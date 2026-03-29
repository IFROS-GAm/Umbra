import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_TYPES, PERMISSIONS } from "../constants.js";
import { createSeedData } from "../seed-data.js";
import {
  buildBootstrapState,
  computePermissionBits,
  createId,
  enrichMessages,
  refreshChannelSummaries,
  resolveMentionUserIds,
  safePreview,
  sortByDateDesc,
  upsertChannelMembership
} from "./helpers.js";

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export class DemoStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
  }

  getMode() {
    return "demo";
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.db = JSON.parse(raw);
    } catch {
      this.db = createSeedData();
      refreshChannelSummaries(this.db);
      await this.save();
    }

    refreshChannelSummaries(this.db);
    return this;
  }

  getDefaultUserId() {
    return this.db?.profiles?.[0]?.id ?? null;
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

    if (
      (permissionBits & PERMISSIONS.MANAGE_CHANNELS) !==
      PERMISSIONS.MANAGE_CHANNELS
    ) {
      throw createError("No tienes permisos para crear canales.", 403);
    }
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

  async createMessage({ authorId, channelId, content, replyTo = null }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      throw createError("El mensaje no puede estar vacío.", 400);
    }

    this.assertCanSend(channel, authorId);

    if (replyTo) {
      const target = this.getMessage(replyTo);
      if (!target || target.channel_id !== channelId) {
        throw createError("El mensaje al que respondes no existe en este canal.", 400);
      }
    }

    const message = {
      id: createId(),
      channel_id: channelId,
      guild_id: channel.guild_id,
      author_id: authorId,
      content: trimmed,
      reply_to: replyTo,
      attachments: [],
      mention_user_ids: resolveMentionUserIds(trimmed, this.db.profiles),
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

    return enrichMessages({
      channelId,
      db: this.db,
      messages: [message],
      userId: authorId
    })[0];
  }

  async updateMessage({ content, messageId, userId }) {
    const message = this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    if (message.author_id !== userId) {
      throw createError("Solo el autor puede editar este mensaje.", 403);
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      throw createError("El mensaje editado no puede estar vacío.", 400);
    }

    message.content = trimmed;
    message.mention_user_ids = resolveMentionUserIds(trimmed, this.db.profiles);
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

  async createGuild({ description = "", name, ownerId }) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    const guildId = createId();
    const everyoneRoleId = createId();
    const ownerRoleId = createId();
    const generalChannelId = createId();
    const now = new Date().toISOString();

    this.db.guilds.push({
      id: guildId,
      name: trimmed,
      description: description.trim(),
      icon_text: trimmed
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join(""),
      banner_color: "#5865F2",
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

    this.db.channels.push({
      id: generalChannelId,
      guild_id: guildId,
      type: CHANNEL_TYPES.TEXT,
      name: "general",
      topic: "Canal inicial del servidor.",
      position: 0,
      parent_id: null,
      created_by: ownerId,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: now,
      updated_at: now
    });

    upsertChannelMembership(this.db, {
      channel_id: generalChannelId,
      user_id: ownerId,
      last_read_message_id: null,
      last_read_at: null,
      hidden: false,
      joined_at: now
    });

    refreshChannelSummaries(this.db);
    await this.save();

    return {
      guild_id: guildId,
      channel_id: generalChannelId
    };
  }

  async createChannel({ createdBy, guildId, name, topic = "" }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageChannels(guildId, createdBy);

    const trimmed = name?.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed) {
      throw createError("El canal necesita un nombre.", 400);
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
      type: CHANNEL_TYPES.TEXT,
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

    this.db.channels.push(channel);
    await this.save();

    return channel;
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
