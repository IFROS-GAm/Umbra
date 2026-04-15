import { Room, RoomEvent, Track } from "livekit-client";

import { api } from "../../../../api.js";
import {
  applySinkId,
  clampUnitVolume,
  createHiddenAudioElement,
  hasTrack,
  primeSharedVoiceAudioContext
} from "./voiceRtcSessionConfig.js";

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
    hasAudio: Boolean(audioTrack),
    micMuted: snapshot.micMuted,
    peerId: snapshot.peerId,
    removed: false,
    screenShareEnabled: snapshot.screenShareEnabled,
    screenShareStream: buildMediaStreamFromTrack(screenTrack),
    speaking: Boolean(participant?.isSpeaking || snapshot.speaking),
    userId: snapshot.userId,
    videoMode: snapshot.videoMode
  };
}

function createRemoteAudioEntry() {
  return {
    attachedTrackSid: "",
    element: createHiddenAudioElement(),
    track: null
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
    }
  };
  let destroyed = false;
  let connected = false;
  let connectPromise = null;
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
  let localAudioStream = null;
  let localCameraStream = null;
  let localScreenShareStream = null;
  let lastMetadataPayload = "";

  const log = (event, details = {}, level = "info") => {
    const logger = typeof console[level] === "function" ? console[level] : console.info;
    logger(`[voice/livekit] ${event}`, {
      channelId,
      peerId: selfPeerId,
      ...details
    });
  };

  const handleSessionError = (error) => {
    if (typeof onError === "function") {
      onError(error);
    }
  };

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

  function removeRemoteParticipant(peerId) {
    const remoteAudio = remoteAudioEntries.get(peerId);
    if (remoteAudio) {
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
      remoteAudioEntries.delete(peerId);
    }

    if (typeof onPeerMediaChange === "function") {
      onPeerMediaChange({
        peerId,
        removed: true
      });
    }
  }

  async function applyPlaybackToRemoteAudio() {
    for (const remoteAudio of remoteAudioEntries.values()) {
      remoteAudio.element.muted = Boolean(playbackState.deafened);
      remoteAudio.element.volume = clampUnitVolume(playbackState.outputVolume, 1);
      await applySinkId(remoteAudio.element, playbackState.outputDeviceId);
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
      speaking: Boolean(participantState.speaking),
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

  async function ensureRemoteAudioTrack(participant) {
    const publication = participant?.getTrackPublication?.(Track.Source.Microphone);
    const track = publication?.track || null;
    const peerId = String(participant?.identity || "").trim();

    if (!peerId) {
      return;
    }

    if (!track) {
      const existingEntry = remoteAudioEntries.get(peerId);
      if (existingEntry) {
        try {
          existingEntry.track?.detach?.(existingEntry.element);
        } catch {
          // Ignore detach races.
        }
        existingEntry.track = null;
        existingEntry.attachedTrackSid = "";
        existingEntry.element.srcObject = null;
      }
      return;
    }

    let remoteAudio = remoteAudioEntries.get(peerId);
    if (!remoteAudio) {
      remoteAudio = createRemoteAudioEntry();
      remoteAudioEntries.set(peerId, remoteAudio);
    }

    const trackSid = String(publication?.trackSid || track?.sid || "").trim();
    if (remoteAudio.attachedTrackSid !== trackSid) {
      try {
        remoteAudio.track?.detach?.(remoteAudio.element);
      } catch {
        // Ignore stale detach errors.
      }

      remoteAudio.track = track;
      remoteAudio.attachedTrackSid = trackSid;
      track.attach(remoteAudio.element);
      remoteAudio.element.autoplay = true;
      remoteAudio.element.defaultMuted = false;
      remoteAudio.element.muted = Boolean(playbackState.deafened);
      remoteAudio.element.playsInline = true;
      remoteAudio.element.volume = clampUnitVolume(playbackState.outputVolume, 1);
      await applySinkId(remoteAudio.element, playbackState.outputDeviceId);

      try {
        await primeSharedVoiceAudioContext();
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

      remoteAudio.element.play().catch((error) => {
        log(
          "audio:play-blocked",
          {
            message: error?.message || String(error),
            targetPeerId: peerId
          },
          "warn"
        );
      });

      log("audio:attached", {
        targetPeerId: peerId,
        trackSid
      });
    }
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

    const audioTrack = localAudioStream?.getAudioTracks?.()?.[0] || null;
    const cameraTrack = localCameraStream?.getVideoTracks?.()?.[0] || null;
    const screenTrack = localScreenShareStream?.getVideoTracks?.()?.[0] || null;

    await syncPublishedTrack("audio", audioTrack, Track.Source.Microphone, "umbra-microphone");
    await syncPublishedTrack("camera", cameraTrack, Track.Source.Camera, "umbra-camera");
    await syncPublishedTrack("screen", screenTrack, Track.Source.ScreenShare, "umbra-screen");

    if (localTracks.audio.publication?.track) {
      if (participantState.micMuted) {
        await localTracks.audio.publication.track.mute();
      } else {
        await localTracks.audio.publication.track.unmute();
      }
    }

    await syncParticipantMetadata();
  }

  room
    .on(RoomEvent.Connected, async () => {
      connected = true;
      log("room:connected", {
        participantCount: room.remoteParticipants.size
      });
      await syncParticipantMetadata();
      await syncLocalTracks();
      await syncAllParticipants();
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
      emitPresenceSnapshot();
    });

  connectPromise = (async () => {
    try {
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
      await room.connect(payload.url, payload.token);
    } catch (error) {
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
        await syncLocalTracks();
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
    async destroy() {
      destroyed = true;

      for (const remoteAudio of remoteAudioEntries.values()) {
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
      }
      remoteAudioEntries.clear();

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
