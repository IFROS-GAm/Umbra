import { startTransition, useCallback, useEffect, useRef } from "react";

import {
  normalizeVoiceSessions
} from "../workspaceCoreEffectHelpers.js";
import { useWorkspaceBackgroundEffects } from "../useWorkspaceBackgroundEffects.js";
import { useWorkspaceSocketRealtimeEffects } from "../useWorkspaceSocketRealtimeEffects.js";
import { useWorkspaceVoiceEffects } from "../useWorkspaceVoiceEffects.js";

export function useWorkspaceCoreEffects({
  accessToken,
  activeChannel,
  activeGuildVoiceChannels,
  activeSelection,
  activeSelectionRef,
  backgroundPrefetchRef,
  cameraSessionRef,
  cameraStream,
  headerActionsRef,
  headerPanel,
  headerPanelRef,
  historyScrollStateRef,
  initialSelection,
  joinedVoiceChannelId,
  joinedVoiceChannelIdRef,
  voiceJoinReadyChannelId,
  voiceJoinReadyChannelIdRef,
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
  screenShareStream,
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
  setSubmittingMessage,
  setTheme,
  setTypingEvents,
  setUiNotice,
  setVoiceDevices,
  setVoiceInputLevel,
  setVoiceInputSpeaking,
  setVoiceInputStatus,
  setVoiceInputStream,
  setVoiceJoinReadyChannelId,
  setVoiceMenu,
  setVoicePeerMedia,
  setVoicePresencePeers,
  setVoicePresenceUsers,
  setVoiceSessions,
  setVoiceState,
  setWorkspace,
  theme,
  topbarActionsRef,
  uiNotice,
  voiceInputSessionRef,
  voiceInputSpeaking,
  voiceLocalPeerIdRef,
  voiceInputStream,
  voiceMenu,
  voicePresencePeers,
  voiceState,
  workspaceRef,
  workspace
}) {
  const voiceSessionsRef = useRef({});
  const channelFallbackSyncRef = useRef(false);
  const bootstrapFallbackSyncRef = useRef(false);
  const voiceFallbackSyncRef = useRef(false);

  const applyVoiceSessions = useCallback((payload = {}) => {
    const normalizedSessions = normalizeVoiceSessions(payload);
    voiceSessionsRef.current = normalizedSessions;
    setVoiceSessions(normalizedSessions);
    return normalizedSessions;
  }, [setVoiceSessions]);

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
    setSubmittingMessage(false);
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

  useWorkspaceSocketRealtimeEffects({
    accessToken,
    activeSelection,
    activeSelectionRef,
    applyVoiceSessions,
    historyScrollStateRef,
    joinedVoiceChannelIdRef,
    listRef,
    loadBootstrapRef,
    loadMessages,
    localReadStateRef,
    onIncomingMessage,
    onVoiceUpdateNotification,
    patchChannelMessages,
    queueMarkRead,
    readChannelCache,
    setAppError,
    setJoinedVoiceChannelId,
    setTypingEvents,
    setVoiceJoinReadyChannelId,
    setVoiceSessions,
    setWorkspace,
    voiceSessionsRef,
    workspace,
    workspaceRef
  });

  useWorkspaceBackgroundEffects({
    accessToken,
    activeChannel,
    activeGuildVoiceChannels,
    activeSelection,
    activeSelectionRef,
    applyVoiceSessions,
    backgroundPrefetchRef,
    bootstrapFallbackSyncRef,
    channelFallbackSyncRef,
    historyScrollStateRef,
    loadBootstrapRef,
    loadMessages,
    readChannelCache,
    readReceiptTimeoutRef,
    setTypingEvents,
    setUiNotice,
    uiNotice,
    voiceFallbackSyncRef,
    voiceSessionsRef,
    workspace
  });

  useWorkspaceVoiceEffects({
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
  });

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
