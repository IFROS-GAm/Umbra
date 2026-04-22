import { Room, RoomEvent, Track } from "livekit-client";

import { api } from "../../../../api.js";
import {
  applySinkId,
  buildParticipantAudioMix,
  clampUnitVolume,
  createHiddenAudioElement,
  getSharedVoiceAudioContext,
  hasTrack,
  normalizeVoiceParticipantAudioPrefsMap,
  primeSharedVoiceAudioContext
} from "./voiceRtcSessionConfig.js";
import {
  isRetryableVoiceSignalAbortError,
  normalizeVoiceErrorMessage,
  shouldSilenceVoiceSessionError
} from "./voiceRtcSessionErrors.js";

function safeParseMetadata(metadata) {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildMediaStreamFromTrack(track) {
  const mediaTrack = track?.mediaStreamTrack || null;
  if (!mediaTrack) {
    return null;
  }

  return new MediaStream([mediaTrack]);
}

function createParticipantSnapshot({ channelId, participant }) {
  const metadata = safeParseMetadata(participant?.metadata);
  const peerId = String(participant?.identity || "").trim();
  const userId = String(metadata.userId || peerId).trim();
  const cameraPublication = participant?.getTrackPublication?.(Track.Source.Camera);
  const screenPublication = participant?.getTrackPublication?.(Track.Source.ScreenShare);
  const microphonePublication = participant?.getTrackPublication?.(Track.Source.Microphone);
  const cameraEnabled =
    typeof metadata.cameraEnabled === "boolean"
      ? metadata.cameraEnabled
      : !(cameraPublication?.isMuted ?? true);
  const screenShareEnabled =
    typeof metadata.screenShareEnabled === "boolean"
      ? metadata.screenShareEnabled
      : Boolean(screenPublication);
  const micMuted =
    typeof metadata.micMuted === "boolean"
      ? metadata.micMuted
      : microphonePublication
        ? Boolean(microphonePublication.isMuted)
        : true;
  const deafened = Boolean(metadata.deafened);
  const speaking =
    typeof metadata.speaking === "boolean" ? metadata.speaking : Boolean(participant?.isSpeaking);
  const videoMode = String(
    metadata.videoMode || (screenShareEnabled ? "screen" : cameraEnabled ? "camera" : "")
  ).trim();

  return {
    cameraEnabled: Boolean(cameraEnabled),
    channelId,
    deafened,
    micMuted: Boolean(micMuted),
    peerId,
    screenShareEnabled: Boolean(screenShareEnabled),
    speaking,
    userId,
    videoMode
  };
}

function buildRemoteMediaPayload({ channelId, participant }) {
  const snapshot = createParticipantSnapshot({
    channelId,
    participant
  });
  const cameraTrack = participant?.getTrackPublication?.(Track.Source.Camera)?.track || null;
  const screenTrack =
    participant?.getTrackPublication?.(Track.Source.ScreenShare)?.track || null;
  const screenAudioTrack =
    participant?.getTrackPublication?.(Track.Source.ScreenShareAudio)?.track || null;
  const audioTrack =
    participant?.getTrackPublication?.(Track.Source.Microphone)?.track || null;

  return {
    audioLevel: Math.max(
      0,
      Math.min(100, Math.round((Number(participant?.audioLevel) || 0) * 100))
    ),
    cameraEnabled: snapshot.cameraEnabled,
    cameraStream: buildMediaStreamFromTrack(cameraTrack),
    channelId,
    deafened: snapshot.deafened,
    hasAudio: Boolean(audioTrack || screenAudioTrack),
    micMuted: snapshot.micMuted,
    microphoneAudioPlaying: Boolean(audioTrack),
    microphoneHasAudio: Boolean(audioTrack),
    peerId: snapshot.peerId,
    removed: false,
    screenShareAudioPlaying: Boolean(screenAudioTrack),
    screenShareHasAudio: Boolean(screenAudioTrack),
    screenShareEnabled: snapshot.screenShareEnabled,
    screenShareStream: buildMediaStreamFromTrack(screenTrack),
    speaking: Boolean(participant?.isSpeaking || snapshot.speaking),
    userId: snapshot.userId,
    videoMode: snapshot.videoMode
  };
}

function buildRemoteAudioEntryKey(peerId, source) {
  return `${String(peerId || "").trim()}:${String(source || Track.Source.Microphone).trim()}`;
}

function createRemoteAudioEntry(source = Track.Source.Microphone) {
  return {
    appliedOutputDeviceId: "",
    attachedTrackSid: "",
    cleanupPlaybackListeners: null,
    element: createHiddenAudioElement(),
    needsPlay: true,
    peerId: "",
    playbackMode: "direct",
    processedAudio: null,
    source,
    track: null,
    userId: ""
  };
}

export function createLiveKitVoiceSession({
  accessToken,
  channelId,
  currentUserId,
  deafened = false,
  localPeerId = "",
  micMuted = false,
  onError = null,
  onPeerMediaChange = null,
  onPresencePeersChange = null,
  outputDeviceId = "default",
  outputVolume = 1,
  speaking = false
}) {
  if (typeof window === "undefined") {
    throw new Error("LiveKit necesita un entorno de navegador.");
  }

  const selfPeerId = String(
    localPeerId ||
      globalThis.crypto?.randomUUID?.() ||
      `livekit-peer-${Date.now()}-${Math.random().toString(16).slice(2)}`
  ).trim();
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: false
  });
  const remoteAudioEntries = new Map();
  const pendingRemoteAudioEntries = new Set();
  const requestedRemoteSubscriptions = new Set();
  const localTracks = {
    audio: {
      mediaTrack: null,
      publication: null
    },
    camera: {
      mediaTrack: null,
      publication: null
    },
    screen: {
      mediaTrack: null,
      publication: null
    },
    screenAudio: {
      mediaTrack: null,
      publication: null
    }
  };
  let destroyed = false;
  let connected = false;
  let connectPromise = null;
  let playbackState = {
    deafened: Boolean(deafened),
    outputDeviceId,
    outputVolume: clampUnitVolume(outputVolume),
    participantAudioPrefs: normalizeVoiceParticipantAudioPrefsMap()
  };
  let participantState = {
    deafened: Boolean(deafened),
    micMuted: Boolean(micMuted),
    speaking: Boolean(speaking)
  };
  let localAudioStream = null;
  let localCameraStream = null;
  let localScreenShareStream = null;
  let lastMetadataPayload = "";
  let localTrackSyncPromise = Promise.resolve();
  let removeAudioUnlockListeners = null;
  const CONNECT_RETRY_DELAY_MS = 250;

  const log = (event, details = {}, level = "info") => {
    const logger = typeof console[level] === "function" ? console[level] : console.info;
    logger(`[voice/livekit] ${event}`, {
      channelId,
      peerId: selfPeerId,
      ...details
    });
  };

  const handleSessionError = (error) => {
    if (shouldSilenceVoiceSessionError(error, { destroyed })) {
      return;
    }

    if (typeof onError === "function") {
      onError(error);
    }
  };

  function updateAudioUnlockListeners() {
    if (
      destroyed ||
      (room.canPlaybackAudio && pendingRemoteAudioEntries.size === 0)
    ) {
      removeAudioUnlockListeners?.();
      removeAudioUnlockListeners = null;
      return;
    }

    if (removeAudioUnlockListeners || typeof window === "undefined") {
      return;
    }

    const unlockPlayback = () => {
      Promise.resolve(
        room.canPlaybackAudio ? undefined : room.startAudio?.()
      )
        .then(async () => {
          try {
            await primeSharedVoiceAudioContext();
          } catch {
            // Direct playback can still work even if the shared AudioContext stays suspended.
          }

          log("audio:playback:unlocked", {
            canPlaybackAudio: Boolean(room.canPlaybackAudio),
            pendingEntries: pendingRemoteAudioEntries.size
          });
          await applyPlaybackToRemoteAudio();
        })
        .catch((error) => {
          log(
            "audio:playback:unlock-blocked",
            {
              message: error?.message || String(error)
            },
            "warn"
          );
        })
        .finally(() => {
          updateAudioUnlockListeners();
        });
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

  function waitForReconnectWindow() {
    return new Promise((resolve) => {
      window.setTimeout(resolve, CONNECT_RETRY_DELAY_MS);
    });
  }

  async function connectToRoom() {
    log("token:request", {});
    const payload = await api.fetchLiveKitToken({
      peerId: selfPeerId,
      room: channelId
    });

    if (destroyed) {
      return;
    }

    log("room:connecting", {
      url: payload?.url || null
    });
    await room.connect(payload.url, payload.token, {
      autoSubscribe: true
    });
  }

  function getParticipantAudioMix(remoteAudio) {
    const participantPref = remoteAudio?.userId
      ? playbackState?.participantAudioPrefs?.[remoteAudio.userId]
      : null;

    return buildParticipantAudioMix(participantPref, playbackState);
  }

  function cleanupProcessedRemoteAudio(remoteAudio) {
    if (!remoteAudio?.processedAudio) {
      return;
    }

    const {
      compressor,
      intensityGain,
      outputGain,
      source
    } = remoteAudio.processedAudio;

    try {
      source?.disconnect?.();
      compressor?.disconnect?.();
      intensityGain?.disconnect?.();
      outputGain?.disconnect?.();
    } catch {
      // Ignore audio node disconnect issues during teardown.
    }

    remoteAudio.processedAudio = null;
    remoteAudio.playbackMode = "direct";
  }

  function safePlayRemoteAudio(remoteAudio, peerId) {
    if (
      !remoteAudio?.element ||
      (!remoteAudio.needsPlay &&
        !pendingRemoteAudioEntries.has(remoteAudio) &&
        remoteAudio.element.paused === false)
    ) {
      return;
    }

    const playResult = remoteAudio?.element?.play?.();
    if (!playResult?.catch) {
      pendingRemoteAudioEntries.delete(remoteAudio);
      remoteAudio.needsPlay = false;
      updateAudioUnlockListeners();
      return;
    }

    playResult
      .then(() => {
        pendingRemoteAudioEntries.delete(remoteAudio);
        remoteAudio.needsPlay = false;
        updateAudioUnlockListeners();
      })
      .catch((error) => {
        pendingRemoteAudioEntries.add(remoteAudio);
        log(
          "audio:play-blocked",
          {
            message: error?.message || String(error),
            source: remoteAudio?.source || Track.Source.Microphone,
            targetPeerId: peerId
          },
          "warn"
        );
        updateAudioUnlockListeners();
      });
  }

  async function ensureDirectRemoteAudio(remoteAudio) {
    if (!remoteAudio?.element || !remoteAudio?.track) {
      return;
    }

    if (remoteAudio.playbackMode !== "direct") {
      cleanupProcessedRemoteAudio(remoteAudio);
      remoteAudio.element.srcObject = null;
      remoteAudio.track.attach(remoteAudio.element);
      remoteAudio.needsPlay = true;
    }
    remoteAudio.playbackMode = "direct";
  }

  async function ensureProcessedRemoteAudio(remoteAudio, mix, peerId) {
    const mediaTrack = remoteAudio?.track?.mediaStreamTrack || null;
    if (!remoteAudio?.element || !mediaTrack) {
      return false;
    }

    let context = getSharedVoiceAudioContext();
    if (!context) {
      return false;
    }

    if (context.state === "suspended") {
      try {
        context = await primeSharedVoiceAudioContext();
      } catch (error) {
        log(
          "audio:context:prime-failed",
          {
            message: error?.message || String(error),
            targetPeerId: peerId
          },
          "warn"
        );
      }
    }

    if (!context) {
      return false;
    }

    const trackId = String(mediaTrack.id || "").trim();
    const needsNewGraph =
      remoteAudio.playbackMode !== "processed" ||
      remoteAudio.processedAudio?.trackId !== trackId ||
      remoteAudio.processedAudio?.useCompressor !== Boolean(mix.useCompressor);

    if (needsNewGraph) {
      try {
        remoteAudio.track?.detach?.(remoteAudio.element);
      } catch {
        // Ignore detach races when switching playback mode.
      }

      cleanupProcessedRemoteAudio(remoteAudio);

      const sourceStream = new MediaStream([mediaTrack]);
      const source = context.createMediaStreamSource(sourceStream);
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

      remoteAudio.processedAudio = {
        compressor,
        destination,
        intensityGain,
        outputGain,
        source,
        trackId,
        useCompressor: Boolean(mix.useCompressor)
      };
      remoteAudio.element.srcObject = destination.stream;
      remoteAudio.playbackMode = "processed";
      remoteAudio.needsPlay = true;
    }

    if (!remoteAudio.processedAudio) {
      return false;
    }

    remoteAudio.processedAudio.intensityGain.gain.setTargetAtTime(
      mix.processedIntensityGain,
      0,
      0.05
    );
    remoteAudio.processedAudio.outputGain.gain.setTargetAtTime(
      mix.processedOutputGain,
      0,
      0.05
    );

    return true;
  }

  function emitPresenceSnapshot() {
    if (typeof onPresencePeersChange !== "function") {
      return;
    }

    const peers = Array.from(room.remoteParticipants.values()).map((participant) =>
      createParticipantSnapshot({
        channelId,
        participant
      })
    );

    onPresencePeersChange(Object.fromEntries(peers.map((entry) => [entry.peerId, entry])));
  }

  function installRemoteAudioPlaybackListeners(entryKey, remoteAudio) {
    if (!remoteAudio?.element || remoteAudio.cleanupPlaybackListeners) {
      return;
    }

    const replayWhenReady = () => {
      if (destroyed || !remoteAudioEntries.has(entryKey) || !remoteAudio.element.srcObject) {
        return;
      }

      applyPlaybackToRemoteAudio().catch((error) => {
        handleSessionError(error);
      });
    };

    remoteAudio.element.addEventListener("loadedmetadata", replayWhenReady);
    remoteAudio.element.addEventListener("canplay", replayWhenReady);
    remoteAudio.cleanupPlaybackListeners = () => {
      remoteAudio.element.removeEventListener("loadedmetadata", replayWhenReady);
      remoteAudio.element.removeEventListener("canplay", replayWhenReady);
    };
  }

  function disposeRemoteAudioEntry(entryKey) {
    const remoteAudio = remoteAudioEntries.get(entryKey);
    if (!remoteAudio) {
      return;
    }

    pendingRemoteAudioEntries.delete(remoteAudio);
    cleanupProcessedRemoteAudio(remoteAudio);
    remoteAudio.cleanupPlaybackListeners?.();
    remoteAudio.cleanupPlaybackListeners = null;
    try {
      remoteAudio.track?.detach?.(remoteAudio.element);
    } catch {
      // Ignore detach races.
    }
    try {
      remoteAudio.element.srcObject = null;
      remoteAudio.element.remove();
    } catch {
      // Ignore DOM cleanup races.
    }

    remoteAudio.appliedOutputDeviceId = "";
    remoteAudioEntries.delete(entryKey);
  }

  function removeRemoteParticipant(peerId) {
    const peerKeyPrefix = `${String(peerId || "").trim()}:`;
    [...remoteAudioEntries.keys()].forEach((entryKey) => {
      if (entryKey.startsWith(peerKeyPrefix)) {
        disposeRemoteAudioEntry(entryKey);
      }
    });
    [...requestedRemoteSubscriptions].forEach((entryKey) => {
      if (entryKey.startsWith(peerKeyPrefix)) {
        requestedRemoteSubscriptions.delete(entryKey);
      }
    });

    if (typeof onPeerMediaChange === "function") {
      onPeerMediaChange({
        peerId,
        removed: true
      });
    }
  }

  async function applyPlaybackToRemoteAudio() {
    for (const [peerId, remoteAudio] of remoteAudioEntries.entries()) {
      const mix = getParticipantAudioMix(remoteAudio);
      const usingProcessedAudio =
        mix.usesProcessing &&
        (await ensureProcessedRemoteAudio(remoteAudio, mix, peerId));

      if (!usingProcessedAudio) {
        await ensureDirectRemoteAudio(remoteAudio);
        remoteAudio.element.defaultMuted = Boolean(mix.muted);
        remoteAudio.element.muted = Boolean(mix.muted);
        remoteAudio.element.volume = mix.directVolume;
      } else {
        remoteAudio.element.defaultMuted = false;
        remoteAudio.element.muted = false;
        remoteAudio.element.volume = 1;
      }

      if (remoteAudio.appliedOutputDeviceId !== playbackState.outputDeviceId) {
        await applySinkId(remoteAudio.element, playbackState.outputDeviceId);
        remoteAudio.appliedOutputDeviceId = playbackState.outputDeviceId;
      }
      if (remoteAudio.element.srcObject) {
        safePlayRemoteAudio(remoteAudio, peerId);
      }
    }
  }

  async function syncParticipantMetadata() {
    if (!connected || destroyed) {
      return;
    }

    const payload = JSON.stringify({
      cameraEnabled: hasTrack(localCameraStream, "video"),
      channelId,
      deafened: Boolean(participantState.deafened),
      micMuted: Boolean(participantState.micMuted),
      userId: currentUserId || null,
      videoMode: hasTrack(localScreenShareStream, "video")
        ? "screen"
        : hasTrack(localCameraStream, "video")
          ? "camera"
          : ""
    });

    if (payload === lastMetadataPayload) {
      return;
    }

    const previousPayload = lastMetadataPayload;
    lastMetadataPayload = payload;

    try {
      await room.localParticipant.setMetadata(payload);
      log("metadata:update", safeParseMetadata(payload));
    } catch (error) {
      lastMetadataPayload = previousPayload;
      log(
        "metadata:update:error",
        {
          message: error?.message || String(error)
        },
        "warn"
      );
    }
  }

  function requestRemoteAudioSubscription(participant, source) {
    const publication = participant?.getTrackPublication?.(source);
    if (!publication) {
      return null;
    }

    const requestKey = buildRemoteAudioEntryKey(participant?.identity, source);
    if (publication.isSubscribed && publication.track) {
      requestedRemoteSubscriptions.delete(requestKey);
      return publication;
    }

    if (requestedRemoteSubscriptions.has(requestKey)) {
      return publication;
    }

    try {
      publication.setSubscribed?.(true);
      requestedRemoteSubscriptions.add(requestKey);
      log("track:subscribe:requested", {
        source,
        subscriptionStatus: publication.subscriptionStatus || null,
        targetPeerId: participant?.identity || ""
      });
    } catch (error) {
      log(
        "track:subscribe:request-failed",
        {
          message: error?.message || String(error),
          source,
          targetPeerId: participant?.identity || ""
        },
        "warn"
      );
    }

    return publication;
  }

  function syncRemoteAudioPublication({
    participant,
    peerId,
    source,
    userId
  }) {
    const publication = requestRemoteAudioSubscription(participant, source);
    const track = publication?.track || null;
    const entryKey = buildRemoteAudioEntryKey(peerId, source);

    if (!track) {
      disposeRemoteAudioEntry(entryKey);
      return;
    }

    let remoteAudio = remoteAudioEntries.get(entryKey);
    if (!remoteAudio) {
      remoteAudio = createRemoteAudioEntry(source);
      remoteAudioEntries.set(entryKey, remoteAudio);
      installRemoteAudioPlaybackListeners(entryKey, remoteAudio);
    }

    remoteAudio.peerId = peerId;
    remoteAudio.source = source;
    remoteAudio.userId = userId;

    const trackSid = String(publication?.trackSid || track?.sid || "").trim();
    if (remoteAudio.attachedTrackSid !== trackSid || remoteAudio.track !== track) {
      try {
        remoteAudio.track?.detach?.(remoteAudio.element);
      } catch {
        // Ignore stale detach errors.
      }

      remoteAudio.track = track;
      remoteAudio.attachedTrackSid = trackSid;
      cleanupProcessedRemoteAudio(remoteAudio);
      remoteAudio.playbackMode = "direct";
      track.attach(remoteAudio.element);
      remoteAudio.element.autoplay = true;
      remoteAudio.element.defaultMuted = false;
      remoteAudio.element.muted = false;
      remoteAudio.element.playsInline = true;
      remoteAudio.element.volume = clampUnitVolume(playbackState.outputVolume, 1);
      remoteAudio.needsPlay = true;
      requestedRemoteSubscriptions.delete(entryKey);

      log("audio:attached", {
        source,
        targetPeerId: peerId,
        trackSid
      });
    }
  }

  async function ensureRemoteAudioTrack(participant) {
    const snapshot = createParticipantSnapshot({
      channelId,
      participant
    });
    const peerId = snapshot.peerId;

    if (!peerId) {
      return;
    }

    syncRemoteAudioPublication({
      participant,
      peerId,
      source: Track.Source.Microphone,
      userId: snapshot.userId
    });
    syncRemoteAudioPublication({
      participant,
      peerId,
      source: Track.Source.ScreenShareAudio,
      userId: snapshot.userId
    });

    await applyPlaybackToRemoteAudio();
  }

  function getPreferredLocalAudioTrack() {
    return localAudioStream?.getAudioTracks?.()?.[0] || null;
  }

  async function syncParticipant(participant) {
    if (!participant || destroyed) {
      return;
    }

    const peerId = String(participant.identity || "").trim();
    if (!peerId || peerId === selfPeerId) {
      return;
    }

    await ensureRemoteAudioTrack(participant);

    if (typeof onPeerMediaChange === "function") {
      onPeerMediaChange(
        buildRemoteMediaPayload({
          channelId,
          participant
        })
      );
    }
  }

  async function syncAllParticipants() {
    emitPresenceSnapshot();

    const participants = Array.from(room.remoteParticipants.values());
    await Promise.all(participants.map((participant) => syncParticipant(participant)));
  }

  async function unpublishTrack(slotKey) {
    const slot = localTracks[slotKey];
    if (!slot?.publication?.track) {
      slot.mediaTrack = null;
      slot.publication = null;
      return;
    }

    try {
      await room.localParticipant.unpublishTrack(slot.publication.track, false);
    } catch (error) {
      log(
        "track:unpublish:error",
        {
          message: error?.message || String(error),
          slot: slotKey
        },
        "warn"
      );
    }

    slot.mediaTrack = null;
    slot.publication = null;
  }

  async function syncPublishedTrack(slotKey, mediaTrack, source, name) {
    const slot = localTracks[slotKey];
    if (!connected || destroyed) {
      slot.mediaTrack = mediaTrack || null;
      return;
    }

    if (!mediaTrack) {
      await unpublishTrack(slotKey);
      return;
    }

    if (slot.mediaTrack === mediaTrack && slot.publication?.track) {
      return;
    }

    if (slot.publication?.track) {
      await room.localParticipant.unpublishTrack(slot.publication.track, false);
      slot.publication = null;
    }

    slot.mediaTrack = mediaTrack;
    slot.publication = await room.localParticipant.publishTrack(mediaTrack, {
      name,
      source
    });
    log("track:published", {
      slot: slotKey,
      source
    });
  }

  async function syncLocalTracks() {
    if (!connected || destroyed) {
      return;
    }

    const audioTrack = getPreferredLocalAudioTrack();
    const cameraTrack = localCameraStream?.getVideoTracks?.()?.[0] || null;
    const screenAudioTrack = localScreenShareStream?.getAudioTracks?.()?.[0] || null;
    const screenTrack = localScreenShareStream?.getVideoTracks?.()?.[0] || null;

    await syncPublishedTrack("audio", audioTrack, Track.Source.Microphone, "umbra-microphone");
    await syncPublishedTrack("camera", cameraTrack, Track.Source.Camera, "umbra-camera");
    await syncPublishedTrack("screen", screenTrack, Track.Source.ScreenShare, "umbra-screen");
    await syncPublishedTrack(
      "screenAudio",
      screenAudioTrack,
      Track.Source.ScreenShareAudio,
      "umbra-screen-audio"
    );

    if (localTracks.audio.publication?.track) {
      if (participantState.micMuted) {
        await localTracks.audio.publication.track.mute();
      } else {
        await localTracks.audio.publication.track.unmute();
      }
    }

    await syncParticipantMetadata();
  }

  function queueLocalTrackSync() {
    localTrackSyncPromise = localTrackSyncPromise
      .catch(() => {})
      .then(() => syncLocalTracks());

    return localTrackSyncPromise;
  }

  room
    .on(RoomEvent.Connected, async () => {
      connected = true;
      log("room:connected", {
        participantCount: room.remoteParticipants.size
      });
      updateAudioUnlockListeners();
      await syncParticipantMetadata();
      await queueLocalTrackSync();
      await syncAllParticipants();
    })
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      log("audio:playback:status", {
        canPlaybackAudio: Boolean(room.canPlaybackAudio)
      });
      updateAudioUnlockListeners();
      applyPlaybackToRemoteAudio().catch((error) => {
        handleSessionError(error);
      });
    })
    .on(RoomEvent.ParticipantConnected, async (participant) => {
      log("participant:connected", {
        targetPeerId: participant.identity
      });
      await syncAllParticipants();
    })
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      log("participant:disconnected", {
        targetPeerId: participant.identity
      });
      removeRemoteParticipant(String(participant.identity || "").trim());
      emitPresenceSnapshot();
    })
    .on(RoomEvent.TrackSubscribed, async (_track, publication, participant) => {
      log("track:subscribed", {
        source: publication?.source || "",
        targetPeerId: participant.identity
      });
      await syncParticipant(participant);
    })
    .on(RoomEvent.TrackPublished, (publication, participant) => {
      log("track:published:remote", {
        source: publication?.source || "",
        targetPeerId: participant.identity,
        trackSid: publication?.trackSid || ""
      });
      if (
        publication?.source === Track.Source.Microphone ||
        publication?.source === Track.Source.ScreenShareAudio
      ) {
        requestRemoteAudioSubscription(participant, publication.source);
      }
      syncParticipant(participant).catch((error) => {
        handleSessionError(error);
      });
    })
    .on(RoomEvent.TrackSubscriptionStatusChanged, (publication, status, participant) => {
      log("track:subscription:status", {
        source: publication?.source || "",
        status: status || "",
        targetPeerId: participant?.identity || ""
      });
    })
    .on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, error) => {
      log(
        "track:subscription:failed",
        {
          message: error?.message || String(error || ""),
          targetPeerId: participant?.identity || "",
          trackSid: trackSid || ""
        },
        "warn"
      );
    })
    .on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      log("track:unsubscribed", {
        source: publication?.source || "",
        targetPeerId: participant.identity
      });
      syncParticipant(participant).catch((error) => {
        handleSessionError(error);
      });
    })
    .on(RoomEvent.TrackMuted, (_publication, participant) => {
      syncParticipant(participant).catch((error) => {
        handleSessionError(error);
      });
    })
    .on(RoomEvent.TrackUnmuted, (_publication, participant) => {
      syncParticipant(participant).catch((error) => {
        handleSessionError(error);
      });
    })
    .on(RoomEvent.ActiveSpeakersChanged, () => {
      syncAllParticipants().catch((error) => {
        handleSessionError(error);
      });
    })
    .on(RoomEvent.ParticipantMetadataChanged, (_prevMetadata, participant) => {
      syncParticipant(participant).catch((error) => {
        handleSessionError(error);
      });
    })
    .on(RoomEvent.Disconnected, (reason) => {
      log("room:disconnected", {
        reason: reason || null
      });
      connected = false;
      updateAudioUnlockListeners();
      emitPresenceSnapshot();
    });

  connectPromise = (async () => {
    try {
      await connectToRoom();
    } catch (error) {
      if (!destroyed && isRetryableVoiceSignalAbortError(error)) {
        log(
          "room:connect:retry",
          {
            message: normalizeVoiceErrorMessage(error)
          },
          "warn"
        );
        try {
          room.disconnect();
        } catch {
          // Ignore disconnect races while resetting the initial handshake.
        }

        await waitForReconnectWindow();

        if (destroyed) {
          return;
        }

        try {
          await connectToRoom();
          return;
        } catch (retryError) {
          handleSessionError(retryError);
          throw retryError;
        }
      }

      handleSessionError(error);
      throw error;
    }
  })();

  return {
    async updateLocalMediaStreams({
      audioStream = null,
      cameraStream = null,
      screenShareStream = null
    } = {}) {
      localAudioStream = audioStream;
      localCameraStream = cameraStream;
      localScreenShareStream = screenShareStream;

      try {
        await connectPromise;
        await queueLocalTrackSync();
      } catch (error) {
        handleSessionError(error);
      }
    },
    async setLocalTrackEnabled(nextEnabled) {
      participantState = {
        ...participantState,
        micMuted: !nextEnabled
      };

      try {
        await connectPromise;
        if (localTracks.audio.publication?.track) {
          if (nextEnabled) {
            await localTracks.audio.publication.track.unmute();
          } else {
            await localTracks.audio.publication.track.mute();
          }
        }
        localAudioStream?.getAudioTracks?.().forEach((track) => {
          track.enabled = Boolean(nextEnabled);
        });
        await syncParticipantMetadata();
      } catch (error) {
        handleSessionError(error);
      }
    },
    async updateParticipantState(nextState = {}) {
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

      try {
        await connectPromise;
        if (localTracks.audio.publication?.track) {
          if (participantState.micMuted) {
            await localTracks.audio.publication.track.mute();
          } else {
            await localTracks.audio.publication.track.unmute();
          }
        }
        await syncParticipantMetadata();
      } catch (error) {
        handleSessionError(error);
      }
    },
    async updatePlayback(nextPlayback = {}) {
      playbackState = {
        ...playbackState,
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

      await applyPlaybackToRemoteAudio();
    },
    async updateParticipantAudioPrefs(nextPrefsByUserId = {}) {
      playbackState = {
        ...playbackState,
        participantAudioPrefs: normalizeVoiceParticipantAudioPrefsMap(nextPrefsByUserId)
      };

      await applyPlaybackToRemoteAudio();
    },
    async destroy() {
      destroyed = true;
      removeAudioUnlockListeners?.();
      removeAudioUnlockListeners = null;

      [...remoteAudioEntries.keys()].forEach((entryKey) => {
        disposeRemoteAudioEntry(entryKey);
      });

      for (const slotKey of Object.keys(localTracks)) {
        await unpublishTrack(slotKey);
      }

      if (typeof onPresencePeersChange === "function") {
        onPresencePeersChange({});
      }

      try {
        room.disconnect();
      } catch {
        // Ignore disconnect races.
      }
    }
  };
}
