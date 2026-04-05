import fs from "node:fs/promises";
import path from "node:path";

import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  PERMISSIONS
} from "../constants.js";
import { createSeedData } from "../seed-data.js";
import {
  buildInvitePreview,
  buildBootstrapState,
  computePermissionBits,
  createId,
  enrichMessages,
  getDefaultGuildChannel,
  isGuildVoiceChannel,
  refreshChannelSummaries,
  resolveMentionUserIds,
  sortByDateDesc,
  upsertChannelMembership
} from "./helpers.js";

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

function sanitizeChannelName(candidate = "") {
  return String(candidate || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function sanitizeCategoryName(candidate = "") {
  return String(candidate || "").trim();
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

export class DemoStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.uploadDir = path.join(path.dirname(filePath), "uploads");
    this.db = null;
  }

  getMode() {
    return "demo";
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.mkdir(this.uploadDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.db = JSON.parse(raw);
    } catch {
      this.db = createSeedData();
      refreshChannelSummaries(this.db);
      await this.save();
    }

    this.db.profiles = (this.db.profiles || []).map((profile) => ({
      avatar_url: "",
      profile_banner_url: "",
      profile_color: "#5865F2",
      ...profile
    }));
    this.db.guilds = (this.db.guilds || []).map((guild) => ({
      icon_url: "",
      banner_image_url: "",
      ...guild
    }));
    this.db.invites = this.db.invites || [];

    refreshChannelSummaries(this.db);
    return this;
  }

  getDefaultUserId() {
    return this.db?.profiles?.[0]?.id ?? null;
  }

  getProfileById(profileId) {
    return this.db.profiles.find((profile) => profile.id === profileId) || null;
  }

  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.db, null, 2), "utf8");
  }

  getChannel(channelId) {
    return this.db.channels.find((channel) => channel.id === channelId);
  }

  getMessage(messageId) {
    return this.db.messages.find((message) => message.id === messageId);
  }

  canAccessChannel({ channelId, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      return false;
    }

    if (channel.guild_id) {
      return this.db.guild_members.some(
        (membership) =>
          membership.guild_id === channel.guild_id && membership.user_id === userId
      );
    }

    return this.db.channel_members.some(
      (membership) =>
        membership.channel_id === channelId &&
        membership.user_id === userId &&
        !membership.hidden
    );
  }

  assertCanSend(channel, userId) {
    if (!channel?.guild_id) {
      return;
    }

    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId: channel.guild_id,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.SEND_MESSAGES) !== PERMISSIONS.SEND_MESSAGES) {
      throw createError("No tienes permisos para enviar mensajes en este canal.", 403);
    }
  }

  assertCanManageMessages(channel, userId) {
    if (!channel?.guild_id) {
      return false;
    }

    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId: channel.guild_id,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    return (permissionBits & PERMISSIONS.MANAGE_MESSAGES) === PERMISSIONS.MANAGE_MESSAGES;
  }

  assertCanManageChannels(guildId, userId) {
    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.ADMINISTRATOR) !== PERMISSIONS.ADMINISTRATOR) {
      throw createError("Solo el administrador puede cambiar la estructura del servidor.", 403);
    }
  }

  assertCanManageGuild(guildId, userId) {
    this.assertCanManageChannels(guildId, userId);
  }

  async bootstrap(userId) {
    refreshChannelSummaries(this.db);
    return buildBootstrapState(this.db, userId);
  }

  async listChannelMessages({ before, channelId, limit = 30, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    const filtered = this.db.messages
      .filter((message) => message.channel_id === channelId && !message.deleted_at)
      .sort(sortByDateDesc);

    let sliceBase = filtered;
    if (before) {
      const anchor = filtered.find((message) => message.id === before);
      if (anchor) {
        sliceBase = filtered.filter(
          (message) =>
            new Date(message.created_at).getTime() <
              new Date(anchor.created_at).getTime() ||
            (message.created_at === anchor.created_at && message.id !== anchor.id)
        );
      }
    }

    const page = sliceBase.slice(0, limit);

    return {
      messages: enrichMessages({
        channelId,
        db: this.db,
        messages: page,
        userId
      }),
      has_more: sliceBase.length > limit
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
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    if (isGuildVoiceChannel(channel)) {
      throw createError("No puedes enviar mensajes dentro de un canal de voz.", 400);
    }

    const trimmed = content?.trim() || "";
    if (!trimmed && !attachments.length) {
      throw createError("El mensaje no puede estar vacío.", 400);
    }

    this.assertCanSend(channel, authorId);

    let replyTarget = null;
    if (replyTo) {
      replyTarget = this.getMessage(replyTo);
      if (!replyTarget || replyTarget.channel_id !== channelId) {
        throw createError("El mensaje al que respondes no existe en este canal.", 400);
      }
    }

    const mentionUserIds = resolveMentionUserIds(trimmed, this.db.profiles, {
      audienceUserIds: channel.guild_id
        ? this.db.guild_members
            .filter((membership) => membership.guild_id === channel.guild_id)
            .map((membership) => membership.user_id)
        : this.db.channel_members
            .filter((membership) => membership.channel_id === channelId && !membership.hidden)
            .map((membership) => membership.user_id),
      authorId
    });

    if (
      replyTarget &&
      replyMentionUserId &&
      replyTarget.author_id === replyMentionUserId &&
      replyTarget.author_id !== authorId &&
      !mentionUserIds.includes(replyTarget.author_id)
    ) {
      mentionUserIds.push(replyTarget.author_id);
    }

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
      created_at: new Date().toISOString()
    };

    this.db.messages.push(message);

    upsertChannelMembership(this.db, {
      channel_id: channelId,
      user_id: authorId,
      last_read_message_id: message.id,
      last_read_at: message.created_at,
      hidden: false,
      joined_at: new Date().toISOString()
    });

    refreshChannelSummaries(this.db);
    await this.save();

    const enrichedMessage = enrichMessages({
      channelId,
      db: this.db,
      messages: [message],
      userId: authorId
    })[0];

    if (enrichedMessage && clientNonce) {
      enrichedMessage.client_nonce = clientNonce;
    }

    return {
      message: enrichedMessage,
      preview: this.getChannelPreview(channelId)
    };
  }

  async updateMessage({ content, messageId, userId }) {
    const message = this.getMessage(messageId);
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

    message.content = trimmed;
    message.mention_user_ids = resolveMentionUserIds(trimmed, this.db.profiles, {
      audienceUserIds: message.guild_id
        ? this.db.guild_members
            .filter((membership) => membership.guild_id === message.guild_id)
            .map((membership) => membership.user_id)
        : this.db.channel_members
            .filter((membership) => membership.channel_id === message.channel_id && !membership.hidden)
            .map((membership) => membership.user_id),
      authorId: userId
    });
    message.edited_at = new Date().toISOString();

    refreshChannelSummaries(this.db);
    await this.save();

    return enrichMessages({
      channelId: message.channel_id,
      db: this.db,
      messages: [message],
      userId
    })[0];
  }

  async deleteMessage({ messageId, userId }) {
    const message = this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    const channel = this.getChannel(message.channel_id);
    const canManage = this.assertCanManageMessages(channel, userId);
    if (message.author_id !== userId && !canManage) {
      throw createError("No puedes eliminar este mensaje.", 403);
    }

    this.db.messages = this.db.messages.filter((item) => item.id !== messageId);
    this.db.message_reactions = this.db.message_reactions.filter(
      (reaction) => reaction.message_id !== messageId
    );

    refreshChannelSummaries(this.db);
    await this.save();

    return {
      id: messageId,
      channel_id: message.channel_id
    };
  }

  async toggleReaction({ emoji, messageId, userId }) {
    const message = this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    const existing = this.db.message_reactions.find(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.user_id === userId &&
        reaction.emoji === emoji
    );

    if (existing) {
      this.db.message_reactions = this.db.message_reactions.filter(
        (reaction) =>
          !(
            reaction.message_id === messageId &&
            reaction.user_id === userId &&
            reaction.emoji === emoji
          )
      );
    } else {
      this.db.message_reactions.push({
        message_id: messageId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString()
      });
    }

    await this.save();

    return enrichMessages({
      channelId: message.channel_id,
      db: this.db,
      messages: [message],
      userId
    })[0];
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

    this.db.guilds.push({
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
    });

    this.db.roles.push(
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
    );

    this.db.guild_members.push({
      guild_id: guildId,
      user_id: ownerId,
      role_ids: [everyoneRoleId, ownerRoleId],
      nickname: "",
      joined_at: now
    });

    const createdChannels = [];
    const textChannels =
      template.textChannels?.length ? template.textChannels : GUILD_TEMPLATES.default.textChannels;
    const voiceChannels = template.voiceChannels || [];

    [...textChannels, ...voiceChannels].forEach((channelName, index) => {
      const isVoice = index >= textChannels.length;
      const channel = {
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

      this.db.channels.push(channel);
      createdChannels.push(channel);
    });

    createdChannels.forEach((channel) => {
      upsertChannelMembership(this.db, {
        channel_id: channel.id,
        user_id: ownerId,
        last_read_message_id: null,
        last_read_at: null,
        hidden: false,
        joined_at: now
      });
    });

    refreshChannelSummaries(this.db);
    await this.save();

    return {
      guild_id: guildId,
      channel_id: createdChannels.find((channel) => channel.type === CHANNEL_TYPES.TEXT)?.id || createdChannels[0]?.id
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
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageChannels(guildId, createdBy);

    const trimmed = sanitizeChannelName(name);
    if (!trimmed) {
      throw createError("El canal necesita un nombre.", 400);
    }

    if (parentId) {
      const parent = this.db.channels.find(
        (channel) => channel.id === parentId && channel.guild_id === guildId
      );
      if (!parent || parent.type !== CHANNEL_TYPES.CATEGORY) {
        throw createError("La categoria seleccionada no existe.", 400);
      }
    }

    const existingNames = this.db.channels
      .filter((channel) => channel.guild_id === guildId)
      .map((channel) => channel.name);

    if (existingNames.includes(trimmed)) {
      throw createError("Ya existe un canal con ese nombre.", 400);
    }

    const nextPosition =
      this.db.channels
        .filter((channel) => channel.guild_id === guildId)
        .reduce((max, channel) => Math.max(max, Number(channel.position)), -1) + 1;

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

    this.db.channels.push(channel);
    await this.save();

    return channel;
  }

  async createCategory({ createdBy, guildId, name }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageChannels(guildId, createdBy);

    const trimmed = sanitizeCategoryName(name);
    if (!trimmed) {
      throw createError("La categoria necesita un nombre.", 400);
    }

    const existingNames = this.db.channels
      .filter((channel) => channel.guild_id === guildId)
      .map((channel) => channel.name.toLowerCase());

    if (existingNames.includes(trimmed.toLowerCase())) {
      throw createError("Ya existe una categoria o canal con ese nombre.", 400);
    }

    const nextPosition =
      this.db.channels
        .filter((channel) => channel.guild_id === guildId)
        .reduce((max, channel) => Math.max(max, Number(channel.position)), -1) + 1;

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

    this.db.channels.push(category);
    await this.save();

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
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    guild.name = trimmedName;
    guild.description = String(description || "").trim().slice(0, 180);
    guild.icon_text = trimmedName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("");
    if (iconUrl !== undefined) {
      guild.icon_url = String(iconUrl || "").trim();
    }
    if (bannerImageUrl !== undefined) {
      guild.banner_image_url = String(bannerImageUrl || "").trim();
    }
    guild.banner_color = normalizeProfileColor(bannerColor, guild.banner_color || "#5865F2");
    guild.updated_at = new Date().toISOString();

    await this.save();
    return guild;
  }

  async createInvite({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

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

    this.db.invites.push(invite);
    await this.save();
    return invite;
  }

  async getInviteByCode({ code, userId = null }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const invite = this.db.invites.find((item) => item.code === normalizedCode);
    assertInviteUsable(invite);

    const guild = this.db.guilds.find((item) => item.id === invite.guild_id);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    return buildInvitePreview({
      channels: this.db.channels,
      guild,
      guildMembers: this.db.guild_members,
      invite,
      profiles: this.db.profiles,
      userId
    });
  }

  async acceptInvite({ code, userId }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const invite = this.db.invites.find((item) => item.code === normalizedCode);
    assertInviteUsable(invite);

    const guild = this.db.guilds.find((item) => item.id === invite.guild_id);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const defaultChannel = getDefaultGuildChannel(this.db.channels, guild.id);
    const alreadyJoined = this.db.guild_members.some(
      (membership) => membership.guild_id === guild.id && membership.user_id === userId
    );

    if (!alreadyJoined) {
      const everyoneRole = this.db.roles.find(
        (role) => role.guild_id === guild.id && role.name === "@everyone"
      );
      const joinedAt = new Date().toISOString();

      this.db.guild_members.push({
        guild_id: guild.id,
        user_id: userId,
        role_ids: everyoneRole ? [everyoneRole.id] : [],
        nickname: "",
        joined_at: joinedAt
      });

      this.db.channels
        .filter(
          (channel) =>
            channel.guild_id === guild.id &&
            channel.type !== CHANNEL_TYPES.CATEGORY
        )
        .forEach((channel) => {
          upsertChannelMembership(this.db, {
            channel_id: channel.id,
            user_id: userId,
            last_read_message_id: null,
            last_read_at: null,
            hidden: false,
            joined_at: joinedAt
          });
        });

      invite.uses = Number(invite.uses || 0) + 1;
      await this.save();
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
    const existing = this.db.channels.find((channel) => {
      if (channel.type !== CHANNEL_TYPES.DM) {
        return false;
      }

      const participants = this.db.channel_members
        .filter((membership) => membership.channel_id === channel.id)
        .map((membership) => membership.user_id)
        .sort();

      return (
        participants.length === 2 &&
        participants[0] === [ownerId, recipientId].sort()[0] &&
        participants[1] === [ownerId, recipientId].sort()[1]
      );
    });

    if (existing) {
      return existing;
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

    this.db.channels.push(channel);
    this.db.channel_members.push(
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
    );

    await this.save();

    return channel;
  }

  async createGroupDm({ name = "", ownerId, recipientIds }) {
    const uniqueRecipientIds = [...new Set((recipientIds || []).map((id) => String(id)).filter(Boolean))]
      .filter((id) => id !== ownerId);

    if (uniqueRecipientIds.length < 2) {
      const error = new Error("Selecciona al menos dos amigos para crear el grupo.");
      error.statusCode = 400;
      throw error;
    }

    const missingUserId = uniqueRecipientIds.find(
      (userId) => !this.db.profiles.some((profile) => profile.id === userId)
    );

    if (missingUserId) {
      const error = new Error("Una de las personas seleccionadas ya no esta disponible.");
      error.statusCode = 400;
      throw error;
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

    this.db.channels.push(channel);
    [ownerId, ...uniqueRecipientIds].forEach((userId) => {
      this.db.channel_members.push({
        channel_id: channel.id,
        user_id: userId,
        last_read_message_id: null,
        last_read_at: null,
        hidden: false,
        joined_at: now
      });
    });

    await this.save();

    return channel;
  }

  async markChannelRead({ channelId, lastReadMessageId = null, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    const targetMessageId = lastReadMessageId || channel.last_message_id || null;
    const targetMessage = targetMessageId ? this.getMessage(targetMessageId) : null;

    upsertChannelMembership(this.db, {
      channel_id: channelId,
      user_id: userId,
      last_read_message_id: targetMessageId,
      last_read_at: targetMessage?.created_at || new Date().toISOString(),
      hidden: false,
      joined_at: new Date().toISOString()
    });

    await this.save();

    return {
      channel_id: channelId,
      last_read_message_id: targetMessageId
    };
  }

  async setPresence({ status, userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    profile.status = status;
    profile.updated_at = new Date().toISOString();
    await this.save();

    return profile;
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
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    const nextUsername = sanitizeUsername(username);
    const duplicate = this.db.profiles.find(
      (item) => item.id !== userId && item.username.toLowerCase() === nextUsername.toLowerCase()
    );

    if (duplicate) {
      throw createError("Ese nombre de usuario ya esta en uso.", 400);
    }

    profile.username = nextUsername;
    profile.bio = String(bio || "").trim().slice(0, 240);
    profile.custom_status = String(customStatus || "").trim().slice(0, 80);
    profile.avatar_hue = Math.max(0, Math.min(360, Number(avatarHue) || 220));
    if (avatarUrl !== undefined) {
      profile.avatar_url = String(avatarUrl || "").trim();
    }
    if (bannerImageUrl !== undefined) {
      profile.profile_banner_url = String(bannerImageUrl || "").trim();
    }
    profile.profile_color = normalizeProfileColor(
      profileColor,
      profile.profile_color || "#5865F2"
    );
    profile.updated_at = new Date().toISOString();
    await this.save();

    return profile;
  }

  async storeAttachments(files = []) {
    const attachments = [];

    for (const file of files) {
      if (!file?.buffer || !file.mimetype?.startsWith("image/")) {
        continue;
      }

      const extension = path.extname(file.originalname || "") || ".png";
      const objectName = `${createId()}${extension}`;
      await fs.writeFile(path.join(this.uploadDir, objectName), file.buffer);

      attachments.push({
        content_type: file.mimetype,
        name: file.originalname || objectName,
        path: `/uploads/${objectName}`,
        size: file.size || file.buffer.length,
        url: `/uploads/${objectName}`
      });
    }

    return attachments;
  }

  async syncConnectionPresence({ isOnline, userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      return null;
    }

    if (isOnline) {
      if (profile.status === "offline") {
        profile.status = "online";
      }
    } else if (profile.status !== "invisible") {
      profile.status = "offline";
    }

    profile.updated_at = new Date().toISOString();
    await this.save();
    return profile;
  }

  async getChannelSnapshot(channelId, userId) {
    const message = this.db.messages
      .filter((item) => item.channel_id === channelId && !item.deleted_at)
      .sort(sortByDateDesc)[0];

    if (!message) {
      return null;
    }

    return enrichMessages({
      channelId,
      db: this.db,
      messages: [message],
      userId
    })[0];
  }

  getChannelPreview(channelId) {
    const channel = this.getChannel(channelId);
    return channel
      ? {
          id: channel.id,
          last_message_id: channel.last_message_id,
          last_message_author_id: channel.last_message_author_id,
          last_message_preview: channel.last_message_preview || safePreview(""),
          last_message_at: channel.last_message_at
        }
      : null;
  }
}
