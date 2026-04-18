export function registerGuildRoutes({
  app,
  emitNavigationUpdate,
  emitNavigationUpdateToUsers,
  removeUserFromGuildVoiceSessions,
  requireViewer,
  sendError,
  store
}) {
  app.post("/api/guilds", requireViewer, async (req, res) => {
    try {
      const payload = await store.createGuild({
        description: req.body.description || "",
        name: req.body.name,
        ownerId: req.viewer.id,
        templateId: req.body.templateId || "default"
      });

      emitNavigationUpdate({
        channelId: payload.channel_id,
        guildId: payload.guild_id,
        type: "guild:create"
      });

      res.status(201).json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/guilds/:guildId", requireViewer, async (req, res) => {
    try {
      const guild = await store.updateGuild({
        allowMemberInvites: req.body.allowMemberInvites,
        bannerColor: req.body.bannerColor,
        bannerImageUrl: req.body.bannerImageUrl,
        description: req.body.description || "",
        guildId: req.params.guildId,
        iconUrl: req.body.iconUrl,
        name: req.body.name,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:update"
      });

      res.json({ guild });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/channels", requireViewer, async (req, res) => {
    try {
      const channel = await store.createChannel({
        createdBy: req.viewer.id,
        guildId: req.params.guildId,
        kind: req.body.kind || "text",
        name: req.body.name,
        parentId: req.body.parentId || null,
        topic: req.body.topic || ""
      });

      emitNavigationUpdate({
        channelId: channel.id,
        guildId: req.params.guildId,
        type: "channel:create"
      });

      res.status(201).json({ channel });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/categories", requireViewer, async (req, res) => {
    try {
      const category = await store.createCategory({
        createdBy: req.viewer.id,
        guildId: req.params.guildId,
        name: req.body.name
      });

      emitNavigationUpdate({
        channelId: category.id,
        guildId: req.params.guildId,
        type: "channel:create"
      });

      res.status(201).json({ category });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/guilds/:guildId/channels/:channelId/move", requireViewer, async (req, res) => {
    try {
      const channel = await store.moveChannel({
        channelId: req.params.channelId,
        createdBy: req.viewer.id,
        guildId: req.params.guildId,
        parentId: req.body.parentId || null,
        placement: req.body.placement || "after",
        relativeToChannelId: req.body.relativeToChannelId || null
      });

      emitNavigationUpdate({
        channelId: req.params.channelId,
        guildId: req.params.guildId,
        type: "channel:move"
      });

      res.json({ channel });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/guilds/:guildId/move", requireViewer, async (req, res) => {
    try {
      const guild = await store.moveGuild({
        createdBy: req.viewer.id,
        guildId: req.params.guildId,
        placement: req.body.placement || "after",
        relativeToGuildId: req.body.relativeToGuildId || null
      });

      res.json({ guild });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/invites", requireViewer, async (req, res) => {
    try {
      const invite = await store.createInvite({
        guildId: req.params.guildId,
        userId: req.viewer.id
      });

      res.status(201).json({ invite });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/guilds/:guildId/invites", requireViewer, async (req, res) => {
    try {
      const invites = await store.listGuildInvites({
        guildId: req.params.guildId,
        userId: req.viewer.id
      });

      res.json({ invites });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/guilds/:guildId/roles", requireViewer, async (req, res) => {
    try {
      const roles = await store.listGuildRoles({
        guildId: req.params.guildId,
        userId: req.viewer.id
      });

      res.json({ roles });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/roles", requireViewer, async (req, res) => {
    try {
      const role = await store.createGuildRole({
        color: req.body.color,
        guildId: req.params.guildId,
        icon: req.body.icon,
        iconUrl: req.body.iconUrl,
        name: req.body.name,
        permissions: req.body.permissions,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:update"
      });

      res.status(201).json({ role });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/guilds/:guildId/roles/:roleId", requireViewer, async (req, res) => {
    try {
      const role = await store.updateGuildRole({
        color: req.body.color,
        guildId: req.params.guildId,
        icon: req.body.icon,
        iconUrl: req.body.iconUrl,
        name: req.body.name,
        permissions: req.body.permissions,
        roleId: req.params.roleId,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:update"
      });

      res.json({ role });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/guilds/:guildId/members/:userId/roles", requireViewer, async (req, res) => {
    try {
      const payload = await store.updateGuildMemberRole({
        guildId: req.params.guildId,
        roleId: req.body.roleId || null,
        targetUserId: req.params.userId,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:update"
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/guilds/:guildId/stickers", requireViewer, async (req, res) => {
    try {
      const stickers = await store.listGuildStickers({
        guildId: req.params.guildId,
        userId: req.viewer.id
      });

      res.json({ stickers });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/stickers", requireViewer, async (req, res) => {
    try {
      const sticker = await store.createGuildSticker({
        emoji: req.body.emoji || "",
        guildId: req.params.guildId,
        imageUrl: req.body.imageUrl || "",
        name: req.body.name,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:update"
      });

      res.status(201).json({ sticker });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/guilds/:guildId/stickers/:stickerId", requireViewer, async (req, res) => {
    try {
      const payload = await store.deleteGuildSticker({
        guildId: req.params.guildId,
        stickerId: req.params.stickerId,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        guildId: req.params.guildId,
        type: "guild:update"
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });
}
