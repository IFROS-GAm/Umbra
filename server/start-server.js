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

import { USER_STATUSES } from "./constants.js";
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

  if (configuredOrigins.length) {
    return new Set([...configuredOrigins, ...derivedOrigins, ...extraOrigins]);
  }

  if (derivedOrigins.length) {
    return new Set([...derivedOrigins, ...extraOrigins]);
  }

  return new Set(
    [
      "http://localhost:3030",
      "http://127.0.0.1:3030",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      ...extraOrigins
    ].filter(Boolean)
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
      files: Number(process.env.MAX_ATTACHMENT_FILES || 8)
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

  async function emitChannelPreview(channelId, preview) {
    if (!channelId || !preview) {
      return;
    }

    const audienceUserIds = await store.listChannelAudienceIds(channelId);
    for (const audienceUserId of audienceUserIds) {
      io.to(`user:${audienceUserId}`).emit("channel:preview", { preview });
    }
  }

  function buildVoicePayload(channelId) {
    return {
      channelId,
      userIds: [...(voiceSessions.get(channelId)?.keys() || [])]
    };
  }

  function emitVoiceUpdate(channelId) {
    io.emit("voice:update", buildVoicePayload(channelId));
  }

  function serializeVoiceState() {
    return Object.fromEntries(
      [...voiceSessions.keys()].map((channelId) => [
        channelId,
        [...(voiceSessions.get(channelId)?.keys() || [])]
      ])
    );
  }

  function leaveVoiceChannel(socket, userId) {
    const previousChannelId = socket.data.voiceChannelId;
    if (!previousChannelId) {
      return;
    }

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

      io.to(`channel:${req.params.channelId}`).emit("message:create", {
        message,
        preview
      });
      emitChannelPreview(req.params.channelId, preview).catch(() => {});

      res.status(201).json({ message, preview });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(
    "/api/attachments",
    requireViewer,
    upload.array("files", Number(process.env.MAX_ATTACHMENT_FILES || 8)),
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

      io.to(`channel:${message.channel_id}`).emit("message:update", {
        message,
        preview
      });
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

      io.to(`channel:${payload.channel_id}`).emit("message:delete", {
        ...payload,
        preview
      });
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

      io.to(`channel:${message.channel_id}`).emit("reaction:update", { message });
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

      emitNavigationUpdate({
        type: "friends:update",
        userId: req.viewer.id,
        targetUserId: req.body.recipientId || null
      });

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

      emitNavigationUpdate({
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

      emitNavigationUpdate({
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

      emitNavigationUpdate({
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

      emitNavigationUpdate({
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
          socket.leave(`channel:${socket.data.activeChannelId}`);
        }

        socket.data.activeChannelId = channelId;
        socket.join(`channel:${channelId}`);
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
        const canAccess = await store.canAccessChannel({
          channelId,
          userId: viewer.id
        });
        const channel = await store.getChannel(channelId);

        if (!canAccess || !isGuildVoiceChannel(channel)) {
          socket.emit("room:error", {
            channelId,
            error: "No puedes entrar a este canal de voz."
          });
          return;
        }

        if (socket.data.voiceChannelId === channelId) {
          socket.emit("voice:update", buildVoicePayload(channelId));
          return;
        }

        leaveVoiceChannel(socket, viewer.id);

        const channelUsers = voiceSessions.get(channelId) || new Map();
        channelUsers.set(viewer.id, (channelUsers.get(viewer.id) || 0) + 1);
        voiceSessions.set(channelId, channelUsers);

        socket.data.voiceChannelId = channelId;
        socket.join(`voice:${channelId}`);
        emitVoiceUpdate(channelId);
      } catch (error) {
        socket.emit("room:error", {
          channelId,
          error: error.message || "No se pudo entrar al canal de voz."
        });
      }
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
