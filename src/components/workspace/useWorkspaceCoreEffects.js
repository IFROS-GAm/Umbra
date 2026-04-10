import { startTransition, useEffect } from "react";

import { getSocket } from "../../socket.js";
import {
  applyChannelPreviewToWorkspace,
  isChannelCacheFresh,
  listLikelyChannelIds,
  removeChannelMessage,
  upsertChannelMessage
} from "./workspaceHelpers.js";
import { BACKGROUND_PREFETCH_COOLDOWN_MS } from "./workspaceCoreMessageStore.js";
import { createVoiceCameraSession } from "./voiceCameraSession.js";
import { createVoiceInputProcessingSession } from "./voiceInputProcessing.js";

export function useWorkspaceCoreEffects({
  accessToken,
  activeChannel,
  activeSelection,
  activeSelectionRef,
  backgroundPrefetchRef,
  headerActionsRef,
  headerPanel,
  headerPanelRef,
  initialSelection,
  joinedVoiceChannelId,
  joinedVoiceChannelIdRef,
  listRef,
  loadBootstrapRef,
  loadMessages,
  localReadStateRef,
  messageMenuFor,
  patchChannelMessages,
  queueMarkRead,
  readChannelCache,
  readReceiptTimeoutRef,
  selectedVoiceDevices,
  setAppError,
  setCameraStatus,
  setCameraStream,
  setComposer,
  setComposerAttachments,
  setComposerMenuOpen,
  setComposerPicker,
  setEditingMessage,
  setHasMore,
  setHeaderPanel,
  setJoinedVoiceChannelId,
  setLoadingMessages,
  setMessageMenuFor,
  setMessages,
  setProfileCard,
  setReactionPickerFor,
  setReplyMentionEnabled,
  setReplyTarget,
  setSelectedVoiceDevices,
  setTheme,
  setTypingEvents,
  setUiNotice,
  setVoiceDevices,
  setVoiceInputLevel,
  setVoiceInputSpeaking,
  setVoiceInputStatus,
  setVoiceMenu,
  setVoiceSessions,
  setVoiceState,
  setWorkspace,
  theme,
  topbarActionsRef,
  uiNotice,
  voiceInputSessionRef,
  voiceMenu,
  voiceState,
  workspace,
  cameraSessionRef
}) {
  useEffect(() => {
    if (!accessToken) {
      return;
    }

    loadBootstrapRef.current?.(initialSelection || activeSelectionRef.current);
  }, [accessToken, initialSelection]);

  useEffect(() => {
    if (workspace?.current_user?.id) {
      const savedTheme = localStorage.getItem(`umbra-theme-${workspace.current_user.id}`);
      setTheme(savedTheme || workspace.current_user.theme || "dark");
    }
  }, [setTheme, workspace?.current_user?.id, workspace?.current_user?.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (workspace?.current_user?.id) {
      localStorage.setItem(`umbra-theme-${workspace.current_user.id}`, theme);
    }
  }, [theme, workspace?.current_user?.id]);

  useEffect(() => {
    setComposer("");
    setComposerAttachments([]);
    setReplyTarget(null);
    setReplyMentionEnabled(true);
    setEditingMessage(null);
    setComposerMenuOpen(false);
    setComposerPicker(null);
    setReactionPickerFor(null);
    setProfileCard(null);
    setHeaderPanel(null);
    setVoiceMenu(null);
    setTypingEvents([]);

    if (activeSelection.channelId && !activeChannel?.is_voice) {
      const cachedEntry = readChannelCache(activeSelection.channelId);
      if (cachedEntry) {
        startTransition(() => {
          setMessages(cachedEntry.messages || []);
          setHasMore(cachedEntry.hasMore ?? true);
        });
        setLoadingMessages(false);

        const latestCached = cachedEntry.messages?.[cachedEntry.messages.length - 1];
        if (latestCached?.id) {
          queueMarkRead({
            channelId: activeSelection.channelId,
            lastReadAt: latestCached.created_at,
            lastReadMessageId: latestCached.id
          });
        }
      } else {
        setMessages([]);
        setHasMore(true);
      }

      loadMessages({
        channelId: activeSelection.channelId,
        force: !cachedEntry,
        silent: Boolean(cachedEntry)
      });
    } else {
      setMessages([]);
      setHasMore(false);
    }
  }, [activeSelection.channelId, activeChannel?.is_voice]);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const socket = getSocket(accessToken);

    const refreshNavigation = async (payload = {}) => {
      if (
        ![
          "guild:create",
          "guild:update",
          "channel:create",
          "channel:move",
          "dm:create",
          "profile:update",
          "friends:update"
        ].includes(payload?.type)
      ) {
        return;
      }

      await loadBootstrapRef.current?.(activeSelectionRef.current);

      if (payload?.type === "profile:update" && activeSelectionRef.current.channelId) {
        await loadMessages({
          channelId: activeSelectionRef.current.channelId
        });
      }
    };

    const onMessageCreate = async ({ message, preview }) => {
      if (preview) {
        setWorkspace((previous) =>
          applyChannelPreviewToWorkspace(previous, preview, {
            localReadStateByChannel: localReadStateRef.current,
            openChannelId: activeSelectionRef.current.channelId
          })
        );
      }

      if (message?.channel_id) {
        patchChannelMessages(message.channel_id, (previous) =>
          upsertChannelMessage(previous, message)
        );
      }

      if (message?.channel_id === activeSelectionRef.current.channelId) {
        requestAnimationFrame(() => {
          const element = listRef.current;
          if (!element) {
            return;
          }
          const nearBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 160;
          if (nearBottom || message.author?.id === workspace?.current_user?.id) {
            element.scrollTop = element.scrollHeight;
          }
        });

        if (message.id && message.author?.id !== workspace?.current_user?.id) {
          queueMarkRead({
            channelId: activeSelectionRef.current.channelId,
            lastReadAt: message.created_at,
            lastReadMessageId: message.id
          });
        }
      }
    };

    const onMessageUpdate = ({ message, preview }) => {
      if (preview) {
        setWorkspace((previous) =>
          applyChannelPreviewToWorkspace(previous, preview, {
            localReadStateByChannel: localReadStateRef.current,
            openChannelId: activeSelectionRef.current.channelId
          })
        );
      }

      if (message?.channel_id) {
        patchChannelMessages(message.channel_id, (previous) =>
          previous.map((item) => (item.id === message.id ? message : item))
        );
      }
    };

    const onMessageDelete = ({ channel_id, id, preview }) => {
      if (preview) {
        setWorkspace((previous) =>
          applyChannelPreviewToWorkspace(previous, preview, {
            localReadStateByChannel: localReadStateRef.current,
            openChannelId: activeSelectionRef.current.channelId
          })
        );
      }

      if (channel_id) {
        patchChannelMessages(channel_id, (previous) => removeChannelMessage(previous, id));
      }
    };

    const onReactionUpdate = ({ message }) => {
      if (message?.channel_id) {
        patchChannelMessages(message.channel_id, (previous) =>
          previous.map((item) => (item.id === message.id ? message : item))
        );
      }
    };

    const onPresenceUpdate = ({ user }) => {
      if (!user) {
        return;
      }

      setWorkspace((previous) => {
        if (!previous) {
          return previous;
        }

        const nextStatus = user.status === "invisible" ? "offline" : user.status;
        const nextUserPatch = {
          ...user,
          status: nextStatus
        };

        return {
          ...previous,
          available_users: previous.available_users.map((item) =>
            item.id === user.id ? { ...item, ...nextUserPatch } : item
          ),
          current_user:
            previous.current_user.id === user.id
              ? { ...previous.current_user, ...nextUserPatch }
              : previous.current_user,
          guilds: previous.guilds.map((guild) => ({
            ...guild,
            members: guild.members.map((member) =>
              member.id === user.id
                ? { ...member, ...nextUserPatch }
                : member
            )
          })),
          dms: previous.dms.map((dm) => ({
            ...dm,
            participants: dm.participants.map((participant) =>
              participant.id === user.id
                ? { ...participant, ...nextUserPatch }
                : participant
            )
          }))
        };
      });
    };

    const onTypingUpdate = (payload) => {
      setTypingEvents((previous) => {
        const filtered = previous.filter(
          (item) =>
            !(
              item.channelId === payload.channelId && item.userId === payload.userId
            ) && item.expires_at > Date.now()
        );
        return [...filtered, payload];
      });
    };

    const onVoiceState = (payload) => {
      setVoiceSessions(payload || {});
    };

    const onVoiceUpdate = ({ channelId, userIds }) => {
      if (!channelId) {
        return;
      }

      setVoiceSessions((previous) => ({
        ...previous,
        [channelId]: userIds || []
      }));
    };

    const onChannelPreview = ({ preview }) => {
      if (!preview) {
        return;
      }

      setWorkspace((previous) =>
        applyChannelPreviewToWorkspace(previous, preview, {
          localReadStateByChannel: localReadStateRef.current,
          openChannelId: activeSelectionRef.current.channelId
        })
      );
    };

    const onRoomError = (payload) => {
      if (!payload?.error) {
        return;
      }

      setAppError(payload.error);
      if (payload.channelId && joinedVoiceChannelIdRef.current === payload.channelId) {
        setJoinedVoiceChannelId(null);
      }
    };

    const onConnect = () => {
      if (joinedVoiceChannelIdRef.current) {
        socket.emit("voice:join", {
          channelId: joinedVoiceChannelIdRef.current
        });
      }
    };

    socket.connect();
    socket.on("connect", onConnect);
    socket.on("message:create", onMessageCreate);
    socket.on("message:update", onMessageUpdate);
    socket.on("message:delete", onMessageDelete);
    socket.on("reaction:update", onReactionUpdate);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("navigation:update", refreshNavigation);
    socket.on("typing:update", onTypingUpdate);
    socket.on("voice:state", onVoiceState);
    socket.on("voice:update", onVoiceUpdate);
    socket.on("channel:preview", onChannelPreview);
    socket.on("room:error", onRoomError);

    return () => {
      socket.off("message:create", onMessageCreate);
      socket.off("message:update", onMessageUpdate);
      socket.off("message:delete", onMessageDelete);
      socket.off("reaction:update", onReactionUpdate);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("navigation:update", refreshNavigation);
      socket.off("typing:update", onTypingUpdate);
      socket.off("connect", onConnect);
      socket.off("voice:state", onVoiceState);
      socket.off("voice:update", onVoiceUpdate);
      socket.off("channel:preview", onChannelPreview);
      socket.off("room:error", onRoomError);
      socket.disconnect();
    };
  }, [accessToken, workspace?.current_user?.id]);

  useEffect(() => {
    if (activeSelection.channelId && accessToken) {
      getSocket(accessToken).emit("room:join", { channelId: activeSelection.channelId });
    }
  }, [accessToken, activeSelection.channelId]);

  useEffect(() => {
    if (!workspace || !accessToken) {
      return undefined;
    }

    const candidateIds = listLikelyChannelIds(workspace, activeSelection, 5).filter(
      (channelId) => {
        const cachedEntry = readChannelCache(channelId);
        if (cachedEntry && isChannelCacheFresh(cachedEntry)) {
          return false;
        }

        const lastPrefetchAt = backgroundPrefetchRef.current.get(channelId) || 0;
        return Date.now() - lastPrefetchAt > BACKGROUND_PREFETCH_COOLDOWN_MS;
      }
    );

    if (!candidateIds.length) {
      return undefined;
    }

    let cancelled = false;
    const scheduleIdle =
      typeof window.requestIdleCallback === "function"
        ? (callback) => window.requestIdleCallback(callback, { timeout: 1400 })
        : (callback) => window.setTimeout(callback, 700);
    const cancelIdle =
      typeof window.cancelIdleCallback === "function"
        ? (handle) => window.cancelIdleCallback(handle)
        : (handle) => window.clearTimeout(handle);

    const handle = scheduleIdle(async () => {
      for (const channelId of candidateIds) {
        const cachedEntry = readChannelCache(channelId);
        if (cancelled || (cachedEntry && isChannelCacheFresh(cachedEntry))) {
          continue;
        }

        backgroundPrefetchRef.current.set(channelId, Date.now());
        await loadMessages({
          background: true,
          channelId,
          limit: 18,
          silent: true
        });
      }
    });

    return () => {
      cancelled = true;
      cancelIdle(handle);
    };
  }, [accessToken, activeSelection.channelId, activeSelection.guildId, activeSelection.kind, workspace]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTypingEvents((previous) =>
        previous.filter((item) => item.expires_at > Date.now())
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (readReceiptTimeoutRef.current) {
        window.clearTimeout(readReceiptTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!uiNotice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setUiNotice("");
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [uiNotice]);

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
  }, []);

  useEffect(() => {
    const shouldProcessInput = Boolean(joinedVoiceChannelId || voiceMenu === "input");

    if (!shouldProcessInput) {
      setVoiceInputLevel(0);
      setVoiceInputSpeaking(false);
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
    };
  }, [
    joinedVoiceChannelId,
    selectedVoiceDevices.audioinput,
    voiceMenu,
    voiceState.inputMonitoring,
    voiceState.noiseSuppressionAmount,
    voiceState.noiseSuppression
  ]);

  useEffect(() => {
    voiceInputSessionRef.current?.setInputVolume(
      voiceState.micMuted ? 0 : voiceState.inputVolume
    );
  }, [voiceState.inputVolume, voiceState.micMuted]);

  useEffect(() => {
    voiceInputSessionRef.current?.setMonitoringEnabled(Boolean(voiceState.inputMonitoring));
  }, [voiceState.inputMonitoring]);

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
  }, [joinedVoiceChannelId, selectedVoiceDevices.videoinput, voiceMenu, voiceState.cameraEnabled]);

  useEffect(() => {
    if (!headerPanel) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        headerPanelRef.current?.contains(target) ||
        headerActionsRef.current?.contains(target) ||
        topbarActionsRef.current?.contains(target)
      ) {
        return;
      }

      setHeaderPanel(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [headerPanel]);

  useEffect(() => {
    if (!messageMenuFor) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (event.target.closest(".message-menu-anchor")) {
        return;
      }

      setMessageMenuFor(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [messageMenuFor]);

  useEffect(() => {
    setHeaderPanel(null);
  }, [activeSelection.channelId, activeSelection.guildId, activeSelection.kind]);
}
