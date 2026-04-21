import {
  applySinkId,
  buildParticipantAudioMix,
  buildRtcConfiguration,
  createHiddenAudioElement,
  createRemoteStream,
  getSharedVoiceAudioContext,
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
  handleSessionError,
  log,
  onPeerMediaChange,
  peers,
  realtimeEnabled,
  sendRealtimeSignal,
  selfPeerId,
  socket
}) {
  const pendingAudioUnlockEntries = new Set();
  let removeAudioUnlockListeners = null;
  let remoteAudioResumePending = false;

  function getRemoteAudioContext() {
    const context = getSharedVoiceAudioContext();
    if (!context) {
      return null;
    }

    if (context.state === "suspended") {
      remoteAudioResumePending = true;
      context.resume().then(() => {
        remoteAudioResumePending = false;
        log("audio:context:resumed", {
          state: context.state
        });
        updateAudioUnlockListeners();
      }).catch(() => {
        updateAudioUnlockListeners();
      });
      updateAudioUnlockListeners();
    }

    return context;
  }

  function hasLiveRemoteTrack(stream, kind) {
    const track = stream?.getTracks?.().find((candidate) => candidate.kind === kind) || null;
    return Boolean(track && track.readyState !== "ended" && !track.muted);
  }

  function updateAudioUnlockListeners() {
    if (pendingAudioUnlockEntries.size === 0 && !remoteAudioResumePending) {
      removeAudioUnlockListeners?.();
      removeAudioUnlockListeners = null;
      return;
    }

    if (removeAudioUnlockListeners || typeof window === "undefined") {
      return;
    }

    const unlockPlayback = () => {
      const remoteAudioContext = getSharedVoiceAudioContext();
      if (remoteAudioContext?.state === "suspended") {
        remoteAudioContext.resume().then(() => {
          remoteAudioResumePending = false;
          log("audio:context:resumed", {
            state: remoteAudioContext.state,
            via: "user-gesture"
          });
          updateAudioUnlockListeners();
        }).catch((error) => {
          log("audio:context:resume-blocked", {
            message: error?.message || "No se pudo reanudar el AudioContext.",
            state: remoteAudioContext.state
          }, "warn");
        });
      }

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

  function getPeerEntry(peerId) {
    return peers.get(peerId) || null;
  }

  function shouldIgnorePeer({ peerId }) {
    return !peerId || peerId === selfPeerId;
  }

  function shouldInitiatePeer(peerId) {
    return selfPeerId.localeCompare(String(peerId || "")) < 0;
  }

  function emitPeerMedia(entry) {
    if (typeof onPeerMediaChange !== "function" || !entry) {
      return;
    }

    const videoMode =
      entry.videoMode ||
      (entry.screenShareEnabled ? "screen" : entry.cameraEnabled ? "camera" : "");
    const hasAudio = hasLiveRemoteTrack(entry.remoteAudioStream, "audio");
    const audioLevel = Math.max(0, Math.min(100, Number(entry.audioLevel) || 0));
    const speaking = hasAudio ? Boolean(entry.detectedSpeaking) : Boolean(entry.speaking);

    onPeerMediaChange({
      audioLevel,
      cameraEnabled: Boolean(entry.cameraEnabled),
      cameraStream:
        videoMode === "camera" && hasLiveRemoteTrack(entry.remoteVideoStream, "video")
          ? entry.remoteVideoStream
          : null,
      deafened: Boolean(entry.deafened),
      hasAudio,
      micMuted: Boolean(entry.micMuted),
      peerId: entry.peerId,
      removed: false,
      screenShareEnabled: Boolean(entry.screenShareEnabled),
      screenShareStream:
        videoMode === "screen" && hasLiveRemoteTrack(entry.remoteVideoStream, "video")
          ? entry.remoteVideoStream
          : null,
      speaking,
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

  function getParticipantAudioMix(entry) {
    const playbackState = getPlaybackState();
    const participantPref = entry?.userId
      ? playbackState?.participantAudioPrefs?.[entry.userId]
      : null;

    return {
      mix: buildParticipantAudioMix(participantPref, playbackState),
      playbackState
    };
  }

  function getRemoteAudioStreamKey(stream) {
    return (stream?.getAudioTracks?.() || [])
      .filter((track) => track.readyState !== "ended")
      .map((track) => track.id)
      .sort()
      .join("|");
  }

  function cleanupProcessedRemoteAudio(entry) {
    if (!entry?.processedAudio) {
      return;
    }

    const {
      compressor,
      intensityGain,
      outputGain,
      source
    } = entry.processedAudio;

    try {
      source?.disconnect?.();
      compressor?.disconnect?.();
      intensityGain?.disconnect?.();
      outputGain?.disconnect?.();
    } catch {
      // Ignore audio node disconnect issues during teardown.
    }

    entry.processedAudio = null;
    entry.playbackMode = "direct";
  }

  function ensureDirectRemoteAudio(entry) {
    if (!entry?.audioElement) {
      return;
    }

    if (entry.playbackMode !== "direct") {
      cleanupProcessedRemoteAudio(entry);
    }

    if (entry.audioElement.srcObject !== entry.remoteAudioStream) {
      entry.audioElement.srcObject = entry.remoteAudioStream;
    }

    entry.playbackMode = "direct";
  }

  function ensureProcessedRemoteAudio(entry, mix) {
    if (!entry?.audioElement) {
      return false;
    }

    const context = getRemoteAudioContext();
    const streamKey = getRemoteAudioStreamKey(entry.remoteAudioStream);
    if (!context || !streamKey) {
      return false;
    }

    const needsNewGraph =
      entry.playbackMode !== "processed" ||
      entry.processedAudio?.streamKey !== streamKey ||
      entry.processedAudio?.useCompressor !== Boolean(mix.useCompressor);

    if (needsNewGraph) {
      cleanupProcessedRemoteAudio(entry);

      const source = context.createMediaStreamSource(entry.remoteAudioStream);
      let lastNode = source;
      let compressor = null;

      if (mix.useCompressor) {
        compressor = context.createDynamicsCompressor();
        compressor.attack.value = 0.004;
        compressor.knee.value = 22;
        compressor.ratio.value = 3.5;
        compressor.release.value = 0.2;
        compressor.threshold.value = -25;
        lastNode.connect(compressor);
        lastNode = compressor;
      }

      const intensityGain = context.createGain();
      const outputGain = context.createGain();
      const destination = context.createMediaStreamDestination();

      lastNode.connect(intensityGain);
      intensityGain.connect(outputGain);
      outputGain.connect(destination);

      entry.processedAudio = {
        compressor,
        destination,
        intensityGain,
        outputGain,
        source,
        streamKey,
        useCompressor: Boolean(mix.useCompressor)
      };
      entry.audioElement.srcObject = destination.stream;
      entry.playbackMode = "processed";
    }

    if (!entry.processedAudio) {
      return false;
    }

    entry.processedAudio.intensityGain.gain.setTargetAtTime(
      mix.processedIntensityGain,
      0,
      0.05
    );
    entry.processedAudio.outputGain.gain.setTargetAtTime(
      mix.processedOutputGain,
      0,
      0.05
    );

    return true;
  }

  function applyPlaybackToPeer(entry) {
    if (!entry?.audioElement) {
      return;
    }

    const { mix, playbackState } = getParticipantAudioMix(entry);
    const canProcess = mix.usesProcessing && hasLiveRemoteTrack(entry.remoteAudioStream, "audio");
    const usingProcessedAudio = canProcess && ensureProcessedRemoteAudio(entry, mix);

    if (!usingProcessedAudio) {
      ensureDirectRemoteAudio(entry);
      entry.audioElement.defaultMuted = Boolean(mix.muted);
      entry.audioElement.muted = Boolean(mix.muted);
      entry.audioElement.volume = mix.directVolume;
    } else {
      entry.audioElement.defaultMuted = false;
      entry.audioElement.muted = false;
      entry.audioElement.volume = 1;
    }

    applySinkId(entry.audioElement, playbackState.outputDeviceId);
    safePlayAudio(entry);
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

  function stopRemoteAudioAnalysis(entry) {
    if (!entry?.remoteAudioAnalysis) {
      return;
    }

    const {
      analyser,
      animationFrameId,
      cleanup,
      silentGain,
      source
    } = entry.remoteAudioAnalysis;

    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
    }

    try {
      source?.disconnect?.();
      analyser?.disconnect?.();
      silentGain?.disconnect?.();
    } catch {
      // Ignore audio node disconnect issues during teardown.
    }

    cleanup?.();
    entry.remoteAudioAnalysis = null;
    entry.audioLevel = 0;
    entry.detectedSpeaking = false;
  }

  function startRemoteAudioAnalysis(entry) {
    if (!entry) {
      return;
    }

    const liveAudioTracks = entry.remoteAudioStream
      ?.getAudioTracks?.()
      ?.filter((track) => track.readyState !== "ended");

    if (!liveAudioTracks?.length) {
      stopRemoteAudioAnalysis(entry);
      emitPeerMedia(entry);
      return;
    }

    const context = getRemoteAudioContext();
    if (!context) {
      log("audio:analysis:no-context", {
        peerId: entry.peerId,
        userId: entry.userId || null
      }, "warn");
      return;
    }

    const streamKey = liveAudioTracks
      .map((track) => track.id)
      .sort()
      .join("|");

    if (entry.remoteAudioAnalysis?.streamKey === streamKey) {
      return;
    }

    stopRemoteAudioAnalysis(entry);

    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    const source = context.createMediaStreamSource(entry.remoteAudioStream);
    source.connect(analyser);
    analyser.connect(silentGain);
    silentGain.connect(context.destination);

    const timeDomainData = new Float32Array(analyser.fftSize);
    let animationFrameId = 0;
    let displayLevel = 0;
    let noiseFloor = 0.0045;
    let speaking = false;
    let speechHoldUntil = 0;
    let frameCount = 0;
    let loggedSignal = false;

    const replayOnCanPlay = () => {
      applyPlaybackToPeer(entry);
      safePlayAudio(entry);
    };

    entry.audioElement.addEventListener("loadedmetadata", replayOnCanPlay);
    entry.audioElement.addEventListener("canplay", replayOnCanPlay);

    log("audio:analysis:start", {
      audioTrackIds: liveAudioTracks.map((track) => track.id),
      audioTrackMuted: liveAudioTracks.map((track) => track.muted),
      contextState: context.state,
      peerId: entry.peerId,
      streamKey
    });

    const tick = () => {
      if (entry.destroyed) {
        return;
      }

      analyser.getFloatTimeDomainData(timeDomainData);

      let sumSquares = 0;
      let peak = 0;
      for (const sample of timeDomainData) {
        const absolute = Math.abs(sample);
        sumSquares += sample * sample;
        if (absolute > peak) {
          peak = absolute;
        }
      }

      const rms = Math.sqrt(sumSquares / timeDomainData.length) || 0;
      const now = performance.now();
      frameCount += 1;

      if (!speaking) {
        const noiseBlend = rms < noiseFloor ? 0.12 : 0.01;
        noiseFloor = noiseFloor * (1 - noiseBlend) + rms * noiseBlend;
      } else {
        noiseFloor = noiseFloor * 0.992 + Math.min(rms, noiseFloor) * 0.008;
      }

      const floor = Math.max(noiseFloor, 0.0035);
      const speakThreshold = Math.max(floor * 2.3, 0.009);
      const releaseThreshold = Math.max(floor * 1.65, 0.0068);
      const speechDetected = rms > speakThreshold || peak > speakThreshold * 3.2;

      if (speechDetected) {
        speechHoldUntil = now + 180;
      }

      const nextSpeaking = speechDetected || now < speechHoldUntil;
      const normalizedRaw = Math.max(
        0,
        (rms - releaseThreshold) / Math.max(0.025, 0.09 - releaseThreshold)
      );
      const normalizedTarget = Math.min(100, normalizedRaw * 100);
      const smoothing = nextSpeaking ? 0.3 : 0.14;
      displayLevel = displayLevel * (1 - smoothing) + normalizedTarget * smoothing;

      if (!nextSpeaking && displayLevel < 2) {
        displayLevel = 0;
      }

      const roundedLevel = Math.round(displayLevel);
      const didSpeakingChange = nextSpeaking !== entry.detectedSpeaking;
      const didLevelChange = roundedLevel !== Math.round(entry.audioLevel || 0);

      speaking = nextSpeaking;
      entry.detectedSpeaking = nextSpeaking;
      entry.audioLevel = roundedLevel;

      if (didSpeakingChange || didLevelChange) {
        emitPeerMedia(entry);
      }

      if (!loggedSignal && (roundedLevel > 0 || nextSpeaking || frameCount === 30)) {
        loggedSignal = true;
        log("audio:analysis:sample", {
          contextState: context.state,
          frameCount,
          level: roundedLevel,
          peak: Number(peak.toFixed(4)),
          peerId: entry.peerId,
          rms: Number(rms.toFixed(4)),
          speaking: nextSpeaking
        });
      }

      animationFrameId = window.requestAnimationFrame(tick);
      if (entry.remoteAudioAnalysis) {
        entry.remoteAudioAnalysis.animationFrameId = animationFrameId;
      }
    };

    entry.remoteAudioAnalysis = {
      analyser,
      animationFrameId: 0,
      cleanup() {
        entry.audioElement.removeEventListener("loadedmetadata", replayOnCanPlay);
        entry.audioElement.removeEventListener("canplay", replayOnCanPlay);
      },
      silentGain,
      source,
      streamKey
    };

    tick();
  }

  function sendSignal(targetPeerId, signal) {
    if (!targetPeerId || !signal) {
      return;
    }

    if (realtimeEnabled) {
      log("signal:emit", {
        signalType: getVoiceSignalType(signal),
        targetPeerId,
        transport: "supabase"
      });
      sendRealtimeSignal?.({
        channelId,
        fromPeerId: selfPeerId,
        signal,
        targetPeerId,
        userId: currentUserId || null
      });
      return;
    }

    socket.emit("voice:signal", {
      signal,
      targetPeerId
    });
  }

  async function flushQueuedIceCandidates(entry) {
    if (!entry?.pendingRemoteCandidates?.length || !entry.peerConnection.remoteDescription) {
      return;
    }

    const queuedCandidates = [...entry.pendingRemoteCandidates];
    entry.pendingRemoteCandidates.length = 0;

    for (const candidate of queuedCandidates) {
      try {
        await entry.peerConnection.addIceCandidate(candidate);
        log("ice:queued:applied", {
          peerId: entry.peerId,
          userId: entry.userId || null
        });
      } catch (error) {
        handleSessionError(error);
      }
    }
  }

  async function syncSenderTrack({ entry, nextTrack, senderKey }) {
    if (!entry || entry.destroyed) {
      return false;
    }

    const sender = entry[senderKey] || null;
    const currentTrack = sender?.track || null;
    if (currentTrack === nextTrack) {
      return false;
    }

    try {
      await sender?.replaceTrack?.(nextTrack || null);
      return true;
    } catch (error) {
      handleSessionError(error);
      return false;
    }
  }

  async function syncLocalAudioToPeer(entry) {
    return syncSenderTrack({
      entry,
      nextTrack: getCurrentLocalAudioTrack(),
      senderKey: "audioSender"
    });
  }

  async function syncLocalVideoToPeer(entry) {
    const nextTrack = getCurrentLocalVideoTrack();
    const changed = await syncSenderTrack({
      entry,
      nextTrack,
      senderKey: "videoSender"
    });

    if (changed) {
      entry.videoMode = getCurrentLocalVideoMode();
    }

    return changed;
  }

  function attachRemoteTrackLifecycle(entry, track, kind) {
    if (!entry || !track) {
      return;
    }

    const listenerKey = `${kind}:${track.id}`;
    if (entry.remoteTrackListeners.has(listenerKey)) {
      return;
    }

    const refreshRemoteMedia = () => {
      if (entry.destroyed) {
        return;
      }

      if (kind === "audio") {
        applyPlaybackToPeer(entry);
        startRemoteAudioAnalysis(entry);
      }

      emitPeerMedia(entry);
    };

    const handleEnded = () => {
      const stream =
        kind === "audio" ? entry.remoteAudioStream : entry.remoteVideoStream;
      stream.removeTrack(track);
      if (kind === "audio") {
        applyPlaybackToPeer(entry);
        startRemoteAudioAnalysis(entry);
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

  async function startPeerOffer(entry, { force = false } = {}) {
    if (!entry || entry.destroyed || !shouldInitiatePeer(entry.peerId)) {
      return false;
    }

    if (entry.offerInFlight) {
      entry.offerQueued = true;
      return false;
    }

    if (entry.peerConnection.signalingState !== "stable") {
      entry.offerQueued = true;
      return false;
    }

    if (
      !force &&
      (entry.peerConnection.localDescription || entry.peerConnection.remoteDescription)
    ) {
      return false;
    }

    entry.offerInFlight = true;

    try {
      await syncLocalAudioToPeer(entry);
      await syncLocalVideoToPeer(entry);
      const offer = await entry.peerConnection.createOffer();
      await entry.peerConnection.setLocalDescription(offer);
      log("offer:emit", {
        peerId: entry.peerId,
        transport: realtimeEnabled ? "supabase" : "socket",
        userId: entry.userId || null
      });
      sendSignal(entry.peerId, {
        description: entry.peerConnection.localDescription
      });
      return true;
    } catch (error) {
      handleSessionError(error);
      return false;
    } finally {
      entry.offerInFlight = false;
      if (entry.offerQueued && !entry.destroyed) {
        entry.offerQueued = false;
        queueMicrotask(() => {
          startPeerOffer(entry, {
            force: true
          }).catch((error) => {
            handleSessionError(error);
          });
        });
      }
    }
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
    stopRemoteAudioAnalysis(entry);
    cleanupProcessedRemoteAudio(entry);

    entry.remoteTrackListeners.forEach(({ cleanup }) => {
      cleanup?.();
    });
    entry.remoteTrackListeners.clear();
    entry.pendingRemoteCandidates.length = 0;

    try {
      entry.peerConnection.onicecandidate = null;
      entry.peerConnection.ontrack = null;
      entry.peerConnection.onconnectionstatechange = null;
      entry.peerConnection.oniceconnectionstatechange = null;
      entry.peerConnection.onicegatheringstatechange = null;
      entry.peerConnection.close();
    } catch {
      // Ignore teardown edge cases.
    }

    try {
      entry.audioElement.pause();
      entry.audioElement.srcObject = null;
      entry.audioElement.remove();
    } catch {
      // Ignore DOM cleanup issues.
    }
  }

  async function createPeerEntry(peer) {
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
      audioLevel: 0,
      audioSender: audioTransceiver.sender,
      cameraEnabled: Boolean(peer.cameraEnabled),
      deafened: Boolean(peer.deafened),
      detectedSpeaking: false,
      destroyed: false,
      iceRestartAttempts: 0,
      micMuted: Boolean(peer.micMuted),
      offerInFlight: false,
      offerQueued: false,
      peerConnection,
      peerId: peer.peerId,
      pendingRemoteCandidates: [],
      playbackMode: "direct",
      processedAudio: null,
      remoteAudioAnalysis: null,
      remoteAudioStream: createRemoteStream(),
      remoteTrackListeners: new Map(),
      remoteVideoStream: createRemoteStream(),
      screenShareEnabled: Boolean(peer.screenShareEnabled),
      speaking: Boolean(peer.speaking),
      userId: peer.userId || "",
      videoMode: peer.videoMode || "",
      videoSender: videoTransceiver.sender
    };

    audioElement.srcObject = entry.remoteAudioStream;
    peers.set(entry.peerId, entry);
    applyPlaybackToPeer(entry);

    peerConnection.onicecandidate = (event) => {
      if (entry.destroyed || !event.candidate) {
        return;
      }

      log("ice:emit", {
        peerId: entry.peerId,
        targetPeerId: entry.peerId,
        transport: realtimeEnabled ? "supabase" : "socket",
        userId: entry.userId || null
      });
      sendSignal(entry.peerId, {
        candidate: event.candidate
      });
    };

    peerConnection.ontrack = (event) => {
      log("track", {
        hasStreams: Boolean(event.streams?.length),
        kind: event.track?.kind || "",
        muted: Boolean(event.track?.muted),
        peerId: entry.peerId,
        readyState: event.track?.readyState || "",
        userId: entry.userId || null
      });

      if (event.track?.kind === "audio") {
        if (
          !entry.remoteAudioStream.getTracks().some((track) => track.id === event.track.id)
        ) {
          entry.remoteAudioStream.addTrack(event.track);
        }
        attachRemoteTrackLifecycle(entry, event.track, "audio");
        applyPlaybackToPeer(entry);
        startRemoteAudioAnalysis(entry);
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

    peerConnection.onconnectionstatechange = () => {
      const { connectionState } = peerConnection;
      log("rtc:state", {
        connectionState,
        peerId: entry.peerId,
        userId: entry.userId || null
      });

      if (connectionState === "failed" && entry.iceRestartAttempts < 1) {
        entry.iceRestartAttempts += 1;
        log("rtc:restart-ice", {
          peerId: entry.peerId,
          userId: entry.userId || null
        });
        peerConnection.restartIce?.();
        queueMicrotask(() => {
          startPeerOffer(entry, {
            force: true
          }).catch((error) => {
            handleSessionError(error);
          });
        });
        return;
      }

      if (connectionState === "closed") {
        cleanupPeer(entry.peerId);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      log("ice:state", {
        iceConnectionState: peerConnection.iceConnectionState,
        peerId: entry.peerId,
        userId: entry.userId || null
      });
    };

    peerConnection.onicegatheringstatechange = () => {
      log("ice:gathering", {
        iceGatheringState: peerConnection.iceGatheringState,
        peerId: entry.peerId,
        userId: entry.userId || null
      });
    };

    await syncLocalAudioToPeer(entry);
    await syncLocalVideoToPeer(entry);
    emitPeerMedia(entry);
    return entry;
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
      existing.videoMode = videoMode || existing.videoMode || "";

      if (existing.micMuted) {
        existing.audioLevel = 0;
        existing.detectedSpeaking = false;
      }

      if (!existing.videoMode && !existing.cameraEnabled && !existing.screenShareEnabled) {
        existing.remoteVideoStream.getTracks().forEach((track) => {
          existing.remoteVideoStream.removeTrack(track);
        });
      }

      applyPlaybackToPeer(existing);
      emitPeerMedia(existing);
      return existing;
    }

    return createPeerEntry({
      cameraEnabled,
      deafened,
      micMuted,
      peerId,
      screenShareEnabled,
      speaking,
      userId,
      videoMode
    });
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
      await startPeerOffer(entry);
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

        if (description.type === "offer") {
          log("offer:received", {
            fromPeerId,
            userId: entry.userId || null
          });
          await entry.peerConnection.setRemoteDescription(description);
          await flushQueuedIceCandidates(entry);
          await syncLocalAudioToPeer(entry);
          await syncLocalVideoToPeer(entry);
          const answer = await entry.peerConnection.createAnswer();
          await entry.peerConnection.setLocalDescription(answer);
          log("answer:emit", {
            targetPeerId: fromPeerId,
            transport: realtimeEnabled ? "supabase" : "socket",
            userId: entry.userId || null
          });
          sendSignal(fromPeerId, {
            description: entry.peerConnection.localDescription
          });
        }

        if (description.type === "answer") {
          log("answer:received", {
            fromPeerId,
            userId: entry.userId || null
          });
          await entry.peerConnection.setRemoteDescription(description);
          await flushQueuedIceCandidates(entry);
        }
      }

      if (signal.candidate) {
        if (entry.peerConnection.remoteDescription?.type) {
          log("ice:received", {
            fromPeerId,
            userId: entry.userId || null
          });
          await entry.peerConnection.addIceCandidate(signal.candidate);
        } else {
          entry.pendingRemoteCandidates.push(signal.candidate);
          log("ice:queued", {
            fromPeerId,
            userId: entry.userId || null
          });
        }
      }
    } catch (error) {
      handleSessionError(error);
    }
  }

  function handlePeerLeft({ channelId: peerChannelId, peerId }) {
    if (peerChannelId !== channelId || !peerId) {
      return;
    }

    log("peer:left", {
      peerId
    });
    cleanupPeer(peerId);
  }

  return {
    applyPlaybackToPeer,
    cleanupPeer,
    handlePeerLeft,
    handlePeersSnapshot,
    handleSignal,
    startPeerOffer,
    syncLocalAudioToPeer,
    syncLocalVideoToPeer
  };
}
