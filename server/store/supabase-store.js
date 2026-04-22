import { CHANNEL_TYPES, GUILD_CHANNEL_KINDS, PERMISSIONS } from "../constants.js";
import {
  canSendUmbraEmails,
  sendUmbraTransactionalEmail
} from "../email/transactional-mailer.js";
import { supabaseStoreRuntimeMethods } from "./supabase-store.runtime.js";
import {
  buildBootstrapState,
  buildStoredGuildDescription,
  buildDefaultGuildStickerRows,
  computePermissionBits,
  createId,
  parseStoredGuildDescription,
  isGuildVoiceChannel
} from "./helpers.js";

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function randomDiscriminator() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function sanitizeUsername(candidate = "") {
  const normalized = candidate
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);

  return normalized || "umbra_user";
}

function normalizeProfileColor(candidate, fallback = "#5865F2") {
  const normalized = String(candidate || "")
    .trim()
    .replace(/^([^#])/, "#$1")
    .toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return fallback;
}

function isEmailAddress(candidate = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(candidate || "").trim());
}

function normalizeRecoveryProvider(provider = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  return ["", "google", "outlook", "apple", "discord", "other"].includes(normalized)
    ? normalized
    : "";
}

function normalizeRecoveryAccount(value = "") {
  return String(value || "").trim().slice(0, 160);
}

const DEFAULT_VOICE_CHANNELS = ["Lounge", "Sala de estudio 1", "Sala de estudio 2"];
const GUILD_MESSAGE_CONTEXT_TTL_MS = 15_000;
const GUILD_STICKER_SCHEMA_RETRY_MS = 12_000;

async function expectData(queryPromise, fallbackMessage = "Error consultando Supabase.") {
  const { data, error } = await queryPromise;
  if (error) {
    const wrapped = createError(error.message || fallbackMessage, 500);
    wrapped.cause = error;
    throw wrapped;
  }

  return data;
}

function isMissingSchemaFeatureError(error, markers = []) {
  const cause = error?.cause || error;
  const haystack = [
    error?.message,
    cause?.message,
    cause?.hint,
    cause?.details
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  const looksLikeSchemaIssue =
    haystack.includes("schema cache") ||
    haystack.includes("could not find the table") ||
    haystack.includes("could not find the column") ||
    haystack.includes("column") && haystack.includes("does not exist");

  if (!looksLikeSchemaIssue) {
    return false;
  }

  return markers.some((marker) => haystack.includes(String(marker).toLowerCase()));
}

export class SupabaseStore {
  constructor(client) {
    this.client = client;
    this.attachmentsBucket = process.env.SUPABASE_ATTACHMENTS_BUCKET || "attachments";
    this.guildModerationEnabled = true;
    this.guildStickersEnabled = true;
    this.guildStickerFeatureCheckPromise = null;
    this.guildStickerFeatureLastCheckAt = 0;
    this.guildMessageContextCache = new Map();
  }

  getMode() {
    return "supabase";
  }

  async init() {
    await this.ensureAttachmentsBucket();
    await this.ensureDefaultVoiceChannels();
    try {
      await this.ensureDefaultGuildStickers();
    } catch (error) {
      if (!this.handleMissingStickerSchemaError(error)) {
        throw error;
      }
    }
    return this;
  }

  handleMissingStickerSchemaError(error) {
    if (!isMissingSchemaFeatureError(error, ["guild_stickers", "sticker_id"])) {
      return false;
    }

    this.guildStickersEnabled = false;
    return true;
  }

  async ensureGuildStickerFeatureAvailable({ force = false } = {}) {
    if (this.guildStickersEnabled && !force) {
      return true;
    }

    if (this.guildStickerFeatureCheckPromise) {
      return this.guildStickerFeatureCheckPromise;
    }

    const now = Date.now();
    if (
      !force &&
      !this.guildStickersEnabled &&
      now - this.guildStickerFeatureLastCheckAt < GUILD_STICKER_SCHEMA_RETRY_MS
    ) {
      return false;
    }

    const probePromise = (async () => {
      this.guildStickerFeatureLastCheckAt = Date.now();

      try {
        await expectData(this.client.from("guild_stickers").select("id").limit(1));
        await expectData(this.client.from("messages").select("id,sticker_id").limit(1));
        this.guildStickersEnabled = true;
        return true;
      } catch (error) {
        if (this.handleMissingStickerSchemaError(error)) {
          return false;
        }

        throw error;
      } finally {
        if (this.guildStickerFeatureCheckPromise === probePromise) {
          this.guildStickerFeatureCheckPromise = null;
        }
      }
    })();

    this.guildStickerFeatureCheckPromise = probePromise;
    return probePromise;
  }

  handleMissingGuildModerationSchemaError(error) {
    if (!isMissingSchemaFeatureError(error, ["guild_bans"])) {
      return false;
    }

    this.guildModerationEnabled = false;
    return true;
  }

  async assertGuildStickerFeatureAvailable() {
    if (!(await this.ensureGuildStickerFeatureAvailable())) {
      throw createError(
        "Los stickers del servidor aun no estan habilitados. Aplica el schema nuevo en Supabase para usarlos.",
        501
      );
    }
  }

  assertGuildModerationFeatureAvailable() {
    if (!this.guildModerationEnabled) {
      throw createError(
        "La moderacion avanzada del servidor aun no esta habilitada. Aplica el schema nuevo en Supabase para usar baneos temporales.",
        501
      );
    }
  }

  invalidateGuildMessageContext(guildId) {
    if (!guildId) {
      return;
    }

    this.guildMessageContextCache.delete(guildId);
  }

  async loadGuildMessageContext(guildId) {
    if (!guildId) {
      return {
        guilds: [],
        guild_stickers: [],
        roles: []
      };
    }

    const cached = this.guildMessageContextCache.get(guildId);
    if (cached && Date.now() - cached.cachedAt < GUILD_MESSAGE_CONTEXT_TTL_MS) {
      return cached.value;
    }

    const [roles, guilds, guildStickers] = await Promise.all([
      expectData(this.client.from("roles").select("*").eq("guild_id", guildId)),
      expectData(this.client.from("guilds").select("*").eq("id", guildId)),
      this.loadGuildStickers(guildId)
    ]);

    const value = {
      guilds,
      guild_stickers: guildStickers,
      roles
    };

    this.guildMessageContextCache.set(guildId, {
      cachedAt: Date.now(),
      value
    });

    return value;
  }

  async getGuildStickerFallbackRows(guildIds = []) {
    const normalizedGuildIds = [...new Set((guildIds || []).filter(Boolean))];
    if (!normalizedGuildIds.length) {
      return [];
    }

    return expectData(
      this.client
        .from("guilds")
        .select("id,description,owner_id,created_at")
        .in("id", normalizedGuildIds)
    );
  }

  async getGuildStickerFallbackRow(guildId) {
    if (!guildId) {
      return null;
    }

    const rows = await expectData(
      this.client
        .from("guilds")
        .select("id,description,owner_id,created_at")
        .eq("id", guildId)
        .limit(1)
    );

    return rows[0] || null;
  }

  async saveGuildStickerFallbackState({ customStickers = [], guildRow }) {
    if (!guildRow?.id) {
      return null;
    }

    const parsed = parseStoredGuildDescription(guildRow.description || "", guildRow);
    const nextDescription = buildStoredGuildDescription({
      customStickers,
      description: parsed.description || ""
    });

    const rows = await expectData(
      this.client
        .from("guilds")
        .update({
          description: nextDescription,
          updated_at: new Date().toISOString()
        })
        .eq("id", guildRow.id)
        .select("id,description,owner_id,created_at")
    );

    this.invalidateGuildMessageContext(guildRow.id);
    return rows[0] || {
      ...guildRow,
      description: nextDescription
    };
  }

  async ensurePersistedGuildStickerCatalog(guildId) {
    if (!guildId || !(await this.ensureGuildStickerFeatureAvailable())) {
      return false;
    }

    const guildRow = await this.getGuildStickerFallbackRow(guildId);
    if (!guildRow) {
      return false;
    }

    const parsed = parseStoredGuildDescription(guildRow.description || "", guildRow);
    const existing = await expectData(
      this.client.from("guild_stickers").select("*").eq("guild_id", guildId)
    );

    const inserts = [];
    if (!existing.some((sticker) => Boolean(sticker.is_default))) {
      inserts.push(
        ...buildDefaultGuildStickerRows({
          createdBy: guildRow.owner_id,
          guildId,
          now: guildRow.created_at || new Date().toISOString()
        })
      );
    }

    const existingIds = new Set(existing.map((sticker) => String(sticker.id || "")));
    const existingNames = new Set(
      existing.map((sticker) => String(sticker.name || "").toLowerCase())
    );
    const stagedNames = new Set(
      inserts.map((sticker) => String(sticker.name || "").toLowerCase())
    );

    parsed.customStickers.forEach((sticker) => {
      const stickerId = String(sticker.id || "");
      const stickerName = String(sticker.name || "").toLowerCase();
      if (!stickerId || existingIds.has(stickerId) || existingNames.has(stickerName) || stagedNames.has(stickerName)) {
        return;
      }

      inserts.push({
        ...sticker,
        guild_id: guildId,
        is_default: false
      });
      existingIds.add(stickerId);
      stagedNames.add(stickerName);
    });

    if (inserts.length) {
      await expectData(this.client.from("guild_stickers").insert(inserts));
    }

    if (parsed.customStickers.length) {
      await this.saveGuildStickerFallbackState({
        customStickers: [],
        guildRow
      });
    }

    if (inserts.length || parsed.customStickers.length) {
      this.invalidateGuildMessageContext(guildId);
    }

    return true;
  }

  async loadGuildStickers(guildId) {
    if (!guildId) {
      return [];
    }

    if (!(await this.ensureGuildStickerFeatureAvailable())) {
      const guildRow = await this.getGuildStickerFallbackRow(guildId);
      if (!guildRow) {
        return [];
      }

      return parseStoredGuildDescription(guildRow.description || "", guildRow).stickers || [];
    }

    try {
      await this.ensurePersistedGuildStickerCatalog(guildId);
      return await expectData(
        this.client.from("guild_stickers").select("*").eq("guild_id", guildId)
      );
    } catch (error) {
      if (this.handleMissingStickerSchemaError(error)) {
        return [];
      }

      throw error;
    }
  }

  async loadGuildStickersByGuildIds(guildIds = []) {
    const normalizedGuildIds = [...new Set((guildIds || []).filter(Boolean))];
    if (!normalizedGuildIds.length) {
      return [];
    }

    if (!(await this.ensureGuildStickerFeatureAvailable())) {
      const guildRows = await this.getGuildStickerFallbackRows(normalizedGuildIds);
      return guildRows.flatMap(
        (guildRow) => parseStoredGuildDescription(guildRow.description || "", guildRow).stickers || []
      );
    }

    try {
      await Promise.all(
        normalizedGuildIds.map((guildId) => this.ensurePersistedGuildStickerCatalog(guildId))
      );
      return await expectData(
        this.client.from("guild_stickers").select("*").in("guild_id", normalizedGuildIds)
      );
    } catch (error) {
      if (this.handleMissingStickerSchemaError(error)) {
        return [];
      }

      throw error;
    }
  }

  async getGuildStickerById(stickerId, guildId = null) {
    if (!stickerId) {
      return null;
    }

    if (!(await this.ensureGuildStickerFeatureAvailable())) {
      if (guildId) {
        const stickers = await this.loadGuildStickers(guildId);
        return stickers.find((sticker) => String(sticker.id || "") === String(stickerId)) || null;
      }

      const guildRows = await expectData(
        this.client.from("guilds").select("id,description,owner_id,created_at")
      );
      for (const guildRow of guildRows) {
        const match = (parseStoredGuildDescription(guildRow.description || "", guildRow).stickers || []).find(
          (sticker) => String(sticker.id || "") === String(stickerId)
        );
        if (match) {
          return match;
        }
      }

      return null;
    }

    try {
      if (guildId) {
        await this.ensurePersistedGuildStickerCatalog(guildId);
      }
      const rows = await expectData(
        this.client.from("guild_stickers").select("*").eq("id", stickerId).limit(1)
      );
      return rows[0] || null;
    } catch (error) {
      if (this.handleMissingStickerSchemaError(error)) {
        return null;
      }

      throw error;
    }
  }

  async verifyAccessToken(accessToken) {
    const {
      data: { user },
      error
    } = await this.client.auth.getUser(accessToken);

    if (error || !user) {
      throw createError("Unauthorized", 401);
    }

    return user;
  }

  async getProfileById(profileId) {
    const profiles = await expectData(
      this.client.from("profiles").select("*").eq("id", profileId).limit(1)
    );
    return profiles[0] || null;
  }

  async getProfileByAuthUserId(authUserId) {
    const profiles = await expectData(
      this.client
        .from("profiles")
        .select("*")
        .eq("auth_user_id", authUserId)
        .limit(1)
    );
    return profiles[0] || null;
  }

  async getProfileByEmail(email) {
    if (!email) {
      return null;
    }

    const profiles = await expectData(
      this.client.from("profiles").select("*").eq("email", email).limit(1)
    );
    return profiles[0] || null;
  }

  getAuthProvider(authUser) {
    return (
      authUser?.app_metadata?.provider ||
      authUser?.identities?.[0]?.provider ||
      "email"
    );
  }

  async createUniqueUsername(preferredValue) {
    const base = sanitizeUsername(preferredValue);
    const profiles = await expectData(
      this.client.from("profiles").select("username")
    );
    const usernames = new Set(
      profiles.map((profile) => profile.username.toLowerCase())
    );

    if (!usernames.has(base.toLowerCase())) {
      return base;
    }

    for (let attempt = 1; attempt <= 999; attempt += 1) {
      const candidate = sanitizeUsername(`${base}_${attempt}`);
      if (!usernames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    return sanitizeUsername(`${base}_${Date.now().toString().slice(-4)}`);
  }

  async ensureAttachmentsBucket() {
    const { data: buckets, error } = await this.client.storage.listBuckets();
    if (error) {
      return;
    }

    if (buckets.some((bucket) => bucket.name === this.attachmentsBucket)) {
      return;
    }

    await this.client.storage.createBucket(this.attachmentsBucket, {
      public: true
    });
  }

  async ensureDefaultVoiceChannels() {
    const defaultGuilds = await expectData(
      this.client.from("guilds").select("id,owner_id").eq("is_default", true)
    );

    for (const guild of defaultGuilds) {
      const existingChannels = await expectData(
        this.client
          .from("channels")
          .select("id,name,position,type,guild_id")
          .eq("guild_id", guild.id)
      );

      const hasVoice = existingChannels.some((channel) => isGuildVoiceChannel(channel));
      if (hasVoice) {
        continue;
      }

      let nextPosition =
        existingChannels.reduce(
          (max, channel) => Math.max(max, Number(channel.position || 0)),
          -1
        ) + 1;

      for (const name of DEFAULT_VOICE_CHANNELS) {
        await expectData(
          this.client.from("channels").insert({
            id: createId(),
            guild_id: guild.id,
            type: CHANNEL_TYPES.VOICE,
            name: sanitizeUsername(name).replace(/_/g, "-"),
            topic: "Canal de voz de Umbra",
            position: nextPosition,
            parent_id: null,
            created_by: guild.owner_id,
            last_message_id: null,
            last_message_author_id: null,
            last_message_preview: "",
            last_message_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        );
        nextPosition += 1;
      }
    }
  }

  async ensureDefaultGuildStickers() {
    if (!(await this.ensureGuildStickerFeatureAvailable())) {
      return;
    }

    const guilds = await expectData(
      this.client.from("guilds").select("id,owner_id")
    );

    for (const guild of guilds) {
      const existing = await expectData(
        this.client
          .from("guild_stickers")
          .select("id")
          .eq("guild_id", guild.id)
          .limit(1)
      );

      if (existing.length) {
        continue;
      }

      await expectData(
        this.client.from("guild_stickers").insert(
          buildDefaultGuildStickerRows({
            createdBy: guild.owner_id,
            guildId: guild.id
          })
        )
      );
    }
  }

  async ensureDefaultMemberships(profileId) {
    const [defaultGuilds, roles, channels] = await Promise.all([
      expectData(this.client.from("guilds").select("*").eq("is_default", true)),
      expectData(this.client.from("roles").select("*")),
      expectData(this.client.from("channels").select("*"))
    ]);

    for (const guild of defaultGuilds) {
      const everyoneRole = roles.find(
        (role) => role.guild_id === guild.id && role.name === "@everyone"
      );

      await expectData(
        this.client.from("guild_members").upsert(
          {
            guild_id: guild.id,
            user_id: profileId,
            role_ids: everyoneRole ? [everyoneRole.id] : [],
            nickname: "",
            joined_at: new Date().toISOString()
          },
          { onConflict: "guild_id,user_id" }
        )
      );

      const guildChannels = channels.filter(
        (channel) => channel.guild_id === guild.id && channel.type === CHANNEL_TYPES.TEXT
      );

      for (const channel of guildChannels) {
        await expectData(
          this.client.from("channel_members").upsert(
            {
              channel_id: channel.id,
              user_id: profileId,
              last_read_message_id: null,
              last_read_at: null,
              hidden: false,
              joined_at: new Date().toISOString()
            },
            { onConflict: "channel_id,user_id" }
          )
        );
      }
    }
  }

  async ensureProfileFromAuthUser(authUser) {
    const email = authUser.email || null;
    let profile =
      (await this.getProfileByAuthUserId(authUser.id)) ||
      (await this.getProfileByEmail(email));

    const updatePayload = {
      auth_provider: this.getAuthProvider(authUser),
      email,
      email_confirmed_at: authUser.email_confirmed_at || null,
      status: "online",
      updated_at: new Date().toISOString()
    };

    if (profile) {
      const rows = await expectData(
        this.client
          .from("profiles")
          .update({
            ...updatePayload,
            auth_user_id: profile.auth_user_id || authUser.id
          })
          .eq("id", profile.id)
          .select("*")
      );

      profile = rows[0] || profile;
      await this.ensureDefaultMemberships(profile.id);
      return profile;
    }

    const preferredUsername =
      authUser.user_metadata?.username ||
      authUser.user_metadata?.user_name ||
      authUser.user_metadata?.preferred_username ||
      authUser.user_metadata?.full_name ||
      email?.split("@")[0] ||
      "umbra_user";

    const rows = await expectData(
      this.client
        .from("profiles")
        .insert({
          id: authUser.id,
          auth_user_id: authUser.id,
          email,
          email_confirmed_at: authUser.email_confirmed_at || null,
          auth_provider: this.getAuthProvider(authUser),
          username: await this.createUniqueUsername(preferredUsername),
          discriminator: randomDiscriminator(),
          avatar_hue: Math.floor(Math.random() * 360),
          avatar_url: "",
          profile_banner_url: "",
          profile_color: "#5865F2",
          recovery_account: "",
          recovery_provider: "",
          bio: "Nuevo usuario en Umbra.",
          status: "online",
          custom_status: "",
          theme: "dark",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select("*")
    );

    profile = rows[0];
    await this.ensureDefaultMemberships(profile.id);
    return profile;
  }

  async getDefaultUserId() {
    const profiles = await expectData(
      this.client.from("profiles").select("id").order("created_at", { ascending: true }).limit(1)
    );
    return profiles?.[0]?.id ?? null;
  }

  async bootstrap(userId) {
    const viewerId = userId || (await this.getDefaultUserId());
    const snapshot = await this.loadBootstrapSnapshot(viewerId);
    return buildBootstrapState(snapshot, viewerId);
  }

  async resendEmailConfirmation({ emailRedirectTo, userId }) {
    const profile = await this.getProfileById(userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    if (!profile.email) {
      throw createError("No hay un correo principal asociado a esta cuenta.", 400);
    }

    if (String(profile.auth_provider || "email").toLowerCase() !== "email") {
      throw createError("El correo de confirmacion solo aplica para accesos por email.", 400);
    }

    const { error } = await this.client.auth.resend({
      type: "signup",
      email: profile.email,
      options: emailRedirectTo
        ? {
            emailRedirectTo: String(emailRedirectTo).trim()
          }
        : undefined
    });

    if (error) {
      throw createError(error.message || "No se pudo reenviar el correo de confirmacion.", 400);
    }

    return {
      email: profile.email,
      kind: "confirmation",
      provider: "supabase-auth",
      ok: true,
      target: "primary"
    };
  }

  async sendEmailCheck({ emailRedirectTo, target, userId }) {
    const profile = await this.getProfileById(userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    const normalizedTarget = String(target || "primary").trim().toLowerCase();
    if (normalizedTarget !== "primary" && normalizedTarget !== "recovery") {
      throw createError("Destino de verificacion no valido.", 400);
    }

    const redirectOptions = emailRedirectTo
      ? {
          redirectTo: String(emailRedirectTo).trim()
        }
      : undefined;

    if (normalizedTarget === "primary") {
      if (!profile.email) {
        throw createError("No hay un correo principal asociado a esta cuenta.", 400);
      }

      if (
        String(profile.auth_provider || "email").toLowerCase() === "email" &&
        !profile.email_confirmed_at
      ) {
        return this.resendEmailConfirmation({ emailRedirectTo, userId });
      }

      if (!canSendUmbraEmails()) {
        throw createError(
          "Configura SMTP de Umbra para enviar correos de prueba con marca propia.",
          400
        );
      }

      await sendUmbraTransactionalEmail({
        actionLabel: "Abrir Umbra",
        actionUrl: emailRedirectTo || process.env.PUBLIC_APP_URL || "http://localhost:5173",
        intro:
          "Este es un correo de prueba del canal principal para confirmar que tu cuenta de acceso sigue recibiendo mensajes de Umbra.",
        preheader: "Prueba de correo principal de Umbra",
        subject: "Umbra | Comprobacion del correo principal",
        title: "Comprobacion del correo principal",
        to: profile.email
      });

      return {
        email: profile.email,
        kind: "check",
        ok: true,
        provider: "umbra-smtp",
        target: "primary"
      };
    }

    const recoveryEmail = normalizeRecoveryAccount(profile.recovery_account);
    if (!recoveryEmail) {
      throw createError("No hay un correo de respaldo configurado.", 400);
    }

    if (!isEmailAddress(recoveryEmail)) {
      throw createError(
        "El respaldo debe ser un correo valido para poder enviar una comprobacion.",
        400
      );
    }

    if (!canSendUmbraEmails()) {
      throw createError(
        "Configura SMTP de Umbra para enviar comprobaciones al correo de respaldo.",
        400
      );
    }

    await sendUmbraTransactionalEmail({
      actionLabel: "Abrir Umbra",
      actionUrl: emailRedirectTo || process.env.PUBLIC_APP_URL || "http://localhost:5173",
      intro:
        "Este correo de prueba confirma que tu cuenta de recuperacion sigue disponible para futuros flujos de respaldo en Umbra.",
      preheader: "Prueba del correo de respaldo de Umbra",
      subject: "Umbra | Comprobacion del correo de respaldo",
      title: "Comprobacion del correo de respaldo",
      to: recoveryEmail
    });

    return {
      email: recoveryEmail,
      kind: "check",
      ok: true,
      provider: "umbra-smtp",
      target: "recovery"
    };
  }

  async inviteUserByEmail({ email, inviterId, redirectTo }) {
    const inviter = await this.getProfileById(inviterId);
    if (!inviter) {
      throw createError("Invitador no encontrado.", 404);
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!isEmailAddress(normalizedEmail)) {
      throw createError("Ingresa un correo valido para enviar la invitacion.", 400);
    }

    const { data, error } = await this.client.auth.admin.inviteUserByEmail(normalizedEmail, {
      data: {
        invited_by: inviter.id,
        invited_by_username: inviter.username || "umbra_user"
      },
      redirectTo: redirectTo
        ? String(redirectTo).trim()
        : process.env.PUBLIC_APP_URL || "http://localhost:5173"
    });

    if (error) {
      throw createError(error.message || "No se pudo enviar la invitacion a Umbra.", 400);
    }

    return {
      email: normalizedEmail,
      invitedUserId: data?.user?.id || null,
      inviter: inviter.username || inviter.display_name || "Umbra",
      kind: "invite",
      ok: true,
      provider: "supabase-auth"
    };
  }

  async loadBootstrapSnapshot(userId) {
    const [guildMemberships, dmMemberships] = await Promise.all([
      expectData(
        this.client.from("guild_members").select("*").eq("user_id", userId)
      ),
      expectData(
        this.client
          .from("channel_members")
          .select("*")
          .eq("user_id", userId)
          .eq("hidden", false)
      )
    ]);

    const guildIds = [...new Set(guildMemberships.map((item) => item.guild_id))];
    const dmChannelIds = [...new Set(dmMemberships.map((item) => item.channel_id))];
    const [friendships, friendRequests, blockedEntries] = await Promise.all([
      expectData(
        this.client
          .from("friendships")
          .select("*")
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      ).catch(() => []),
      expectData(
        this.client
          .from("friend_requests")
          .select("*")
          .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
      ).catch(() => []),
      expectData(
        this.client.from("user_blocks").select("*").eq("blocker_id", userId)
      ).catch(() => [])
    ]);

    const [guilds, roles, guildMembers, guildChannels, guildStickers, dmChannels] = await Promise.all([
      guildIds.length
        ? expectData(this.client.from("guilds").select("*").in("id", guildIds))
        : Promise.resolve([]),
      guildIds.length
        ? expectData(this.client.from("roles").select("*").in("guild_id", guildIds))
        : Promise.resolve([]),
      guildIds.length
        ? expectData(
            this.client.from("guild_members").select("*").in("guild_id", guildIds)
          )
        : Promise.resolve([]),
      guildIds.length
        ? expectData(
            this.client.from("channels").select("*").in("guild_id", guildIds)
          )
        : Promise.resolve([]),
      this.loadGuildStickersByGuildIds(guildIds),
      dmChannelIds.length
        ? expectData(this.client.from("channels").select("*").in("id", dmChannelIds))
        : Promise.resolve([])
    ]);

    const channels = [...guildChannels, ...dmChannels].filter(
      (channel, index, collection) =>
        collection.findIndex((item) => item.id === channel.id) === index
    );
    const channelIds = channels.map((channel) => channel.id);
    const channelMembers = channelIds.length
      ? await expectData(
          this.client.from("channel_members").select("*").in("channel_id", channelIds)
        )
      : [];
    const relatedUserIds = [
      ...new Set(
        [
          userId,
          ...guildMembers.map((member) => member.user_id),
          ...channelMembers.map((member) => member.user_id),
          ...guilds.map((guild) => guild.owner_id),
          ...channels.map((channel) => channel.created_by),
          ...channels.map((channel) => channel.last_message_author_id),
          ...friendships.flatMap((friendship) => [friendship.user_id, friendship.friend_id]),
          ...friendRequests.flatMap((request) => [request.requester_id, request.recipient_id]),
          ...blockedEntries.map((entry) => entry.blocked_id)
        ].filter(Boolean)
      )
    ];
    const profiles = relatedUserIds.length
      ? await expectData(this.client.from("profiles").select("*").in("id", relatedUserIds))
      : [];

    const snapshot = {
      profiles,
      guilds,
      roles,
      guild_members: guildMembers,
      guild_stickers: guildStickers,
      channels,
      channel_members: channelMembers,
      friendships,
      friend_requests: friendRequests,
      user_blocks: blockedEntries,
      messages: [],
      message_reactions: []
    };
    return snapshot;
  }

  async getChannel(channelId) {
    const rows = await expectData(
      this.client.from("channels").select("*").eq("id", channelId).limit(1)
    );
    return rows[0] || null;
  }

  async getMessage(messageId) {
    const rows = await expectData(
      this.client.from("messages").select("*").eq("id", messageId).limit(1)
    );
    return rows[0] || null;
  }

  async canAccessChannel({ channel, channelId, userId }) {
    const resolvedChannel = channel || (await this.getChannel(channelId));
    if (!resolvedChannel) {
      return false;
    }

    if (resolvedChannel.guild_id) {
      const memberships = await expectData(
        this.client
          .from("guild_members")
          .select("guild_id")
          .eq("guild_id", resolvedChannel.guild_id)
          .eq("user_id", userId)
          .limit(1)
      );

      return Boolean(memberships[0]);
    }

    const memberships = await expectData(
      this.client
        .from("channel_members")
        .select("channel_id,hidden")
        .eq("channel_id", resolvedChannel.id || channelId)
        .eq("user_id", userId)
        .limit(1)
    );

    return Boolean(memberships[0]) && !memberships[0].hidden;
  }

  async getPermissionBits(guildId, userId) {
    const [guilds, roles, guildMembers] = await Promise.all([
      expectData(this.client.from("guilds").select("*").eq("id", guildId)),
      expectData(this.client.from("roles").select("*").eq("guild_id", guildId)),
      expectData(this.client.from("guild_members").select("*").eq("guild_id", guildId))
    ]);

    return computePermissionBits({
      guilds,
      guildId,
      guildMembers,
      roles,
      userId
    });
  }

  async listGuildAudienceIds(guildId) {
    const memberships = await expectData(
      this.client.from("guild_members").select("user_id").eq("guild_id", guildId)
    );

    return [...new Set(memberships.map((membership) => membership.user_id))];
  }

  async listChannelAudienceIds(channelId) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return [];
    }

    if (channel.guild_id) {
      return this.listGuildAudienceIds(channel.guild_id);
    }

    const memberships = await expectData(
      this.client
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", channelId)
        .eq("hidden", false)
    );

    return [...new Set(memberships.map((membership) => membership.user_id))];
  }

}

for (const methodName of Object.getOwnPropertyNames(supabaseStoreRuntimeMethods)) {
  if (methodName === "constructor") {
    continue;
  }

  Object.defineProperty(
    SupabaseStore.prototype,
    methodName,
    Object.getOwnPropertyDescriptor(supabaseStoreRuntimeMethods, methodName)
  );
}
