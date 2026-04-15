import { useEffect, useRef } from "react";

import { getSocket } from "../../../socket.js";
import { supabase } from "../../../supabase-browser.js";
import { findChannelInSession } from "../../../utils.js";
import { createVoiceCameraSession } from "../voiceCameraSession.js";
import { createVoiceInputProcessingSession } from "../voiceInputProcessing.js";
import {
  buildVoicePresencePeersFromState,
  buildVoicePresenceUsersFromState,
  buildVoiceSessionsFromPresenceState
} from "../voiceRealtimeHelpers.js";
import { createRealtimePresenceSync } from "../voice/presence/createRealtimePresenceSync.js";
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
  voiceMenu,
  voicePresencePeers,
  voiceState,
  workspace,
  workspaceRef
}) {
  const voiceRtcSessionRef = useRef(null);
  const voicePresenceChannelRef = useRef(null);
  const voicePresenceRevisionRef = useRef(0);
  const voicePresenceSyncRef = useRef(null);
  const voicePresenceHeartbeatRef = useRef(null);

  function buildKnownVoicePeers(channelId) {
    const normalizedChannelId = String(channelId || "").trim();
    const localPeerId = String(voiceLocalPeerIdRef.current || "").trim();

    if (!normalizedChannelId) {
      return [];
    }

    return Object.values(voicePresencePeers || {}).filter((entry) => {
      const peerId = String(entry?.peerId || "").trim();
      return (
        String(entry?.channelId || "").trim() === normalizedChannelId &&
        peerId &&
        peerId !== localPeerId
      );
    });
  }

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
      log: (event, details = {}, level = "info") => {
        const logger = typeof console[level] === "function" ? console[level] : console.info;
        logger(`[voice/client] realtime:presence:${event}`, {
          peerId: voiceLocalPeerIdRef.current,
          ...details
        });
      },
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

      const presenceState = channel.presenceState();
      let nextSessions = buildVoiceSessionsFromPresenceState(presenceState);
      let nextPresencePeers = buildVoicePresencePeersFromState(presenceState);
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

        nextPresencePeers = Object.fromEntries(
          Object.entries(nextPresencePeers).filter(([peerId, entry]) => {
            if (peerId === localPeerId) {
              return false;
            }

            return entry?.userId !== currentUserId;
          })
        );

        nextPresenceUsers = Object.fromEntries(
          Object.entries(nextPresenceUsers).filter(([userId]) => userId !== currentUserId)
        );
      }

      console.info("[voice/client] realtime:presence:sync", {
        channelIds: Object.keys(nextSessions),
        peerId: voiceLocalPeerIdRef.current,
        userId: workspaceRef.current?.current_user?.id || null
      });
      applyVoiceSessions(nextSessions);
      setVoicePresencePeers(nextPresencePeers);
      setVoicePresenceUsers(nextPresenceUsers);

      const localEntry = localPeerId ? nextPresencePeers?.[localPeerId] : null;
      if (currentJoinedChannelId && localEntry?.channelId === currentJoinedChannelId) {
        console.info("[voice/client] flow:presence-confirmed", {
          channelId: currentJoinedChannelId,
          peerId: localPeerId,
          step: 3
        });
        setVoiceJoinReadyChannelId((previous) =>
          previous === currentJoinedChannelId ? previous : currentJoinedChannelId
        );
      }
    };

    const syncTrackedPresence = async () => {
      const payload = buildNextVoicePresencePayload();
      if (payload) {
        console.info("[voice/client] flow:presence-track-request", {
          channelId: payload.channelId,
          peerId: payload.peerId,
          step: 2
        });
      }
      await presenceSync.schedule(payload);
    };

    channel.on("presence", { event: "sync" }, syncPresenceState);
    channel.on("presence", { event: "join" }, syncPresenceState);
    channel.on("presence", { event: "leave" }, syncPresenceState);
    channel.subscribe(async (status) => {
      console.info("[voice/client] realtime:presence:status", {
        peerId: voiceLocalPeerIdRef.current,
        status
      });
      if (status !== "SUBSCRIBED" || cancelled) {
        return;
      }

      console.info("[voice/client] flow:presence-subscribed", {
        channelId: joinedVoiceChannelIdRef.current || "",
        peerId: voiceLocalPeerIdRef.current,
        step: "2.subscribed"
      });

      await syncTrackedPresence();
      syncPresenceState();

      if (voicePresenceHeartbeatRef.current) {
        window.clearInterval(voicePresenceHeartbeatRef.current);
      }
      voicePresenceHeartbeatRef.current = window.setInterval(() => {
        const payload = buildNextVoicePresencePayload();
        voicePresenceSyncRef.current?.schedule(payload).catch(() => {});
      }, 3_000);
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

      presenceSync.dispose();
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel).catch(() => {});
      setVoicePresencePeers({});
      setVoicePresenceUsers({});
    };
  }, [accessToken, workspace?.mode, workspace?.current_user?.id, applyVoiceSessions, setVoicePresencePeers, setVoicePresenceUsers]);

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
    setVoicePresencePeers,
    setVoicePresenceUsers
  ]);

  useEffect(() => {
    if (joinedVoiceChannelId || workspace?.mode !== "supabase") {
      return;
    }

    setVoiceJoinReadyChannelId(null);

    const localPeerId = String(voiceLocalPeerIdRef.current || "").trim();
    const currentUserId = String(workspaceRef.current?.current_user?.id || "").trim();

    if (localPeerId) {
      setVoicePresencePeers((previous) => {
        const currentEntry = previous?.[localPeerId];
        if (!currentEntry?.channelId) {
          return previous;
        }

        return {
          ...(previous || {}),
          [localPeerId]: {
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
            previous.audiooutput !== "default" &&
            nextDevices.audiooutput.some((device) => device.deviceId === previous.audiooutput)
              ? previous.audiooutput
              : nextDevices.audiooutput[0]?.deviceId || "default",
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

    if (
      !accessToken ||
      !joinedVoiceChannelId ||
      !workspaceRef.current?.current_user?.id ||
      joinedVoiceChannelId !== readyChannelId
    ) {
      if (voiceRtcSessionRef.current) {
        voiceRtcSessionRef.current.destroy().catch(() => {});
        voiceRtcSessionRef.current = null;
      }

      return undefined;
    }

    const socket = getSocket(accessToken);
    if (!socket.connected) {
      socket.connect();
    }

    try {
      const session = createVoiceRtcSession({
        channelId: joinedVoiceChannelId,
        currentUserId: workspaceRef.current.current_user.id,
        deafened: Boolean(voiceState.deafen),
        localPeerId: voiceLocalPeerIdRef.current,
        micMuted: Boolean(voiceState.micMuted),
        onError: (error) => {
          if (error?.message) {
            setUiNotice(error.message);
          }
        },
        onPeerMediaChange: (payload) => {
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
              peerId: payload.peerId || "",
              screenShareEnabled: Boolean(payload.screenShareEnabled),
              screenShareStream: payload.screenShareStream || null,
              speaking: Boolean(payload.speaking),
              userId: payload.userId || "",
              videoMode: payload.videoMode || ""
            };

            return nextState;
          });
        },
        outputDeviceId: selectedVoiceDevices.audiooutput,
        outputVolume: (Number(voiceState.outputVolume) || 0) / 100,
        speaking:
          !voiceState.micMuted && !voiceState.deafen && Boolean(voiceInputSpeaking),
        socket,
        useSharedRealtime: useSharedVoiceRealtime
      });

      voiceRtcSessionRef.current = session;
      setVoicePeerMedia({});
      session
        .updateLocalMediaStreams({
          audioStream: voiceInputStream,
          cameraStream,
          screenShareStream
        })
        .catch(() => {});
      if (useSharedVoiceRealtime) {
        const knownPeers = buildKnownVoicePeers(joinedVoiceChannelId);
        console.info("[voice/client] global:peers:sync", {
          channelId: joinedVoiceChannelId,
          peerIds: knownPeers.map((entry) => entry.peerId),
          peerUserIds: knownPeers.map((entry) => entry.userId)
        });
        session.syncKnownPeers?.(knownPeers).catch?.(() => {});
      }
      session.setLocalTrackEnabled(!voiceState.micMuted);

      return () => {
        if (voiceRtcSessionRef.current === session) {
          voiceRtcSessionRef.current = null;
        }

        setVoicePeerMedia({});
        session.destroy().catch(() => {});
      };
    } catch (error) {
      setUiNotice(error.message || "No se pudo iniciar la sesion de voz.");
      return undefined;
    }
  }, [
    accessToken,
    joinedVoiceChannelId,
    setUiNotice,
    voiceJoinReadyChannelId,
    voicePresencePeers,
    workspace?.mode,
    workspace?.current_user?.id
  ]);

  useEffect(() => {
    if (workspace?.mode !== "supabase" || !joinedVoiceChannelId) {
      return;
    }

    const session = voiceRtcSessionRef.current;
    if (!session?.syncKnownPeers) {
      return;
    }

    const knownPeers = buildKnownVoicePeers(joinedVoiceChannelId);
    console.info("[voice/client] global:peers:sync", {
      channelId: joinedVoiceChannelId,
      peerIds: knownPeers.map((entry) => entry.peerId),
      peerUserIds: knownPeers.map((entry) => entry.userId)
    });
    session.syncKnownPeers(knownPeers).catch(() => {});
  }, [joinedVoiceChannelId, voicePresencePeers, workspace?.mode]);

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
