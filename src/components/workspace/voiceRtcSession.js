import { supabase } from "../../supabase-browser.js";
import { buildVoicePeersFromPresenceState } from "./voiceRealtimeHelpers.js";

const DEFAULT_RTC_CONFIGURATION = {
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302"]
    }
  ]
};

function clampUnitVolume(value, fallback = 1) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(0, Math.min(1, numeric));
}

async function applySinkId(audioElement, outputDeviceId) {
  if (!audioElement?.setSinkId || !outputDeviceId) {
    return;
  }

  try {
    await audioElement.setSinkId(outputDeviceId);
  } catch {
    // Keep the default device when Chromium blocks explicit routing.
  }
}

function createHiddenAudioElement() {
  const element = document.createElement("audio");
  element.autoplay = true;
  element.playsInline = true;
  element.style.display = "none";
  document.body.appendChild(element);
  return element;
}

function createRemoteStream() {
  return new MediaStream();
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

function hasTrack(stream, kind) {
  return Boolean(stream?.getTracks?.().some((track) => track.kind === kind));
}

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

  function handleSessionError(error) {
    if (typeof onError === "function") {
      onError(error);
    }
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
      joinedAt: new Date().toISOString(),
      micMuted: Boolean(participantState.micMuted),
      peerId: selfPeerId,
      screenShareEnabled: hasTrack(localScreenShareStream, "video"),
      speaking: Boolean(participantState.speaking),
      userId: currentUserId || null,
      videoMode: getCurrentLocalVideoMode()
    };
  }

  function syncRealtimePresence() {
    if (!realtimeEnabled || !realtimeChannel) {
      return Promise.resolve();
    }

    return realtimeChannel.track(buildRealtimePresencePayload());
  }

  function emitPeerMedia(entry) {
    if (typeof onPeerMediaChange !== "function" || !entry) {
      return;
    }

    const videoMode =
      entry.videoMode ||
      (entry.screenShareEnabled ? "screen" : entry.cameraEnabled ? "camera" : "");

    onPeerMediaChange({
      cameraStream:
        videoMode === "camera" && hasTrack(entry.remoteVideoStream, "video")
          ? entry.remoteVideoStream
          : null,
      deafened: Boolean(entry.deafened),
      hasAudio: hasTrack(entry.remoteAudioStream, "audio"),
      micMuted: Boolean(entry.micMuted),
      peerId: entry.peerId,
      removed: false,
      screenShareStream:
        videoMode === "screen" && hasTrack(entry.remoteVideoStream, "video")
          ? entry.remoteVideoStream
          : null,
      speaking: Boolean(entry.speaking),
      userId: entry.userId || "",
      videoMode
    });
  }

  function clearPeerMedia(entry) {
    if (typeof onPeerMediaChange !== "function" || !entry) {
      return;
    }

    onPeerMediaChange({
      peerId: entry.peerId,
      removed: true,
      userId: entry.userId || ""
    });
  }

  function applyPlaybackToPeer(entry) {
    if (!entry?.audioElement) {
      return;
    }

    entry.audioElement.muted = playbackState.deafened;
    entry.audioElement.volume = playbackState.deafened ? 0 : playbackState.outputVolume;
    applySinkId(entry.audioElement, playbackState.outputDeviceId);
  }

  function safePlayAudio(entry) {
    entry?.audioElement?.play?.().catch((error) => {
      log(
        "audio:play-blocked",
        {
          message: error?.message || "Autoplay bloqueado."
        },
        "warn"
      );
    });
  }

  function getPeerEntry(peerId) {
    return peers.get(peerId) || null;
  }

  function shouldIgnorePeer({ peerId, userId }) {
    return !peerId || peerId === selfPeerId || (currentUserId && userId === currentUserId);
  }

  function sendSignal(targetPeerId, signal) {
    if (!targetPeerId || !signal) {
      return;
    }

    if (realtimeEnabled && realtimeChannel) {
      log("signal:emit", {
        signalType: getVoiceSignalType(signal),
        targetPeerId,
        transport: "supabase"
      });
      realtimeChannel
        .send({
          type: "broadcast",
          event: "signal",
          payload: {
            channelId,
            fromPeerId: selfPeerId,
            signal,
            targetPeerId,
            userId: currentUserId || null
          }
        })
        .catch((error) => {
          handleSessionError(error);
        });
      return;
    }

    socket.emit("voice:signal", {
      signal,
      targetPeerId
    });
  }

  async function negotiatePeer(entry) {
    if (!entry || destroyed || entry.destroyed) {
      return;
    }

    if (entry.makingOffer || entry.peerConnection.signalingState !== "stable") {
      entry.pendingNegotiation = true;
      return;
    }

    try {
      entry.makingOffer = true;
      log("offer:create", { peerId: entry.peerId, userId: entry.userId || null });
      await entry.peerConnection.setLocalDescription(
        await entry.peerConnection.createOffer()
      );
      log("offer:emit", {
        peerId: entry.peerId,
        transport: realtimeEnabled ? "supabase" : "socket",
        userId: entry.userId || null
      });
      sendSignal(entry.peerId, {
        description: entry.peerConnection.localDescription
      });
    } catch (error) {
      handleSessionError(error);
    } finally {
      entry.makingOffer = false;
      if (entry.pendingNegotiation && !destroyed && !entry.destroyed) {
        entry.pendingNegotiation = false;
        queueMicrotask(() => {
          negotiatePeer(entry);
        });
      }
    }
  }

  async function syncSenderTrack({
    addStream,
    entry,
    nextTrack,
    senderKey
  }) {
    if (!entry || destroyed || entry.destroyed) {
      return false;
    }

    const sender = entry[senderKey] || null;
    const currentTrack = sender?.track || null;

    if (currentTrack === nextTrack) {
      return false;
    }

    if (sender) {
      try {
        await sender.replaceTrack(nextTrack);
        return true;
      } catch (error) {
        handleSessionError(error);
        return false;
      }
    }

    if (!nextTrack || !addStream) {
      return false;
    }

    entry[senderKey] = entry.peerConnection.addTrack(nextTrack, addStream);
    return true;
  }

  async function syncLocalAudioToPeer(entry, { renegotiate = false } = {}) {
    const changed = await syncSenderTrack({
      addStream: localAudioStream,
      entry,
      nextTrack: getCurrentLocalAudioTrack(),
      senderKey: "audioSender"
    });

    if (changed && renegotiate) {
      await negotiatePeer(entry);
    }
  }

  async function syncLocalVideoToPeer(entry, { renegotiate = false } = {}) {
    const localVideoStream = getCurrentLocalVideoStream();
    const nextTrack = getCurrentLocalVideoTrack();
    const changed = await syncSenderTrack({
      addStream: localVideoStream,
      entry,
      nextTrack,
      senderKey: "videoSender"
    });

    if (changed) {
      entry.videoMode = getCurrentLocalVideoMode();
    }

    if (changed && renegotiate) {
      await negotiatePeer(entry);
    }
  }

  function cleanupPeer(peerId) {
    const entry = peers.get(peerId);
    if (!entry) {
      return;
    }

    entry.destroyed = true;
    peers.delete(peerId);
    clearPeerMedia(entry);

    try {
      entry.peerConnection.onicecandidate = null;
      entry.peerConnection.ontrack = null;
      entry.peerConnection.onconnectionstatechange = null;
      entry.peerConnection.close();
    } catch {
      // Ignore peer teardown errors.
    }

    try {
      entry.audioElement.pause();
      entry.audioElement.srcObject = null;
      entry.audioElement.remove();
    } catch {
      // Ignore DOM cleanup edge cases.
    }
  }

  async function ensurePeer(peer) {
    const {
      cameraEnabled = false,
      deafened = false,
      micMuted = false,
      peerId,
      screenShareEnabled = false,
      speaking = false,
      userId = null,
      videoMode = ""
    } = peer || {};
    if (shouldIgnorePeer({ peerId, userId })) {
      return null;
    }

    const existing = getPeerEntry(peerId);
    if (existing) {
      existing.cameraEnabled = Boolean(cameraEnabled);
      existing.deafened = Boolean(deafened);
      existing.micMuted = Boolean(micMuted);
      existing.screenShareEnabled = Boolean(screenShareEnabled);
      existing.speaking = Boolean(speaking);
      existing.userId = userId || existing.userId;
      existing.videoMode = videoMode || existing.videoMode;
      emitPeerMedia(existing);
      return existing;
    }

    const audioElement = createHiddenAudioElement();

    const entry = {
      audioElement,
      audioSender: null,
      cameraEnabled: Boolean(cameraEnabled),
      deafened: Boolean(deafened),
      destroyed: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      makingOffer: false,
      micMuted: Boolean(micMuted),
      peerConnection: new RTCPeerConnection(DEFAULT_RTC_CONFIGURATION),
      peerId,
      pendingNegotiation: false,
      remoteAudioStream: createRemoteStream(),
      remoteVideoStream: createRemoteStream(),
      screenShareEnabled: Boolean(screenShareEnabled),
      speaking: Boolean(speaking),
      userId,
      videoMode
    };

    audioElement.srcObject = entry.remoteAudioStream;
    peers.set(peerId, entry);
    applyPlaybackToPeer(entry);

    entry.peerConnection.onicecandidate = (event) => {
      if (destroyed || entry.destroyed || !event.candidate) {
        return;
      }

      log("ice:emit", {
        peerId,
        targetPeerId: peerId,
        transport: realtimeEnabled ? "supabase" : "socket",
        userId: entry.userId || null
      });
      sendSignal(peerId, {
        candidate: event.candidate
      });
    };

    entry.peerConnection.ontrack = (event) => {
      log("track", {
        hasStreams: Boolean(event.streams?.length),
        kind: event.track?.kind || "",
        peerId,
        userId: entry.userId || null
      });

      if (event.track?.kind === "audio") {
        if (
          !entry.remoteAudioStream.getTracks().some((track) => track.id === event.track.id)
        ) {
          entry.remoteAudioStream.addTrack(event.track);
        }
        entry.audioElement.srcObject = entry.remoteAudioStream;
        applyPlaybackToPeer(entry);
        safePlayAudio(entry);
        emitPeerMedia(entry);
        return;
      }

      if (event.track?.kind === "video") {
        entry.remoteVideoStream.getTracks().forEach((track) => {
          entry.remoteVideoStream.removeTrack(track);
        });
        entry.remoteVideoStream.addTrack(event.track);
        emitPeerMedia(entry);
      }
    };

    entry.peerConnection.onconnectionstatechange = () => {
      const { connectionState } = entry.peerConnection;
      log("rtc:state", { connectionState, peerId, userId: entry.userId || null });
      if (connectionState === "failed" || connectionState === "closed") {
        cleanupPeer(peerId);
      }
    };

    await syncLocalAudioToPeer(entry, {
      renegotiate: false
    });
    await syncLocalVideoToPeer(entry, {
      renegotiate: false
    });

    emitPeerMedia(entry);
    return entry;
  }

  async function handlePeersSnapshot({ channelId: snapshotChannelId, peers: nextPeers = [] }) {
    if (destroyed || snapshotChannelId !== channelId) {
      return;
    }

    log("peers:received", {
      peerIds: nextPeers.map((peer) => peer.peerId),
      peerUserIds: nextPeers.map((peer) => peer.userId)
    });
    const activePeerIds = new Set();

    for (const peer of nextPeers) {
      if (shouldIgnorePeer(peer)) {
        continue;
      }

      activePeerIds.add(peer.peerId);
      const entry = await ensurePeer(peer);
      if (
        entry &&
        !entry.peerConnection.localDescription &&
        !entry.peerConnection.remoteDescription
      ) {
        await negotiatePeer(entry);
      }
    }

    for (const peerId of [...peers.keys()]) {
      if (!activePeerIds.has(peerId)) {
        cleanupPeer(peerId);
      }
    }
  }

  async function handleSignal({
    channelId: signalChannelId,
    fromPeerId,
    signal,
    userId
  }) {
    if (destroyed || signalChannelId !== channelId || !fromPeerId || !signal) {
      return;
    }

    log("signal:received", {
      fromPeerId,
      hasCandidate: Boolean(signal.candidate),
      hasDescription: Boolean(signal.description),
      signalType: getVoiceSignalType(signal)
    });
    const entry = await ensurePeer({
      peerId: fromPeerId,
      userId
    });
    if (!entry) {
      return;
    }

    try {
      if (signal.description) {
        const description = signal.description;
        const readyForOffer =
          !entry.makingOffer &&
          (entry.peerConnection.signalingState === "stable" ||
            entry.isSettingRemoteAnswerPending);
        const offerCollision = description.type === "offer" && !readyForOffer;
        const polite = selfPeerId.localeCompare(String(fromPeerId || "")) > 0;

        entry.ignoreOffer = !polite && offerCollision;
        if (entry.ignoreOffer) {
          return;
        }

        if (description.type === "answer") {
          log("answer:received", { fromPeerId, userId: entry.userId || null });
        }

        entry.isSettingRemoteAnswerPending = description.type === "answer";
        await entry.peerConnection.setRemoteDescription(description);
        entry.isSettingRemoteAnswerPending = false;

        if (description.type === "offer") {
          log("offer:received", { fromPeerId, userId: entry.userId || null });
          await syncLocalAudioToPeer(entry, {
            renegotiate: false
          });
          await syncLocalVideoToPeer(entry, {
            renegotiate: false
          });
          await entry.peerConnection.setLocalDescription(
            await entry.peerConnection.createAnswer()
          );
          log("answer:emit", {
            targetPeerId: fromPeerId,
            transport: realtimeEnabled ? "supabase" : "socket",
            userId: entry.userId || null
          });
          sendSignal(fromPeerId, {
            description: entry.peerConnection.localDescription
          });
        }

        if (
          description.type === "answer" &&
          entry.pendingNegotiation &&
          entry.peerConnection.signalingState === "stable"
        ) {
          entry.pendingNegotiation = false;
          queueMicrotask(() => {
            negotiatePeer(entry);
          });
        }
      }

      if (signal.candidate && !entry.ignoreOffer) {
        log("ice:received", { fromPeerId, userId: entry.userId || null });
        await entry.peerConnection.addIceCandidate(signal.candidate);
      }
    } catch (error) {
      handleSessionError(error);
    }
  }

  function handlePeerLeft({ channelId: peerChannelId, peerId }) {
    if (destroyed || peerChannelId !== channelId || !peerId) {
      return;
    }

    log("peer:left", { peerId });
    cleanupPeer(peerId);
  }

  function handleSocketConnect() {
    if (destroyed || realtimeEnabled) {
      return;
    }

    log("socket:connect", {});
    for (const peerId of [...peers.keys()]) {
      cleanupPeer(peerId);
    }

    log("sync-peers:emit", {});
    socket.emit("voice:sync-peers", {
      channelId
    });
  }

  async function handleRealtimePresenceSync() {
    if (destroyed || !realtimeChannel) {
      return;
    }

    const nextPeers = buildVoicePeersFromPresenceState(realtimeChannel.presenceState(), {
      channelId,
      currentUserId,
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
      log("sync-peers:emit", {});
      socket.emit("voice:sync-peers", {
        channelId
      });
    }
  }

  return {
    async updateLocalMediaStreams({
      audioStream = null,
      cameraStream = null,
      screenShareStream = null
    } = {}) {
      localAudioStream = audioStream;
      localCameraStream = cameraStream;
      localScreenShareStream = screenShareStream;

      if (realtimeEnabled && realtimeChannel) {
        syncRealtimePresence().catch((error) => {
            handleSessionError(error);
          });
      }

      for (const entry of peers.values()) {
        await syncLocalAudioToPeer(entry, {
          renegotiate: true
        });
        await syncLocalVideoToPeer(entry, {
          renegotiate: true
        });
      }
    },
    setLocalTrackEnabled(nextEnabled) {
      localAudioStream?.getAudioTracks?.().forEach((track) => {
        track.enabled = Boolean(nextEnabled);
      });
    },
    updateParticipantState(nextState = {}) {
      participantState = {
        deafened:
          typeof nextState.deafened === "boolean"
            ? nextState.deafened
            : participantState.deafened,
        micMuted:
          typeof nextState.micMuted === "boolean"
            ? nextState.micMuted
            : participantState.micMuted,
        speaking:
          typeof nextState.speaking === "boolean"
            ? nextState.speaking
            : participantState.speaking
      };

      if (realtimeEnabled && realtimeChannel) {
        syncRealtimePresence().catch((error) => {
          handleSessionError(error);
        });
      }
    },
    updatePlayback(nextPlayback = {}) {
      playbackState = {
        deafened:
          typeof nextPlayback.deafened === "boolean"
            ? nextPlayback.deafened
            : playbackState.deafened,
        outputDeviceId: nextPlayback.outputDeviceId || playbackState.outputDeviceId,
        outputVolume:
          nextPlayback.outputVolume === undefined
            ? playbackState.outputVolume
            : clampUnitVolume(nextPlayback.outputVolume, playbackState.outputVolume)
      };

      for (const entry of peers.values()) {
        applyPlaybackToPeer(entry);
      }
    },
    async destroy() {
      destroyed = true;

      if (realtimeEnabled) {
        if (realtimeChannel) {
          try {
            await realtimeChannel.untrack();
          } catch {
            // Ignore untrack races during teardown.
          }

          try {
            await supabase.removeChannel(realtimeChannel);
          } catch {
            // Ignore realtime teardown failures.
          }

          realtimeChannel = null;
        }
      } else {
        socket.off("voice:peers", handlePeersSnapshot);
        socket.off("voice:peer-left", handlePeerLeft);
        socket.off("voice:signal", handleSignal);
        socket.off("connect", handleSocketConnect);
      }

      for (const peerId of [...peers.keys()]) {
        cleanupPeer(peerId);
      }
    }
  };
}
