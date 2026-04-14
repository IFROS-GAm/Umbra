import { createId } from "../helpers.js";
import {
  buildFriendshipPair,
  createError,
  normalizePrivacySettings,
  normalizeProfileColor,
  normalizeRecoveryAccount,
  normalizeRecoveryProvider,
  normalizeSocialLinks,
  sanitizeUsername
} from "./shared.js";

export const demoStoreSocialMethods = {
  async sendFriendRequest({ recipientId, requesterId }) {
    if (!recipientId || requesterId === recipientId) {
      throw createError("No puedes enviarte una solicitud a ti mismo.", 400);
    }

    const recipient = this.getProfileById(recipientId);
    if (!recipient) {
      throw createError("Usuario no encontrado.", 404);
    }

    const isBlocked = (this.db.user_blocks || []).some(
      (entry) =>
        (entry.blocker_id === requesterId && entry.blocked_id === recipientId) ||
        (entry.blocker_id === recipientId && entry.blocked_id === requesterId)
    );
    if (isBlocked) {
      throw createError("No puedes enviar una solicitud a este usuario.", 403);
    }

    const [user_id, friend_id] = buildFriendshipPair(requesterId, recipientId);
    const existingFriendship = (this.db.friendships || []).find(
      (friendship) => friendship.user_id === user_id && friendship.friend_id === friend_id
    );
    if (existingFriendship) {
      return {
        friend: recipient,
        friendship: existingFriendship,
        status: "friends"
      };
    }

    const reversePending = (this.db.friend_requests || []).find(
      (request) =>
        request.requester_id === recipientId &&
        request.recipient_id === requesterId &&
        String(request.status || "pending") === "pending"
    );
    if (reversePending) {
      const accepted = await this.acceptFriendRequest({
        requestId: reversePending.id,
        userId: requesterId
      });
      return {
        friend: recipient,
        friendship: accepted.friendship,
        status: "accepted"
      };
    }

    const existingPending = (this.db.friend_requests || []).find(
      (request) =>
        request.requester_id === requesterId &&
        request.recipient_id === recipientId &&
        String(request.status || "pending") === "pending"
    );
    if (existingPending) {
      return {
        request: existingPending,
        status: "pending",
        user: recipient
      };
    }

    const request = {
      id: createId(),
      requester_id: requesterId,
      recipient_id: recipientId,
      status: "pending",
      created_at: new Date().toISOString()
    };

    this.db.friend_requests.push(request);
    await this.save();

    return {
      request,
      status: "pending",
      user: recipient
    };
  }
,
  async acceptFriendRequest({ requestId, userId }) {
    const request = (this.db.friend_requests || []).find((item) => item.id === requestId);
    if (!request || String(request.status || "pending") !== "pending") {
      throw createError("Solicitud no encontrada.", 404);
    }

    if (request.recipient_id !== userId) {
      throw createError("No puedes aceptar esta solicitud.", 403);
    }

    const [leftId, rightId] = buildFriendshipPair(request.requester_id, request.recipient_id);
    let friendship = (this.db.friendships || []).find(
      (item) => item.user_id === leftId && item.friend_id === rightId
    );

    if (!friendship) {
      friendship = {
        id: createId(),
        user_id: leftId,
        friend_id: rightId,
        created_at: new Date().toISOString()
      };
      this.db.friendships.push(friendship);
    }

    this.db.friend_requests = (this.db.friend_requests || []).filter(
      (item) =>
        !(
          String(item.status || "pending") === "pending" &&
          ((item.requester_id === request.requester_id && item.recipient_id === request.recipient_id) ||
            (item.requester_id === request.recipient_id && item.recipient_id === request.requester_id))
        )
    );

    await this.save();

    return {
      friend_id: request.requester_id,
      friendship,
      status: "friends"
    };
  }
,
  async cancelFriendRequest({ requestId, userId }) {
    const request = (this.db.friend_requests || []).find((item) => item.id === requestId);
    if (!request || String(request.status || "pending") !== "pending") {
      throw createError("Solicitud no encontrada.", 404);
    }

    if (request.requester_id !== userId && request.recipient_id !== userId) {
      throw createError("No puedes cancelar esta solicitud.", 403);
    }

    this.db.friend_requests = (this.db.friend_requests || []).filter(
      (item) => item.id !== requestId
    );
    await this.save();
    return {
      ok: true,
      other_user_id: request.requester_id === userId ? request.recipient_id : request.requester_id,
      request_id: requestId
    };
  }
,
  async removeFriend({ friendId, userId }) {
    const [leftId, rightId] = buildFriendshipPair(userId, friendId);
    const previousCount = (this.db.friendships || []).length;
    this.db.friendships = (this.db.friendships || []).filter(
      (friendship) => !(friendship.user_id === leftId && friendship.friend_id === rightId)
    );

    if (this.db.friendships.length === previousCount) {
      throw createError("La amistad no existe.", 404);
    }

    await this.save();
    return { friend_id: friendId, ok: true };
  }
,
  async blockUser({ targetUserId, userId }) {
    if (!targetUserId || targetUserId === userId) {
      throw createError("No puedes bloquearte a ti mismo.", 400);
    }

    const target = this.getProfileById(targetUserId);
    if (!target) {
      throw createError("Usuario no encontrado.", 404);
    }

    const alreadyBlocked = (this.db.user_blocks || []).some(
      (entry) => entry.blocker_id === userId && entry.blocked_id === targetUserId
    );
    if (!alreadyBlocked) {
      this.db.user_blocks.push({
        blocker_id: userId,
        blocked_id: targetUserId,
        created_at: new Date().toISOString(),
        id: createId()
      });
    }

    const [leftId, rightId] = buildFriendshipPair(userId, targetUserId);
    this.db.friendships = (this.db.friendships || []).filter(
      (friendship) => !(friendship.user_id === leftId && friendship.friend_id === rightId)
    );
    this.db.friend_requests = (this.db.friend_requests || []).filter(
      (request) =>
        !(
          (request.requester_id === userId && request.recipient_id === targetUserId) ||
          (request.requester_id === targetUserId && request.recipient_id === userId)
        )
    );

    await this.save();
    return { blocked_id: targetUserId, ok: true };
  }
,
  async reportProfile({ reason = "spam", reporterId, targetUserId }) {
    if (!targetUserId || targetUserId === reporterId) {
      throw createError("No puedes reportarte a ti mismo.", 400);
    }

    const target = this.getProfileById(targetUserId);
    if (!target) {
      throw createError("Usuario no encontrado.", 404);
    }

    const report = {
      id: createId(),
      reporter_id: reporterId,
      target_user_id: targetUserId,
      reason: String(reason || "spam").slice(0, 64),
      created_at: new Date().toISOString()
    };

    this.db.profile_reports.push(report);
    await this.save();
    return { ok: true, report };
  }
,
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
    if (socialLinks !== undefined) {
      profile.social_links = normalizeSocialLinks(socialLinks);
    }
    if (privacySettings !== undefined) {
      profile.privacy_settings = normalizePrivacySettings(privacySettings);
    }
    if (recoveryAccount !== undefined) {
      profile.recovery_account = normalizeRecoveryAccount(recoveryAccount);
    }
    if (recoveryProvider !== undefined) {
      profile.recovery_provider = normalizeRecoveryProvider(recoveryProvider);
    }
    profile.profile_color = normalizeProfileColor(
      profileColor,
      profile.profile_color || "#5865F2"
    );
    profile.updated_at = new Date().toISOString();
    await this.save();

    return profile;
  }
,
  async resendEmailConfirmation({ userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    if (!profile.email) {
      throw createError("No hay un correo principal asociado a esta cuenta.", 400);
    }

    if (String(profile.auth_provider || "email").toLowerCase() !== "email") {
      throw createError("El correo de confirmacion solo aplica para accesos por email.", 400);
    }

    return {
      email: profile.email,
      kind: "confirmation",
      mode: "demo",
      ok: true,
      target: "primary"
    };
  }
,
  async sendEmailCheck({ target, userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    const normalizedTarget = String(target || "primary").trim().toLowerCase();
    if (normalizedTarget !== "primary" && normalizedTarget !== "recovery") {
      throw createError("Destino de verificacion no valido.", 400);
    }

    if (normalizedTarget === "primary") {
      if (!profile.email) {
        throw createError("No hay un correo principal asociado a esta cuenta.", 400);
      }

      return {
        email: profile.email,
        kind:
          String(profile.auth_provider || "email").toLowerCase() === "email" &&
          !profile.email_confirmed_at
            ? "confirmation"
            : "check",
        mode: "demo",
        ok: true,
        target: "primary"
      };
    }

    const recoveryEmail = normalizeRecoveryAccount(profile.recovery_account);
    if (!recoveryEmail) {
      throw createError("No hay un correo de respaldo configurado.", 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      throw createError(
        "El respaldo debe ser un correo valido para poder enviar una comprobacion.",
        400
      );
    }

    return {
      email: recoveryEmail,
      kind: "check",
      mode: "demo",
      ok: true,
      target: "recovery"
    };
  }
,
  async inviteUserByEmail({ email, inviterId }) {
    const inviter = this.db.profiles.find((item) => item.id === inviterId);
    if (!inviter) {
      throw createError("Invitador no encontrado.", 404);
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw createError("Ingresa un correo valido para enviar la invitacion.", 400);
    }

    return {
      email: normalizedEmail,
      inviter: inviter.username || inviter.display_name || "Umbra",
      kind: "invite",
      mode: "demo",
      ok: true
    };
  }
};
