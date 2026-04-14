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
  voiceState,
  workspace,
  workspaceRef
}) {
  const voiceRtcSessionRef = useRef(null);
  const voicePresenceChannelRef = useRef(null);

  function buildCurrentVoicePresencePayload() {
    const currentUserId = String(workspaceRef.current?.current_user?.id || "").trim();
    const currentChannelId = String(joinedVoiceChannelIdRef.current || "").trim();
    const hasCameraTrack = Boolean(cameraStream?.getVideoTracks?.().length);
    const hasScreenTrack = Boolean(screenShareStream?.getVideoTracks?.().length);
    const isMicMuted = Boolean(voiceState.micMuted);
    const isDeafened = Boolean(voiceState.deafen);
    const isSpeaking = !isMicMuted && !isDeafened && Boolean(voiceInputSpeaking);

    if (!currentUserId || !currentChannelId) {
      return null;
    }

    const lookup = findChannelInSession(workspaceRef.current, currentChannelId);

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
    voicePresenceChannelRef.current = channel;

    const syncPresenceState = () => {
      if (cancelled) {
        return;
      }

      const presenceState = channel.presenceState();
      const nextSessions = buildVoiceSessionsFromPresenceState(presenceState);
      const nextPresencePeers = buildVoicePresencePeersFromState(presenceState);
      const nextPresenceUsers = buildVoicePresenceUsersFromState(presenceState);
      console.info("[voice/client] realtime:presence:sync", {
        channelIds: Object.keys(nextSessions),
        peerId: voiceLocalPeerIdRef.current,
        userId: workspaceRef.current?.current_user?.id || null
      });
      applyVoiceSessions(nextSessions);
      setVoicePresencePeers(nextPresencePeers);
      setVoicePresenceUsers(nextPresenceUsers);
    };

    const syncTrackedPresence = async () => {
      const payload = buildCurrentVoicePresencePayload();

      try {
        if (payload) {
          console.info("[voice/client] realtime:presence:track", payload);
          await channel.track(payload);
        } else {
          console.info("[voice/client] realtime:presence:untrack", {
            peerId: voiceLocalPeerIdRef.current
          });
          await channel.untrack();
        }
      } catch (error) {
        console.warn("[voice/client] realtime:presence:error", {
          error: error?.message || String(error),
          peerId: voiceLocalPeerIdRef.current
        });
      }
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

      await syncTrackedPresence();
      syncPresenceState();
    });

    return () => {
      cancelled = true;
      if (voicePresenceChannelRef.current === channel) {
        voicePresenceChannelRef.current = null;
      }

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

    const payload = buildCurrentVoicePresencePayload();

    if (payload) {
      channel.track(payload).catch(() => {});
    } else {
      channel.untrack().catch(() => {});
    }

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
      (!useSharedVoiceRealtime && joinedVoiceChannelId !== readyChannelId)
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
              cameraStream: payload.cameraStream || null,
              deafened: Boolean(payload.deafened),
              hasAudio: Boolean(payload.hasAudio),
              micMuted: Boolean(payload.micMuted),
              peerId: payload.peerId || "",
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
