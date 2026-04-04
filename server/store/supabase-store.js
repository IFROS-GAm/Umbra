import { CHANNEL_TYPES, GUILD_CHANNEL_KINDS, PERMISSIONS } from "../constants.js";
import { supabaseStoreRuntimeMethods } from "./supabase-store.runtime.js";
import { buildBootstrapState, computePermissionBits, createId, isGuildVoiceChannel } from "./helpers.js";

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

const DEFAULT_VOICE_CHANNELS = ["Lounge", "Sala de estudio 1", "Sala de estudio 2"];

async function expectData(queryPromise, fallbackMessage = "Error consultando Supabase.") {
  const { data, error } = await queryPromise;
  if (error) {
    const wrapped = createError(error.message || fallbackMessage, 500);
    wrapped.cause = error;
    throw wrapped;
  }

  return data;
}

export class SupabaseStore {
  constructor(client) {
    this.client = client;
    this.attachmentsBucket = process.env.SUPABASE_ATTACHMENTS_BUCKET || "attachments";
  }

  getMode() {
    return "supabase";
  }

  async init() {
    await this.ensureAttachmentsBucket();
    await this.ensureDefaultVoiceChannels();
    return this;
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

    const [guilds, roles, guildMembers, guildChannels, dmChannels] = await Promise.all([
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
          ...channels.map((channel) => channel.last_message_author_id)
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
      channels,
      channel_members: channelMembers,
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

  async canAccessChannel({ channelId, userId }) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return false;
    }

    if (channel.guild_id) {
      const memberships = await expectData(
        this.client
          .from("guild_members")
          .select("guild_id")
          .eq("guild_id", channel.guild_id)
          .eq("user_id", userId)
          .limit(1)
      );

      return Boolean(memberships[0]);
    }

    const memberships = await expectData(
      this.client
        .from("channel_members")
        .select("channel_id,hidden")
        .eq("channel_id", channelId)
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
