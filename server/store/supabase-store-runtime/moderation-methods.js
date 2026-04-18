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

export const supabaseStoreRuntimeModerationMethods = {
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
,
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
,
  async pruneExpiredGuildBans({ guildId = null, userId = null } = {}) {
    if (!this.guildModerationEnabled) {
      return;
    }

    try {
      let query = this.client
        .from("guild_bans")
        .delete()
        .lte("expires_at", new Date().toISOString());

      if (guildId) {
        query = query.eq("guild_id", guildId);
      }

      if (userId) {
        query = query.eq("user_id", userId);
      }

      await expectData(query);
    } catch (error) {
      if (this.handleMissingGuildModerationSchemaError?.(error)) {
        return;
      }

      throw error;
    }
  }
,
  async getActiveGuildBan(guildId, userId) {
    if (!guildId || !userId || !this.guildModerationEnabled) {
      return null;
    }

    try {
      await this.pruneExpiredGuildBans({ guildId, userId });
      const rows = await expectData(
        this.client
          .from("guild_bans")
          .select("*")
          .eq("guild_id", guildId)
          .eq("user_id", userId)
          .limit(1)
      );

      return rows[0] || null;
    } catch (error) {
      if (this.handleMissingGuildModerationSchemaError?.(error)) {
        return null;
      }

      throw error;
    }
  }
,
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
,
  async assertCanModerateGuildMember(guildId, actorId, targetUserId) {
    const [guildRows, membershipRows] = await Promise.all([
      expectData(this.client.from("guilds").select("id,owner_id").eq("id", guildId).limit(1)),
      expectData(
        this.client
          .from("guild_members")
          .select("guild_id,user_id")
          .eq("guild_id", guildId)
          .eq("user_id", targetUserId)
          .limit(1)
      )
    ]);

    const guild = guildRows[0] || null;
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, actorId);
    if ((permissionBits & PERMISSIONS.MANAGE_GUILD) !== PERMISSIONS.MANAGE_GUILD) {
      throw createError("No tienes permisos para moderar miembros del servidor.", 403);
    }

    if (targetUserId === actorId) {
      throw createError("No puedes moderarte a ti mismo desde este panel.", 400);
    }

    if (targetUserId === guild.owner_id) {
      throw createError("No puedes moderar al owner del servidor.", 403);
    }

    if (!membershipRows[0]) {
      throw createError("Ese miembro ya no pertenece a este servidor.", 404);
    }

    return guild;
  }
,
  async kickGuildMember({ guildId, targetUserId, userId }) {
    await this.assertCanModerateGuildMember(guildId, userId, targetUserId);

    const channels = await expectData(
      this.client.from("channels").select("id").eq("guild_id", guildId)
    );
    const guildChannelIds = channels.map((channel) => channel.id);

    if (guildChannelIds.length) {
      await expectData(
        this.client
          .from("channel_members")
          .delete()
          .eq("user_id", targetUserId)
          .in("channel_id", guildChannelIds)
      );
    }

    await expectData(
      this.client
        .from("guild_members")
        .delete()
        .eq("guild_id", guildId)
        .eq("user_id", targetUserId)
    );

    return {
      guild_id: guildId,
      kicked: true,
      user_id: targetUserId
    };
  }
,
  async banGuildMember({ expiresAt = null, guildId, targetUserId, userId }) {
    await this.assertCanModerateGuildMember(guildId, userId, targetUserId);
    this.assertGuildModerationFeatureAvailable?.();

    const normalizedExpiresAt = normalizeBanExpiration(expiresAt);
    await this.pruneExpiredGuildBans({ guildId, userId: targetUserId });

    const [existingBanRows, channels] = await Promise.all([
      expectData(
        this.client
          .from("guild_bans")
          .select("id")
          .eq("guild_id", guildId)
          .eq("user_id", targetUserId)
          .limit(1)
      ),
      expectData(this.client.from("channels").select("id").eq("guild_id", guildId))
    ]);

    const existingBan = existingBanRows[0] || null;
    const nextBanPayload = {
      created_at: new Date().toISOString(),
      created_by: userId,
      expires_at: normalizedExpiresAt,
      guild_id: guildId,
      user_id: targetUserId
    };

    try {
      if (existingBan) {
        await expectData(
          this.client
            .from("guild_bans")
            .update(nextBanPayload)
            .eq("id", existingBan.id)
        );
      } else {
        await expectData(this.client.from("guild_bans").insert(nextBanPayload));
      }
    } catch (error) {
      if (this.handleMissingGuildModerationSchemaError?.(error)) {
        this.assertGuildModerationFeatureAvailable?.();
      }

      throw error;
    }

    const guildChannelIds = channels.map((channel) => channel.id);
    if (guildChannelIds.length) {
      await expectData(
        this.client
          .from("channel_members")
          .delete()
          .eq("user_id", targetUserId)
          .in("channel_id", guildChannelIds)
      );
    }

    await expectData(
      this.client
        .from("guild_members")
        .delete()
        .eq("guild_id", guildId)
        .eq("user_id", targetUserId)
    );

    return {
      banned: true,
      expires_at: normalizedExpiresAt,
      guild_id: guildId,
      user_id: targetUserId
    };
  }
,
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
,
  async updateProfile({
    avatarHue,
    avatarUrl,
    bannerImageUrl,
    bio,
    customStatus,
    privacySettings,
    profileColor,
    recoveryAccount,
    recoveryProvider,
    socialLinks,
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
          recovery_account:
            recoveryAccount !== undefined
              ? normalizeRecoveryAccount(recoveryAccount)
              : normalizeRecoveryAccount(profile.recovery_account),
          recovery_provider:
            recoveryProvider !== undefined
              ? normalizeRecoveryProvider(recoveryProvider)
              : normalizeRecoveryProvider(profile.recovery_provider),
          privacy_settings:
            privacySettings !== undefined
              ? normalizePrivacySettings(privacySettings)
              : normalizePrivacySettings(profile.privacy_settings),
          social_links:
            socialLinks !== undefined
              ? normalizeSocialLinks(socialLinks)
              : normalizeSocialLinks(profile.social_links),
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("*")
    );

    return rows[0] || null;
  }
,
  async storeAttachments(files = []) {
    const attachments = [];

    for (const file of files) {
      if (!file?.buffer) {
        continue;
      }

      const extension = (file.originalname || "").includes(".")
        ? file.originalname.slice(file.originalname.lastIndexOf("."))
        : ".bin";
      const objectPath = `${new Date().toISOString().slice(0, 10)}/${createId()}${extension}`;

      const { error } = await this.client.storage
        .from(this.attachmentsBucket)
        .upload(objectPath, file.buffer, {
          contentType: file.mimetype || "application/octet-stream",
          upsert: false
        });

      if (error) {
        throw createError(error.message || "No se pudo subir el adjunto.", 500);
      }

      const { data } = this.client.storage
        .from(this.attachmentsBucket)
        .getPublicUrl(objectPath);

      attachments.push({
        content_type: file.mimetype || "application/octet-stream",
        name: file.originalname || objectPath,
        path: objectPath,
        size: file.size || file.buffer.length,
        url: data.publicUrl
      });
    }

    return attachments;
  }
,
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
    let sticker = null;
    if (message?.sticker_id) {
      sticker = await this.getGuildStickerById(message.sticker_id);
    }
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
