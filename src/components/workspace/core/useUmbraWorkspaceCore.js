import { useEffect, useRef, useState } from "react";

import { initializeUmbraSoundEffects } from "../../../audio/umbraSoundEffects.js";
import { findChannelInSession } from "../../../utils.js";
import {
  attachmentKey,
  normalizeConversationCopy,
  renderHeaderCopy,
} from "../workspaceHelpers.js";
import { createWorkspaceCoreActions } from "../workspaceCoreActions.js";
import { useWorkspaceCoreEffects } from "../useWorkspaceCoreEffects.js";
import { createWorkspaceMessageStore } from "../workspaceCoreMessageStore.js";

export function useUmbraWorkspaceCore({
  accessToken,
  initialSelection = null,
  onIncomingMessage = null,
  onVoiceUpdateNotification = null,
  onSignOut
}) {
  const [workspace, setWorkspace] = useState(null);
  const [activeSelection, setActiveSelectionState] = useState({
    channelId: initialSelection?.channelId || null,
    guildId: initialSelection?.guildId || null,
    kind: initialSelection?.kind || "guild"
  });
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingHistoryMessages, setLoadingHistoryMessages] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageLoadError, setMessageLoadError] = useState(null);
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const [composer, setComposer] = useState("");
  const [composerAttachments, setComposerAttachments] = useState([]);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyMentionEnabled, setReplyMentionEnabled] = useState(true);
  const [editingMessage, setEditingMessage] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [typingEvents, setTypingEvents] = useState([]);
  const [theme, setTheme] = useState("dark");
  const [appError, setAppError] = useState("");
  const [uiNotice, setUiNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersPanelVisible, setMembersPanelVisible] = useState(true);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [composerPicker, setComposerPicker] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [messageMenuFor, setMessageMenuFor] = useState(null);
  const [profileCard, setProfileCard] = useState(null);
  const [headerPanel, setHeaderPanel] = useState(null);
  const [inboxTab, setInboxTab] = useState("for_you");
  const [voiceMenu, setVoiceMenu] = useState(null);
  const [hoveredVoiceChannelId, setHoveredVoiceChannelId] = useState(null);
  const [voiceInputLevel, setVoiceInputLevel] = useState(0);
  const [voiceInputSpeaking, setVoiceInputSpeaking] = useState(false);
  const [voiceInputStream, setVoiceInputStream] = useState(null);
  const [voiceInputStatus, setVoiceInputStatus] = useState({
    engine: "off",
    error: "",
    ready: false
  });
  const [cameraStream, setCameraStream] = useState(null);
  const [screenShareStream, setScreenShareStream] = useState(null);
  const [cameraStatus, setCameraStatus] = useState({
    error: "",
    label: "",
    ready: false
  });
  const [voicePeerMedia, setVoicePeerMedia] = useState({});
  const [voiceState, setVoiceState] = useState({
    cameraEnabled: false,
    deafen: false,
    inputMonitoring: false,
    inputProfile: "custom",
    inputVolume: 84,
    micMuted: false,
    noiseSuppressionAmount: 44,
    noiseSuppression: true,
    pushToTalk: false,
    outputVolume: 52,
    screenShareEnabled: false,
    screenShareQuality: "720p30",
    shareAudio: true
  });
  const [voiceSessions, setVoiceSessions] = useState({});
  const [voicePresencePeers, setVoicePresencePeers] = useState({});
  const [voicePresenceUsers, setVoicePresenceUsers] = useState({});
  const [voiceJoinReadyChannelId, setVoiceJoinReadyChannelId] = useState(null);
  const [voiceDevices, setVoiceDevices] = useState({
    audioinput: [],
    audiooutput: [],
    videoinput: []
  });
  const [selectedVoiceDevices, setSelectedVoiceDevices] = useState({
    audioinput: "default",
    audiooutput: "default",
    videoinput: "default"
  });
  const [joinedVoiceChannelId, setJoinedVoiceChannelIdState] = useState(null);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [booting, setBooting] = useState(true);

  const listRef = useRef(null);
  const composerRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const headerActionsRef = useRef(null);
  const headerPanelRef = useRef(null);
  const topbarActionsRef = useRef(null);
  const lastTypingAtRef = useRef(0);
  const pendingReadRef = useRef(null);
  const readReceiptTimeoutRef = useRef(null);
  const activeSelectionRef = useRef(activeSelection);
  const loadBootstrapRef = useRef(null);
  const accessTokenRef = useRef(accessToken);
  const joinedVoiceChannelIdRef = useRef(joinedVoiceChannelId);
  const voiceJoinReadyChannelIdRef = useRef(voiceJoinReadyChannelId);
  const voiceLocalPeerIdRef = useRef(
    globalThis.crypto?.randomUUID?.() ||
      `voice-peer-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const workspaceRef = useRef(workspace);
  const voiceInputSessionRef = useRef(null);
  const cameraSessionRef = useRef(null);
  const voiceRtcSessionRef = useRef(null);
  const messageCacheRef = useRef(new Map());
  const messageRequestIdRef = useRef(0);
  const bootstrapRequestIdRef = useRef(0);
  const messageAbortRef = useRef(null);
  const inFlightMessageLoadsRef = useRef(new Map());
  const backgroundPrefetchRef = useRef(new Map());
  const localReadStateRef = useRef(new Map());
  const pendingDirectDmRef = useRef(new Set());
  const selectionVersionRef = useRef(0);
  const historyScrollStateRef = useRef({
    autoSyncToLatest: true,
    cancelViewportStabilizer: null,
    lastScrollTop: Number.POSITIVE_INFINITY,
    loadArmed: true,
    pendingViewportTracker: null
  });
  const bootstrapRetryRef = useRef({
    attempt: 0,
    timer: null
  });
  const attachmentUploadCounterRef = useRef(0);
  const previousComposerAttachmentsRef = useRef([]);
  const pendingSocialRealtimeActionsRef = useRef([]);

  useEffect(() => {
    initializeUmbraSoundEffects();
  }, []);

  function areSelectionsEqual(left, right) {
    return (
      (left?.channelId ?? null) === (right?.channelId ?? null) &&
      (left?.guildId ?? null) === (right?.guildId ?? null) &&
      (left?.kind || "guild") === (right?.kind || "guild")
    );
  }

  function setActiveSelection(nextSelectionOrUpdater) {
    setActiveSelectionState((previous) => {
      const nextSelection =
        typeof nextSelectionOrUpdater === "function"
          ? nextSelectionOrUpdater(previous)
          : nextSelectionOrUpdater;

      if (!areSelectionsEqual(previous, nextSelection)) {
        selectionVersionRef.current += 1;
      }

      activeSelectionRef.current = nextSelection;
      return nextSelection;
    });
  }

  function setJoinedVoiceChannelId(nextChannelIdOrUpdater) {
    if (typeof nextChannelIdOrUpdater !== "function") {
      joinedVoiceChannelIdRef.current = nextChannelIdOrUpdater;
      setJoinedVoiceChannelIdState(nextChannelIdOrUpdater);
      return;
    }

    setJoinedVoiceChannelIdState((previous) => {
      const nextChannelId = nextChannelIdOrUpdater(previous);
      joinedVoiceChannelIdRef.current = nextChannelId;
      return nextChannelId;
    });
  }

  function isBootstrapConnectionError(message = "") {
    const normalized = String(message || "").toLowerCase();
    return (
      normalized.includes("failed to fetch") ||
      normalized.includes("no se pudo conectar") ||
      normalized.includes("networkerror") ||
      normalized.includes("err_connection_refused")
    );
  }

  useEffect(() => {
    historyScrollStateRef.current?.cancelViewportStabilizer?.();
    historyScrollStateRef.current?.pendingViewportTracker?.stop?.();
    historyScrollStateRef.current = {
      autoSyncToLatest: true,
      cancelViewportStabilizer: null,
      lastScrollTop: Number.POSITIVE_INFINITY,
      loadArmed: true,
      pendingViewportTracker: null
    };
  }, [activeSelection.channelId]);

  useEffect(() => {
    const previousByKey = new Map(
      (previousComposerAttachmentsRef.current || []).map((attachment) => [
        attachmentKey(attachment),
        attachment
      ])
    );
    const currentKeys = new Set((composerAttachments || []).map((attachment) => attachmentKey(attachment)));

    previousByKey.forEach((attachment, key) => {
      if (currentKeys.has(key)) {
        return;
      }

      if (attachment?.preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.preview_url);
      }
    });

    previousComposerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  useEffect(
    () => () => {
      (previousComposerAttachmentsRef.current || []).forEach((attachment) => {
        if (attachment?.preview_url?.startsWith("blob:")) {
          URL.revokeObjectURL(attachment.preview_url);
        }
      });
    },
    []
  );

  useEffect(() => {
    const retryState = bootstrapRetryRef.current;
    if (retryState.timer) {
      window.clearTimeout(retryState.timer);
      retryState.timer = null;
    }

    if (!accessToken || workspace || !isBootstrapConnectionError(appError)) {
      retryState.attempt = 0;
      return;
    }

    const nextAttempt = Math.min(retryState.attempt + 1, 6);
    retryState.attempt = nextAttempt;
    const delay = Math.min(900 + nextAttempt * 700, 5200);

    retryState.timer = window.setTimeout(() => {
      loadBootstrapRef.current?.(initialSelection || activeSelectionRef.current);
    }, delay);

    return () => {
      if (retryState.timer) {
        window.clearTimeout(retryState.timer);
        retryState.timer = null;
      }
    };
  }, [accessToken, appError, initialSelection, workspace]);

  activeSelectionRef.current = activeSelection;
  accessTokenRef.current = accessToken;
  joinedVoiceChannelIdRef.current = joinedVoiceChannelId;
  voiceJoinReadyChannelIdRef.current = voiceJoinReadyChannelId;
  workspaceRef.current = workspace;

  const activeLookup = findChannelInSession(workspace, activeSelection.channelId);
  const activeChannel = activeLookup?.channel || null;
  const activeGuild =
    activeLookup?.guild ||
    workspace?.guilds?.find((guild) => guild.id === activeSelection.guildId) ||
    null;
  const isVoiceChannel = Boolean(activeChannel?.is_voice);
  const activeGuildTextChannels =
    activeGuild?.channels.filter((channel) => !channel.is_voice && !channel.is_category) || [];
  const activeGuildVoiceChannels = activeGuild?.channels.filter((channel) => channel.is_voice) || [];
  const rawHeaderCopy = renderHeaderCopy(activeChannel, activeSelection.kind);
  const headerCopy = {
    ...rawHeaderCopy,
    description: normalizeConversationCopy(rawHeaderCopy?.description || ""),
    eyebrow: normalizeConversationCopy(rawHeaderCopy?.eyebrow || "")
  };
  const currentUserLabel =
    workspace?.current_user?.display_name || workspace?.current_user?.username || "Umbra user";
  const directUnreadCount =
    workspace?.dms?.reduce((count, dm) => count + (dm.unread_count || 0), 0) || 0;
  const typingUsers = typingEvents.filter(
    (item) =>
      item.channelId === activeSelection.channelId &&
      item.userId !== workspace?.current_user?.id &&
      item.expires_at > Date.now()
  );
  const voiceUserIds = activeChannel?.id ? voiceSessions[activeChannel.id] || [] : [];
  const {
    loadBootstrap,
    loadMessages,
    patchChannelMessages,
    queueMarkRead,
    readChannelCache
  } = createWorkspaceMessageStore({
    accessTokenRef,
    activeSelection,
    activeSelectionRef,
    backgroundPrefetchRef,
    bootstrapRequestIdRef,
    historyScrollStateRef,
    inFlightMessageLoadsRef,
    listRef,
    localReadStateRef,
    messageAbortRef,
    messageCacheRef,
    messageRequestIdRef,
    onSignOut,
    pendingReadRef,
    readReceiptTimeoutRef,
    refs: { listRef },
    selectionVersionRef,
    setActiveSelection,
    setAppError,
    setBooting,
    setHasMore,
    setLoadingHistoryMessages,
    setLoadingMessages,
    setMessageLoadError,
    setMessages,
    setWorkspace,
    workspaceRef,
    workspace
  });

  loadBootstrapRef.current = loadBootstrap;

  useWorkspaceCoreEffects({
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
    pendingSocialRealtimeActionsRef,
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
    setVoiceInputStream,
    setVoiceInputStatus,
    setVoiceJoinReadyChannelId,
    setVoiceMenu,
    setVoicePeerMedia,
    setVoicePresencePeers,
    setVoicePresenceUsers,
    setVoiceSessions,
    setVoiceState,
    setVoiceJoinReadyChannelId,
    setWorkspace,
    theme,
    topbarActionsRef,
    uiNotice,
    voiceInputSessionRef,
    voiceInputSpeaking,
    voiceLocalPeerIdRef,
    voiceRtcSessionRef,
    voiceInputStream,
    voiceMenu,
    voicePeerMedia,
    voicePresencePeers,
    voiceState,
    workspaceRef,
    workspace
  });

  const {
    appendToComposer,
    cycleVoiceDevice,
    getSelectedDeviceLabel,
    handleAttachmentSelection,
    handleComposerChange,
    handleComposerShortcut,
    handleDeleteMessage,
    handleDialogSubmit,
    handleForwardMessage,
    handleJoinDirectCall,
    handlePickerInsert,
    handleProfileUpdate,
    handleReaction,
    handleRetryMessages,
    handleScroll,
    handleJumpToLatest,
    joinVoiceChannelById,
    handleSelectGuildChannel,
    handleStatusChange,
    handleStickerSelect,
    handleSubmitMessage,
    handleTogglePinnedMessage,
    updateComposerAttachment,
    handleVoiceDeviceChange,
    handleVoiceLeave,
    removeComposerAttachment,
    showUiNotice,
    toggleHeaderPanel,
    toggleVoiceMenu,
    toggleVoiceState,
    updateVoiceSetting
  } = createWorkspaceCoreActions({
    accessToken,
    activeGuild,
    activeSelection,
    activeSelectionRef,
    attachmentInputRef,
    composer,
    composerAttachments,
    composerRef,
    currentUserLabel,
    dialog,
    editingMessage,
    hasMore,
    isVoiceChannel,
    joinedVoiceChannelId,
    lastTypingAtRef,
    listRef,
    loadBootstrap,
    historyScrollStateRef,
    loadMessages,
    loadingHistoryMessages,
    loadingMessages,
    messageLoadError,
    localReadStateRef,
    messages,
    patchChannelMessages,
    pendingDirectDmRef,
    readChannelCache,
    replyMentionEnabled,
    replyTarget,
    selectedVoiceDevices,
    attachmentUploadCounterRef,
    submittingMessage,
    setActiveSelection,
    setAppError,
    setComposer,
    setComposerAttachments,
    setComposerMenuOpen,
    setComposerPicker,
    setDialog,
    setEditingMessage,
    setHeaderPanel,
    setJoinedVoiceChannelId,
    setMessageLoadError,
    setProfileCard,
    setReplyMentionEnabled,
    setReplyTarget,
    setSelectedVoiceDevices,
    setSubmittingMessage,
    setUiNotice,
    setUploadingAttachments,
    setVoiceMenu,
    setVoiceJoinReadyChannelId,
    setVoiceSessions,
    setVoiceState,
    setWorkspace,
    voiceDevices,
    workspace
  });

  return {
    accessTokenRef, activeChannel, activeGuild, activeGuildTextChannels, activeGuildVoiceChannels, activeLookup,
    activeSelection, activeSelectionRef, appError, attachmentInputRef, booting, composer, composerAttachments,
    cameraStatus, cameraStream,
    composerMenuOpen, composerPicker, composerRef, currentUserLabel, cycleVoiceDevice, dialog, directUnreadCount, editingMessage,
    handleAttachmentSelection, handleComposerChange, handleComposerShortcut, handleDeleteMessage, handleDialogSubmit, handleForwardMessage,
    handlePickerInsert, handleProfileUpdate, handleReaction, handleRetryMessages, handleScroll, handleJumpToLatest, joinVoiceChannelById, handleSelectGuildChannel,
    handleStickerSelect, handleStatusChange, handleSubmitMessage, handleTogglePinnedMessage, handleVoiceDeviceChange, handleVoiceLeave, handleJoinDirectCall, hasMore, headerActionsRef,
    getSelectedDeviceLabel, headerCopy, headerPanel, headerPanelRef, hoveredVoiceChannelId, inboxTab, isVoiceChannel, joinedVoiceChannelId,
    joinedVoiceChannelIdRef, lastTypingAtRef, listRef, loadBootstrap, loadBootstrapRef, loadMessages,
    loadingHistoryMessages, loadingMessages, messageLoadError, messageMenuFor, messages, membersPanelVisible, profileCard,
    reactionPickerFor, removeComposerAttachment, replyMentionEnabled, replyTarget, selectedVoiceDevices,
    updateComposerAttachment,
    setActiveSelection, setAppError, setBooting, setComposer, setComposerAttachments, setComposerMenuOpen,
    setComposerPicker, setDialog, setEditingMessage, setHeaderPanel, setHoveredVoiceChannelId, setInboxTab,
    setJoinedVoiceChannelId, setMembersPanelVisible, setMessageMenuFor, setProfileCard, setWorkspace,
    setReactionPickerFor, setReplyMentionEnabled, setReplyTarget, setSettingsOpen, setTheme, setTypingEvents,
      setScreenShareStream, setSubmittingMessage, setUiNotice, setVoiceDevices, setVoiceMenu, setVoicePeerMedia, setVoicePresencePeers, setVoicePresenceUsers, setVoiceSessions, setVoiceState, setVoiceJoinReadyChannelId, settingsOpen, showUiNotice,
    submittingMessage, theme, toggleHeaderPanel, toggleVoiceMenu, toggleVoiceState, topbarActionsRef, typingEvents, typingUsers,
    uiNotice, updateVoiceSetting, uploadingAttachments, voiceDevices, voiceInputLevel, voiceInputStatus,
    voiceInputSpeaking, voiceJoinReadyChannelId, voiceJoinReadyChannelIdRef, voiceLocalPeerIdRef, voiceMenu, voicePeerMedia, voicePresencePeers, voicePresenceUsers, voiceRtcSessionRef, voiceSessions, voiceState, voiceUserIds, screenShareStream, workspace, pendingSocialRealtimeActionsRef
  };
}
