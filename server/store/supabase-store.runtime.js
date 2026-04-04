import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  PERMISSIONS
} from "../constants.js";
import {
  buildMessagePreview,
  createId,
  enrichMessages,
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
        banner_color: "#5865F2",
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

  async createChannel({ createdBy, guildId, kind = GUILD_CHANNEL_KINDS.TEXT, name, topic = "" }) {
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

    const trimmed = name?.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed) {
      throw createError("El canal necesita un nombre.", 400);
    }

    const existingChannels = await expectData(
      this.client.from("channels").select("id,name,position").eq("guild_id", guildId)
    );
    if (existingChannels.some((channel) => channel.name === trimmed)) {
      throw createError("Ya existe un canal con ese nombre.", 400);
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
      parent_id: null,
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
