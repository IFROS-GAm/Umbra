import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  GUILD_MEMBER_MESSAGE_SELECT,
  GUILD_PERMISSION_SELECT,
  PERMISSIONS,
  PROFILE_MESSAGE_SELECT,
  REACTION_SELECT,
  ROLE_PERMISSION_SELECT,
  assertInviteUsable,
  buildDirectDmKey,
  buildFriendshipPair,
  buildGuildBanMessage,
  buildGuildMovePatchPlan,
  buildInviteCode,
  buildInvitePreview,
  buildMessagePreview,
  buildChannelMovePatchPlan,
  buildDefaultGuildStickerRows,
  createError,
  createId,
  enrichMessages,
  expectData,
  getDefaultGuildChannel,
  isGuildVoiceChannel,
  normalizeBanExpiration,
  normalizePrivacySettings,
  normalizeProfileColor,
  normalizeRecoveryAccount,
  normalizeRecoveryProvider,
  normalizeSocialLinks,
  normalizeStickerEmoji,
  resolveMentionUserIds,
  sanitizeCategoryName,
  sanitizeChannelName,
  sanitizeStickerName,
  sanitizeUsername,
  sortByDateDesc,
  sortGuildStickers
} from "./shared.js";

export const supabaseStoreRuntimeMessageMethods = {
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
    const [reactions, replyMessages, guildMessageContext] = await Promise.all([
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
      this.loadGuildMessageContext(channel.guild_id)
    ]);
    const roles = guildMessageContext?.roles || [];
    const guilds = guildMessageContext?.guilds || [];
    const guildStickers = guildMessageContext?.guild_stickers || [];

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
      guild_stickers: guildStickers,
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
    const sticker = stickerId ? await this.getGuildStickerById(stickerId) : null;

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

    if (this.guildStickersEnabled) {
      message.sticker_id = sticker?.id || null;
    }

    await expectData(this.client.from("messages").insert(message));
    const preview = await this.updateChannelSummary(channelId, message, sticker);
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
,
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
,
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
,
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
};
