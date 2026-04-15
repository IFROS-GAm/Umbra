import { AccessToken } from "livekit-server-sdk";

export function registerSystemRoutes({
  app,
  emitNavigationUpdate,
  requireViewer,
  resolveOptionalViewer,
  sendError,
  serializeVoiceState,
  store
}) {
  app.get("/api/health", async (_req, res) => {
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

  app.get("/api/livekit/token", requireViewer, async (req, res) => {
    try {
      const room = String(req.query.room || "").trim();
      const peerId = String(req.query.peerId || "").trim();
      const liveKitUrl = String(
        process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || ""
      ).trim();
      const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
      const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();

      if (!room || !peerId) {
        throw Object.assign(new Error("Faltan room o peerId para generar el token de LiveKit."), {
          status: 400
        });
      }

      if (!liveKitUrl || !apiKey || !apiSecret) {
        throw Object.assign(new Error("LiveKit no esta configurado en este entorno."), {
          status: 503
        });
      }

      const displayName =
        req.viewer.display_name ||
        req.viewer.username ||
        req.viewer.email ||
        req.viewer.id;
      const metadata = JSON.stringify({
        avatarHue: req.viewer.avatar_hue || null,
        avatarUrl: req.viewer.avatar_url || "",
        displayName,
        userId: req.viewer.id,
        username: req.viewer.username || displayName
      });
      const token = new AccessToken(apiKey, apiSecret, {
        identity: peerId,
        metadata,
        name: displayName
      });

      token.addGrant({
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
        room,
        roomJoin: true
      });

      res.json({
        token: await token.toJwt(),
        url: liveKitUrl
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
