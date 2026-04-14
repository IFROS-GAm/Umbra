import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { Server } from "socket.io";

import { createServerRuntime } from "./start-server/runtime.js";
import { registerGuildRoutes } from "./start-server/register-guild-routes.js";
import { registerMessageRoutes } from "./start-server/register-message-routes.js";
import { registerSocialRoutes } from "./start-server/register-social-routes.js";
import { registerSocketHandlers } from "./start-server/register-socket-handlers.js";
import { registerSystemRoutes } from "./start-server/register-system-routes.js";
import {
  createCloseHandle,
  createCorsOptions,
  createHttpError,
  parseAllowedOrigins
} from "./start-server/shared.js";
import { createStore } from "./store/index.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  const runtime = createServerRuntime({
    authCache,
    io,
    store,
    voicePeerRooms,
    voiceSessions
  });

  registerSystemRoutes({
    app,
    emitNavigationUpdate: runtime.emitNavigationUpdate,
    requireViewer: runtime.requireViewer,
    resolveOptionalViewer: runtime.resolveOptionalViewer,
    sendError: runtime.sendError,
    serializeVoiceState: runtime.serializeVoiceState,
    store
  });

  registerMessageRoutes({
    app,
    emitChannelEvent: runtime.emitChannelEvent,
    emitChannelPreview: runtime.emitChannelPreview,
    requireViewer: runtime.requireViewer,
    sendError: runtime.sendError,
    store,
    upload
  });

  registerGuildRoutes({
    app,
    emitNavigationUpdate: runtime.emitNavigationUpdate,
    emitNavigationUpdateToUsers: runtime.emitNavigationUpdateToUsers,
    removeUserFromGuildVoiceSessions: runtime.removeUserFromGuildVoiceSessions,
    requireViewer: runtime.requireViewer,
    sendError: runtime.sendError,
    store
  });

  registerSocialRoutes({
    app,
    emitFriendRequestToUser: runtime.emitFriendRequestToUser,
    emitNavigationUpdate: runtime.emitNavigationUpdate,
    emitNavigationUpdateToUsers: runtime.emitNavigationUpdateToUsers,
    emitPresenceUpdate: runtime.emitPresenceUpdate,
    requireViewer: runtime.requireViewer,
    sendError: runtime.sendError,
    store
  });

  app.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError) {
      runtime.sendError(
        res,
        createHttpError("No se pudieron procesar los adjuntos.", 400)
      );
      return;
    }

    if (error) {
      runtime.sendError(res, error);
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

  registerSocketHandlers({
    authCache,
    buildVoicePayload: runtime.buildVoicePayload,
    connectedUsers,
    emitPresenceUpdate: runtime.emitPresenceUpdate,
    emitVoicePeerSnapshots: runtime.emitVoicePeerSnapshots,
    emitVoiceUpdate: runtime.emitVoiceUpdate,
    getAdapterVoiceRoomSocketIds: runtime.getAdapterVoiceRoomSocketIds,
    getVoiceRoomSocketIds: runtime.getVoiceRoomSocketIds,
    io,
    leaveVoiceChannel: runtime.leaveVoiceChannel,
    listAdapterVoicePeers: runtime.listAdapterVoicePeers,
    listVoicePeers: runtime.listVoicePeers,
    logVoiceServer: runtime.logVoiceServer,
    registerVoicePeer: runtime.registerVoicePeer,
    serializeVoiceState: runtime.serializeVoiceState,
    store,
    voiceSessions
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
