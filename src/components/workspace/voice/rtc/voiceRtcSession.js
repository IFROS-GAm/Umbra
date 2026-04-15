import { supabase } from "../../../../supabase-browser.js";
import { createVoiceRtcPeerSession } from "./createVoiceRtcPeerSession.js";
import { createVoiceRtcSessionControls } from "./createVoiceRtcSessionControls.js";
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
  const transportReadyWaiters = new Set();
  const pendingRealtimeSignals = [];
  let destroyed = false;
  let localAudioStream = null;
  let localCameraStream = null;
  let localScreenShareStream = null;
  let realtimeChannel = null;
  let realtimeTransportReady = !realtimeEnabled;
  let pendingPeerSnapshot = null;
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

  function resolveTransportWaiters() {
    transportReadyWaiters.forEach((resolve) => resolve());
    transportReadyWaiters.clear();
  }

  function waitForRealtimeTransport() {
    if (!realtimeEnabled || realtimeTransportReady || destroyed) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      transportReadyWaiters.add(resolve);
    });
  }

  async function flushPendingRealtimeSignals() {
    if (!realtimeEnabled || !realtimeChannel || !realtimeTransportReady || destroyed) {
      return;
    }

    while (pendingRealtimeSignals.length && !destroyed) {
      const payload = pendingRealtimeSignals.shift();
      if (!payload) {
        continue;
      }

      try {
        await realtimeChannel.send({
          event: "signal",
          payload,
          type: "broadcast"
        });
      } catch (error) {
        handleSessionError(error);
        pendingRealtimeSignals.unshift(payload);
        break;
      }
    }
  }

  async function applyKnownPeers(peersSnapshot = []) {
    await handlePeersSnapshot({
      channelId,
      peers: peersSnapshot
    });
  }

  async function flushPendingPeerSnapshot() {
    if (!pendingPeerSnapshot || destroyed) {
      return;
    }

    const snapshot = pendingPeerSnapshot;
    pendingPeerSnapshot = null;
    await applyKnownPeers(snapshot);
  }

  function sendRealtimeSignal(payload) {
    if (!realtimeEnabled) {
      return;
    }

    if (!realtimeChannel || !realtimeTransportReady) {
      pendingRealtimeSignals.push(payload);
      log("signal:queued", {
        signalType:
          payload?.signal?.description?.type ||
          (payload?.signal?.candidate ? "ice" : "unknown"),
        targetPeerId: payload?.targetPeerId || null
      });
      return;
    }

    realtimeChannel.send({
      event: "signal",
      payload,
      type: "broadcast"
    }).catch((error) => {
      handleSessionError(error);
    });
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
    handleSessionError,
    log,
    onPeerMediaChange,
    peers,
    realtimeEnabled,
    sendRealtimeSignal,
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

  async function setupRealtimeTransport() {
    if (!realtimeEnabled || destroyed || realtimeChannel) {
      return;
    }

    const signalChannel = supabase.channel(`umbra-voice-signal:${channelId}`);
    realtimeChannel = signalChannel;
    realtimeTransportReady = false;

    signalChannel.on("broadcast", { event: "signal" }, ({ payload } = {}) => {
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

    signalChannel.subscribe(async (status) => {
      log("signal:status", { status });

      if (status !== "SUBSCRIBED" || destroyed || realtimeChannel !== signalChannel) {
        return;
      }

      realtimeTransportReady = true;
      resolveTransportWaiters();

      try {
        await flushPendingRealtimeSignals();
        await flushPendingPeerSnapshot();
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

  const controls = createVoiceRtcSessionControls({
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
      if (destroyed) {
        realtimeTransportReady = true;
        pendingPeerSnapshot = null;
        pendingRealtimeSignals.length = 0;
        resolveTransportWaiters();
      }
    },
    setParticipantState: (nextParticipantState) => {
      participantState = nextParticipantState;
    },
    setPlaybackState: (nextPlaybackState) => {
      playbackState = nextPlaybackState;
    },
    setRealtimeChannel: (nextRealtimeChannel) => {
      realtimeChannel = nextRealtimeChannel;
    },
    socket,
    syncLocalAudioToPeer,
    syncLocalVideoToPeer,
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

  return {
    ...controls,
    async syncKnownPeers(nextPeers = []) {
      log("global:peers:received", {
        peerIds: nextPeers.map((peer) => peer?.peerId).filter(Boolean),
        peerUserIds: nextPeers.map((peer) => peer?.userId).filter(Boolean)
      });

      if (!realtimeEnabled) {
        await applyKnownPeers(nextPeers);
        return;
      }

      pendingPeerSnapshot = nextPeers;

      if (!realtimeTransportReady) {
        log("signal:transport:waiting", {
          peerIds: nextPeers.map((peer) => peer?.peerId).filter(Boolean)
        });
        await waitForRealtimeTransport();
      }

      if (destroyed) {
        return;
      }

      await flushPendingPeerSnapshot();
    }
  };
}
