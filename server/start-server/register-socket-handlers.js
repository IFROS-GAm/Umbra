import {
  canUseSharedVoiceChannel,
  extractBearerToken,
  getVoiceSignalType,
  normalizeVoiceChannelId,
  resolveViewer
} from "./shared.js";

export function registerSocketHandlers({
  authCache,
  buildVoicePayload,
  connectedUsers,
  emitPresenceUpdate,
  emitVoicePeerSnapshots,
  emitVoiceUpdate,
  getAdapterVoiceRoomSocketIds,
  getVoiceRoomSocketIds,
  io,
  leaveVoiceChannel,
  listAdapterVoicePeers,
  listVoicePeers,
  logVoiceServer,
  registerVoicePeer,
  serializeVoiceState,
  store,
  voiceSessions
}) {
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

    socket.on("call:invite", async ({ callId, channelId, mode = "audio" } = {}) => {
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

        if (!canAccess || channel?.type !== "dm") {
          return;
        }

        const participantIds = (channel.participants || [])
          .map((participant) => String(participant?.id || "").trim())
          .filter((participantId) => participantId && participantId !== viewer.id);

        if (!participantIds.length) {
          return;
        }

        const issuedAt = Date.now();
        const payload = {
          callId:
            String(callId || "").trim() ||
            `${normalizedChannelId}:${viewer.id}:${issuedAt}`,
          caller: {
            avatar_url: viewer.avatar_url || "",
            display_name: viewer.display_name || "",
            id: viewer.id,
            username: viewer.username || ""
          },
          channelId: normalizedChannelId,
          expiresAt: issuedAt + 28000,
          issuedAt,
          mode: mode === "video" ? "video" : "audio"
        };

        participantIds.forEach((participantId) => {
          io.to(`user:${participantId}`).emit("call:incoming", payload);
        });
      } catch {
        // keep direct-call invite best-effort
      }
    });

    socket.on("call:response", async ({ callId, channelId, status } = {}) => {
      if (!channelId || !status) {
        return;
      }

      try {
        const normalizedChannelId = normalizeVoiceChannelId(channelId);
        const canAccess = await store.canAccessChannel({
          channelId: normalizedChannelId,
          userId: viewer.id
        });
        const channel = await store.getChannel(normalizedChannelId);

        if (!canAccess || channel?.type !== "dm") {
          return;
        }

        const normalizedStatus = ["accepted", "missed", "rejected"].includes(status)
          ? status
          : "rejected";
        const participantIds = (channel.participants || [])
          .map((participant) => String(participant?.id || "").trim())
          .filter((participantId) => participantId && participantId !== viewer.id);

        if (!participantIds.length) {
          return;
        }

        const payload = {
          callId: String(callId || "").trim() || normalizedChannelId,
          channelId: normalizedChannelId,
          respondedAt: Date.now(),
          responder: {
            avatar_url: viewer.avatar_url || "",
            display_name: viewer.display_name || "",
            id: viewer.id,
            username: viewer.username || ""
          },
          status: normalizedStatus
        };

        participantIds.forEach((participantId) => {
          io.to(`user:${participantId}`).emit("call:response", payload);
        });
      } catch {
        // keep direct-call response best-effort
      }
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
}
