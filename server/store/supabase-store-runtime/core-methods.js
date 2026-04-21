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
  resolveMessageSticker,
  resolveMentionUserIds,
  sanitizeCategoryName,
  sanitizeChannelName,
  sanitizeStickerName,
  sanitizeUsername,
  sortByDateDesc,
  sortGuildStickers
} from "./shared.js";

export const supabaseStoreRuntimeCoreMethods = {
  async getNextGuildMembershipPosition(userId) {
    const memberships = await expectData(
      this.client.from("guild_members").select("position").eq("user_id", userId)
    );

    return (
      memberships.reduce(
        (max, membership) => Math.max(max, Number(membership.position || 0)),
        -1
      ) + 1
    );
  }
,
  async buildMessageSnapshot({ channel, message, replyTarget = null, userId }) {
    if (!channel || !message) {
      return null;
    }

    const messageBundle = [message, replyTarget].filter(Boolean);
    const profileIds = [...new Set(messageBundle.map((item) => item.author_id).filter(Boolean))];
    const memberIds = [...new Set([userId, ...profileIds].filter(Boolean))];

    const [profiles, guilds, roles, guildMembers, reactions, guildStickers] = await Promise.all([
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
      ),
      this.loadGuildStickers(channel.guild_id)
    ]);

    const enriched = enrichMessages({
      channelId: channel.id,
      db: {
        profiles,
        guilds,
        roles,
        guild_members: guildMembers,
        guild_stickers: guildStickers,
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
,
  async updateChannelSummary(channelId, message = null, sticker = null) {
    const preview = {
      id: channelId,
      last_message_id: message?.id ?? null,
      last_message_author_id: message?.author_id ?? null,
      last_message_preview: message
        ? buildMessagePreview(message.content, message.attachments || [], sticker)
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
,
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
    const persistedSticker = message?.sticker_id
      ? await this.getGuildStickerById(message.sticker_id, message.guild_id)
      : null;
    const sticker = resolveMessageSticker(message, {
      guild_stickers: persistedSticker ? [persistedSticker] : [],
      guilds: []
    });
    await expectData(
      this.client
        .from("channels")
        .update({
          last_message_id: message?.id ?? null,
          last_message_author_id: message?.author_id ?? null,
          last_message_preview: message
            ? buildMessagePreview(message.content, message.attachments || [], sticker)
            : "",
          last_message_at: message?.created_at ?? null,
          updated_at: new Date().toISOString()
        })
        .eq("id", channelId)
    );
  }
,
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
,
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
};
