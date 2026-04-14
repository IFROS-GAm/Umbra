export function registerSystemRoutes({
  app,
  emitNavigationUpdate,
  requireViewer,
  resolveOptionalViewer,
  sendError,
  serializeVoiceState,
  store
}) {
  app.get("/api/health", async (_, res) => {
    res.json({
      ok: true,
      mode: store.getMode()
    });
  });

  app.get("/api/bootstrap", requireViewer, async (req, res) => {
    try {
      const data = await store.bootstrap(req.viewer.id);
      res.json({
        mode: store.getMode(),
        ...data
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/voice/state", requireViewer, async (_req, res) => {
    try {
      res.json({
        sessions: serializeVoiceState()
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/invites/:code", async (req, res) => {
    try {
      const auth = await resolveOptionalViewer(req);
      const invite = await store.getInviteByCode({
        code: req.params.code,
        userId: auth?.viewer?.id || null
      });

      res.json({ invite });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/invites/:code/accept", requireViewer, async (req, res) => {
    try {
      const payload = await store.acceptInvite({
        code: req.params.code,
        userId: req.viewer.id
      });

      emitNavigationUpdate({
        channelId: payload.channel_id,
        guildId: payload.guild_id,
        type: "guild:join"
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });
}
