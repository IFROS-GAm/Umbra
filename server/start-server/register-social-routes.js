import { USER_STATUSES } from "../constants.js";
import { createHttpError } from "./shared.js";

export function registerSocialRoutes({
  app,
  emitFriendRequestToUser,
  emitNavigationUpdate,
  emitNavigationUpdateToUsers,
  emitPresenceUpdate,
  requireViewer,
  sendError,
  store
}) {
  app.post("/api/dms", requireViewer, async (req, res) => {
    try {
      let channel = null;
      const recipientIds = Array.isArray(req.body.recipientIds)
        ? [...new Set(req.body.recipientIds.map((id) => String(id)).filter(Boolean))]
        : [];

      if (recipientIds.length) {
        channel = await store.createGroupDm({
          name: req.body.name || "",
          ownerId: req.viewer.id,
          recipientIds
        });
      } else {
        channel = await store.createOrGetDm({
          ownerId: req.viewer.id,
          recipientId: req.body.recipientId
        });
      }

      emitNavigationUpdate({
        channelId: channel.id,
        type: "dm:create"
      });

      res.status(201).json({ channel });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/dms/:channelId/visibility", requireViewer, async (req, res) => {
    try {
      const payload = await store.setDmVisibility({
        channelId: req.params.channelId,
        hidden: Boolean(req.body.hidden),
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        channelId: req.params.channelId,
        hidden: payload.hidden,
        type: "dm:visibility",
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/friends/requests", requireViewer, async (req, res) => {
    try {
      const payload = await store.sendFriendRequest({
        recipientId: req.body.recipientId,
        requesterId: req.viewer.id
      });

      emitNavigationUpdateToUsers([req.viewer.id, req.body.recipientId], {
        type: "friends:update",
        userId: req.viewer.id,
        targetUserId: req.body.recipientId || null
      });

      if (payload?.status === "pending" && payload?.request?.id && req.body.recipientId) {
        emitFriendRequestToUser(req.body.recipientId, {
          request: payload.request,
          requester: {
            avatar_url: req.viewer.avatar_url || "",
            display_name: req.viewer.display_name || req.viewer.username || "Umbra",
            id: req.viewer.id,
            username: req.viewer.username || "umbra_user"
          }
        });
      }

      res.status(201).json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/friends/requests/:requestId/accept", requireViewer, async (req, res) => {
    try {
      const payload = await store.acceptFriendRequest({
        requestId: req.params.requestId,
        userId: req.viewer.id
      });

      emitNavigationUpdateToUsers([req.viewer.id, payload.friend_id || null], {
        type: "friends:update",
        userId: req.viewer.id,
        targetUserId: payload.friend_id || null
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/friends/requests/:requestId", requireViewer, async (req, res) => {
    try {
      const payload = await store.cancelFriendRequest({
        requestId: req.params.requestId,
        userId: req.viewer.id
      });

      emitNavigationUpdateToUsers([req.viewer.id, payload.other_user_id || null], {
        type: "friends:update",
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/friends/:friendId", requireViewer, async (req, res) => {
    try {
      const payload = await store.removeFriend({
        friendId: req.params.friendId,
        userId: req.viewer.id
      });

      emitNavigationUpdateToUsers([req.viewer.id, req.params.friendId], {
        type: "friends:update",
        userId: req.viewer.id,
        targetUserId: req.params.friendId
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/users/:userId/block", requireViewer, async (req, res) => {
    try {
      const payload = await store.blockUser({
        targetUserId: req.params.userId,
        userId: req.viewer.id
      });

      emitNavigationUpdateToUsers([req.viewer.id, req.params.userId], {
        type: "friends:update",
        userId: req.viewer.id,
        targetUserId: req.params.userId
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/users/:userId/report", requireViewer, async (req, res) => {
    try {
      const payload = await store.reportProfile({
        reason: req.body.reason || "spam",
        reporterId: req.viewer.id,
        targetUserId: req.params.userId
      });

      res.status(201).json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/users/me/status", requireViewer, async (req, res) => {
    try {
      const status = req.body.status;
      if (!USER_STATUSES.includes(status)) {
        throw createHttpError("Estado invalido.", 400);
      }

      const user = await store.setPresence({
        status,
        userId: req.viewer.id
      });

      emitPresenceUpdate(user);
      res.json({ user });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/users/me/profile", requireViewer, async (req, res) => {
    try {
      const user = await store.updateProfile({
        avatarHue: req.body.avatarHue,
        avatarUrl: req.body.avatarUrl,
        bannerImageUrl: req.body.bannerImageUrl,
        bio: req.body.bio,
        customStatus: req.body.customStatus,
        privacySettings: req.body.privacySettings,
        profileColor: req.body.profileColor,
        recoveryAccount: req.body.recoveryAccount,
        recoveryProvider: req.body.recoveryProvider,
        socialLinks: req.body.socialLinks,
        userId: req.viewer.id,
        username: req.body.username
      });

      emitPresenceUpdate(user);
      emitNavigationUpdate({
        type: "profile:update",
        userId: req.viewer.id
      });
      res.json({ user });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/users/me/email/resend-confirmation", requireViewer, async (req, res) => {
    try {
      const payload = await store.resendEmailConfirmation({
        emailRedirectTo: req.body.emailRedirectTo,
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/users/me/email/send-check", requireViewer, async (req, res) => {
    try {
      const payload = await store.sendEmailCheck({
        emailRedirectTo: req.body.emailRedirectTo,
        target: req.body.target,
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/users/invite-email", requireViewer, async (req, res) => {
    try {
      const payload = await store.inviteUserByEmail({
        email: req.body.email,
        inviterId: req.viewer.id,
        redirectTo: req.body.redirectTo
      });

      res.status(201).json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/channels/:channelId/read", requireViewer, async (req, res) => {
    try {
      const payload = await store.markChannelRead({
        channelId: req.params.channelId,
        lastReadMessageId: req.body.lastReadMessageId || null,
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/read", requireViewer, async (req, res) => {
    try {
      const payload = await store.markGuildRead({
        guildId: req.params.guildId,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:read",
        userId: req.viewer.id
      });
      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/guilds/:guildId/members/me", requireViewer, async (req, res) => {
    try {
      const payload = await store.leaveGuild({
        guildId: req.params.guildId,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:leave",
        userId: req.viewer.id
      });
      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/guilds/:guildId", requireViewer, async (req, res) => {
    try {
      const payload = await store.deleteGuild({
        guildId: req.params.guildId,
        userId: req.viewer.id
      });

      emitNavigationUpdateToUsers(payload?.affected_user_ids || [req.viewer.id], {
        guildId: req.params.guildId,
        type: "guild:update",
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/guilds/:guildId/members/:userId", requireViewer, async (req, res) => {
    try {
      if (!String(req.params.userId || "").trim()) {
        throw createHttpError("Miembro invalido.", 400);
      }

      const audienceUserIds =
        typeof store.listGuildAudienceIds === "function"
          ? await store.listGuildAudienceIds(req.params.guildId)
          : [];
      const payload = await store.kickGuildMember({
        guildId: req.params.guildId,
        targetUserId: req.params.userId,
        userId: req.viewer.id
      });

      await removeUserFromGuildVoiceSessions(req.params.userId, req.params.guildId);
      emitNavigationUpdateToUsers(
        [...audienceUserIds, req.params.userId],
        {
          guildId: req.params.guildId,
          type: "guild:member-kick",
          userId: req.params.userId
        }
      );
      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/bans", requireViewer, async (req, res) => {
    try {
      if (!String(req.body.userId || "").trim()) {
        throw createHttpError("Miembro invalido.", 400);
      }

      const audienceUserIds =
        typeof store.listGuildAudienceIds === "function"
          ? await store.listGuildAudienceIds(req.params.guildId)
          : [];
      const payload = await store.banGuildMember({
        expiresAt: req.body.expiresAt || null,
        guildId: req.params.guildId,
        targetUserId: req.body.userId,
        userId: req.viewer.id
      });

      await removeUserFromGuildVoiceSessions(req.body.userId, req.params.guildId);
      emitNavigationUpdateToUsers(
        [...audienceUserIds, req.body.userId],
        {
          expiresAt: payload.expires_at || null,
          guildId: req.params.guildId,
          type: "guild:member-ban",
          userId: req.body.userId
        }
      );
      res.status(201).json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });
}
