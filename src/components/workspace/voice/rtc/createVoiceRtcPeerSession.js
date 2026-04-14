import {
  applySinkId,
  buildRtcConfiguration,
  createHiddenAudioElement,
  createRemoteStream,
  getVoiceSignalType
} from "./voiceRtcSessionConfig.js";

export function createVoiceRtcPeerSession({
  channelId,
  currentUserId,
  getCurrentLocalAudioTrack,
  getLocalAudioStream,
  getCurrentLocalVideoMode,
  getCurrentLocalVideoStream,
  getCurrentLocalVideoTrack,
  getPlaybackState,
  getRealtimeChannel,
  handleSessionError,
  log,
  onPeerMediaChange,
  peers,
  realtimeEnabled,
  selfPeerId,
  socket
}) {
  const pendingAudioUnlockEntries = new Set();
  let removeAudioUnlockListeners = null;

  function hasLiveRemoteTrack(stream, kind) {
    const track = stream?.getTracks?.().find((candidate) => candidate.kind === kind) || null;
    return Boolean(track && track.readyState !== "ended" && !track.muted);
  }

  function updateAudioUnlockListeners() {
    if (pendingAudioUnlockEntries.size === 0) {
      removeAudioUnlockListeners?.();
      removeAudioUnlockListeners = null;
      return;
    }

    if (removeAudioUnlockListeners || typeof window === "undefined") {
      return;
    }

    const unlockPlayback = () => {
      for (const entry of [...pendingAudioUnlockEntries]) {
        entry?.audioElement?.play?.().then?.(() => {
          pendingAudioUnlockEntries.delete(entry);
          updateAudioUnlockListeners();
        }).catch(() => {});
      }
    };

    const listenerOptions = {
      capture: true,
      passive: true
    };
    const eventNames = ["pointerdown", "keydown", "touchstart"];

    eventNames.forEach((eventName) => {
      window.addEventListener(eventName, unlockPlayback, listenerOptions);
    });

    removeAudioUnlockListeners = () => {
      eventNames.forEach((eventName) => {
        window.removeEventListener(eventName, unlockPlayback, listenerOptions);
      });
    };
  }

  function emitPeerMedia(entry) {
    if (typeof onPeerMediaChange !== "function" || !entry) {
      return;
    }

    const videoMode =
      entry.videoMode ||
      (entry.screenShareEnabled ? "screen" : entry.cameraEnabled ? "camera" : "");

    onPeerMediaChange({
      cameraEnabled: Boolean(entry.cameraEnabled),
      cameraStream:
        videoMode === "camera" && hasLiveRemoteTrack(entry.remoteVideoStream, "video")
          ? entry.remoteVideoStream
          : null,
      deafened: Boolean(entry.deafened),
      hasAudio: hasLiveRemoteTrack(entry.remoteAudioStream, "audio"),
      micMuted: Boolean(entry.micMuted),
      peerId: entry.peerId,
      removed: false,
      screenShareEnabled: Boolean(entry.screenShareEnabled),
      screenShareStream:
        videoMode === "screen" && hasLiveRemoteTrack(entry.remoteVideoStream, "video")
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

    const playbackState = getPlaybackState();
    entry.audioElement.muted = playbackState.deafened;
    entry.audioElement.volume = playbackState.deafened ? 0 : playbackState.outputVolume;
    applySinkId(entry.audioElement, playbackState.outputDeviceId);
  }

  function safePlayAudio(entry) {
    const playResult = entry?.audioElement?.play?.();
    if (!playResult?.catch) {
      pendingAudioUnlockEntries.delete(entry);
      updateAudioUnlockListeners();
      return;
    }

    playResult
      .then(() => {
        pendingAudioUnlockEntries.delete(entry);
        updateAudioUnlockListeners();
      })
      .catch((error) => {
        pendingAudioUnlockEntries.add(entry);
        updateAudioUnlockListeners();
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

  function shouldIgnorePeer({ peerId }) {
    return !peerId || peerId === selfPeerId;
  }

  function sendSignal(targetPeerId, signal) {
    if (!targetPeerId || !signal) {
      return;
    }

    if (realtimeEnabled && getRealtimeChannel()) {
      log("signal:emit", {
        signalType: getVoiceSignalType(signal),
        targetPeerId,
        transport: "supabase"
      });
      getRealtimeChannel()
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
    if (!entry || entry.destroyed) {
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
      if (!entry.pendingNegotiation || entry.destroyed) {
        return;
      }

      entry.pendingNegotiation = false;
      queueMicrotask(() => {
        negotiatePeer(entry);
      });
    }
  }

  async function syncSenderTrack({
    entry,
    nextTrack,
    senderKey
  }) {
    if (!entry || entry.destroyed) {
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

    if (!nextTrack) {
      return false;
    }

    const streamForAddTrack =
      senderKey === "audioSender" ? getLocalAudioStream() : getCurrentLocalVideoStream();

    if (!streamForAddTrack) {
      return false;
    }

    entry[senderKey] = entry.peerConnection.addTrack(nextTrack, streamForAddTrack);
    return true;
  }

  async function syncLocalAudioToPeer(entry, { renegotiate = false } = {}) {
    const changed = await syncSenderTrack({
      entry,
      nextTrack: getCurrentLocalAudioTrack(),
      senderKey: "audioSender"
    });

    if (changed && renegotiate) {
      await negotiatePeer(entry);
    }

    return changed;
  }

  async function syncLocalVideoToPeer(entry, { renegotiate = false } = {}) {
    const nextTrack = getCurrentLocalVideoTrack();
    const changed = await syncSenderTrack({
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

    return changed;
  }

  function cleanupPeer(peerId) {
    const entry = peers.get(peerId);
    if (!entry) {
      return;
    }

    entry.destroyed = true;
    peers.delete(peerId);
    pendingAudioUnlockEntries.delete(entry);
    updateAudioUnlockListeners();
    clearPeerMedia(entry);

    entry.remoteTrackListeners?.forEach(({ cleanup }) => {
      cleanup?.();
    });
    entry.remoteTrackListeners?.clear?.();

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

  function attachRemoteTrackLifecycle(entry, track, kind) {
    if (!entry || !track) {
      return;
    }

    const listenerKey = `${kind}:${track.id}`;
    if (entry.remoteTrackListeners?.has(listenerKey)) {
      return;
    }

    const refreshRemoteMedia = () => {
      if (entry.destroyed) {
        return;
      }

      if (kind === "audio") {
        entry.audioElement.srcObject = entry.remoteAudioStream;
        applyPlaybackToPeer(entry);
        if (!track.muted && track.readyState !== "ended") {
          safePlayAudio(entry);
        }
      }

      emitPeerMedia(entry);
    };

    const handleEnded = () => {
      if (kind === "audio") {
        entry.remoteAudioStream.removeTrack(track);
      } else {
        entry.remoteVideoStream.removeTrack(track);
      }

      entry.remoteTrackListeners.get(listenerKey)?.cleanup?.();
      entry.remoteTrackListeners.delete(listenerKey);
      emitPeerMedia(entry);
    };

    track.addEventListener("mute", refreshRemoteMedia);
    track.addEventListener("unmute", refreshRemoteMedia);
    track.addEventListener("ended", handleEnded);

    entry.remoteTrackListeners.set(listenerKey, {
      cleanup() {
        track.removeEventListener("mute", refreshRemoteMedia);
        track.removeEventListener("unmute", refreshRemoteMedia);
        track.removeEventListener("ended", handleEnded);
      }
    });
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
      existing.videoMode = videoMode;
      if (!existing.videoMode && !existing.cameraEnabled && !existing.screenShareEnabled) {
        existing.remoteVideoStream.getTracks().forEach((track) => {
          existing.remoteVideoStream.removeTrack(track);
        });
      }
      emitPeerMedia(existing);
      return existing;
    }

    const audioElement = createHiddenAudioElement();
    const peerConnection = new RTCPeerConnection(buildRtcConfiguration());
    const audioTransceiver = peerConnection.addTransceiver("audio", {
      direction: "sendrecv"
    });
    const videoTransceiver = peerConnection.addTransceiver("video", {
      direction: "sendrecv"
    });

    const entry = {
      audioElement,
      audioSender: audioTransceiver.sender,
      cameraEnabled: Boolean(cameraEnabled),
      deafened: Boolean(deafened),
      destroyed: false,
      ignoreOffer: false,
      iceRestartAttempts: 0,
      isSettingRemoteAnswerPending: false,
      makingOffer: false,
      micMuted: Boolean(micMuted),
      peerConnection,
      peerId,
      pendingNegotiation: false,
      remoteAudioStream: createRemoteStream(),
      remoteTrackListeners: new Map(),
      remoteVideoStream: createRemoteStream(),
      screenShareEnabled: Boolean(screenShareEnabled),
      speaking: Boolean(speaking),
      userId,
      videoMode,
      videoSender: videoTransceiver.sender
    };

    audioElement.srcObject = entry.remoteAudioStream;
    peers.set(peerId, entry);
    applyPlaybackToPeer(entry);

    entry.peerConnection.onicecandidate = (event) => {
      if (entry.destroyed || !event.candidate) {
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
        attachRemoteTrackLifecycle(entry, event.track, "audio");
        entry.audioElement.srcObject = entry.remoteAudioStream;
        applyPlaybackToPeer(entry);
        safePlayAudio(entry);
        emitPeerMedia(entry);
        return;
      }

      if (event.track?.kind === "video") {
        entry.remoteVideoStream.getTracks().forEach((track) => {
          if (track.id !== event.track.id) {
            entry.remoteVideoStream.removeTrack(track);
          }
        });
        if (
          !entry.remoteVideoStream.getTracks().some((track) => track.id === event.track.id)
        ) {
          entry.remoteVideoStream.addTrack(event.track);
        }
        attachRemoteTrackLifecycle(entry, event.track, "video");
        emitPeerMedia(entry);
      }
    };

    entry.peerConnection.onconnectionstatechange = () => {
      const { connectionState } = entry.peerConnection;
      log("rtc:state", { connectionState, peerId, userId: entry.userId || null });
      if (connectionState === "failed" && entry.iceRestartAttempts < 1) {
        entry.iceRestartAttempts += 1;
        log("rtc:restart-ice", { peerId, userId: entry.userId || null }, "warn");
        entry.peerConnection.restartIce?.();
        queueMicrotask(() => {
          negotiatePeer(entry);
        });
        return;
      }

      if (connectionState === "failed" || connectionState === "closed") {
        cleanupPeer(peerId);
      }
    };

    entry.peerConnection.oniceconnectionstatechange = () => {
      const { iceConnectionState } = entry.peerConnection;
      log("ice:state", {
        iceConnectionState,
        peerId,
        userId: entry.userId || null
      });
    };

    entry.peerConnection.onicegatheringstatechange = () => {
      log("ice:gathering", {
        iceGatheringState: entry.peerConnection.iceGatheringState,
        peerId,
        userId: entry.userId || null
      });
    };

    entry.peerConnection.onnegotiationneeded = () => {
      if (entry.destroyed) {
        return;
      }

      log("rtc:negotiationneeded", { peerId, userId: entry.userId || null });
      negotiatePeer(entry).catch((error) => {
        handleSessionError(error);
      });
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
    if (snapshotChannelId !== channelId) {
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
    if (signalChannelId !== channelId || !fromPeerId || !signal) {
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
    if (peerChannelId !== channelId || !peerId) {
      return;
    }

    log("peer:left", { peerId });
    cleanupPeer(peerId);
  }

  return {
    applyPlaybackToPeer,
    cleanupPeer,
    handlePeerLeft,
    handlePeersSnapshot,
    handleSignal,
    negotiatePeer,
    syncLocalAudioToPeer,
    syncLocalVideoToPeer
  };
}
