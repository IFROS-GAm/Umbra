import { supabase } from "../../../../supabase-browser.js";
import { createVoiceRtcPeerSession } from "./createVoiceRtcPeerSession.js";
import { createVoiceRtcSessionControls } from "./createVoiceRtcSessionControls.js";
import { createRealtimePresenceSync } from "../presence/createRealtimePresenceSync.js";
import { buildVoicePeersFromPresenceState } from "../presence/voiceRealtimeHelpers.js";
import { clampUnitVolume, hasTrack } from "./voiceRtcSessionConfig.js";

export function createVoiceRtcSession({
  channelId,
  currentUserId,
  deafened = false,
  micMuted = false,
  localPeerId = "",
  onError = null,
  onPeerMediaChange = null,
  outputDeviceId = "default",
  outputVolume = 1,
  speaking = false,
  socket,
  useSharedRealtime = false
}) {
  if (!socket) {
    throw new Error("No hay socket disponible para iniciar voz.");
  }

  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("Este entorno no soporta conexiones WebRTC.");
  }

  const realtimeEnabled = Boolean(useSharedRealtime && supabase);
  const peers = new Map();
  let destroyed = false;
  let localAudioStream = null;
  let localCameraStream = null;
  let localScreenShareStream = null;
  let realtimeChannel = null;
  let realtimePresenceSync = null;
  let playbackState = {
    deafened: Boolean(deafened),
    outputDeviceId,
    outputVolume: clampUnitVolume(outputVolume)
  };
  let participantState = {
    deafened: Boolean(deafened),
    micMuted: Boolean(micMuted),
    speaking: Boolean(speaking)
  };

  const selfPeerId = String(
    localPeerId ||
      socket.id ||
      globalThis.crypto?.randomUUID?.() ||
      `voice-peer-${Date.now()}-${Math.random().toString(16).slice(2)}`
  ).trim();
  const joinedAt = new Date().toISOString();
  let realtimePresenceRevision = 0;

  const log = (event, details = {}, level = "info") => {
    const logger = typeof console[level] === "function" ? console[level] : console.info;
    logger(`[voice/client] ${event}`, {
      channelId,
      peerId: selfPeerId,
      socketId: socket.id || null,
      ...details
    });
  };

  function handleSessionError(error) {
    if (typeof onError === "function") {
      onError(error);
    }
  }

  function getLocalAudioStream() {
    return localAudioStream;
  }

  function getCurrentLocalAudioTrack() {
    return localAudioStream?.getAudioTracks?.()?.[0] || null;
  }

  function getCurrentLocalVideoMode() {
    if (hasTrack(localScreenShareStream, "video")) {
      return "screen";
    }

    if (hasTrack(localCameraStream, "video")) {
      return "camera";
    }

    return "";
  }

  function getCurrentLocalVideoStream() {
    if (getCurrentLocalVideoMode() === "screen") {
      return localScreenShareStream;
    }

    if (getCurrentLocalVideoMode() === "camera") {
      return localCameraStream;
    }

    return null;
  }

  function getCurrentLocalVideoTrack() {
    return getCurrentLocalVideoStream()?.getVideoTracks?.()?.[0] || null;
  }

  function buildRealtimePresencePayload() {
    return {
      cameraEnabled: hasTrack(localCameraStream, "video"),
      channelId,
      deafened: Boolean(participantState.deafened),
      joinedAt,
      micMuted: Boolean(participantState.micMuted),
      peerId: selfPeerId,
      revision: realtimePresenceRevision,
      screenShareEnabled: hasTrack(localScreenShareStream, "video"),
      speaking: Boolean(participantState.speaking),
      updatedAt: new Date().toISOString(),
      userId: currentUserId || null,
      videoMode: getCurrentLocalVideoMode()
    };
  }

  function syncRealtimePresence() {
    if (!realtimeEnabled || !realtimeChannel || !realtimePresenceSync) {
      return Promise.resolve();
    }

    realtimePresenceRevision += 1;
    return realtimePresenceSync.schedule(buildRealtimePresencePayload());
  }

  const {
    applyPlaybackToPeer,
    cleanupPeer,
    handlePeerLeft,
    handlePeersSnapshot,
    handleSignal,
    startPeerOffer,
    syncLocalAudioToPeer,
    syncLocalVideoToPeer
  } = createVoiceRtcPeerSession({
    channelId,
    currentUserId,
    getCurrentLocalAudioTrack,
    getCurrentLocalVideoMode,
    getCurrentLocalVideoStream,
    getCurrentLocalVideoTrack,
    getLocalAudioStream,
    getPlaybackState: () => playbackState,
    getRealtimeChannel: () => realtimeChannel,
    handleSessionError,
    log,
    onPeerMediaChange,
    peers,
    realtimeEnabled,
    selfPeerId,
    socket
  });

  function requestPeerSync() {
    log("sync-peers:emit", {});
    socket.emit("voice:sync-peers", {
      channelId
    });
  }

  function handleSocketConnect() {
    if (destroyed || realtimeEnabled) {
      return;
    }

    log("socket:connect", {});
    for (const peerId of [...peers.keys()]) {
      cleanupPeer(peerId);
    }
    requestPeerSync();
  }

  async function handleRealtimePresenceSync() {
    if (destroyed || !realtimeChannel) {
      return;
    }

    const nextPeers = buildVoicePeersFromPresenceState(realtimeChannel.presenceState(), {
      channelId,
      localPeerId: selfPeerId
    });

    log("realtime:peers", {
      peerIds: nextPeers.map((peer) => peer.peerId),
      peerUserIds: nextPeers.map((peer) => peer.userId)
    });

    await handlePeersSnapshot({
      channelId,
      peers: nextPeers
    });
  }

  async function setupRealtimeTransport() {
    if (!realtimeEnabled || destroyed || realtimeChannel) {
      return;
    }

    realtimeChannel = supabase.channel(`umbra-voice-room:${channelId}`, {
      config: {
        presence: {
          key: selfPeerId
        }
      }
    });
    realtimePresenceSync = createRealtimePresenceSync({
      getChannel: () => realtimeChannel,
      log: (event, details = {}, level = "info") => {
        log(`realtime:${event}`, details, level);
      },
      onError: (error) => {
        handleSessionError(error);
      }
    });

    realtimeChannel.on("presence", { event: "sync" }, () => {
      handleRealtimePresenceSync();
    });
    realtimeChannel.on("presence", { event: "join" }, () => {
      handleRealtimePresenceSync();
    });
    realtimeChannel.on("presence", { event: "leave" }, ({ leftPresences = [] } = {}) => {
      leftPresences.forEach((presence) => {
        const peerId = String(presence?.peerId || presence?.presence_ref || "").trim();
        if (peerId) {
          log("peer:left", {
            peerId,
            transport: "supabase"
          });
          cleanupPeer(peerId);
        }
      });
      handleRealtimePresenceSync();
    });
    realtimeChannel.on("broadcast", { event: "signal" }, ({ payload } = {}) => {
      const nextPayload = payload || {};
      if (!nextPayload?.targetPeerId || nextPayload.targetPeerId !== selfPeerId) {
        return;
      }

      handleSignal({
        channelId: nextPayload.channelId,
        fromPeerId: nextPayload.fromPeerId,
        signal: nextPayload.signal,
        userId: nextPayload.userId
      });
    });

    realtimeChannel.subscribe(async (status) => {
      log("realtime:status", { status });
      if (status !== "SUBSCRIBED" || destroyed) {
        return;
      }

      try {
        await syncRealtimePresence();
        await handleRealtimePresenceSync();
      } catch (error) {
        handleSessionError(error);
      }
    });
  }

  if (realtimeEnabled) {
    setupRealtimeTransport().catch((error) => {
      handleSessionError(error);
    });
  } else {
    socket.on("voice:peers", handlePeersSnapshot);
    socket.on("voice:peer-left", handlePeerLeft);
    socket.on("voice:signal", handleSignal);
    socket.on("connect", handleSocketConnect);

    if (socket.connected) {
      requestPeerSync();
    }
  }

  return createVoiceRtcSessionControls({
    applyPlaybackToPeer,
    cleanupPeer,
    getLocalStreams: () => ({
      localAudioStream,
      localCameraStream,
      localScreenShareStream
    }),
    getParticipantState: () => participantState,
    getPlaybackState: () => playbackState,
    getPeers: () => peers,
    getRealtimePresenceSync: () => realtimePresenceSync,
    getRealtimeChannel: () => realtimeChannel,
    handlePeerLeft,
    handlePeersSnapshot,
    handleSignal,
    handleSessionError,
    handleSocketConnect,
    realtimeEnabled,
    requestPeerOffer: startPeerOffer,
    setDestroyed: (nextDestroyed) => {
      destroyed = nextDestroyed;
    },
    setParticipantState: (nextParticipantState) => {
      participantState = nextParticipantState;
    },
    setPlaybackState: (nextPlaybackState) => {
      playbackState = nextPlaybackState;
    },
    setRealtimeChannel: (nextRealtimeChannel) => {
      realtimeChannel = nextRealtimeChannel;
      if (!nextRealtimeChannel) {
        realtimePresenceSync = null;
      }
    },
    socket,
    syncLocalAudioToPeer,
    syncLocalVideoToPeer,
    syncRealtimePresence,
    updateLocalStreams: ({
      audioStream = null,
      cameraStream = null,
      screenShareStream = null
    }) => {
      localAudioStream = audioStream;
      localCameraStream = cameraStream;
      localScreenShareStream = screenShareStream;
    }
  });
}
