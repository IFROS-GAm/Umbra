import { startTransition, useEffect, useRef } from "react";

import { api } from "../../api.js";
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
import { createVoiceRtcSession } from "./voiceRtcSession.js";

function areVoiceSessionsEqual(previous = {}, next = {}) {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every((key) => {
    const previousUsers = previous[key] || [];
    const nextUsers = next[key] || [];

    if (previousUsers.length !== nextUsers.length) {
      return false;
    }

    return previousUsers.every((userId, index) => userId === nextUsers[index]);
  });
}

function normalizeVoiceSessions(sessions = {}) {
  return Object.fromEntries(
    Object.entries(sessions || {})
      .map(([channelId, userIds]) => [
        channelId,
        [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))]
      ])
      .filter(([channelId, userIds]) => channelId && userIds.length)
  );
}

function patchProfileEntry(entry, userPatch) {
  if (!entry || entry.id !== userPatch.id) {
    return entry;
  }

  return {
    ...entry,
    ...userPatch
  };
}

function patchFriendRequestEntry(entry, userPatch) {
  if (!entry?.user || entry.user.id !== userPatch.id) {
    return entry;
  }

  return {
    ...entry,
    user: {
      ...entry.user,
      ...userPatch
    }
  };
}

function patchWorkspaceUser(previous, userPatch) {
  if (!previous || !userPatch?.id) {
    return previous;
  }

  return {
    ...previous,
    available_users: (previous.available_users || []).map((item) =>
      patchProfileEntry(item, userPatch)
    ),
    blocked_users: (previous.blocked_users || []).map((item) =>
      patchProfileEntry(item, userPatch)
    ),
    current_user:
      previous.current_user?.id === userPatch.id
        ? {
            ...previous.current_user,
            ...userPatch
          }
        : previous.current_user,
    dms: (previous.dms || []).map((dm) => {
      const nextParticipants = (dm.participants || []).map((participant) =>
        patchProfileEntry(participant, userPatch)
      );

      if (
        dm.type === "dm" &&
        nextParticipants.some((participant) => participant.id === userPatch.id) &&
        previous.current_user?.id !== userPatch.id
      ) {
        return {
          ...dm,
          display_name: userPatch.username || dm.display_name,
          participants: nextParticipants
        };
      }

      return {
        ...dm,
        participants: nextParticipants
      };
    }),
    friend_requests_received: (previous.friend_requests_received || []).map((entry) =>
      patchFriendRequestEntry(entry, userPatch)
    ),
    friend_requests_sent: (previous.friend_requests_sent || []).map((entry) =>
      patchFriendRequestEntry(entry, userPatch)
    ),
    friends: (previous.friends || []).map((item) => patchProfileEntry(item, userPatch)),
    guilds: (previous.guilds || []).map((guild) => ({
      ...guild,
      members: (guild.members || []).map((member) => patchProfileEntry(member, userPatch))
    }))
  };
}

export function useWorkspaceCoreEffects({
  accessToken,
  activeChannel,
  activeSelection,
  activeSelectionRef,
  backgroundPrefetchRef,
  headerActionsRef,
  headerPanel,
  headerPanelRef,
  historyScrollStateRef,
  initialSelection,
  joinedVoiceChannelId,
  joinedVoiceChannelIdRef,
  listRef,
  loadBootstrapRef,
  loadMessages,
  localReadStateRef,
  messageMenuFor,
  onIncomingMessage,
  onVoiceUpdateNotification,
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
  setLoadingHistoryMessages,
  setLoadingMessages,
  setMessageLoadError,
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
  setVoiceInputStream,
  setVoiceInputStatus,
  setVoiceMenu,
  setVoiceSessions,
  setVoiceState,
  setWorkspace,
  theme,
  topbarActionsRef,
  uiNotice,
  voiceInputSessionRef,
  voiceInputStream,
  voiceMenu,
  voiceState,
  workspaceRef,
  workspace,
  cameraSessionRef
}) {
  const voiceSessionsRef = useRef({});
  const previewRefreshTimersRef = useRef(new Map());
  const channelFallbackSyncRef = useRef(false);
  const bootstrapFallbackSyncRef = useRef(false);
  const voiceFallbackSyncRef = useRef(false);
  const voiceRtcSessionRef = useRef(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    loadBootstrapRef.current?.(initialSelection || activeSelectionRef.current, {
      selectionMode: initialSelection ? "target" : "preserve-current"
    });
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
    setLoadingHistoryMessages(false);
    setMessageLoadError(null);

    if (activeSelection.channelId && !activeChannel?.is_voice) {
      if (!activeChannel) {
        setMessages([]);
        setHasMore(false);
        setLoadingMessages(false);
        setMessageLoadError({
          kind: "missing-channel",
          message: "El canal seleccionado ya no esta disponible. Reintenta para resincronizar."
        });
        return;
      }

      const cachedEntry = readChannelCache(activeSelection.channelId);
      const canRestoreLatestWindow = cachedEntry?.windowMode !== "history";

      if (cachedEntry && canRestoreLatestWindow) {
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
        setLoadingMessages(true);
      }

      loadMessages({
        channelId: activeSelection.channelId,
        force: !canRestoreLatestWindow,
        resetWindow: !canRestoreLatestWindow,
        silent: Boolean(cachedEntry && canRestoreLatestWindow)
      });
    } else {
      setMessages([]);
      setHasMore(false);
      setLoadingMessages(false);
      setMessageLoadError(null);
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
          "friends:update"
        ].includes(payload?.type)
      ) {
        return;
      }

      await loadBootstrapRef.current?.(activeSelectionRef.current);
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

      if (
        message?.author?.id &&
        message.author.id !== workspaceRef.current?.current_user?.id &&
        typeof onIncomingMessage === "function"
      ) {
        onIncomingMessage({
          message,
          preview,
          workspace: workspaceRef.current
        });
      }

      if (message?.channel_id === activeSelectionRef.current.channelId) {
        requestAnimationFrame(() => {
          const element = listRef.current;
          if (!element) {
            return;
          }
          const autoSyncToLatest = historyScrollStateRef?.current?.autoSyncToLatest !== false;
          const nearBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 160;
          if (autoSyncToLatest || nearBottom || message.author?.id === workspace?.current_user?.id) {
            element.scrollTop = element.scrollHeight;
            requestAnimationFrame(() => {
              const settledElement = listRef.current;
              if (settledElement) {
                settledElement.scrollTop = settledElement.scrollHeight;
              }
            });
          }
        });

        if (
          message.id &&
          message.author?.id !== workspace?.current_user?.id &&
          historyScrollStateRef?.current?.autoSyncToLatest !== false
        ) {
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

    const applyVoiceSessions = (payload = {}) => {
      const normalizedSessions = normalizeVoiceSessions(payload);
      voiceSessionsRef.current = normalizedSessions;
      setVoiceSessions(normalizedSessions);
      return normalizedSessions;
    };

    const syncVoiceSessionsNow = async () => {
      try {
        const payload = await api.fetchVoiceState();
        applyVoiceSessions(payload?.sessions || {});
      } catch {
        // Socket remains the primary path; this is a silent consistency sweep.
      }
    };

    const onPresenceUpdate = ({ user }) => {
      if (!user) {
        return;
      }

      const nextStatus = user.status === "invisible" ? "offline" : user.status;
      const nextUserPatch = {
        ...user,
        status: nextStatus
      };

      setWorkspace((previous) => {
        if (!previous) {
          return previous;
        }

        return patchWorkspaceUser(previous, nextUserPatch);
      });

      if (activeSelectionRef.current.channelId) {
        patchChannelMessages(activeSelectionRef.current.channelId, (previousMessages) =>
          previousMessages.map((message) =>
            message.author?.id === user.id
              ? {
                  ...message,
                  author: {
                    ...message.author,
                    ...user,
                    status: nextStatus
                  }
                }
              : message
          )
        );
      }
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
      applyVoiceSessions(payload || {});
    };

    const onVoiceUpdate = ({ channelId, userIds }) => {
      const previousUserIds = voiceSessionsRef.current?.[channelId] || [];
      if (!channelId) {
        return;
      }

      const normalizedUserIds = [...new Set((userIds || []).filter(Boolean))];
      const currentUserId = workspaceRef.current?.current_user?.id || "";

      setVoiceSessions((previous) => {
        const nextVoiceSessions = { ...previous };
        if (normalizedUserIds.length) {
          nextVoiceSessions[channelId] = normalizedUserIds;
        } else {
          delete nextVoiceSessions[channelId];
        }
        voiceSessionsRef.current = nextVoiceSessions;
        return nextVoiceSessions;
      });

      if (
        currentUserId &&
        joinedVoiceChannelIdRef.current === channelId &&
        !normalizedUserIds.includes(currentUserId)
      ) {
        setJoinedVoiceChannelId(null);
      }

      if (typeof onVoiceUpdateNotification === "function") {
        onVoiceUpdateNotification({
          channelId,
          previousUserIds,
          userIds: normalizedUserIds,
          workspace: workspaceRef.current
        });
      }
    };

    const onChannelPreview = ({ preview }) => {
      if (!preview) {
        return;
      }

      const openChannelId = activeSelectionRef.current.channelId;
      const isOpenChannel = preview.id === openChannelId;
      const cachedOpenChannel = isOpenChannel ? readChannelCache(preview.id) : null;
      const cachedLastMessageId = String(
        cachedOpenChannel?.messages?.[cachedOpenChannel.messages.length - 1]?.id || ""
      ).trim();
      const previewLastMessageId = String(preview.last_message_id || "").trim();

      setWorkspace((previous) =>
        applyChannelPreviewToWorkspace(previous, preview, {
          localReadStateByChannel: localReadStateRef.current,
          openChannelId
        })
      );

      if (
        isOpenChannel &&
        previewLastMessageId &&
        previewLastMessageId !== cachedLastMessageId
      ) {
        const existingTimer = previewRefreshTimersRef.current.get(preview.id);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        const timer = window.setTimeout(() => {
          previewRefreshTimersRef.current.delete(preview.id);

          const latestCachedLastMessageId = String(
            readChannelCache(preview.id)?.messages?.[
              (readChannelCache(preview.id)?.messages?.length || 1) - 1
            ]?.id || ""
          ).trim();

          if (
            activeSelectionRef.current.channelId === preview.id &&
            latestCachedLastMessageId !== previewLastMessageId &&
            historyScrollStateRef?.current?.autoSyncToLatest !== false
          ) {
            loadMessages({
              channelId: preview.id,
              force: true,
              silent: true
            });
          }
        }, 900);

        previewRefreshTimersRef.current.set(preview.id, timer);
      }
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
      syncVoiceSessionsNow();

      if (activeSelectionRef.current?.channelId) {
        socket.emit("room:join", {
          channelId: activeSelectionRef.current.channelId
        });
      }

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
      previewRefreshTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      previewRefreshTimersRef.current.clear();
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
      const socket = getSocket(accessToken);
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit("room:join", { channelId: activeSelection.channelId });
    }
  }, [accessToken, activeSelection.channelId]);

  useEffect(() => {
    if (!accessToken || !workspace || !activeSelection.channelId || activeChannel?.is_voice) {
      return undefined;
    }

    let cancelled = false;

    async function syncActiveChannelMessages() {
      if (cancelled || channelFallbackSyncRef.current) {
        return;
      }

      if (historyScrollStateRef?.current?.autoSyncToLatest === false) {
        return;
      }

      channelFallbackSyncRef.current = true;

      try {
        await loadMessages({
          channelId: activeSelection.channelId,
          force: true,
          limit: 24,
          silent: true
        });
      } catch {
        // Keep the fallback quiet; socket events remain the primary realtime path.
      } finally {
        channelFallbackSyncRef.current = false;
      }
    }

    syncActiveChannelMessages();

    const interval = window.setInterval(
      syncActiveChannelMessages,
      document.hidden ? 1800 : 900
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      channelFallbackSyncRef.current = false;
    };
  }, [accessToken, activeChannel?.is_voice, activeSelection.channelId, Boolean(workspace)]);

  useEffect(() => {
    if (!accessToken || !workspace) {
      return undefined;
    }

    let cancelled = false;

    async function syncWorkspaceShell() {
      if (cancelled || bootstrapFallbackSyncRef.current) {
        return;
      }

      bootstrapFallbackSyncRef.current = true;

      try {
        await loadBootstrapRef.current?.(activeSelectionRef.current);
      } catch {
        // Background sync should not surface noisy errors.
      } finally {
        bootstrapFallbackSyncRef.current = false;
      }
    }

    syncWorkspaceShell();

    const interval = window.setInterval(
      syncWorkspaceShell,
      document.hidden ? 3600 : 1800
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      bootstrapFallbackSyncRef.current = false;
    };
  }, [accessToken, Boolean(workspace)]);

  useEffect(() => {
    if (!accessToken || !workspace) {
      return undefined;
    }

    let cancelled = false;

    async function syncVoiceSessions() {
      if (cancelled || voiceFallbackSyncRef.current) {
        return;
      }

      voiceFallbackSyncRef.current = true;

      try {
        const payload = await api.fetchVoiceState();
        if (cancelled) {
          return;
        }

        const nextSessions = payload?.sessions || {};
        if (areVoiceSessionsEqual(voiceSessionsRef.current, nextSessions)) {
          return;
        }
        applyVoiceSessions(nextSessions);
      } catch {
        // Voice fallback stays silent while the primary socket path is healthy.
      } finally {
        voiceFallbackSyncRef.current = false;
      }
    }

    syncVoiceSessions();

    const interval = window.setInterval(
      syncVoiceSessions,
      document.hidden ? 3200 : 1600
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      voiceFallbackSyncRef.current = false;
    };
  }, [accessToken, Boolean(workspace), setVoiceSessions]);

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
    voiceState.noiseSuppression
  ]);

  useEffect(() => {
    voiceInputSessionRef.current?.setInputVolume(
      voiceState.micMuted ? 0 : voiceState.inputVolume
    );
    voiceInputSessionRef.current?.setTrackEnabled(!voiceState.micMuted);
  }, [voiceState.inputVolume, voiceState.micMuted]);

  useEffect(() => {
    voiceInputSessionRef.current?.setMonitoringEnabled(Boolean(voiceState.inputMonitoring));
  }, [voiceState.inputMonitoring]);

  useEffect(() => {
    if (!accessToken || !joinedVoiceChannelId || !workspaceRef.current?.current_user?.id) {
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
        onError: (error) => {
          if (error?.message) {
            setUiNotice(error.message);
          }
        },
        outputDeviceId: selectedVoiceDevices.audiooutput,
        outputVolume: (Number(voiceState.outputVolume) || 0) / 100,
        socket
      });

      voiceRtcSessionRef.current = session;
      session.updateLocalAudioStream(voiceInputStream).catch(() => {});
      session.setLocalTrackEnabled(!voiceState.micMuted);

      return () => {
        if (voiceRtcSessionRef.current === session) {
          voiceRtcSessionRef.current = null;
        }

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
    workspace?.current_user?.id
  ]);

  useEffect(() => {
    const session = voiceRtcSessionRef.current;
    if (!session) {
      return;
    }

    session.updateLocalAudioStream(voiceInputStream).catch(() => {});
  }, [voiceInputStream]);

  useEffect(() => {
    voiceRtcSessionRef.current?.setLocalTrackEnabled(!voiceState.micMuted);
  }, [voiceState.micMuted]);

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
