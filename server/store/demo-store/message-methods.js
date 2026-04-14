import { CHANNEL_TYPES } from "../../constants.js";
import {
  createId,
  enrichMessages,
  isGuildVoiceChannel,
  refreshChannelSummaries,
  resolveMentionUserIds,
  sortByDateDesc,
  upsertChannelMembership
} from "../helpers.js";
import { createError } from "./shared.js";

export const demoStoreMessageMethods = {
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
,
  async createMessage({
    attachments = [],
    authorId,
    channelId,
    clientNonce = null,
    content,
    stickerId = null,
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
    const sticker = stickerId
      ? this.db.guild_stickers.find((item) => item.id === stickerId) || null
      : null;

    if (stickerId && !sticker) {
      throw createError("El sticker seleccionado no existe.", 400);
    }

    if (sticker && !channel.guild_id) {
      throw createError("Los stickers del servidor solo funcionan dentro de ese servidor.", 400);
    }

    if (sticker && sticker.guild_id !== channel.guild_id) {
      throw createError("Ese sticker no pertenece a este servidor.", 400);
    }
    if (!trimmed && !attachments.length && !sticker) {
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
      sticker_id: sticker?.id || null,
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
,
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
,
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
,
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
,
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
,
  async markGuildRead({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const isMember = this.db.guild_members.some(
      (membership) => membership.guild_id === guildId && membership.user_id === userId
    );
    if (!isMember) {
      throw createError("No perteneces a este servidor.", 403);
    }

    const joinedAt = new Date().toISOString();

    this.db.channels
      .filter((channel) => channel.guild_id === guildId && channel.type !== CHANNEL_TYPES.CATEGORY)
      .forEach((channel) => {
        const targetMessageId = channel.last_message_id || null;
        const targetMessage = targetMessageId ? this.getMessage(targetMessageId) : null;

        upsertChannelMembership(this.db, {
          channel_id: channel.id,
          user_id: userId,
          last_read_message_id: targetMessageId,
          last_read_at: targetMessage?.created_at || new Date().toISOString(),
          hidden: false,
          joined_at: joinedAt
        });
      });

    await this.save();

    return {
      guild_id: guildId
    };
  }
};
