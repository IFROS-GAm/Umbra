import { useEffect, useRef } from "react";

import { getSocket } from "../../../socket.js";
import { supabase } from "../../../supabase-browser.js";
import { findChannelInSession } from "../../../utils.js";
import { createVoiceCameraSession } from "../voiceCameraSession.js";
import { createVoiceInputProcessingSession } from "../voiceInputProcessing.js";
import {
  buildVoicePresenceUsersFromState,
  buildVoiceSessionsFromPresenceState
} from "../voiceRealtimeHelpers.js";
import { createRealtimePresenceSync } from "../voice/presence/createRealtimePresenceSync.js";
import { createLiveKitVoiceSession } from "../voice/rtc/createLiveKitVoiceSession.js";
import { getVoiceErrorNoticeMessage } from "../voice/rtc/voiceRtcSessionErrors.js";
import { shouldUseLiveKitVoice } from "../voice/rtc/voiceRtcSessionConfig.js";
import { createVoiceRtcSession } from "../voiceRtcSession.js";

export function useWorkspaceVoiceEffects({
  accessToken,
  applyVoiceSessions,
  cameraSessionRef,
  cameraStream,
  joinedVoiceChannelId,
  joinedVoiceChannelIdRef,
  screenShareStream,
  selectedVoiceDevices,
  setCameraStatus,
  setCameraStream,
  setSelectedVoiceDevices,
  setUiNotice,
  setVoiceDevices,
  setVoiceInputLevel,
  setVoiceInputSpeaking,
  setVoiceInputStatus,
  setVoiceInputStream,
  setVoiceJoinReadyChannelId,
  setVoicePeerMedia,
  setVoicePresencePeers,
  setVoicePresenceUsers,
  setVoiceState,
  voiceInputSessionRef,
  voiceInputSpeaking,
  voiceInputStream,
  voiceJoinReadyChannelId,
  voiceJoinReadyChannelIdRef,
  voiceLocalPeerIdRef,
  voiceRtcSessionRef,
  voiceMenu,
  voicePresencePeers,
  voiceState,
  workspace,
  workspaceRef
}) {
  const voicePresenceChannelRef = useRef(null);
  const voicePresenceRevisionRef = useRef(0);
  const voicePresenceSyncRef = useRef(null);
  const voicePresenceHeartbeatRef = useRef(null);
  const voicePresenceResyncRef = useRef(null);

  function buildCurrentVoicePresencePayload() {
    const currentUserId = String(workspaceRef.current?.current_user?.id || "").trim();
    const currentChannelId = String(joinedVoiceChannelIdRef.current || "").trim();
    const hasActiveChannel = Boolean(currentChannelId);
    const hasCameraTrack = hasActiveChannel && Boolean(cameraStream?.getVideoTracks?.().length);
    const hasScreenTrack =
      hasActiveChannel && Boolean(screenShareStream?.getVideoTracks?.().length);
    const isMicMuted = hasActiveChannel ? Boolean(voiceState.micMuted) : false;
    const isDeafened = hasActiveChannel ? Boolean(voiceState.deafen) : false;
    const isSpeaking =
      hasActiveChannel && !isMicMuted && !isDeafened && Boolean(voiceInputSpeaking);

    if (!currentUserId) {
      return null;
    }

    if (!hasActiveChannel) {
      return null;
    }

    const lookup = hasActiveChannel
      ? findChannelInSession(workspaceRef.current, currentChannelId)
      : null;

    return {
      channelId: currentChannelId,
      cameraEnabled: hasCameraTrack,
      deafened: isDeafened,
      guildId: lookup?.guild?.id || null,
      kind: lookup?.kind || lookup?.channel?.type || "",
      micMuted: isMicMuted,
      peerId: voiceLocalPeerIdRef.current,
      screenShareEnabled: hasScreenTrack,
      speaking: isSpeaking,
      updatedAt: new Date().toISOString(),
      userId: currentUserId,
      videoMode: hasScreenTrack ? "screen" : hasCameraTrack ? "camera" : ""
    };
  }

  function buildNextVoicePresencePayload() {
    const payload = buildCurrentVoicePresencePayload();
    if (!payload) {
      return null;
    }

    voicePresenceRevisionRef.current += 1;

    return {
      ...payload,
      revision: voicePresenceRevisionRef.current
    };
  }

  useEffect(() => {
    if (!supabase || !accessToken) {
      return;
    }

    supabase.realtime.setAuth?.(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!supabase || workspace?.mode !== "supabase" || !workspace?.current_user?.id) {
      return undefined;
    }

    let cancelled = false;
    const channel = supabase.channel("umbra-voice-presence", {
      config: {
        presence: {
          key: voiceLocalPeerIdRef.current
        }
      }
    });
    const presenceSync = createRealtimePresenceSync({
      getChannel: () => (voicePresenceChannelRef.current === channel ? channel : null),
      onError: (error) => {
        console.warn("[voice/client] realtime:presence:error", {
          error: error?.message || String(error),
          peerId: voiceLocalPeerIdRef.current
        });
      }
    });
    voicePresenceChannelRef.current = channel;
    voicePresenceSyncRef.current = presenceSync;

    const syncPresenceState = () => {
      if (cancelled) {
        return;
      }

      const useLiveKitVoice = shouldUseLiveKitVoice(workspaceRef.current?.mode);
      const presenceState = channel.presenceState();
      let nextSessions = buildVoiceSessionsFromPresenceState(presenceState);
      let nextPresenceUsers = buildVoicePresenceUsersFromState(presenceState);
      const currentJoinedChannelId = String(joinedVoiceChannelIdRef.current || "").trim();
      const currentUserId = String(workspaceRef.current?.current_user?.id || "").trim();
      const localPeerId = String(voiceLocalPeerIdRef.current || "").trim();

      if (!currentJoinedChannelId) {
        nextSessions = Object.fromEntries(
          Object.entries(nextSessions).flatMap(([channelId, userIds]) => {
            const filteredUserIds = (Array.isArray(userIds) ? userIds : []).filter(
              (userId) => userId !== currentUserId
            );
            return filteredUserIds.length ? [[channelId, filteredUserIds]] : [];
          })
        );

        nextPresenceUsers = Object.fromEntries(
          Object.entries(nextPresenceUsers).filter(([userId]) => userId !== currentUserId)
        );
      }
      if (!useLiveKitVoice) {
        applyVoiceSessions(nextSessions);
      }
      setVoicePresenceUsers(nextPresenceUsers);

      const localEntry = currentUserId ? nextPresenceUsers?.[currentUserId] : null;
      if (currentJoinedChannelId && localEntry?.channelId === currentJoinedChannelId) {
        setVoiceJoinReadyChannelId((previous) =>
          previous === currentJoinedChannelId ? previous : currentJoinedChannelId
        );
      }
    };

    const syncTrackedPresence = async () => {
      const payload = buildNextVoicePresencePayload();
      await presenceSync.schedule(payload);
    };

    channel.on("presence", { event: "sync" }, syncPresenceState);
    channel.on("presence", { event: "join" }, syncPresenceState);
    channel.on("presence", { event: "leave" }, syncPresenceState);
    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED" || cancelled) {
        return;
      }

      await syncTrackedPresence();
      syncPresenceState();

      if (voicePresenceHeartbeatRef.current) {
        window.clearInterval(voicePresenceHeartbeatRef.current);
      }
      if (voicePresenceResyncRef.current) {
        window.clearInterval(voicePresenceResyncRef.current);
      }
      voicePresenceHeartbeatRef.current = window.setInterval(() => {
        const payload = buildNextVoicePresencePayload();
        voicePresenceSyncRef.current?.schedule(payload).catch(() => {});
        syncPresenceState();
      }, 3_000);
      voicePresenceResyncRef.current = window.setInterval(() => {
        syncPresenceState();
      }, 1_200);
    });

    return () => {
      cancelled = true;
      if (voicePresenceChannelRef.current === channel) {
        voicePresenceChannelRef.current = null;
      }
      if (voicePresenceSyncRef.current === presenceSync) {
        voicePresenceSyncRef.current = null;
      }
      if (voicePresenceHeartbeatRef.current) {
        window.clearInterval(voicePresenceHeartbeatRef.current);
        voicePresenceHeartbeatRef.current = null;
      }
      if (voicePresenceResyncRef.current) {
        window.clearInterval(voicePresenceResyncRef.current);
        voicePresenceResyncRef.current = null;
      }

      presenceSync.dispose();
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel).catch(() => {});
      setVoicePresenceUsers({});
    };
  }, [accessToken, workspace?.mode, workspace?.current_user?.id, applyVoiceSessions, setVoicePresenceUsers]);

  useEffect(() => {
    if (!supabase || workspace?.mode !== "supabase") {
      setVoicePresencePeers({});
      setVoicePresenceUsers({});
      return undefined;
    }

    const channel = voicePresenceChannelRef.current;
    if (!channel) {
      return undefined;
    }

    const nextPayload = buildNextVoicePresencePayload();

    if (!nextPayload) {
      voicePresenceSyncRef.current?.schedule(null).catch(() => {});
      return undefined;
    }

    voicePresenceSyncRef.current?.schedule(nextPayload).catch(() => {});

    return undefined;
  }, [
    cameraStream,
    joinedVoiceChannelId,
    screenShareStream,
    voiceInputSpeaking,
    voiceState.deafen,
    voiceState.micMuted,
    workspace?.mode,
    workspace?.current_user?.id,
    setVoicePresenceUsers
  ]);

  useEffect(() => {
    if (joinedVoiceChannelId || workspace?.mode !== "supabase") {
      return;
    }

    setVoiceJoinReadyChannelId(null);
    setVoicePresencePeers({});

    const currentUserId = String(workspaceRef.current?.current_user?.id || "").trim();

    if (currentUserId) {
      setVoicePresenceUsers((previous) => {
        const currentEntry = previous?.[currentUserId];
        if (!currentEntry?.channelId) {
          return previous;
        }

        return {
          ...(previous || {}),
          [currentUserId]: {
            ...currentEntry,
            cameraEnabled: false,
            channelId: "",
            deafened: false,
            micMuted: false,
            screenShareEnabled: false,
            speaking: false,
            videoMode: ""
          }
        };
      });
    }
  }, [
    joinedVoiceChannelId,
    setVoicePresencePeers,
    setVoicePresenceUsers,
    workspace?.mode
  ]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return undefined;
    }

    let cancelled = false;

    async function syncDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) {
          return;
        }

        const nextDevices = {
          audioinput: devices.filter((device) => device.kind === "audioinput"),
          audiooutput: devices.filter((device) => device.kind === "audiooutput"),
          videoinput: devices.filter((device) => device.kind === "videoinput")
        };

        setVoiceDevices(nextDevices);
        setSelectedVoiceDevices((previous) => ({
          audioinput:
            previous.audioinput !== "default" &&
            nextDevices.audioinput.some((device) => device.deviceId === previous.audioinput)
              ? previous.audioinput
              : nextDevices.audioinput[0]?.deviceId || "default",
          audiooutput:
            previous.audiooutput === "default" ||
            !nextDevices.audiooutput.some((device) => device.deviceId === previous.audiooutput)
              ? "default"
              : previous.audiooutput,
          videoinput:
            previous.videoinput !== "default" &&
            nextDevices.videoinput.some((device) => device.deviceId === previous.videoinput)
              ? previous.videoinput
              : nextDevices.videoinput[0]?.deviceId || "default"
        }));
      } catch {
        // Ignore device enumeration issues in unsupported contexts.
      }
    }

    syncDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", syncDevices);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", syncDevices);
    };
  }, [setSelectedVoiceDevices, setVoiceDevices]);

  useEffect(() => {
    const shouldProcessInput = Boolean(joinedVoiceChannelId || voiceMenu === "input");

    if (!shouldProcessInput) {
      setVoiceInputLevel(0);
      setVoiceInputSpeaking(false);
      setVoiceInputStream(null);
      setVoiceInputStatus({
        engine: voiceState.noiseSuppression ? "native" : "off",
        error: "",
        ready: false
      });

      if (voiceInputSessionRef.current) {
        voiceInputSessionRef.current.destroy().catch(() => {});
        voiceInputSessionRef.current = null;
      }

      return undefined;
    }

    let cancelled = false;

    async function startVoiceInputSession() {
      if (voiceInputSessionRef.current) {
        await voiceInputSessionRef.current.destroy().catch(() => {});
        voiceInputSessionRef.current = null;
      }

      try {
        const session = await createVoiceInputProcessingSession({
          deviceId: selectedVoiceDevices.audioinput,
          inputVolume: voiceState.micMuted ? 0 : voiceState.inputVolume,
          monitorEnabled: voiceState.inputMonitoring,
          noiseSuppressionAmount: voiceState.noiseSuppressionAmount,
          noiseSuppressionEnabled: voiceState.noiseSuppression,
          onLevelChange: (level) => {
            if (!cancelled) {
              setVoiceInputLevel(level);
            }
          },
          onSpeakingChange: (nextSpeaking) => {
            if (!cancelled) {
              setVoiceInputSpeaking(Boolean(nextSpeaking));
            }
          }
        });

        if (cancelled) {
          await session.destroy();
          return;
        }

        voiceInputSessionRef.current = session;
        session.setTrackEnabled(!voiceState.micMuted);
        setVoiceInputStream(session.stream);
        setVoiceInputStatus({
          engine: session.engine,
          error: "",
          ready: true
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setVoiceInputLevel(0);
        setVoiceInputSpeaking(false);
        setVoiceInputStream(null);
        setVoiceInputStatus({
          engine: "off",
          error: error.message || "No se pudo abrir el microfono.",
          ready: false
        });
      }
    }

    startVoiceInputSession();

    return () => {
      cancelled = true;
      if (voiceInputSessionRef.current) {
        voiceInputSessionRef.current.destroy().catch(() => {});
        voiceInputSessionRef.current = null;
      }
      setVoiceInputStream(null);
    };
  }, [
    joinedVoiceChannelId,
    selectedVoiceDevices.audioinput,
    voiceMenu,
    voiceState.inputMonitoring,
    voiceState.noiseSuppressionAmount,
    voiceState.noiseSuppression,
    setVoiceInputLevel,
    setVoiceInputSpeaking,
    setVoiceInputStatus,
    setVoiceInputStream
  ]);

  useEffect(() => {
    voiceInputSessionRef.current?.setInputVolume(
      voiceState.micMuted ? 0 : voiceState.inputVolume
    );
    voiceInputSessionRef.current?.setTrackEnabled(!voiceState.micMuted);
  }, [voiceState.inputVolume, voiceState.micMuted, voiceInputSessionRef]);

  useEffect(() => {
    voiceInputSessionRef.current?.setMonitoringEnabled(Boolean(voiceState.inputMonitoring));
  }, [voiceState.inputMonitoring, voiceInputSessionRef]);

  useEffect(() => {
    const readyChannelId = voiceJoinReadyChannelIdRef?.current || null;
    const useSharedVoiceRealtime =
      workspaceRef.current?.mode === "supabase" && Boolean(supabase);
    const useLiveKitVoice = shouldUseLiveKitVoice(workspaceRef.current?.mode);

    if (
      !accessToken ||
      !joinedVoiceChannelId ||
      !workspaceRef.current?.current_user?.id ||
      (!useLiveKitVoice && joinedVoiceChannelId !== readyChannelId)
    ) {
      if (voiceRtcSessionRef.current) {
        voiceRtcSessionRef.current.destroy().catch(() => {});
        voiceRtcSessionRef.current = null;
      }

      return undefined;
    }

    try {
      const applyPeerMediaPayload = (payload) => {
        const entryKey = String(payload?.peerId || "").trim();
        if (!entryKey) {
          return;
        }

        setVoicePeerMedia((previous) => {
          const nextState = {
            ...(previous || {})
          };

          if (payload?.removed) {
            delete nextState[entryKey];
            return nextState;
          }

          nextState[entryKey] = {
            audioLevel: Math.max(0, Math.min(100, Number(payload.audioLevel) || 0)),
            cameraEnabled: Boolean(payload.cameraEnabled),
            cameraStream: payload.cameraStream || null,
            deafened: Boolean(payload.deafened),
            hasAudio: Boolean(payload.hasAudio),
            micMuted: Boolean(payload.micMuted),
            microphoneAudioPlaying: Boolean(payload.microphoneAudioPlaying),
            microphoneHasAudio: Boolean(payload.microphoneHasAudio),
            peerId: payload.peerId || "",
            screenShareEnabled: Boolean(payload.screenShareEnabled),
            screenShareAudioPlaying: Boolean(payload.screenShareAudioPlaying),
            screenShareHasAudio: Boolean(payload.screenShareHasAudio),
            screenShareStream: payload.screenShareStream || null,
            speaking: Boolean(payload.speaking),
            userId: payload.userId || "",
            videoMode: payload.videoMode || ""
          };

          return nextState;
        });
      };
      let session = null;

      if (useLiveKitVoice) {
        session = createLiveKitVoiceSession({
          accessToken,
          channelId: joinedVoiceChannelId,
          currentUserId: workspaceRef.current.current_user.id,
          deafened: Boolean(voiceState.deafen),
          localPeerId: voiceLocalPeerIdRef.current,
          micMuted: Boolean(voiceState.micMuted),
          onError: (error) => {
            const noticeMessage = getVoiceErrorNoticeMessage(error);
            if (noticeMessage) {
              setUiNotice(noticeMessage);
            }
          },
          onPeerMediaChange: applyPeerMediaPayload,
          onPresencePeersChange: (nextPresencePeers) => {
            setVoicePresencePeers(nextPresencePeers || {});
          },
          outputDeviceId: selectedVoiceDevices.audiooutput,
          outputVolume: (Number(voiceState.outputVolume) || 0) / 100,
          speaking:
            !voiceState.micMuted && !voiceState.deafen && Boolean(voiceInputSpeaking)
        });
      } else {
        const socket = getSocket(accessToken);
        if (!socket.connected) {
          socket.connect();
        }

        session = createVoiceRtcSession({
          channelId: joinedVoiceChannelId,
          currentUserId: workspaceRef.current.current_user.id,
          deafened: Boolean(voiceState.deafen),
          localPeerId: voiceLocalPeerIdRef.current,
          micMuted: Boolean(voiceState.micMuted),
          onError: (error) => {
            const noticeMessage = getVoiceErrorNoticeMessage(error);
            if (noticeMessage) {
              setUiNotice(noticeMessage);
            }
          },
          onPeerMediaChange: applyPeerMediaPayload,
          onPresencePeersChange: (nextPresencePeers) => {
            setVoicePresencePeers(nextPresencePeers || {});
          },
          outputDeviceId: selectedVoiceDevices.audiooutput,
          outputVolume: (Number(voiceState.outputVolume) || 0) / 100,
          speaking:
            !voiceState.micMuted && !voiceState.deafen && Boolean(voiceInputSpeaking),
          socket,
          useSharedRealtime: useSharedVoiceRealtime
        });
      }

      voiceRtcSessionRef.current = session;
      setVoicePresencePeers({});
      setVoicePeerMedia({});
      session
        .updateLocalMediaStreams({
          audioStream: voiceInputStream,
          cameraStream,
          screenShareStream
        })
        .catch(() => {});
      session.setLocalTrackEnabled(!voiceState.micMuted);

      return () => {
        if (voiceRtcSessionRef.current === session) {
          voiceRtcSessionRef.current = null;
        }

        setVoicePresencePeers({});
        setVoicePeerMedia({});
        session.destroy().catch(() => {});
      };
    } catch (error) {
      const noticeMessage = getVoiceErrorNoticeMessage(error);
      if (noticeMessage) {
        setUiNotice(noticeMessage);
      }
      return undefined;
    }
  }, [
    accessToken,
    joinedVoiceChannelId,
    setUiNotice,
    voiceJoinReadyChannelId,
    workspace?.mode,
    workspace?.current_user?.id
  ]);

  useEffect(() => {
    const session = voiceRtcSessionRef.current;
    if (!session) {
      return;
    }

    session
      .updateLocalMediaStreams({
        audioStream: voiceInputStream,
        cameraStream,
        screenShareStream
      })
      .catch(() => {});
  }, [cameraStream, screenShareStream, voiceInputStream]);

  useEffect(() => {
    voiceRtcSessionRef.current?.setLocalTrackEnabled(!voiceState.micMuted);
  }, [voiceState.micMuted]);

  useEffect(() => {
    voiceRtcSessionRef.current?.updateParticipantState({
      deafened: Boolean(voiceState.deafen),
      micMuted: Boolean(voiceState.micMuted),
      speaking:
        !voiceState.micMuted && !voiceState.deafen && Boolean(voiceInputSpeaking)
    });
  }, [voiceInputSpeaking, voiceState.deafen, voiceState.micMuted]);

  useEffect(() => {
    voiceRtcSessionRef.current?.updatePlayback({
      deafened: Boolean(voiceState.deafen),
      outputDeviceId: selectedVoiceDevices.audiooutput,
      outputVolume: (Number(voiceState.outputVolume) || 0) / 100
    });
  }, [selectedVoiceDevices.audiooutput, voiceState.deafen, voiceState.outputVolume]);

  useEffect(() => {
    const shouldProcessCamera = Boolean(
      voiceState.cameraEnabled && (joinedVoiceChannelId || voiceMenu === "camera")
    );

    if (!shouldProcessCamera) {
      setCameraStatus({
        error: "",
        label: "",
        ready: false
      });
      setCameraStream(null);

      if (cameraSessionRef.current) {
        cameraSessionRef.current.destroy().catch(() => {});
        cameraSessionRef.current = null;
      }

      return undefined;
    }

    let cancelled = false;

    async function startCameraSession() {
      if (cameraSessionRef.current) {
        await cameraSessionRef.current.destroy().catch(() => {});
        cameraSessionRef.current = null;
      }

      try {
        const session = await createVoiceCameraSession({
          deviceId: selectedVoiceDevices.videoinput
        });

        if (cancelled) {
          await session.destroy();
          return;
        }

        cameraSessionRef.current = session;
        session.setEnabled(true);
        setCameraStream(session.stream);
        setCameraStatus({
          error: "",
          label: session.label,
          ready: true
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCameraStream(null);
        setCameraStatus({
          error: error.message || "No se pudo abrir la camara.",
          label: "",
          ready: false
        });
        setVoiceState((previous) =>
          previous.cameraEnabled
            ? {
                ...previous,
                cameraEnabled: false
              }
            : previous
        );
      }
    }

    startCameraSession();

    return () => {
      cancelled = true;
      if (cameraSessionRef.current) {
        cameraSessionRef.current.destroy().catch(() => {});
        cameraSessionRef.current = null;
      }
      setCameraStream(null);
    };
  }, [
    joinedVoiceChannelId,
    selectedVoiceDevices.videoinput,
    voiceMenu,
    voiceState.cameraEnabled,
    cameraSessionRef,
    setCameraStatus,
    setCameraStream,
    setVoiceState
  ]);
}
