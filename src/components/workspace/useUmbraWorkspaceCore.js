import { useRef, useState } from "react";

import { findChannelInSession } from "../../utils.js";
import {
  renderHeaderCopy,
} from "./workspaceHelpers.js";
import { createWorkspaceCoreActions } from "./workspaceCoreActions.js";
import { useWorkspaceCoreEffects } from "./useWorkspaceCoreEffects.js";
import { createWorkspaceMessageStore } from "./workspaceCoreMessageStore.js";

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
  const [loadingMessages, setLoadingMessages] = useState(false);
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
  const [voiceInputStatus, setVoiceInputStatus] = useState({
    engine: "off",
    error: "",
    ready: false
  });
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraStatus, setCameraStatus] = useState({
    error: "",
    label: "",
    ready: false
  });
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
  const workspaceRef = useRef(workspace);
  const voiceInputSessionRef = useRef(null);
  const cameraSessionRef = useRef(null);
  const messageCacheRef = useRef(new Map());
  const messageRequestIdRef = useRef(0);
  const bootstrapRequestIdRef = useRef(0);
  const messageAbortRef = useRef(null);
  const inFlightMessageLoadsRef = useRef(new Map());
  const backgroundPrefetchRef = useRef(new Map());
  const localReadStateRef = useRef(new Map());
  const pendingDirectDmRef = useRef(new Set());
  const selectionVersionRef = useRef(0);

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
    setJoinedVoiceChannelIdState((previous) => {
      const nextChannelId =
        typeof nextChannelIdOrUpdater === "function"
          ? nextChannelIdOrUpdater(previous)
          : nextChannelIdOrUpdater;
      joinedVoiceChannelIdRef.current = nextChannelId;
      return nextChannelId;
    });
  }

  activeSelectionRef.current = activeSelection;
  accessTokenRef.current = accessToken;
  joinedVoiceChannelIdRef.current = joinedVoiceChannelId;
  workspaceRef.current = workspace;

  const activeLookup = findChannelInSession(workspace, activeSelection.channelId);
  const activeChannel = activeLookup?.channel || null;
  const activeGuild = activeLookup?.guild || null;
  const isVoiceChannel = Boolean(activeChannel?.is_voice);
  const activeGuildTextChannels =
    activeGuild?.channels.filter((channel) => !channel.is_voice && !channel.is_category) || [];
  const activeGuildVoiceChannels = activeGuild?.channels.filter((channel) => channel.is_voice) || [];
  const headerCopy = renderHeaderCopy(activeChannel, activeSelection.kind);
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
    setLoadingMessages,
    setMessages,
    setWorkspace,
    workspace
  });

  loadBootstrapRef.current = loadBootstrap;

  useWorkspaceCoreEffects({
    accessToken,
    activeChannel,
    activeSelection,
    activeSelectionRef,
    backgroundPrefetchRef,
    cameraSessionRef,
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
    handleJoinDirectCall,
    handlePickerInsert,
    handleProfileUpdate,
    handleReaction,
    handleScroll,
    joinVoiceChannelById,
    handleSelectGuildChannel,
    handleStatusChange,
    handleStickerSelect,
    handleSubmitMessage,
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
    loadMessages,
    loadingMessages,
    localReadStateRef,
    messages,
    patchChannelMessages,
    pendingDirectDmRef,
    readChannelCache,
    replyMentionEnabled,
    replyTarget,
    selectedVoiceDevices,
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
    setProfileCard,
    setReplyMentionEnabled,
    setReplyTarget,
    setSelectedVoiceDevices,
    setUiNotice,
    setUploadingAttachments,
    setVoiceMenu,
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
    handleAttachmentSelection, handleComposerChange, handleComposerShortcut, handleDeleteMessage, handleDialogSubmit,
    handlePickerInsert, handleProfileUpdate, handleReaction, handleScroll, joinVoiceChannelById, handleSelectGuildChannel,
    handleStickerSelect,
    handleStatusChange, handleSubmitMessage, handleVoiceDeviceChange, handleVoiceLeave, handleJoinDirectCall, hasMore, headerActionsRef,
    getSelectedDeviceLabel, headerCopy, headerPanel, headerPanelRef, hoveredVoiceChannelId, inboxTab, isVoiceChannel, joinedVoiceChannelId,
    joinedVoiceChannelIdRef, lastTypingAtRef, listRef, loadBootstrap, loadBootstrapRef, loadMessages,
    loadingMessages, messageMenuFor, messages, membersPanelVisible, profileCard,
    reactionPickerFor, removeComposerAttachment, replyMentionEnabled, replyTarget, selectedVoiceDevices,
    setActiveSelection, setAppError, setBooting, setComposer, setComposerAttachments, setComposerMenuOpen,
    setComposerPicker, setDialog, setEditingMessage, setHeaderPanel, setHoveredVoiceChannelId, setInboxTab,
    setJoinedVoiceChannelId, setMembersPanelVisible, setMessageMenuFor, setProfileCard, setWorkspace,
    setReactionPickerFor, setReplyMentionEnabled, setReplyTarget, setSettingsOpen, setTheme, setTypingEvents,
    setUiNotice, setVoiceDevices, setVoiceMenu, setVoiceSessions, setVoiceState, settingsOpen, showUiNotice,
    theme, toggleHeaderPanel, toggleVoiceMenu, toggleVoiceState, topbarActionsRef, typingEvents, typingUsers,
    uiNotice, updateVoiceSetting, uploadingAttachments, voiceDevices, voiceInputLevel, voiceInputStatus,
    voiceInputSpeaking, voiceMenu, voiceSessions, voiceState, voiceUserIds, workspace
  };
}
