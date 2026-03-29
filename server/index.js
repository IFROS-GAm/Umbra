import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Server } from "socket.io";

import { USER_STATUSES } from "./constants.js";
import { createStore } from "./store/index.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3030);

async function bootstrap() {
  const store = await createStore();
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH", "DELETE"]
    }
  });
  const connectedUsers = new Map();

  app.use(
    cors({
      origin: "*"
    })
  );
  app.use(express.json());

  function getUserId(req) {
    return (
      req.query.userId ||
      req.body?.userId ||
      req.body?.authorId ||
      req.body?.ownerId ||
      null
    );
  }

  function sendError(res, error) {
    res.status(error.statusCode || 500).json({
      error: error.message || "Error interno del servidor."
    });
  }

  app.get("/api/health", async (_, res) => {
    res.json({
      ok: true,
      mode: store.getMode()
    });
  });

  app.get("/api/bootstrap", async (req, res) => {
    try {
      const requestedUserId = req.query.userId || (await store.getDefaultUserId());
      const data = await store.bootstrap(requestedUserId);
      res.json({
        mode: store.getMode(),
        ...data
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/channels/:channelId/messages", async (req, res) => {
    try {
      const payload = await store.listChannelMessages({
        before: req.query.before || null,
        channelId: req.params.channelId,
        limit: Number(req.query.limit || 30),
        userId: req.query.userId
      });
      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/channels/:channelId/messages", async (req, res) => {
    try {
      const message = await store.createMessage({
        authorId: req.body.authorId,
        channelId: req.params.channelId,
        content: req.body.content,
        replyTo: req.body.replyTo || null
      });
      const preview = await store.getChannelPreview(req.params.channelId);

      io.emit("message:create", {
        message,
        preview
      });

      res.status(201).json({ message, preview });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/messages/:messageId", async (req, res) => {
    try {
      const message = await store.updateMessage({
        content: req.body.content,
        messageId: req.params.messageId,
        userId: req.body.userId
      });
      const preview = await store.getChannelPreview(message.channel_id);

      io.emit("message:update", {
        message,
        preview
      });

      res.json({ message, preview });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/messages/:messageId", async (req, res) => {
    try {
      const payload = await store.deleteMessage({
        messageId: req.params.messageId,
        userId: req.query.userId
      });
      const preview = await store.getChannelPreview(payload.channel_id);

      io.emit("message:delete", {
        ...payload,
        preview
      });

      res.json({
        ok: true,
        ...payload,
        preview
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    try {
      const message = await store.toggleReaction({
        emoji: req.body.emoji,
        messageId: req.params.messageId,
        userId: req.body.userId
      });

      io.emit("reaction:update", { message });
      res.json({ message });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds", async (req, res) => {
    try {
      const payload = await store.createGuild({
        description: req.body.description || "",
        name: req.body.name,
        ownerId: req.body.ownerId
      });

      io.emit("navigation:update", {
        type: "guild",
        owner_id: req.body.ownerId,
        ...payload
      });

      res.status(201).json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/guilds/:guildId/channels", async (req, res) => {
    try {
      const channel = await store.createChannel({
        createdBy: req.body.createdBy,
        guildId: req.params.guildId,
        name: req.body.name,
        topic: req.body.topic || ""
      });

      io.emit("navigation:update", {
        type: "channel",
        channel
      });

      res.status(201).json({ channel });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/dms", async (req, res) => {
    try {
      const channel = await store.createOrGetDm({
        ownerId: req.body.ownerId,
        recipientId: req.body.recipientId
      });

      io.emit("navigation:update", {
        type: "dm",
        channel
      });

      res.status(201).json({ channel });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch("/api/users/:userId/status", async (req, res) => {
    try {
      const status = req.body.status;
      if (!USER_STATUSES.includes(status)) {
        res.status(400).json({ error: "Estado inválido." });
        return;
      }

      const user = await store.setPresence({
        status,
        userId: req.params.userId
      });

      io.emit("presence:update", { user });
      res.json({ user });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/channels/:channelId/read", async (req, res) => {
    try {
      const payload = await store.markChannelRead({
        channelId: req.params.channelId,
        lastReadMessageId: req.body.lastReadMessageId || null,
        userId: req.body.userId
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  const distPath = path.join(__dirname, "..", "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  io.on("connection", (socket) => {
    socket.on("session:identify", async ({ userId }) => {
      if (!userId) {
        return;
      }

      socket.data.userId = userId;
      socket.join(`user:${userId}`);

      const currentCount = connectedUsers.get(userId) || 0;
      connectedUsers.set(userId, currentCount + 1);

      const profile = await store.syncConnectionPresence({
        isOnline: true,
        userId
      });

      if (profile) {
        io.emit("presence:update", { user: profile });
      }
    });

    socket.on("room:join", ({ channelId }) => {
      if (!channelId) {
        return;
      }

      if (socket.data.activeChannelId) {
        socket.leave(`channel:${socket.data.activeChannelId}`);
      }

      socket.data.activeChannelId = channelId;
      socket.join(`channel:${channelId}`);
    });

    socket.on("typing:start", ({ channelId, userId, username }) => {
      if (!channelId || !userId) {
        return;
      }

      socket.to(`channel:${channelId}`).emit("typing:update", {
        channelId,
        userId,
        username,
        expires_at: Date.now() + 5000
      });
    });

    socket.on("disconnect", async () => {
      const userId = socket.data.userId;
      if (!userId) {
        return;
      }

      const nextCount = Math.max(0, (connectedUsers.get(userId) || 1) - 1);
      if (nextCount === 0) {
        connectedUsers.delete(userId);
        const profile = await store.syncConnectionPresence({
          isOnline: false,
          userId
        });
        if (profile) {
          io.emit("presence:update", { user: profile });
        }
      } else {
        connectedUsers.set(userId, nextCount);
      }
    });
  });

  server.listen(port, () => {
    console.log(`IFROS Mini Discord corriendo en http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
