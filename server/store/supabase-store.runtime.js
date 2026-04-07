import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  PERMISSIONS
} from "../constants.js";
import {
  buildInvitePreview,
  buildMessagePreview,
  createId,
  enrichMessages,
  getDefaultGuildChannel,
  isGuildVoiceChannel,
  resolveMentionUserIds,
  sortByDateDesc
} from "./helpers.js";

const PROFILE_MESSAGE_SELECT = [
  "id",
  "username",
  "discriminator",
  "avatar_hue",
  "avatar_url",
  "profile_banner_url",
  "profile_color",
  "status"
].join(",");

const GUILD_PERMISSION_SELECT = ["id", "owner_id"].join(",");
const GUILD_MEMBER_MESSAGE_SELECT = ["guild_id", "user_id", "nickname", "role_ids"].join(",");
const ROLE_PERMISSION_SELECT = ["id", "guild_id", "name", "permissions", "position", "color"].join(",");
const REACTION_SELECT = ["message_id", "user_id", "emoji"].join(",");

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

function sanitizeUsername(candidate = "") {
  const normalized = String(candidate || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);

  return normalized || "umbra_user";
}

function sanitizeChannelName(candidate = "") {
  return String(candidate || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function sanitizeCategoryName(candidate = "") {
  return String(candidate || "").trim();
}

function buildDirectDmKey(ownerId, recipientId) {
  return [String(ownerId || ""), String(recipientId || "")].sort().join(":");
}

function buildFriendshipPair(leftId, rightId) {
  return [String(leftId || ""), String(rightId || "")].sort();
}

function buildInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function assertInviteUsable(invite) {
  if (!invite) {
    throw createError("Invitacion no encontrada.", 404);
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    throw createError("Esta invitacion ya expiro.", 410);
  }

  if (
    invite.max_uses !== null &&
    invite.max_uses !== undefined &&
    Number(invite.uses || 0) >= Number(invite.max_uses)
  ) {
    throw createError("Esta invitacion ya no esta disponible.", 410);
  }
}

async function expectData(queryPromise, fallbackMessage = "Error consultando Supabase.") {
  const { data, error } = await queryPromise;
  if (error) {
    const wrapped = createError(error.message || fallbackMessage, 500);
    wrapped.cause = error;
    throw wrapped;
  }

  return data;
}

export const supabaseStoreRuntimeMethods = class SupabaseStoreRuntime {
  async buildMessageSnapshot({ channel, message, replyTarget = null, userId }) {
    if (!channel || !message) {
      return null;
    }

    const messageBundle = [message, replyTarget].filter(Boolean);
    const profileIds = [...new Set(messageBundle.map((item) => item.author_id).filter(Boolean))];
    const memberIds = [...new Set([userId, ...profileIds].filter(Boolean))];

    const [profiles, guilds, roles, guildMembers, reactions] = await Promise.all([
      profileIds.length
        ? expectData(
            this.client.from("profiles").select(PROFILE_MESSAGE_SELECT).in("id", profileIds)
          )
        : Promise.resolve([]),
      channel.guild_id
        ? expectData(
            this.client.from("guilds").select(GUILD_PERMISSION_SELECT).eq("id", channel.guild_id)
          )
        : Promise.resolve([]),
      channel.guild_id
        ? expectData(
            this.client.from("roles").select(ROLE_PERMISSION_SELECT).eq("guild_id", channel.guild_id)
          )
        : Promise.resolve([]),
      channel.guild_id && memberIds.length
        ? expectData(
            this.client
              .from("guild_members")
              .select(GUILD_MEMBER_MESSAGE_SELECT)
              .eq("guild_id", channel.guild_id)
              .in("user_id", memberIds)
          )
        : Promise.resolve([]),
      expectData(
        this.client
          .from("message_reactions")
          .select(REACTION_SELECT)
          .eq("message_id", message.id)
      )
    ]);

    const enriched = enrichMessages({
      channelId: channel.id,
      db: {
        profiles,
        guilds,
        roles,
        guild_members: guildMembers,
        channels: [channel],
        channel_members: [],
        messages: messageBundle,
        message_reactions: reactions
      },
      messages: [message],
      userId
    });

    return enriched[0] || null;
  }

  async updateChannelSummary(channelId, message = null) {
    const preview = {
      id: channelId,
      last_message_id: message?.id ?? null,
      last_message_author_id: message?.author_id ?? null,
      last_message_preview: message
        ? buildMessagePreview(message.content, message.attachments || [])
        : "",
      last_message_at: message?.created_at ?? null,
      updated_at: message?.created_at ?? new Date().toISOString()
    };

    await expectData(
      this.client
        .from("channels")
        .update({
          last_message_id: preview.last_message_id,
          last_message_author_id: preview.last_message_author_id,
          last_message_preview: preview.last_message_preview,
          last_message_at: preview.last_message_at,
          updated_at: preview.updated_at
        })
        .eq("id", channelId)
    );

    return preview;
  }

  async listChannelMessages({ before, channelId, limit = 30, userId }) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    if (!(await this.canAccessChannel({ channelId, userId }))) {
      throw createError("No puedes acceder a este canal.", 403);
    }

    let createdBefore = null;
    if (before) {
      const anchor = await this.getMessage(before);
      createdBefore = anchor?.created_at ?? null;
    }

    let query = this.client
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (createdBefore) {
      query = query.lt("created_at", createdBefore);
    }

    const messages = await expectData(query);
    const pageMessageIds = messages.map((message) => message.id);
    const replyIds = messages.map((message) => message.reply_to).filter(Boolean);
    const [reactions, replyMessages, roles, guilds] = await Promise.all([
      pageMessageIds.length
        ? expectData(
            this.client
              .from("message_reactions")
              .select(REACTION_SELECT)
              .in("message_id", pageMessageIds)
          )
        : Promise.resolve([]),
      replyIds.length
        ? expectData(
            this.client.from("messages").select("*").in("id", replyIds)
          )
        : Promise.resolve([]),
      channel.guild_id
        ? expectData(
            this.client.from("roles").select(ROLE_PERMISSION_SELECT).eq("guild_id", channel.guild_id)
          )
        : Promise.resolve([]),
      channel.guild_id
        ? expectData(
            this.client.from("guilds").select(GUILD_PERMISSION_SELECT).eq("id", channel.guild_id)
          )
        : Promise.resolve([])
    ]);

    const relatedProfileIds = [
      ...new Set(
        [userId, ...messages.map((message) => message.author_id), ...replyMessages.map((message) => message.author_id)]
          .filter(Boolean)
      )
    ];
    const [profiles, guildMembers] = await Promise.all([
      relatedProfileIds.length
        ? expectData(
            this.client.from("profiles").select(PROFILE_MESSAGE_SELECT).in("id", relatedProfileIds)
          )
        : Promise.resolve([]),
      channel.guild_id && relatedProfileIds.length
        ? expectData(
            this.client
              .from("guild_members")
              .select(GUILD_MEMBER_MESSAGE_SELECT)
              .eq("guild_id", channel.guild_id)
              .in("user_id", relatedProfileIds)
          )
        : Promise.resolve([])
    ]);

    const snapshot = {
      profiles,
      guilds,
      roles,
      guild_members: guildMembers,
      channels: [channel],
      channel_members: [],
      messages: [...messages, ...replyMessages].filter(
        (message, index, collection) =>
          collection.findIndex((item) => item.id === message.id) === index
      ),
      message_reactions: reactions
    };

    return {
      messages: enrichMessages({
        channelId,
        db: snapshot,
        messages,
        userId
      }),
      has_more: messages.length === limit
    };
  }

  async createMessage({
    attachments = [],
    authorId,
    channelId,
    clientNonce = null,
    content,
    replyMentionUserId = null,
    replyTo = null
  }) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    if (!(await this.canAccessChannel({ channelId, userId: authorId }))) {
      throw createError("No puedes escribir en este canal.", 403);
    }

    if (isGuildVoiceChannel(channel)) {
      throw createError("No puedes enviar mensajes dentro de un canal de voz.", 400);
    }

    const trimmed = content?.trim() || "";
    if (!trimmed && !attachments.length) {
      throw createError("El mensaje no puede estar vacío.", 400);
    }

    if (channel.guild_id) {
      const permissionBits = await this.getPermissionBits(channel.guild_id, authorId);
      if (
        (permissionBits & PERMISSIONS.SEND_MESSAGES) !== PERMISSIONS.SEND_MESSAGES
      ) {
        throw createError("No tienes permisos para enviar mensajes en este canal.", 403);
      }
    }

    let replyTarget = null;
    if (replyTo) {
      replyTarget = await this.getMessage(replyTo);
      if (!replyTarget || replyTarget.channel_id !== channelId) {
        throw createError("El mensaje al que respondes no existe en este canal.", 400);
      }
    }

    const shouldResolveEveryone = /(^|\s)@everyone\b/i.test(trimmed);
    const shouldResolveNamedMentions = /(^|\s)@(?!everyone\b)[a-zA-Z0-9_-]+/i.test(trimmed);
    const [profiles, audienceUserIds] = await Promise.all([
      shouldResolveNamedMentions
        ? expectData(this.client.from("profiles").select("id,username"))
        : Promise.resolve([]),
      shouldResolveEveryone ? this.listChannelAudienceIds(channelId) : Promise.resolve([])
    ]);
    const mentionUserIds =
      shouldResolveEveryone || shouldResolveNamedMentions
        ? resolveMentionUserIds(trimmed, profiles, {
            audienceUserIds,
            authorId
          })
        : [];

    if (
      replyTarget &&
      replyMentionUserId &&
      replyTarget.author_id === replyMentionUserId &&
      replyTarget.author_id !== authorId &&
      !mentionUserIds.includes(replyTarget.author_id)
    ) {
      mentionUserIds.push(replyTarget.author_id);
    }

    const now = new Date().toISOString();
    const message = {
      id: createId(),
      channel_id: channelId,
      guild_id: channel.guild_id,
      author_id: authorId,
      content: trimmed,
      reply_to: replyTo,
      attachments,
      mention_user_ids: mentionUserIds,
      edited_at: null,
      deleted_at: null,
      created_at: now
    };

    await expectData(this.client.from("messages").insert(message));
    const preview = await this.updateChannelSummary(channelId, message);
    await this.markChannelRead({
      channelId,
      lastReadMessageId: message.id,
      userId: authorId
    });

    const enrichedMessage = await this.buildMessageSnapshot({
      channel,
      message,
      replyTarget,
      userId: authorId
    });

    if (enrichedMessage && clientNonce) {
      enrichedMessage.client_nonce = clientNonce;
    }

    return {
      message: enrichedMessage,
      preview
    };
  }

  async updateMessage({ content, messageId, userId }) {
    const message = await this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    if (message.author_id !== userId) {
      throw createError("Solo el autor puede editar este mensaje.", 403);
    }

    const trimmed = content?.trim() || "";
    if (!trimmed && !(message.attachments || []).length) {
      throw createError("El mensaje editado no puede estar vacío.", 400);
    }

    const profiles = await expectData(this.client.from("profiles").select("*"));
    await expectData(
      this.client
        .from("messages")
        .update({
          content: trimmed,
          edited_at: new Date().toISOString(),
          mention_user_ids: resolveMentionUserIds(trimmed, profiles, {
            audienceUserIds: await this.listChannelAudienceIds(message.channel_id),
            authorId: userId
          })
        })
        .eq("id", messageId)
    );

    await this.refreshChannelSummary(message.channel_id);
    return this.getChannelSnapshot(message.channel_id, userId, messageId);
  }

  async deleteMessage({ messageId, userId }) {
    const message = await this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    let canManage = false;
    if (message.guild_id) {
      const permissionBits = await this.getPermissionBits(message.guild_id, userId);
      canManage =
        (permissionBits & PERMISSIONS.MANAGE_MESSAGES) ===
        PERMISSIONS.MANAGE_MESSAGES;
    }

    if (message.author_id !== userId && !canManage) {
      throw createError("No puedes eliminar este mensaje.", 403);
    }

    await expectData(
      this.client
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId)
    );
    await expectData(
      this.client.from("message_reactions").delete().eq("message_id", messageId)
    );
    await this.refreshChannelSummary(message.channel_id);

    return {
      id: messageId,
      channel_id: message.channel_id
    };
  }

  async toggleReaction({ emoji, messageId, userId }) {
    const message = await this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    if (!(await this.canAccessChannel({ channelId: message.channel_id, userId }))) {
      throw createError("No puedes reaccionar en este canal.", 403);
    }

    const existing = await expectData(
      this.client
        .from("message_reactions")
        .select("*")
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", emoji)
        .limit(1)
    );

    if (existing[0]) {
      await expectData(
        this.client
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", userId)
          .eq("emoji", emoji)
      );
    } else {
      await expectData(
        this.client.from("message_reactions").insert({
          message_id: messageId,
          user_id: userId,
          emoji,
          created_at: new Date().toISOString()
        })
      );
    }

    return this.getChannelSnapshot(message.channel_id, userId, messageId);
  }

  async createGuild({ description = "", name, ownerId, templateId = "default" }) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    const template = GUILD_TEMPLATES[templateId] || GUILD_TEMPLATES.default;
    const guildId = createId();
    const everyoneRoleId = createId();
    const ownerRoleId = createId();
    const now = new Date().toISOString();

    await expectData(
      this.client.from("guilds").insert({
        id: guildId,
        name: trimmed,
        description: description.trim() || template.description,
        icon_text: trimmed
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0]?.toUpperCase())
          .join(""),
        icon_url: "",
        banner_color: "#5865F2",
        banner_image_url: "",
        owner_id: ownerId,
        created_at: now,
        updated_at: now
      })
    );

    await expectData(
      this.client.from("roles").insert([
        {
          id: everyoneRoleId,
          guild_id: guildId,
          name: "@everyone",
          color: "#9AA4B2",
          position: 0,
          permissions: PERMISSIONS.READ_MESSAGES | PERMISSIONS.SEND_MESSAGES,
          hoist: false,
          mentionable: false,
          created_at: now
        },
        {
          id: ownerRoleId,
          guild_id: guildId,
          name: "Owner",
          color: "#60A5FA",
          position: 2,
          permissions:
            PERMISSIONS.READ_MESSAGES |
            PERMISSIONS.SEND_MESSAGES |
            PERMISSIONS.MANAGE_MESSAGES |
            PERMISSIONS.MANAGE_CHANNELS |
            PERMISSIONS.MANAGE_GUILD |
            PERMISSIONS.MANAGE_ROLES |
            PERMISSIONS.ADMINISTRATOR,
          hoist: true,
          mentionable: false,
          created_at: now
        }
      ])
    );

    await expectData(
      this.client.from("guild_members").insert({
        guild_id: guildId,
        user_id: ownerId,
        role_ids: [everyoneRoleId, ownerRoleId],
        nickname: "",
        joined_at: now
      })
    );

    const textChannels =
      template.textChannels?.length ? template.textChannels : GUILD_TEMPLATES.default.textChannels;
    const voiceChannels = template.voiceChannels || [];
    const createdChannels = [...textChannels, ...voiceChannels].map((channelName, index) => {
      const isVoice = index >= textChannels.length;
      return {
        id: createId(),
        guild_id: guildId,
        type: isVoice ? CHANNEL_TYPES.VOICE : CHANNEL_TYPES.TEXT,
        name: channelName,
        topic: isVoice ? "Canal de voz de Umbra." : "Canal inicial del servidor.",
        position: index,
        parent_id: null,
        created_by: ownerId,
        last_message_id: null,
        last_message_author_id: null,
        last_message_preview: "",
        last_message_at: null,
        created_at: now,
        updated_at: now
      };
    });

    await expectData(this.client.from("channels").insert(createdChannels));

    await expectData(
      this.client.from("channel_members").upsert(
        createdChannels.map((channel) => ({
          channel_id: channel.id,
          user_id: ownerId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        })),
        { onConflict: "channel_id,user_id" }
      )
    );

    return {
      guild_id: guildId,
      channel_id:
        createdChannels.find((channel) => channel.type === CHANNEL_TYPES.TEXT)?.id ||
        createdChannels[0]?.id
    };
  }

  async createChannel({
    createdBy,
    guildId,
    kind = GUILD_CHANNEL_KINDS.TEXT,
    name,
    parentId = null,
    topic = ""
  }) {
    const guild = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    if (!guild[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, createdBy);
    if ((permissionBits & PERMISSIONS.ADMINISTRATOR) !== PERMISSIONS.ADMINISTRATOR) {
      throw createError("Solo el administrador puede cambiar la estructura del servidor.", 403);
    }

    const trimmed = sanitizeChannelName(name);
    if (!trimmed) {
      throw createError("El canal necesita un nombre.", 400);
    }

    const existingChannels = await expectData(
      this.client.from("channels").select("id,name,position,type,guild_id").eq("guild_id", guildId)
    );
    if (existingChannels.some((channel) => channel.name === trimmed)) {
      throw createError("Ya existe un canal con ese nombre.", 400);
    }

    if (parentId) {
      const parent = existingChannels.find((channel) => channel.id === parentId);
      if (!parent || parent.type !== CHANNEL_TYPES.CATEGORY) {
        throw createError("La categoria seleccionada no existe.", 400);
      }
    }

    const nextPosition =
      existingChannels.reduce(
        (max, channel) => Math.max(max, Number(channel.position)),
        -1
      ) + 1;

    const channel = {
      id: createId(),
      guild_id: guildId,
      type: kind === GUILD_CHANNEL_KINDS.VOICE ? CHANNEL_TYPES.VOICE : CHANNEL_TYPES.TEXT,
      name: trimmed,
      topic: topic.trim(),
      position: nextPosition,
      parent_id: parentId,
      created_by: createdBy,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await expectData(this.client.from("channels").insert(channel));
    return channel;
  }

  async createCategory({ createdBy, guildId, name }) {
    const guild = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    if (!guild[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, createdBy);
    if ((permissionBits & PERMISSIONS.ADMINISTRATOR) !== PERMISSIONS.ADMINISTRATOR) {
      throw createError("Solo el administrador puede cambiar la estructura del servidor.", 403);
    }

    const trimmed = sanitizeCategoryName(name);
    if (!trimmed) {
      throw createError("La categoria necesita un nombre.", 400);
    }

    const existingChannels = await expectData(
      this.client.from("channels").select("id,name,position").eq("guild_id", guildId)
    );
    if (
      existingChannels.some(
        (channel) => String(channel.name).toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      throw createError("Ya existe una categoria o canal con ese nombre.", 400);
    }

    const nextPosition =
      existingChannels.reduce(
        (max, channel) => Math.max(max, Number(channel.position)),
        -1
      ) + 1;

    const category = {
      id: createId(),
      guild_id: guildId,
      type: CHANNEL_TYPES.CATEGORY,
      name: trimmed,
      topic: "",
      position: nextPosition,
      parent_id: null,
      created_by: createdBy,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await expectData(this.client.from("channels").insert(category));
    return category;
  }

  async updateGuild({
    bannerColor,
    bannerImageUrl,
    description = "",
    guildId,
    iconUrl,
    name,
    userId
  }) {
    const guildRows = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    const guild = guildRows[0];
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.ADMINISTRATOR) !== PERMISSIONS.ADMINISTRATOR) {
      throw createError("Solo el administrador puede editar este servidor.", 403);
    }

    const trimmed = String(name || "").trim();
    if (!trimmed) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    const updatedRows = await expectData(
      this.client
        .from("guilds")
        .update({
          name: trimmed,
          description: String(description || "").trim().slice(0, 180),
          icon_text: trimmed
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase())
            .join(""),
          icon_url: iconUrl !== undefined ? String(iconUrl || "").trim() : guild.icon_url || "",
          banner_color: normalizeProfileColor(bannerColor, guild.banner_color || "#5865F2"),
          banner_image_url:
            bannerImageUrl !== undefined
              ? String(bannerImageUrl || "").trim()
              : guild.banner_image_url || "",
          updated_at: new Date().toISOString()
        })
        .eq("id", guildId)
        .select("*")
    );

    return updatedRows[0] || guild;
  }

  async createInvite({ guildId, userId }) {
    const guildRows = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.ADMINISTRATOR) !== PERMISSIONS.ADMINISTRATOR) {
      throw createError("Solo el administrador puede invitar personas desde este menu.", 403);
    }

    const invite = {
      id: createId(),
      code: buildInviteCode(),
      guild_id: guildId,
      creator_id: userId,
      uses: 0,
      max_uses: null,
      expires_at: null,
      created_at: new Date().toISOString()
    };

    await expectData(this.client.from("invites").insert(invite));
    return invite;
  }

  async getInviteByCode({ code, userId = null }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const inviteRows = await expectData(
      this.client.from("invites").select("*").eq("code", normalizedCode).limit(1)
    );
    const invite = inviteRows[0] || null;
    assertInviteUsable(invite);

    const [guildRows, guildMembers, channels] = await Promise.all([
      expectData(this.client.from("guilds").select("*").eq("id", invite.guild_id).limit(1)),
      expectData(this.client.from("guild_members").select("*").eq("guild_id", invite.guild_id)),
      expectData(
        this.client
          .from("channels")
          .select("id,guild_id,type,name,position,parent_id")
          .eq("guild_id", invite.guild_id)
      )
    ]);

    const guild = guildRows[0] || null;
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const memberIds = [...new Set(guildMembers.map((membership) => membership.user_id))];
    const profiles = memberIds.length
      ? await expectData(
          this.client
            .from("profiles")
            .select("id,status")
            .in("id", memberIds)
        )
      : [];

    return buildInvitePreview({
      channels,
      guild,
      guildMembers,
      invite,
      profiles,
      userId
    });
  }

  async acceptInvite({ code, userId }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const inviteRows = await expectData(
      this.client.from("invites").select("*").eq("code", normalizedCode).limit(1)
    );
    const invite = inviteRows[0] || null;
    assertInviteUsable(invite);

    const [guildRows, guildMembers, channels, roles] = await Promise.all([
      expectData(this.client.from("guilds").select("*").eq("id", invite.guild_id).limit(1)),
      expectData(this.client.from("guild_members").select("*").eq("guild_id", invite.guild_id)),
      expectData(this.client.from("channels").select("*").eq("guild_id", invite.guild_id)),
      expectData(this.client.from("roles").select("*").eq("guild_id", invite.guild_id))
    ]);

    const guild = guildRows[0] || null;
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const defaultChannel = getDefaultGuildChannel(channels, guild.id);
    const alreadyJoined = guildMembers.some((membership) => membership.user_id === userId);

    if (!alreadyJoined) {
      const everyoneRole = roles.find((role) => role.name === "@everyone");
      const joinedAt = new Date().toISOString();

      await expectData(
        this.client.from("guild_members").insert({
          guild_id: guild.id,
          user_id: userId,
          role_ids: everyoneRole ? [everyoneRole.id] : [],
          nickname: "",
          joined_at: joinedAt
        })
      );

      const membershipRows = channels
        .filter((channel) => channel.type !== CHANNEL_TYPES.CATEGORY)
        .map((channel) => ({
          channel_id: channel.id,
          user_id: userId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: joinedAt
        }));

      if (membershipRows.length) {
        await expectData(
          this.client.from("channel_members").upsert(membershipRows, {
            onConflict: "channel_id,user_id"
          })
        );
      }

      await expectData(
        this.client
          .from("invites")
          .update({
            uses: Number(invite.uses || 0) + 1
          })
          .eq("id", invite.id)
      );
    }

    return {
      already_joined: alreadyJoined,
      channel_id: defaultChannel?.id || null,
      guild_id: guild.id,
      invite: await this.getInviteByCode({
        code: normalizedCode,
        userId
      })
    };
  }

  async createOrGetDm({ ownerId, recipientId }) {
    if (ownerId === recipientId) {
      throw createError("No puedes abrir un DM contigo mismo.", 400);
    }

    const recipient = await this.getProfileById(recipientId);
    if (!recipient) {
      throw createError("Destinatario no encontrado.", 404);
    }

    const memberships = await expectData(
      this.client
        .from("channel_members")
        .select("*")
        .in("user_id", [ownerId, recipientId])
    );

    const candidateIds = [...new Set(memberships.map((item) => item.channel_id))];
    if (candidateIds.length) {
      const [candidateChannels, candidateMemberships] = await Promise.all([
        expectData(
          this.client
            .from("channels")
            .select("*")
            .in("id", candidateIds)
            .eq("type", CHANNEL_TYPES.DM)
        ),
        expectData(
          this.client
            .from("channel_members")
            .select("*")
            .in("channel_id", candidateIds)
        )
      ]);

      const exact = candidateChannels.find((channel) => {
        const participants = candidateMemberships
          .filter((item) => item.channel_id === channel.id)
          .map((item) => item.user_id)
          .sort();
        const expected = [ownerId, recipientId].sort();
        return (
          participants.length === 2 &&
          participants[0] === expected[0] &&
          participants[1] === expected[1]
        );
      });

      if (exact) {
        return exact;
      }
    }

    const now = new Date().toISOString();
    const channel = {
      id: createId(),
      guild_id: null,
      type: CHANNEL_TYPES.DM,
      name: "",
      topic: "Conversación directa",
      position: 0,
      parent_id: null,
      created_by: ownerId,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: now,
      updated_at: now
    };

    await expectData(this.client.from("channels").insert(channel));
    await expectData(
      this.client.from("channel_members").insert([
        {
          channel_id: channel.id,
          user_id: ownerId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        },
        {
          channel_id: channel.id,
          user_id: recipientId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        }
      ])
    );

    return channel;
  }

  async createOrGetDm({ ownerId, recipientId }) {
    if (ownerId === recipientId) {
      throw createError("No puedes abrir un DM contigo mismo.", 400);
    }

    const dmKey = buildDirectDmKey(ownerId, recipientId);
    this.dmLocks = this.dmLocks || new Map();
    const existingLock = this.dmLocks.get(dmKey);
    if (existingLock) {
      return existingLock;
    }

    const task = (async () => {
      const recipient = await this.getProfileById(recipientId);
      if (!recipient) {
        throw createError("Destinatario no encontrado.", 404);
      }

      const memberships = await expectData(
        this.client
          .from("channel_members")
          .select("*")
          .in("user_id", [ownerId, recipientId])
      );

      const candidateIds = [...new Set(memberships.map((item) => item.channel_id))];
      if (candidateIds.length) {
        const [candidateChannels, candidateMemberships] = await Promise.all([
          expectData(
            this.client
              .from("channels")
              .select("*")
              .in("id", candidateIds)
              .eq("type", CHANNEL_TYPES.DM)
          ),
          expectData(
            this.client
              .from("channel_members")
              .select("*")
              .in("channel_id", candidateIds)
          )
        ]);

        const exact = candidateChannels.find((channel) => {
          const participants = candidateMemberships
            .filter((item) => item.channel_id === channel.id)
            .map((item) => item.user_id)
            .sort();
          const expected = [ownerId, recipientId].sort();
          return (
            participants.length === 2 &&
            participants[0] === expected[0] &&
            participants[1] === expected[1]
          );
        });

        if (exact) {
          return exact;
        }
      }

      const now = new Date().toISOString();
      const channel = {
        id: createId(),
        guild_id: null,
        type: CHANNEL_TYPES.DM,
        name: "",
        topic: "ConversaciÃ³n directa",
        position: 0,
        parent_id: null,
        created_by: ownerId,
        last_message_id: null,
        last_message_author_id: null,
        last_message_preview: "",
        last_message_at: null,
        created_at: now,
        updated_at: now
      };

      await expectData(this.client.from("channels").insert(channel));
      await expectData(
        this.client.from("channel_members").insert([
          {
            channel_id: channel.id,
            user_id: ownerId,
            last_read_message_id: null,
            last_read_at: null,
            hidden: false,
            joined_at: now
          },
          {
            channel_id: channel.id,
            user_id: recipientId,
            last_read_message_id: null,
            last_read_at: null,
            hidden: false,
            joined_at: now
          }
        ])
      );

      return channel;
    })();

    this.dmLocks.set(dmKey, task);

    try {
      return await task;
    } finally {
      if (this.dmLocks.get(dmKey) === task) {
        this.dmLocks.delete(dmKey);
      }
    }
  }

  async createGroupDm({ name = "", ownerId, recipientIds }) {
    const uniqueRecipientIds = [...new Set((recipientIds || []).map((id) => String(id)).filter(Boolean))]
      .filter((id) => id !== ownerId);

    if (uniqueRecipientIds.length < 2) {
      throw createError("Selecciona al menos dos amigos para crear el grupo.", 400);
    }

    const participantIds = [ownerId, ...uniqueRecipientIds];
    const profiles = await expectData(
      this.client.from("profiles").select("id").in("id", participantIds)
    );

    if (profiles.length !== participantIds.length) {
      throw createError("Una de las personas seleccionadas ya no esta disponible.", 400);
    }

    const now = new Date().toISOString();
    const channel = {
      id: createId(),
      guild_id: null,
      type: CHANNEL_TYPES.GROUP_DM,
      name: String(name || "").trim(),
      topic: "Grupo directo",
      position: 0,
      parent_id: null,
      created_by: ownerId,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: now,
      updated_at: now
    };

    await expectData(this.client.from("channels").insert(channel));
    await expectData(
      this.client.from("channel_members").insert(
        participantIds.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        }))
      )
    );

    return channel;
  }

  async sendFriendRequest({ recipientId, requesterId }) {
    if (!recipientId) {
      throw createError("Selecciona a quien quieres anadir.", 400);
    }

    if (String(requesterId) === String(recipientId)) {
      throw createError("No puedes enviarte una solicitud a ti mismo.", 400);
    }

    const recipient = await this.getProfileById(recipientId);
    if (!recipient) {
      throw createError("Usuario no encontrado.", 404);
    }

    const [leftId, rightId] = buildFriendshipPair(requesterId, recipientId);

    const [friendships, forwardPending, reversePending, outgoingBlock, incomingBlock] = await Promise.all([
      expectData(
        this.client
          .from("friendships")
          .select("*")
          .eq("user_id", leftId)
          .eq("friend_id", rightId)
          .limit(1)
      ),
      expectData(
        this.client
          .from("friend_requests")
          .select("*")
          .eq("requester_id", requesterId)
          .eq("recipient_id", recipientId)
          .eq("status", "pending")
          .limit(1)
      ),
      expectData(
        this.client
          .from("friend_requests")
          .select("*")
          .eq("requester_id", recipientId)
          .eq("recipient_id", requesterId)
          .eq("status", "pending")
          .limit(1)
      ),
      expectData(
        this.client
          .from("user_blocks")
          .select("*")
          .eq("blocker_id", requesterId)
          .eq("blocked_id", recipientId)
          .limit(1)
      ),
      expectData(
        this.client
          .from("user_blocks")
          .select("*")
          .eq("blocker_id", recipientId)
          .eq("blocked_id", requesterId)
          .limit(1)
      )
    ]);

    if (outgoingBlock[0] || incomingBlock[0]) {
      throw createError("No puedes enviar una solicitud a esta persona.", 403);
    }

    if (friendships[0]) {
      return {
        request: null,
        status: "friends"
      };
    }

    if (reversePending[0]) {
      const accepted = await this.acceptFriendRequest({
        requestId: reversePending[0].id,
        userId: requesterId
      });
      return {
        ...accepted,
        status: "accepted"
      };
    }

    if (forwardPending[0]) {
      return {
        request: forwardPending[0],
        status: "pending"
      };
    }

    const createdAt = new Date().toISOString();
    const createdRows = await expectData(
      this.client
        .from("friend_requests")
        .insert({
          id: createId(),
          requester_id: requesterId,
          recipient_id: recipientId,
          status: "pending",
          created_at: createdAt
        })
        .select("*")
    );

    return {
      request: createdRows[0] || null,
      status: "pending"
    };
  }

  async acceptFriendRequest({ requestId, userId }) {
    const rows = await expectData(
      this.client.from("friend_requests").select("*").eq("id", requestId).limit(1)
    );
    const request = rows[0];

    if (!request || request.status !== "pending") {
      throw createError("La solicitud ya no esta disponible.", 404);
    }

    if (String(request.recipient_id) !== String(userId)) {
      throw createError("No puedes aceptar esta solicitud.", 403);
    }

    const [leftId, rightId] = buildFriendshipPair(request.requester_id, request.recipient_id);
    const createdAt = new Date().toISOString();

    await expectData(
      this.client
        .from("friendships")
        .upsert(
          {
            id: createId(),
            user_id: leftId,
            friend_id: rightId,
            created_at: createdAt
          },
          { onConflict: "user_id,friend_id" }
        )
        .select("*")
    );

    await expectData(
      this.client
        .from("friend_requests")
        .delete()
        .or(
          `and(requester_id.eq.${request.requester_id},recipient_id.eq.${request.recipient_id}),and(requester_id.eq.${request.recipient_id},recipient_id.eq.${request.requester_id})`
        )
    );

    return {
      friend_id: request.requester_id,
      request_id: request.id
    };
  }

  async cancelFriendRequest({ requestId, userId }) {
    const rows = await expectData(
      this.client.from("friend_requests").select("*").eq("id", requestId).limit(1)
    );
    const request = rows[0];

    if (!request || request.status !== "pending") {
      throw createError("La solicitud ya no esta disponible.", 404);
    }

    if (![request.requester_id, request.recipient_id].includes(userId)) {
      throw createError("No puedes cancelar esta solicitud.", 403);
    }

    await expectData(
      this.client.from("friend_requests").delete().eq("id", requestId)
    );

    return {
      ok: true,
      request_id: requestId
    };
  }

  async removeFriend({ friendId, userId }) {
    if (!friendId) {
      throw createError("Selecciona una amistad valida.", 400);
    }

    const [leftId, rightId] = buildFriendshipPair(userId, friendId);
    await expectData(
      this.client
        .from("friendships")
        .delete()
        .eq("user_id", leftId)
        .eq("friend_id", rightId)
    );

    return {
      friend_id: friendId,
      ok: true
    };
  }

  async blockUser({ targetUserId, userId }) {
    if (!targetUserId || String(targetUserId) === String(userId)) {
      throw createError("No puedes bloquear este perfil.", 400);
    }

    const target = await this.getProfileById(targetUserId);
    if (!target) {
      throw createError("Usuario no encontrado.", 404);
    }

    const [leftId, rightId] = buildFriendshipPair(userId, targetUserId);
    const createdAt = new Date().toISOString();

    await expectData(
      this.client
        .from("user_blocks")
        .upsert(
          {
            id: createId(),
            blocker_id: userId,
            blocked_id: targetUserId,
            created_at: createdAt
          },
          { onConflict: "blocker_id,blocked_id" }
        )
        .select("*")
    );

    await Promise.all([
      expectData(
        this.client
          .from("friendships")
          .delete()
          .eq("user_id", leftId)
          .eq("friend_id", rightId)
      ),
      expectData(
        this.client
          .from("friend_requests")
          .delete()
          .or(
            `and(requester_id.eq.${userId},recipient_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},recipient_id.eq.${userId})`
          )
      )
    ]);

    return {
      ok: true,
      target_user_id: targetUserId
    };
  }

  async reportProfile({ reason = "spam", reporterId, targetUserId }) {
    if (!targetUserId || String(targetUserId) === String(reporterId)) {
      throw createError("No puedes reportar este perfil.", 400);
    }

    const target = await this.getProfileById(targetUserId);
    if (!target) {
      throw createError("Usuario no encontrado.", 404);
    }

    const createdRows = await expectData(
      this.client
        .from("profile_reports")
        .insert({
          id: createId(),
          reporter_id: reporterId,
          target_user_id: targetUserId,
          reason: String(reason || "spam").trim() || "spam",
          created_at: new Date().toISOString()
        })
        .select("*")
    );

    return {
      ok: true,
      report: createdRows[0] || null
    };
  }

  async markChannelRead({ channelId, lastReadMessageId = null, userId }) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    if (!(await this.canAccessChannel({ channelId, userId }))) {
      throw createError("No puedes acceder a este canal.", 403);
    }

    const targetMessageId = lastReadMessageId || channel.last_message_id || null;
    const targetMessage = targetMessageId ? await this.getMessage(targetMessageId) : null;

    if (targetMessage && targetMessage.channel_id !== channelId) {
      throw createError("El mensaje leido no pertenece a este canal.", 400);
    }

    await expectData(
      this.client.from("channel_members").upsert(
        {
          channel_id: channelId,
          user_id: userId,
          last_read_message_id: targetMessageId,
          last_read_at: targetMessage?.created_at || new Date().toISOString(),
          hidden: false,
          joined_at: new Date().toISOString()
        },
        { onConflict: "channel_id,user_id" }
      )
    );

    return {
      channel_id: channelId,
      last_read_message_id: targetMessageId
    };
  }

  async markGuildRead({ guildId, userId }) {
    const [guildRows, membershipRows, channels] = await Promise.all([
      expectData(this.client.from("guilds").select("id").eq("id", guildId).limit(1)),
      expectData(
        this.client
          .from("guild_members")
          .select("guild_id,user_id")
          .eq("guild_id", guildId)
          .eq("user_id", userId)
          .limit(1)
      ),
      expectData(this.client.from("channels").select("*").eq("guild_id", guildId))
    ]);

    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    if (!membershipRows[0]) {
      throw createError("No perteneces a este servidor.", 403);
    }

    const rows = channels
      .filter((channel) => channel.type !== CHANNEL_TYPES.CATEGORY)
      .map((channel) => ({
        channel_id: channel.id,
        user_id: userId,
        last_read_message_id: channel.last_message_id || null,
        last_read_at: channel.last_message_at || new Date().toISOString(),
        hidden: false,
        joined_at: new Date().toISOString()
      }));

    if (rows.length) {
      await expectData(
        this.client.from("channel_members").upsert(rows, {
          onConflict: "channel_id,user_id"
        })
      );
    }

    return {
      guild_id: guildId
    };
  }

  async leaveGuild({ guildId, userId }) {
    const [guildRows, membershipRows, channels] = await Promise.all([
      expectData(this.client.from("guilds").select("id").eq("id", guildId).limit(1)),
      expectData(
        this.client
          .from("guild_members")
          .select("guild_id,user_id")
          .eq("guild_id", guildId)
          .eq("user_id", userId)
          .limit(1)
      ),
      expectData(this.client.from("channels").select("id").eq("guild_id", guildId))
    ]);

    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    if (!membershipRows[0]) {
      throw createError("No perteneces a este servidor.", 403);
    }

    const guildChannelIds = channels.map((channel) => channel.id);

    if (guildChannelIds.length) {
      await expectData(
        this.client
          .from("channel_members")
          .delete()
          .eq("user_id", userId)
          .in("channel_id", guildChannelIds)
      );
    }

    await expectData(
      this.client
        .from("guild_members")
        .delete()
        .eq("guild_id", guildId)
        .eq("user_id", userId)
    );

    return {
      guild_id: guildId,
      left: true
    };
  }

  async setPresence({ status, userId }) {
    const rows = await expectData(
      this.client
        .from("profiles")
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("*")
    );

    return rows[0] || null;
  }

  async updateProfile({
    avatarHue,
    avatarUrl,
    bannerImageUrl,
    bio,
    customStatus,
    profileColor,
    userId,
    username
  }) {
    const profile = await this.getProfileById(userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    const nextUsername = sanitizeUsername(username);
    const duplicate = await expectData(
      this.client
        .from("profiles")
        .select("id")
        .neq("id", userId)
        .eq("username", nextUsername)
        .limit(1)
    );

    if (duplicate[0]) {
      throw createError("Ese nombre de usuario ya esta en uso.", 400);
    }

    const rows = await expectData(
      this.client
        .from("profiles")
        .update({
          username: nextUsername,
          bio: String(bio || "").trim().slice(0, 240),
          custom_status: String(customStatus || "").trim().slice(0, 80),
          avatar_hue: Math.max(0, Math.min(360, Number(avatarHue) || 220)),
          avatar_url:
            avatarUrl !== undefined
              ? String(avatarUrl || "").trim()
              : profile.avatar_url || "",
          profile_banner_url:
            bannerImageUrl !== undefined
              ? String(bannerImageUrl || "").trim()
              : profile.profile_banner_url || "",
          profile_color: normalizeProfileColor(
            profileColor,
            profile.profile_color || "#5865F2"
          ),
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("*")
    );

    return rows[0] || null;
  }

  async storeAttachments(files = []) {
    const attachments = [];

    for (const file of files) {
      if (!file?.buffer || !file.mimetype?.startsWith("image/")) {
        continue;
      }

      const extension = (file.originalname || "").includes(".")
        ? file.originalname.slice(file.originalname.lastIndexOf("."))
        : ".png";
      const objectPath = `${new Date().toISOString().slice(0, 10)}/${createId()}${extension}`;

      const { error } = await this.client.storage
        .from(this.attachmentsBucket)
        .upload(objectPath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) {
        throw createError(error.message || "No se pudo subir el adjunto.", 500);
      }

      const { data } = this.client.storage
        .from(this.attachmentsBucket)
        .getPublicUrl(objectPath);

      attachments.push({
        content_type: file.mimetype,
        name: file.originalname || objectPath,
        path: objectPath,
        size: file.size || file.buffer.length,
        url: data.publicUrl
      });
    }

    return attachments;
  }

  async syncConnectionPresence({ isOnline, userId }) {
    const rows = await expectData(
      this.client.from("profiles").select("*").eq("id", userId).limit(1)
    );
    const profile = rows[0];
    if (!profile) {
      return null;
    }

    let nextStatus = profile.status;
    if (isOnline) {
      if (profile.status === "offline") {
        nextStatus = "online";
      }
    } else if (profile.status !== "invisible") {
      nextStatus = "offline";
    }

    if (nextStatus !== profile.status) {
      return this.setPresence({ status: nextStatus, userId });
    }

    return profile;
  }

  async refreshChannelSummary(channelId) {
    const latest = await expectData(
      this.client
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
    );

    const message = latest[0];
    await expectData(
      this.client
        .from("channels")
        .update({
          last_message_id: message?.id ?? null,
          last_message_author_id: message?.author_id ?? null,
          last_message_preview: message
            ? buildMessagePreview(message.content, message.attachments || [])
            : "",
          last_message_at: message?.created_at ?? null,
          updated_at: new Date().toISOString()
        })
        .eq("id", channelId)
    );
  }

  async getChannelSnapshot(channelId, userId, messageId = null) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return null;
    }

    if (!(await this.canAccessChannel({ channelId, userId }))) {
      throw createError("No puedes acceder a este canal.", 403);
    }

    if (messageId) {
      const target = await this.getMessage(messageId);
      if (!target || target.deleted_at) {
        return null;
      }
      const replyTarget = target.reply_to ? await this.getMessage(target.reply_to) : null;
      return this.buildMessageSnapshot({
        channel,
        message: target,
        replyTarget,
        userId
      });
    }

    const rows = await expectData(
      this.client
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
    );
    const messages = rows;

    if (!messages.length) {
      return null;
    }
    const targetMessage = [...messages].sort(sortByDateDesc)[0];
    const replyTarget = targetMessage.reply_to ? await this.getMessage(targetMessage.reply_to) : null;

    return this.buildMessageSnapshot({
      channel,
      message: targetMessage,
      replyTarget,
      userId
    });
  }

  async getChannelPreview(channelId) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return null;
    }

    return {
      id: channel.id,
      last_message_id: channel.last_message_id,
      last_message_author_id: channel.last_message_author_id,
      last_message_preview: channel.last_message_preview,
      last_message_at: channel.last_message_at
    };
  }
}.prototype;
