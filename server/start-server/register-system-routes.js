import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

function toLiveKitServiceUrl(value = "") {
  return String(value || "")
    .trim()
    .replace(/^wss:/i, "https:")
    .replace(/^ws:/i, "http:");
}

function parseParticipantMetadata(metadata) {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildLiveKitOccupancySessions(participantsByRoom = {}) {
  return Object.fromEntries(
    Object.entries(participantsByRoom).map(([channelId, participants]) => {
      const userIds = [
        ...new Set(
          (Array.isArray(participants) ? participants : [])
            .map((participant) => {
              const metadata = parseParticipantMetadata(participant?.metadata);
              return String(metadata.userId || "").trim();
            })
            .filter(Boolean)
        )
      ];

      return [channelId, userIds];
    })
  );
}

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
        canUpdateOwnMetadata: true,
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

  app.get("/api/livekit/occupancy", requireViewer, async (req, res) => {
    try {
      const requestedChannelIds = [
        ...new Set(
          []
            .concat(req.query.channelId || [])
            .map((channelId) => String(channelId || "").trim())
            .filter(Boolean)
        )
      ];
      const liveKitUrl = String(
        process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || ""
      ).trim();
      const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
      const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();

      if (!requestedChannelIds.length) {
        res.json({
          sessions: {}
        });
        return;
      }

      if (!liveKitUrl || !apiKey || !apiSecret) {
        throw Object.assign(new Error("LiveKit no esta configurado en este entorno."), {
          status: 503
        });
      }

      const roomService = new RoomServiceClient(
        toLiveKitServiceUrl(liveKitUrl),
        apiKey,
        apiSecret
      );
      const participantSnapshots = await Promise.all(
        requestedChannelIds.map(async (channelId) => {
          try {
            const participants = await roomService.listParticipants(channelId);
            return [channelId, participants || []];
          } catch (error) {
            const normalizedMessage = String(error?.message || "").toLowerCase();
            if (
              normalizedMessage.includes("room does not exist") ||
              normalizedMessage.includes("not found")
            ) {
              return [channelId, []];
            }

            console.warn("[voice/livekit] occupancy:error", {
              channelId,
              message: error?.message || String(error)
            });
            return [channelId, []];
          }
        })
      );

      res.json({
        sessions: buildLiveKitOccupancySessions(Object.fromEntries(participantSnapshots))
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
