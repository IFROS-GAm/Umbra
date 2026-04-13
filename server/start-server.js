import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { Server } from "socket.io";

import { CHANNEL_TYPES, USER_STATUSES } from "./constants.js";
import { createStore } from "./store/index.js";
import { isGuildVoiceChannel } from "./store/helpers.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseAllowedOrigins(extraOrigins = []) {
  const defaultDevOrigins = [
    "http://localhost:3030",
    "http://127.0.0.1:3030",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174"
  ];
  const derivedOrigins = [
    process.env.PUBLIC_APP_URL,
    process.env.RENDER_EXTERNAL_URL
  ]
    .map((origin) => origin?.trim())
    .filter(Boolean);
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(
    [...defaultDevOrigins, ...configuredOrigins, ...derivedOrigins, ...extraOrigins].filter(
      Boolean
    )
  );
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.size === 0) {
    return true;
  }

  return allowedOrigins.has(origin);
}

function createCorsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(createHttpError("Origen no permitido.", 403));
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: false
  };
}

function canUseSharedVoiceChannel(channel) {
  return Boolean(
    channel &&
      (isGuildVoiceChannel(channel) ||
        channel.type === CHANNEL_TYPES.DM ||
        channel.type === CHANNEL_TYPES.GROUP_DM)
  );
}

function extractBearerToken(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : String(value);
}

async function resolveViewer(store, token, authCache = null) {
  if (store.getMode() !== "supabase") {
    const userId = await store.getDefaultUserId();
    if (!userId) {
      throw createHttpError("No hay usuario demo disponible.", 401);
    }

    return {
      authUser: { id: userId },
      viewer: { id: userId, username: "demo" }
    };
  }

  if (!token) {
    throw createHttpError("Unauthorized", 401);
  }

  const cachedEntry = authCache?.get(token);
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.value;
  }

  if (cachedEntry) {
    authCache.delete(token);
  }

  const authUser = await store.verifyAccessToken(token);
  const viewer = await store.ensureProfileFromAuthUser(authUser);

  const resolved = {
    authUser,
    viewer
  };

  if (authCache) {
    authCache.set(token, {
      expiresAt: Date.now() + Number(process.env.AUTH_CACHE_TTL_MS || 15_000),
      value: resolved
    });

    if (authCache.size > Number(process.env.AUTH_CACHE_MAX || 300)) {
      const oldestKey = authCache.keys().next().value;
      if (oldestKey) {
        authCache.delete(oldestKey);
      }
    }
  }

  return resolved;
}

function createCloseHandle({ io, server }) {
  let closed = false;

  return async () => {
    if (closed) {
      return;
    }

    closed = true;

    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    await new Promise((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }

      server.close((error) => {
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };
}

function getVoiceSignalType(signal = {}) {
  if (signal?.description?.type) {
    return signal.description.type;
  }

  if (signal?.candidate) {
    return "ice";
  }

  return "unknown";
}

function normalizeVoiceChannelId(channelId) {
  return String(channelId || "").trim();
}

export async function startServer(options = {}) {
  const store = await createStore();
  const port = Number(options.port ?? process.env.PORT ?? 3030);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const quiet = Boolean(options.quiet);
  const allowedOrigins = parseAllowedOrigins(options.allowedOrigins || []);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Number(process.env.MAX_ATTACHMENT_BYTES || 8 * 1024 * 1024),
      files: Number(process.env.MAX_ATTACHMENT_FILES || 10)
    }
  });

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: createCorsOptions(allowedOrigins),
    serveClient: false,
    transports: ["websocket"],
    allowUpgrades: false,
    httpCompression: false,
    perMessageDeflate: false
  });
  const authCache = new Map();
  const connectedUsers = new Map();
  const voiceSessions = new Map();
  const voicePeerRooms = new Map();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false
    })
  );
  app.use(compression());
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      max: Number(process.env.RATE_LIMIT_MAX || 300),
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  if (store.uploadDir && fs.existsSync(store.uploadDir)) {
    app.use("/uploads", express.static(store.uploadDir));
  }

  function sendError(res, error) {
    res.status(error.statusCode || 500).json({
      error: error.message || "Error interno del servidor."
    });
  }

  async function requireViewer(req, res, next) {
    try {
      const auth = await resolveViewer(
        store,
        extractBearerToken(req.get("authorization")),
        authCache
      );

      req.authUser = auth.authUser;
      req.viewer = auth.viewer;
      next();
    } catch (error) {
      sendError(res, error);
    }
  }

  async function resolveOptionalViewer(req) {
    const token = extractBearerToken(req.get("authorization"));
    if (!token) {
      return null;
    }

    try {
      return await resolveViewer(store, token, authCache);
    } catch {
      return null;
    }
  }

  function emitPresenceUpdate(user) {
    io.emit("presence:update", { user });
  }

  function emitNavigationUpdate(payload = {}) {
    io.emit("navigation:update", payload);
  }

  function emitNavigationUpdateToUsers(userIds = [], payload = {}) {
    const targetIds = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
    if (!targetIds.length) {
      emitNavigationUpdate(payload);
      return;
    }

    targetIds.forEach((userId) => {
      io.to(`user:${userId}`).emit("navigation:update", payload);
    });
  }

  function emitFriendRequestToUser(recipientUserId, payload = {}) {
    const normalizedRecipientId = String(recipientUserId || "").trim();
    if (!normalizedRecipientId) {
      return;
    }

    io.to(`user:${normalizedRecipientId}`).emit("friend:request", payload);
  }

  async function emitChannelPreview(channelId, preview) {
    if (!channelId || !preview) {
      return;
    }

    const audienceUserIds =
      typeof store.listChannelAudienceIds === "function"
        ? await store.listChannelAudienceIds(channelId)
        : [];
    for (const audienceUserId of audienceUserIds) {
      io.to(`user:${audienceUserId}`).emit("channel:preview", { preview });
    }
  }

  async function emitChannelEvent(channelId, eventName, payload = {}) {
    if (!channelId || !eventName) {
      return;
    }

    io.to(`channel:${channelId}`).emit(eventName, payload);

    const audienceUserIds =
      typeof store.listChannelAudienceIds === "function"
        ? await store.listChannelAudienceIds(channelId)
        : [];
    for (const audienceUserId of audienceUserIds) {
      io.to(`user:${audienceUserId}`).emit(eventName, payload);
    }
  }

  function listVoiceUserIds(channelId) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId) {
      return [];
    }

    const userIds = new Set();

    const sessionUsers = voiceSessions.get(normalizedChannelId);
    if (sessionUsers) {
      [...sessionUsers.keys()].forEach((userId) => {
        if (userId) {
          userIds.add(userId);
        }
      });
    }

    const trackedRoom = getTrackedVoiceRoom(normalizedChannelId);
    if (trackedRoom) {
      for (const [socketId, entry] of trackedRoom.entries()) {
        if (entry?.userId) {
          userIds.add(entry.userId);
          continue;
        }

        const socket = io.sockets.sockets.get(socketId);
        if (socket?.data?.user?.id) {
          userIds.add(socket.data.user.id);
        }
      }
    }

    for (const socketId of getAdapterVoiceRoomSocketIds(normalizedChannelId)) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket?.data?.user?.id) {
        userIds.add(socket.data.user.id);
      }
    }

    return [...userIds];
  }

  function buildVoicePayload(channelId) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    return {
      channelId: normalizedChannelId,
      userIds: listVoiceUserIds(normalizedChannelId)
    };
  }

  function getTrackedVoiceRoom(channelId, { create = false } = {}) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId) {
      return null;
    }

    const existingRoom = voicePeerRooms.get(normalizedChannelId);
    if (existingRoom || !create) {
      return existingRoom || null;
    }

    const nextRoom = new Map();
    voicePeerRooms.set(normalizedChannelId, nextRoom);
    return nextRoom;
  }

  function registerVoicePeer(channelId, socket, userId) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId || !socket?.id) {
      return;
    }

    const room = getTrackedVoiceRoom(normalizedChannelId, { create: true });
    room.set(socket.id, {
      joinedAt: Date.now(),
      userId
    });
  }

  function unregisterVoicePeer(channelId, socketId) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId || !socketId) {
      return;
    }

    const room = getTrackedVoiceRoom(normalizedChannelId);
    if (!room) {
      return;
    }

    room.delete(socketId);
    if (!room.size) {
      voicePeerRooms.delete(normalizedChannelId);
    }
  }

  function getVoiceRoomSocketIds(channelId) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId) {
      return new Set();
    }

    const trackedRoom = getTrackedVoiceRoom(normalizedChannelId);
    return new Set(trackedRoom ? [...trackedRoom.keys()] : []);
  }

  function getAdapterVoiceRoomSocketIds(channelId) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId) {
      return new Set();
    }

    return new Set(io.sockets.adapter.rooms.get(`voice:${normalizedChannelId}`) || []);
  }

  function listVoicePeers(channelId, excludedSocketId = null) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId) {
      return [];
    }

    const trackedRoom = getTrackedVoiceRoom(normalizedChannelId);
    if (!trackedRoom?.size) {
      return [];
    }

    const peers = [];
    for (const [socketId, peerEntry] of trackedRoom.entries()) {
      if (!socketId || socketId === excludedSocketId) {
        continue;
      }

      const peerSocket = io.sockets.sockets.get(socketId);
      if (!peerSocket?.data?.user?.id) {
        unregisterVoicePeer(normalizedChannelId, socketId);
        continue;
      }

      const peerChannelId = normalizeVoiceChannelId(peerSocket.data.voiceChannelId);
      if (peerChannelId !== normalizedChannelId) {
        unregisterVoicePeer(normalizedChannelId, socketId);
        continue;
      }

      peers.push({
        peerId: socketId,
        userId: peerEntry?.userId || peerSocket.data.user.id
      });
    }

    return peers;
  }

  function listAdapterVoicePeers(channelId, excludedSocketId = null) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId) {
      return [];
    }

    return [...getAdapterVoiceRoomSocketIds(normalizedChannelId)]
      .filter((socketId) => {
        if (!socketId || socketId === excludedSocketId) {
          return false;
        }

        const peerSocket = io.sockets.sockets.get(socketId);
        if (!peerSocket?.data?.user?.id) {
          return false;
        }

        return normalizeVoiceChannelId(peerSocket.data.voiceChannelId) === normalizedChannelId;
      })
      .map((peerSocket) => ({
        peerId: peerSocket,
        userId: io.sockets.sockets.get(peerSocket)?.data?.user?.id || null
      }))
      .filter(Boolean);
  }

  function logVoiceServer(event, details = {}) {
    console.info(`[voice/server] ${event}`, details);
  }

  function emitVoicePeerSnapshots(channelId) {
    const normalizedChannelId = normalizeVoiceChannelId(channelId);
    if (!normalizedChannelId) {
      return;
    }

    const roomSocketIds = getVoiceRoomSocketIds(normalizedChannelId);
    const adapterSocketIds = getAdapterVoiceRoomSocketIds(normalizedChannelId);
    const peersInChannel = listVoicePeers(normalizedChannelId);
    if (!roomSocketIds.size && !peersInChannel.length) {
      return;
    }

    const targetSocketIds = roomSocketIds.size
      ? [...roomSocketIds]
      : peersInChannel.map((peer) => peer.peerId);

    for (const socketId of targetSocketIds) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket) {
        continue;
      }

      const peers = listVoicePeers(normalizedChannelId, socketId);
      logVoiceServer("peers:snapshot", {
        channelId: normalizedChannelId,
        adapterSocketIds: [...adapterSocketIds],
        roomSocketIds: [...roomSocketIds],
        socketId,
        targetSocketId: socketId,
        peerIds: peers.map((peer) => peer.peerId),
        peerUserIds: peers.map((peer) => peer.userId)
      });

      targetSocket.emit("voice:peers", {
        channelId: normalizedChannelId,
        peers
      });
    }
  }

  function emitVoiceUpdate(channelId) {
    io.emit("voice:update", buildVoicePayload(channelId));
  }

  function serializeVoiceState() {
    const channelIds = new Set([
      ...voiceSessions.keys(),
      ...voicePeerRooms.keys()
    ]);

    return Object.fromEntries(
      [...channelIds].map((channelId) => [
        channelId,
        listVoiceUserIds(channelId)
      ])
    );
  }

  function leaveVoiceChannel(socket, userId) {
    const previousChannelId = normalizeVoiceChannelId(socket.data.voiceChannelId);
    if (!previousChannelId) {
      return;
    }

    logVoiceServer("leave", {
      channelId: previousChannelId,
      socketId: socket.id,
      userId
    });

    unregisterVoicePeer(previousChannelId, socket.id);
    socket.to(`voice:${previousChannelId}`).emit("voice:peer-left", {
      channelId: previousChannelId,
      peerId: socket.id,
      userId
    });

    const channelUsers = voiceSessions.get(previousChannelId);
    if (channelUsers) {
      const nextCount = Math.max(0, (channelUsers.get(userId) || 1) - 1);
      if (nextCount === 0) {
        channelUsers.delete(userId);
      } else {
        channelUsers.set(userId, nextCount);
      }

      if (channelUsers.size === 0) {
        voiceSessions.delete(previousChannelId);
      }
    }

    socket.leave(`voice:${previousChannelId}`);
    socket.data.voiceChannelId = null;
    emitVoiceUpdate(previousChannelId);
    emitVoicePeerSnapshots(previousChannelId);
  }

  async function removeUserFromGuildVoiceSessions(userId, guildId) {
    if (!userId || !guildId) {
      return;
    }

    const sockets = [...io.sockets.sockets.values()].filter(
      (socket) => socket?.data?.user?.id === userId
    );

    for (const socket of sockets) {
      const channelId = socket.data.voiceChannelId;
      if (!channelId) {
        continue;
      }

      try {
        const channel = await store.getChannel(channelId);
        if (channel?.guild_id === guildId) {
          leaveVoiceChannel(socket, userId);
        }
      } catch {
        // Keep moderation flow alive even if voice cleanup cannot resolve the channel.
      }
    }
  }

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

  app.get("/api/channels/:channelId/messages", requireViewer, async (req, res) => {
    try {
      const payload = await store.listChannelMessages({
        before: req.query.before || null,
        channelId: req.params.channelId,
        limit: Number(req.query.limit || 30),
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/channels/:channelId/messages", requireViewer, async (req, res) => {
    try {
      const created = await store.createMessage({
        attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
        authorId: req.viewer.id,
        channelId: req.params.channelId,
        clientNonce: req.body.clientNonce || null,
        content: req.body.content,
        stickerId: req.body.stickerId || null,
        replyMentionUserId: req.body.replyMentionUserId || null,
        replyTo: req.body.replyTo || null
      });
      const message = created?.message || created;
      const preview = created?.preview || (await store.getChannelPreview(req.params.channelId));

      emitChannelEvent(req.params.channelId, "message:create", {
        message,
        preview
      }).catch(() => {});
      emitChannelPreview(req.params.channelId, preview).catch(() => {});

      res.status(201).json({ message, preview });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(
    "/api/attachments",
    requireViewer,
    upload.array("files", Number(process.env.MAX_ATTACHMENT_FILES || 10)),
    async (req, res) => {
      try {
        if (!req.files?.length) {
          throw createHttpError("No se recibieron archivos.", 400);
        }

        const attachments = await store.storeAttachments(req.files);
        res.status(201).json({ attachments });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  app.patch("/api/messages/:messageId", requireViewer, async (req, res) => {
    try {
      const message = await store.updateMessage({
        content: req.body.content,
        messageId: req.params.messageId,
        userId: req.viewer.id
      });
      const preview = await store.getChannelPreview(message.channel_id);

      emitChannelEvent(message.channel_id, "message:update", {
        message,
        preview
      }).catch(() => {});
      emitChannelPreview(message.channel_id, preview).catch(() => {});

      res.json({ message, preview });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/messages/:messageId", requireViewer, async (req, res) => {
    try {
      const payload = await store.deleteMessage({
        messageId: req.params.messageId,
        userId: req.viewer.id
      });
      const preview = await store.getChannelPreview(payload.channel_id);

      emitChannelEvent(payload.channel_id, "message:delete", {
        ...payload,
        preview
      }).catch(() => {});
      emitChannelPreview(payload.channel_id, preview).catch(() => {});

      res.json({
        ok: true,
        ...payload,
        preview
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/messages/:messageId/reactions", requireViewer, async (req, res) => {
    try {
      const message = await store.toggleReaction({
        emoji: req.body.emoji,
        messageId: req.params.messageId,
        userId: req.viewer.id
      });

      emitChannelEvent(message.channel_id, "reaction:update", { message }).catch(() => {});
      res.json({ message });
    } catch (error) {
      sendError(res, error);
    }
  });

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

  app.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError) {
      sendError(res, createHttpError("No se pudieron procesar los adjuntos.", 400));
      return;
    }

    if (error) {
      sendError(res, error);
      return;
    }

    next();
  });

  const distPath = path.join(__dirname, "..", "dist");
  if (options.serveStatic !== false && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }

      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  io.use(async (socket, next) => {
    try {
      const auth = await resolveViewer(
        store,
        extractBearerToken(
          socket.handshake.auth?.token || socket.handshake.headers?.authorization
        ),
        authCache
      );

      socket.data.authUser = auth.authUser;
      socket.data.user = auth.viewer;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const viewer = socket.data.user;
    socket.join(`user:${viewer.id}`);
    socket.emit("voice:state", serializeVoiceState());

    const currentCount = connectedUsers.get(viewer.id) || 0;
    connectedUsers.set(viewer.id, currentCount + 1);

    store
      .syncConnectionPresence({
        isOnline: true,
        userId: viewer.id
      })
      .then((profile) => {
        if (profile) {
          emitPresenceUpdate(profile);
        }
      })
      .catch(() => {});

    socket.on("room:join", async ({ channelId }) => {
      if (!channelId) {
        return;
      }

      try {
        const canAccess = await store.canAccessChannel({
          channelId,
          userId: viewer.id
        });

        if (!canAccess) {
          socket.emit("room:error", {
            channelId,
            error: "No puedes acceder a este canal."
          });
          return;
        }

        if (socket.data.activeChannelId) {
          await socket.leave(`channel:${socket.data.activeChannelId}`);
        }

        socket.data.activeChannelId = channelId;
        await socket.join(`channel:${channelId}`);
      } catch (error) {
        socket.emit("room:error", {
          channelId,
          error: error.message || "No se pudo unir al canal."
        });
      }
    });

    socket.on("typing:start", async ({ channelId }) => {
      if (!channelId) {
        return;
      }

      if (socket.data.activeChannelId !== channelId) {
        return;
      }

      socket.to(`channel:${channelId}`).emit("typing:update", {
        channelId,
        userId: viewer.id,
        username: viewer.username,
        expires_at: Date.now() + 5000
      });
    });

    socket.on("voice:join", async ({ channelId }) => {
      if (!channelId) {
        return;
      }

      try {
        const normalizedChannelId = normalizeVoiceChannelId(channelId);
        const canAccess = await store.canAccessChannel({
          channelId: normalizedChannelId,
          userId: viewer.id
        });
        const channel = await store.getChannel(normalizedChannelId);

        if (!canAccess || !canUseSharedVoiceChannel(channel)) {
          socket.emit("room:error", {
            channelId: normalizedChannelId,
            error: "No puedes entrar a esta llamada."
          });
          return;
        }

        if (normalizeVoiceChannelId(socket.data.voiceChannelId) === normalizedChannelId) {
          logVoiceServer("join:already", {
            channelId: normalizedChannelId,
            adapterSocketIds: [...getAdapterVoiceRoomSocketIds(normalizedChannelId)],
            roomSocketIds: [...getVoiceRoomSocketIds(normalizedChannelId)],
            socketId: socket.id,
            userId: viewer.id
          });
          socket.emit("voice:update", buildVoicePayload(normalizedChannelId));
          socket.emit("voice:peers", {
            channelId: normalizedChannelId,
            peers: listVoicePeers(normalizedChannelId, socket.id)
          });
          return;
        }

        leaveVoiceChannel(socket, viewer.id);

        const channelUsers = voiceSessions.get(normalizedChannelId) || new Map();
        channelUsers.set(viewer.id, (channelUsers.get(viewer.id) || 0) + 1);
        voiceSessions.set(normalizedChannelId, channelUsers);

        registerVoicePeer(normalizedChannelId, socket, viewer.id);
        socket.data.voiceChannelId = normalizedChannelId;
        await socket.join(`voice:${normalizedChannelId}`);
        await new Promise((resolve) => setImmediate(resolve));
        const peers = listVoicePeers(normalizedChannelId, socket.id);
        logVoiceServer("join", {
          channelId: normalizedChannelId,
          adapterPeerIds: listAdapterVoicePeers(normalizedChannelId, socket.id).map((peer) => peer.peerId),
          adapterSocketIds: [...getAdapterVoiceRoomSocketIds(normalizedChannelId)],
          peerIds: peers.map((peer) => peer.peerId),
          peerUserIds: peers.map((peer) => peer.userId),
          roomSocketIds: [...getVoiceRoomSocketIds(normalizedChannelId)],
          socketId: socket.id,
          userId: viewer.id
        });
        emitVoiceUpdate(normalizedChannelId);
        emitVoicePeerSnapshots(normalizedChannelId);
        socket.emit("voice:joined", {
          channelId: normalizedChannelId,
          peerId: socket.id,
          peers
        });
      } catch (error) {
        socket.emit("room:error", {
          channelId,
          error: error.message || "No se pudo entrar al canal de voz."
        });
      }
    });

    socket.on("voice:sync-peers", ({ channelId: requestedChannelId } = {}) => {
      const channelId = normalizeVoiceChannelId(requestedChannelId || socket.data.voiceChannelId);
      if (!channelId) {
        socket.emit("voice:peers", {
          channelId: null,
          peers: []
        });
        return;
      }

      const peers = listVoicePeers(channelId, socket.id);
      logVoiceServer("sync-peers", {
        channelId,
        adapterPeerIds: listAdapterVoicePeers(channelId, socket.id).map((peer) => peer.peerId),
        adapterSocketIds: [...getAdapterVoiceRoomSocketIds(channelId)],
        peerIds: peers.map((peer) => peer.peerId),
        peerUserIds: peers.map((peer) => peer.userId),
        requestedChannelId: requestedChannelId || null,
        roomSocketIds: [...getVoiceRoomSocketIds(channelId)],
        socketId: socket.id,
        userId: viewer.id
      });
      socket.emit("voice:peers", {
        channelId,
        peers
      });
    });

    socket.on("voice:signal", ({ signal, targetPeerId }) => {
      const channelId = normalizeVoiceChannelId(socket.data.voiceChannelId);
      if (!channelId || !targetPeerId || targetPeerId === socket.id || !signal) {
        return;
      }

      const targetSocket = io.sockets.sockets.get(targetPeerId);
      if (!targetSocket || normalizeVoiceChannelId(targetSocket.data.voiceChannelId) !== channelId) {
        return;
      }

      logVoiceServer("signal:relay", {
        channelId,
        fromPeerId: socket.id,
        fromSocketId: socket.id,
        signalType: getVoiceSignalType(signal),
        socketId: socket.id,
        targetPeerId,
        targetSocketId: targetPeerId,
        hasDescription: Boolean(signal.description),
        hasCandidate: Boolean(signal.candidate)
      });
      targetSocket.emit("voice:signal", {
        channelId,
        fromPeerId: socket.id,
        signal,
        userId: viewer.id
      });
    });

    socket.on("voice:leave", () => {
      leaveVoiceChannel(socket, viewer.id);
    });

    socket.on("disconnect", () => {
      leaveVoiceChannel(socket, viewer.id);
      const nextCount = Math.max(0, (connectedUsers.get(viewer.id) || 1) - 1);

      if (nextCount === 0) {
        connectedUsers.delete(viewer.id);
        store
          .syncConnectionPresence({
            isOnline: false,
            userId: viewer.id
          })
          .then((profile) => {
            if (profile) {
              emitPresenceUpdate(profile);
            }
          })
          .catch(() => {});
        return;
      }

      connectedUsers.set(viewer.id, nextCount);
    });
  });

  await new Promise((resolve) => {
    server.listen(port, host, resolve);
  });

  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const address = server.address();
  const listeningPort =
    typeof address === "object" && address?.port ? address.port : port;
  const url = `http://${displayHost}:${listeningPort}`;

  if (!quiet) {
    console.log(`Umbra server running at ${url}`);
  }

  return {
    app,
    io,
    server,
    store,
    url,
    close: createCloseHandle({ io, server })
  };
}
