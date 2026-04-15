import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

let liveKitRoomServiceClient = null;
let liveKitRoomServiceCacheKey = "";

function normalizeLiveKitServiceUrl(url = "") {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

function parseLiveKitParticipantMetadata(metadata = "") {
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

function getLiveKitRoomServiceClient() {
  const liveKitUrl = String(
    process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || ""
  ).trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
  const serviceUrl = normalizeLiveKitServiceUrl(liveKitUrl);

  if (!serviceUrl || !apiKey || !apiSecret) {
    return null;
  }

  const cacheKey = `${serviceUrl}::${apiKey}::${apiSecret}`;
  if (!liveKitRoomServiceClient || liveKitRoomServiceCacheKey !== cacheKey) {
    liveKitRoomServiceClient = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
    liveKitRoomServiceCacheKey = cacheKey;
  }

  return {
    apiKey,
    apiSecret,
    client: liveKitRoomServiceClient,
    liveKitUrl
  };
}

async function listLiveKitVoiceSessions() {
  const service = getLiveKitRoomServiceClient();
  if (!service?.client) {
    return null;
  }

  const rooms = await service.client.listRooms();
  const sessions = {};

  await Promise.all(
    (rooms || []).map(async (room) => {
      const roomName = String(room?.name || "").trim();
      if (!roomName) {
        return;
      }

      const participants = await service.client.listParticipants(roomName);
      const userIds = [
        ...new Set(
          (participants || [])
            .map((participant) => {
              const metadata = parseLiveKitParticipantMetadata(participant?.metadata || "");
              return String(metadata?.userId || "").trim();
            })
            .filter(Boolean)
        )
      ];

      if (userIds.length) {
        sessions[roomName] = userIds;
      }
    })
  );

  return sessions;
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
      if (store.getMode() === "supabase") {
        const liveKitSessions = await listLiveKitVoiceSessions();
        if (liveKitSessions) {
          res.json({
            sessions: liveKitSessions
          });
          return;
        }
      }

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
