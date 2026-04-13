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

export function createVoiceRtcSession({
  channelId,
  currentUserId,
  deafened = false,
  onError = null,
  outputDeviceId = "default",
  outputVolume = 1,
  socket
}) {
  if (!socket) {
    throw new Error("No hay socket disponible para iniciar voz.");
  }

  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("Este entorno no soporta conexiones WebRTC.");
  }

  const peers = new Map();
  let destroyed = false;
  let localAudioStream = null;
  let localAudioTrack = null;
  const log = (event, details = {}, level = "info") => {
    const logger = typeof console[level] === "function" ? console[level] : console.info;
    logger(`[voice/client] ${event}`, {
      channelId,
      socketId: socket.id || null,
      ...details
    });
  };
  let playbackState = {
    deafened: Boolean(deafened),
    outputDeviceId,
    outputVolume: clampUnitVolume(outputVolume)
  };

  function handleSessionError(error) {
    if (typeof onError === "function") {
      onError(error);
    }
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
    entry?.audioElement?.play?.().catch(() => {
      // User interaction usually unlocks playback before joining voice.
    });
  }

  function getPeerEntry(peerId) {
    return peers.get(peerId) || null;
  }

  function shouldIgnorePeer({ peerId, userId }) {
    return !peerId || peerId === socket.id || (currentUserId && userId === currentUserId);
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
      log("offer:emit", { peerId: entry.peerId, userId: entry.userId || null });
      socket.emit("voice:signal", {
        signal: {
          description: entry.peerConnection.localDescription
        },
        targetPeerId: entry.peerId
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

  async function syncLocalAudioToPeer(entry, { renegotiate = false } = {}) {
    if (!entry || destroyed || entry.destroyed) {
      return;
    }

    const nextTrack = localAudioTrack;
    if (entry.audioSender) {
      if (entry.audioSender.track === nextTrack) {
        return;
      }

      try {
        await entry.audioSender.replaceTrack(nextTrack);
      } catch (error) {
        handleSessionError(error);
      }
      return;
    }

    if (!nextTrack || !localAudioStream) {
      return;
    }

    entry.audioSender = entry.peerConnection.addTrack(nextTrack, localAudioStream);
    if (renegotiate) {
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
    const { peerId, userId = null } = peer || {};
    if (shouldIgnorePeer({ peerId, userId })) {
      return null;
    }

    const existing = getPeerEntry(peerId);
    if (existing) {
      existing.userId = userId || existing.userId;
      return existing;
    }

    const audioElement = createHiddenAudioElement();
    const remoteStream = createRemoteStream();
    audioElement.srcObject = remoteStream;

    const entry = {
      audioElement,
      audioSender: null,
      destroyed: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      makingOffer: false,
      peerConnection: new RTCPeerConnection(DEFAULT_RTC_CONFIGURATION),
      peerId,
      pendingNegotiation: false,
      remoteStream,
      userId
    };

    peers.set(peerId, entry);
    applyPlaybackToPeer(entry);

    entry.peerConnection.onicecandidate = (event) => {
      if (destroyed || entry.destroyed || !event.candidate) {
        return;
      }

      log("ice:emit", {
        peerId,
        targetPeerId: peerId,
        userId: entry.userId || null
      });
      socket.emit("voice:signal", {
        signal: {
          candidate: event.candidate
        },
        targetPeerId: peerId
      });
    };

    entry.peerConnection.ontrack = (event) => {
      log("track", { peerId, userId: entry.userId || null, hasStreams: Boolean(event.streams?.length) });
      const nextStream = event.streams?.[0] || null;
      if (nextStream) {
        entry.audioElement.srcObject = nextStream;
      } else if (
        event.track &&
        !entry.remoteStream.getTracks().some((track) => track.id === event.track.id)
      ) {
        entry.remoteStream.addTrack(event.track);
        entry.audioElement.srcObject = entry.remoteStream;
      }

      applyPlaybackToPeer(entry);
      safePlayAudio(entry);
    };

    entry.peerConnection.onconnectionstatechange = () => {
      const { connectionState } = entry.peerConnection;
      log("rtc:state", { peerId, userId: entry.userId || null, connectionState });
      if (connectionState === "failed" || connectionState === "closed") {
        cleanupPeer(peerId);
      }
    };

    await syncLocalAudioToPeer(entry, {
      renegotiate: false
    });

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
      signalType: getVoiceSignalType(signal),
      hasDescription: Boolean(signal.description),
      hasCandidate: Boolean(signal.candidate)
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
        const polite = String(socket.id || "").localeCompare(String(fromPeerId || "")) > 0;

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
          await entry.peerConnection.setLocalDescription(
            await entry.peerConnection.createAnswer()
          );
          log("answer:emit", { targetPeerId: fromPeerId, userId: entry.userId || null });
          socket.emit("voice:signal", {
            signal: {
              description: entry.peerConnection.localDescription
            },
            targetPeerId: fromPeerId
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
    if (destroyed) {
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

  return {
    async updateLocalAudioStream(nextStream) {
      localAudioStream = nextStream || null;
      localAudioTrack = nextStream?.getAudioTracks?.()?.[0] || null;

      for (const entry of peers.values()) {
        await syncLocalAudioToPeer(entry, {
          renegotiate: Boolean(localAudioTrack)
        });
      }
    },
    setLocalTrackEnabled(nextEnabled) {
      if (!localAudioTrack) {
        return;
      }

      localAudioTrack.enabled = Boolean(nextEnabled);
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
      socket.off("voice:peers", handlePeersSnapshot);
      socket.off("voice:peer-left", handlePeerLeft);
      socket.off("voice:signal", handleSignal);
      socket.off("connect", handleSocketConnect);

      for (const peerId of [...peers.keys()]) {
        cleanupPeer(peerId);
      }
    }
  };
}
