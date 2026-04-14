import {
  canUseSharedVoiceChannel,
  extractBearerToken,
  getVoiceSignalType,
  normalizeVoiceChannelId,
  resolveViewer
} from "./shared.js";

export function createServerRuntime({
  authCache,
  io,
  store,
  voicePeerRooms,
  voiceSessions
}) {
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

  return {
    buildVoicePayload,
    emitChannelEvent,
    emitChannelPreview,
    emitFriendRequestToUser,
    emitNavigationUpdate,
    emitNavigationUpdateToUsers,
    emitPresenceUpdate,
    emitVoicePeerSnapshots,
    emitVoiceUpdate,
    getAdapterVoiceRoomSocketIds,
    getVoiceRoomSocketIds,
    leaveVoiceChannel,
    listAdapterVoicePeers,
    listVoicePeers,
    logVoiceServer,
    registerVoicePeer,
    removeUserFromGuildVoiceSessions,
    requireViewer,
    resolveOptionalViewer,
    sendError,
    serializeVoiceState,
    unregisterVoicePeer
  };
}
