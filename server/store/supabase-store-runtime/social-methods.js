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

export const supabaseStoreRuntimeSocialMethods = {
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
,
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
,
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
      other_user_id:
        String(request.requester_id) === String(userId)
          ? request.recipient_id
          : request.requester_id,
      request_id: requestId
    };
  }
,
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
,
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
,
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
};
