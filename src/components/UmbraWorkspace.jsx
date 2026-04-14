import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";

import { api, buildInviteUrl } from "../api.js";
import { translate } from "../i18n.js";
import { AccountManagerModal } from "./AccountManagerModal.jsx";
import { CurrentUserMenu } from "./CurrentUserMenu.jsx";
import { UserProfileCard } from "./UserProfileCard.jsx";
import { UserProfileModal } from "./UserProfileModal.jsx";
import { ChatHeaderPanel } from "./workspace/ChatHeaderPanel.jsx";
import { ChatHeader } from "./workspace/ChatHeader.jsx";
import { DesktopTopbar } from "./workspace/DesktopTopbar.jsx";
import { MembersPanel } from "./workspace/MembersPanel.jsx";
import { WorkspaceScreenSharePicker } from "./workspace/WorkspaceScreenSharePicker.jsx";
import {
  WorkspaceCameraMenu,
  WorkspaceInputMenu,
  WorkspaceOutputMenu,
  WorkspaceShareMenu
} from "./workspace/WorkspaceVoiceMenus.jsx";
import { WorkspaceNavigation } from "./workspace/WorkspaceNavigation.jsx";
import { WorkspaceTooltipLayer } from "./workspace/WorkspaceTooltipLayer.jsx";
import {
  createVoiceScreenShareSession,
  SCREEN_SHARE_QUALITY_PRESETS
} from "./workspace/voiceScreenShareSession.js";
import {
  applyServerFolderAction,
  reorderGuildList,
  toggleServerFolder
} from "./workspace/serverFolders.js";
import {
  buildMemberGroups,
  buildVoiceStageTone,
  isVisibleStatus,
} from "./workspace/workspaceHelpers.js";
import { buildWorkspaceProfileCardData } from "./workspace/workspaceProfileCard.js";
import { createWorkspaceSocialActions } from "./workspace/workspaceSocialActions.js";
import { useUmbraWorkspaceCore } from "./workspace/useUmbraWorkspaceCore.js";
import { useWorkspaceDesktopNotifications } from "./workspace/useWorkspaceDesktopNotifications.js";
import { useWorkspaceShellState } from "./workspace/useWorkspaceShellState.js";

const lazyNamed = (loader, exportName) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] })));

const Dialog = lazyNamed(() => import("./Dialog.jsx"), "Dialog");
const ConfirmActionModal = lazyNamed(
  () => import("./ConfirmActionModal.jsx"),
  "ConfirmActionModal"
);
const FriendsHome = lazyNamed(() => import("./FriendsHome.jsx"), "FriendsHome");
const InviteServerModal = lazyNamed(() => import("./InviteServerModal.jsx"), "InviteServerModal");
const MessageRequestsHome = lazyNamed(
  () => import("./MessageRequestsHome.jsx"),
  "MessageRequestsHome"
);
const ServerSettingsModal = lazyNamed(
  () => import("./ServerSettingsModal.jsx"),
  "ServerSettingsModal"
);
const SettingsModal = lazyNamed(() => import("./SettingsModal.jsx"), "SettingsModal");
const MessageStage = lazyNamed(() => import("./workspace/MessageStage.jsx"), "MessageStage");
const VoiceRoomStage = lazyNamed(() => import("./workspace/VoiceRoomStage.jsx"), "VoiceRoomStage");
const VoiceParticipantContextMenu = lazyNamed(
  () => import("./workspace/VoiceParticipantContextMenu.jsx"),
  "VoiceParticipantContextMenu"
);

function WorkspacePanelFallback({ compact = false }) {
  return (
    <div className={`workspace-panel-fallback ${compact ? "compact" : ""}`.trim()}>
      <div className="workspace-panel-pulse" />
      <div className="workspace-panel-pulse short" />
    </div>
  );
}

export function UmbraWorkspace({
  accessToken,
  initialSelection = null,
  language = "es",
  onChangeLanguage,
  onSignOut
}) {
  const t = (key, fallback = "") => translate(language, key, fallback);
  const {
    activeChannel, activeGuild, activeGuildTextChannels, activeGuildVoiceChannels, activeSelection,
    activeSelectionRef,
    appError, attachmentInputRef, booting, cameraStatus, cameraStream, composer, composerAttachments, composerMenuOpen,
    composerPicker, composerRef, currentUserLabel, dialog, directUnreadCount, editingMessage,
    handleAttachmentSelection, handleComposerChange, handleComposerShortcut, handleDeleteMessage,
    handleDialogSubmit, handlePickerInsert, handleProfileUpdate, handleReaction, handleRetryMessages, handleScroll, handleJumpToLatest,
    handleStickerSelect,
    handleJoinDirectCall, joinVoiceChannelById, handleSelectGuildChannel, handleStatusChange, handleSubmitMessage, handleVoiceDeviceChange, handleVoiceLeave,
    headerActionsRef, headerCopy, headerPanel, headerPanelRef, hoveredVoiceChannelId, inboxTab,
    isVoiceChannel, joinedVoiceChannelId, listRef, loadBootstrap, loadingHistoryMessages, loadingMessages, messageMenuFor, messages,
    membersPanelVisible, messageLoadError, profileCard, reactionPickerFor, removeComposerAttachment,
    replyMentionEnabled, replyTarget, setActiveSelection, setBooting, setComposer,
    setComposerAttachments, setComposerMenuOpen, setComposerPicker, setDialog, setEditingMessage,
    setHeaderPanel, setHoveredVoiceChannelId, setInboxTab, setMembersPanelVisible,
    setMessageMenuFor, setProfileCard, setReactionPickerFor, setAppError, setWorkspace,
    setReplyMentionEnabled, setReplyTarget, setSettingsOpen, setTheme, setVoiceMenu, theme, settingsOpen,
    showUiNotice, submittingMessage, toggleHeaderPanel, toggleVoiceMenu, toggleVoiceState, topbarActionsRef,
    screenShareStream, setScreenShareStream,
    typingUsers, uiNotice, updateVoiceSetting, uploadingAttachments, voiceDevices, voiceMenu,
    voiceLocalPeerIdRef, voicePeerMedia, voicePresencePeers, voicePresenceUsers, voiceSessions, voiceState, voiceUserIds, voiceInputLevel, voiceInputSpeaking, voiceInputStatus, workspace,
    updateComposerAttachment,
    cycleVoiceDevice, getSelectedDeviceLabel, selectedVoiceDevices
  } = useUmbraWorkspaceCore({ accessToken, initialSelection, onSignOut });
  const openingDmRequestsRef = useRef(new Map());
  const screenShareSessionRef = useRef(null);
  const statusResetTimeoutRef = useRef(null);
  const [currentUserMenuAnchorRect, setCurrentUserMenuAnchorRect] = useState(null);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [settingsView, setSettingsView] = useState({
    initialEditorOpen: false,
    initialTab: "security"
  });
  const [screenShareStatus, setScreenShareStatus] = useState({
    audioAvailable: false,
    error: "",
    kind: "window",
    label: "",
    quality: SCREEN_SHARE_QUALITY_PRESETS["720p30"],
    ready: false,
    sourceId: ""
  });
  const [screenSharePicker, setScreenSharePicker] = useState({
    loading: false,
    open: false,
    quality: "720p30",
    selectedSourceId: "",
    shareAudio: true,
    sources: [],
    tab: "applications"
  });
  const {
    appShellRef,
    desktopShellRef,
    dmMenuPrefs,
    fullProfile,
    guildMenuPrefs,
    inviteModalState,
    isResizingMembersPanel,
    leaveGuildTarget,
    leavingGuild,
    membersPanelWidth,
    membersResizeCleanupRef,
    membersResizeRef,
    serverFolders,
    serverSettingsGuildId,
    setDmMenuPrefs,
    setFullProfile,
    setGuildMenuPrefs,
    setInviteModalState,
    setIsResizingMembersPanel,
    setLeaveGuildTarget,
    setLeavingGuild,
    setMembersPanelWidth,
    setServerFolders,
    setServerSettingsGuildId,
    setVoiceParticipantMenu,
    setVoiceParticipantPrefs,
    setVoiceInputPanel,
    setVoiceOutputPanel,
    viewportWidth,
    voiceParticipantMenu,
    voiceParticipantPrefs,
    voiceInputPanel,
    voiceOutputPanel
  } = useWorkspaceShellState({
    currentUserId: workspace?.current_user?.id || "",
    guilds: workspace?.guilds
  });

  const {
    acceptIncomingCall,
    incomingCall,
    rejectIncomingCall
  } = useWorkspaceDesktopNotifications({
    accessToken,
    dmMenuPrefs,
    guildMenuPrefs,
    joinVoiceChannelById,
    joinedVoiceChannelId,
    language,
    showUiNotice,
    voiceSessions,
    workspace
  });

  const currentUser = workspace?.current_user || null;
  const currentUserId = currentUser?.id || "";
  const currentUserProfile = useMemo(
    () =>
      currentUser
        ? buildWorkspaceProfileCardData({
            activeChannel,
            activeGuild,
            targetUser: currentUser,
            workspace
          })
        : null,
    [activeChannel, activeGuild, currentUser, workspace]
  );
  const isDirectConversation = activeSelection?.kind === "dm";
  const isGroupDirectConversation = isDirectConversation && activeChannel?.type === "group_dm";
  const isCallableDirectConversation =
    isDirectConversation && ["dm", "group_dm"].includes(activeChannel?.type || "");
  const isSingleDirectMessagePanel =
    membersPanelVisible && isDirectConversation && activeChannel?.type === "dm";
  const resolvedMembersPanelWidth = isSingleDirectMessagePanel ? membersPanelWidth : 292;
  const resolvedMembersPanelMinWidth = isSingleDirectMessagePanel ? 320 : 292;
  const minimumNavigatorWidth = 272;
  const minimumChatStageWidth = isSingleDirectMessagePanel ? 540 : 500;
  const serverRailWidth = 88;
  const effectiveNavigatorVisible =
    viewportWidth >= serverRailWidth + minimumNavigatorWidth + minimumChatStageWidth;
  const requiredViewportWidth =
    serverRailWidth +
    (effectiveNavigatorVisible ? minimumNavigatorWidth : 0) +
    resolvedMembersPanelWidth +
    (isSingleDirectMessagePanel ? 10 : 0) +
    minimumChatStageWidth;
  const effectiveMembersPanelVisible =
    membersPanelVisible && viewportWidth >= requiredViewportWidth;
  const serverSettingsGuild =
    workspace?.guilds.find((guild) => guild.id === serverSettingsGuildId) || null;
  const inviteTargetGuild =
    workspace?.guilds.find((guild) => guild.id === inviteModalState.guildId) || null;
  const shellGridTemplateColumns = useMemo(() => {
    const columns = [`${serverRailWidth}px`];

    if (effectiveNavigatorVisible) {
      columns.push("272px");
    }

    columns.push("minmax(0, 1fr)");

    if (effectiveMembersPanelVisible) {
      if (isSingleDirectMessagePanel) {
        columns.push("10px");
      }

      columns.push(`${resolvedMembersPanelWidth}px`);
    }

    return columns.join(" ");
  }, [
    effectiveMembersPanelVisible,
    effectiveNavigatorVisible,
    isSingleDirectMessagePanel,
    resolvedMembersPanelWidth,
    serverRailWidth
  ]);

  useEffect(() => {
    setVoiceParticipantMenu(null);
  }, [activeChannel?.id, joinedVoiceChannelId, setVoiceParticipantMenu]);

  useEffect(
    () => () => {
      if (membersResizeCleanupRef.current) {
        membersResizeCleanupRef.current();
        membersResizeCleanupRef.current = null;
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (statusResetTimeoutRef.current) {
        window.clearTimeout(statusResetTimeoutRef.current);
        statusResetTimeoutRef.current = null;
      }
    },
    []
  );

  function buildProfileCardData(targetUser, displayNameOverride = null) {
    return buildWorkspaceProfileCardData({
      activeChannel,
      activeGuild,
      displayNameOverride,
      targetUser,
      workspace
    });
  }

  useEffect(() => {
    if (!workspace) {
      return;
    }

    if (profileCard?.profile?.id) {
      const refreshedCardProfile = buildWorkspaceProfileCardData({
        activeChannel,
        activeGuild,
        displayNameOverride: profileCard.profile.displayName,
        targetUser: { id: profileCard.profile.id },
        workspace
      });

      if (refreshedCardProfile) {
        setProfileCard((previous) =>
          previous?.profile?.id === refreshedCardProfile.id
            ? {
                ...previous,
                profile: refreshedCardProfile
              }
            : previous
        );
      }
    }

    if (fullProfile?.id) {
      const refreshedFullProfile = buildWorkspaceProfileCardData({
        activeChannel,
        activeGuild,
        displayNameOverride: fullProfile.displayName,
        targetUser: { id: fullProfile.id },
        workspace
      });

      if (refreshedFullProfile) {
        setFullProfile((previous) =>
          previous?.id === refreshedFullProfile.id ? refreshedFullProfile : previous
        );
      }
    }
  }, [
    activeChannel,
    activeGuild,
    fullProfile?.displayName,
    fullProfile?.id,
    profileCard?.profile?.displayName,
    profileCard?.profile?.id,
    setFullProfile,
    setProfileCard,
    workspace
  ]);

  function openSettingsDialog(preset = {}) {
    setCurrentUserMenuAnchorRect(null);
    setProfileCard(null);
    setVoiceParticipantMenu(null);
    setSettingsView({
      initialEditorOpen: Boolean(preset.initialEditorOpen),
      initialTab: preset.initialTab || "security"
    });
    setSettingsOpen(true);
  }

  function openCurrentUserMenu(event) {
    if (!currentUser?.id) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard(null);
    setVoiceParticipantMenu(null);
    setCurrentUserMenuAnchorRect({
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top
    });
  }

  function openAccountManager() {
    setCurrentUserMenuAnchorRect(null);
    setAccountManagerOpen(true);
  }

  async function handleCurrentUserStatusChange(status, durationMs = null) {
    if (statusResetTimeoutRef.current) {
      window.clearTimeout(statusResetTimeoutRef.current);
      statusResetTimeoutRef.current = null;
    }

    await handleStatusChange(status);

    if (durationMs) {
      statusResetTimeoutRef.current = window.setTimeout(() => {
        handleStatusChange("online").catch(() => {});
        statusResetTimeoutRef.current = null;
      }, durationMs);
    }
  }

  async function handleCurrentUserExit() {
    setCurrentUserMenuAnchorRect(null);
    setAccountManagerOpen(false);
    await onSignOut?.();
  }

  async function handleCopyCurrentUserId() {
    if (!currentUserId) {
      showUiNotice("No hay ID visible para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(currentUserId));
      showUiNotice("ID del usuario copiado.");
    } catch {
      showUiNotice("No se pudo copiar el ID del usuario.");
    }
  }

  async function handleCopyProfileId(profile) {
    if (!profile?.id) {
      showUiNotice("No hay ID visible para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(profile.id));
      showUiNotice("ID del usuario copiado.");
    } catch {
      showUiNotice("No se pudo copiar el ID del usuario.");
    }
  }

  function getVoiceParticipantPref(userId) {
    const current = voiceParticipantPrefs?.[userId] || {};
    const volume = Number(current.volume);

    return {
      muted: Boolean(current.muted),
      videoHidden: Boolean(current.videoHidden),
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(200, Math.round(volume))) : 100
    };
  }

  function updateVoiceParticipantPref(userId, nextValues) {
    if (!userId) {
      return;
    }

    setVoiceParticipantPrefs((previous) => {
      const current = previous?.[userId] || {};
      const nextPref = {
        ...current,
        ...nextValues
      };
      const nextVolume = Number(nextPref.volume);
      nextPref.volume = Number.isFinite(nextVolume)
        ? Math.max(0, Math.min(200, Math.round(nextVolume)))
        : 100;

      return {
        ...previous,
        [userId]: nextPref
      };
    });
  }

  function handleToggleVoiceParticipantMuted(userId) {
    const current = getVoiceParticipantPref(userId);
    updateVoiceParticipantPref(userId, {
      muted: !current.muted
    });
  }

  function handleToggleVoiceParticipantVideo(userId) {
    const current = getVoiceParticipantPref(userId);
    updateVoiceParticipantPref(userId, {
      videoHidden: !current.videoHidden
    });
  }

  function handleUpdateVoiceParticipantVolume(userId, value) {
    updateVoiceParticipantPref(userId, {
      volume: value
    });
  }

  function handleStartMembersResize(event) {
    if (!effectiveMembersPanelVisible || !isSingleDirectMessagePanel) {
      return;
    }

    if (membersResizeCleanupRef.current) {
      membersResizeCleanupRef.current();
      membersResizeCleanupRef.current = null;
    }

    const rightEdge = appShellRef.current?.getBoundingClientRect().right || window.innerWidth;
    membersResizeRef.current = { rightEdge };
    setIsResizingMembersPanel(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const handleMove = (moveEvent) => {
      if (!membersResizeRef.current) {
        return;
      }

      const edge = membersResizeRef.current.rightEdge || window.innerWidth;
      const nextWidth = Math.round(edge - moveEvent.clientX);
      setMembersPanelWidth(Math.max(320, Math.min(460, nextWidth)));
    };
    const handleStop = () => {
      membersResizeRef.current = null;
      setIsResizingMembersPanel(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove, true);
      window.removeEventListener("mouseup", handleStop, true);
      window.removeEventListener("blur", handleStop);
      window.removeEventListener("mouseleave", handleStop);
      membersResizeCleanupRef.current = null;
    };
    membersResizeCleanupRef.current = handleStop;
    window.addEventListener("mousemove", handleMove, true);
    window.addEventListener("mouseup", handleStop, true);
    window.addEventListener("blur", handleStop);
    window.addEventListener("mouseleave", handleStop);
    event.preventDefault();
  }

  function openProfileCard(event, targetUser, displayNameOverride = null) {
    const resolved = buildProfileCardData(targetUser, displayNameOverride);
    if (!resolved) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard({
      anchorRect: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      },
      profile: resolved
    });
  }

  function openVoiceParticipantMenu(event, targetUser) {
    const resolved = buildProfileCardData(
      targetUser,
      targetUser?.display_name || targetUser?.displayName || targetUser?.username
    );
    if (!targetUser?.id || !resolved) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard(null);
    setVoiceParticipantMenu({
      currentUserId,
      position: {
        anchorRect: {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top
        },
        x: event.clientX + 10,
        y: event.clientY + 6
      },
      profile: resolved,
      user: targetUser
    });
  }

  function openFullProfile(targetUser, displayNameOverride = null) {
    const resolved = buildProfileCardData(targetUser, displayNameOverride);
    if (!resolved) {
      return;
    }

    setFullProfile(resolved);
  }
  const {
    ensureDirectDmChannel,
    handleAcceptFriendRequest,
    handleBlockUser,
    handleCancelFriendRequest,
    handleInboxItemAction,
    handleOpenDmFromCard,
    handleRemoveFriend,
    handleReportUser,
    handleSendDmFromCard,
    handleSendFriendRequest
  } = createWorkspaceSocialActions({
    activeGuild,
    activeSelection,
    currentUserId,
    loadBootstrap,
    openingDmRequestsRef,
    setActiveSelection,
    setAppError,
    setFullProfile,
    setHeaderPanel,
    setProfileCard,
    setSettingsOpen,
    showUiNotice,
    workspace
  });

  const friendUsers = useMemo(
    () =>
      (workspace?.friends || [])
        .filter((user) => user.id !== currentUserId)
        .sort((a, b) => {
          const aStatus = isVisibleStatus(a.status) ? 0 : 1;
          const bStatus = isVisibleStatus(b.status) ? 0 : 1;
          if (aStatus !== bStatus) {
            return aStatus - bStatus;
          }

          return String(a.username || "").localeCompare(String(b.username || ""), "es");
        }),
    [currentUserId, workspace?.friends]
  );
  const activeNowUsers = useMemo(
    () => friendUsers.filter((user) => isVisibleStatus(user.status)).slice(0, 3),
    [friendUsers]
  );
  const blockedUsers = workspace?.blocked_users || [];
  const pendingFriendRequestsReceived = workspace?.friend_requests_received || [];
  const pendingFriendRequestsSent = workspace?.friend_requests_sent || [];
  const desktopTitle = activeGuild?.name || activeChannel?.display_name || activeChannel?.name || "Umbra";
  const inboxItems = useMemo(
    () => ({
      for_you: friendUsers.slice(0, 4).map((user, index) => ({
        id: `for-you-${user.id}`,
        actionLabel: "Enviar mensaje",
        tab: "for_you",
        meta: [`11 d`, `17 d`, `1 mes`, `2 mes`][index] || "Hace poco",
        text: `${user.display_name || user.username} ha aceptado tu solicitud de amistad.`,
        user
      })),
      unread: (workspace?.dms || [])
        .filter((dm) => dm.unread_count)
        .slice(0, 4)
        .map((dm) => {
          const user =
            dm.participants.find((participant) => participant.id !== currentUserId) || null;

          return {
            actionLabel: "Abrir chat",
            channelId: dm.id,
            id: `unread-${dm.id}`,
            meta: dm.unread_count === 1 ? "1 no leido" : `${dm.unread_count} no leidos`,
            tab: "unread",
            text: `${dm.display_name} tiene actividad pendiente para ti.`,
            user
          };
        }),
      mentions: activeGuild
        ? [
            {
              actionLabel: "Ver canal",
              channelId: activeSelection.channelId,
              id: `mention-${activeGuild.id}`,
              meta: activeChannel?.name ? `#${activeChannel.name}` : "Canal actual",
              tab: "mentions",
              text: `Actividad reciente en ${activeGuild.name} puede requerir tu atencion.`,
              user: currentUser
            }
          ]
        : []
    }),
    [
      activeChannel?.name,
      activeGuild,
      activeSelection.channelId,
      friendUsers,
      currentUser,
      currentUserId,
      workspace?.dms
    ]
  );
  const inboxCount = inboxItems.unread.length + inboxItems.mentions.length;
  const currentInboxItems = inboxItems[inboxTab] || [];
  const availableUsersById = useMemo(
    () => Object.fromEntries((workspace?.available_users || []).map((user) => [user.id, user])),
    [workspace?.available_users]
  );
  const voiceUsers = useMemo(
    () =>
      voiceUserIds
        .map((userId) => {
          if (currentUserId === userId) {
            return currentUser;
          }

          if (isDirectConversation) {
            return (
              activeChannel?.participants?.find((participant) => participant.id === userId) ||
              availableUsersById[userId] ||
              null
            );
          }

          return (
            activeGuild?.members.find((member) => member.id === userId) ||
            availableUsersById[userId] ||
            null
          );
        })
        .filter(Boolean),
    [
      activeChannel?.participants,
      activeGuild?.members,
      availableUsersById,
      currentUser,
      currentUserId,
      isDirectConversation,
      voiceUserIds
    ]
  );
  const joinedVoiceChannel =
    (workspace?.guilds || [])
      .flatMap((guild) => guild.channels)
      .find((channel) => channel.id === joinedVoiceChannelId) || null;
  const voiceUsersByChannel = useMemo(
    () => {
      const guildMembersById = new Map(
        (activeGuild?.members || []).map((member) => [member.id, member])
      );

      return Object.fromEntries(
        activeGuildVoiceChannels.map((channel) => {
          const layeredUserIds = [
            ...(voiceSessions[channel.id] || []),
            ...(joinedVoiceChannelId === channel.id && currentUserId ? [currentUserId] : []),
            ...(activeChannel?.id === channel.id ? voiceUserIds : [])
          ];
          const seenUserIds = new Set();
          const resolvedUsers = layeredUserIds
            .filter(Boolean)
            .map((userId) => {
              if (seenUserIds.has(userId)) {
                return null;
              }

              seenUserIds.add(userId);

              const resolvedUser =
                userId === currentUserId
                  ? currentUser
                  : guildMembersById.get(userId) || availableUsersById[userId] || null;

              if (resolvedUser) {
                return {
                  ...resolvedUser,
                  is_voice_fallback: false,
                  is_voice_self: userId === currentUserId
                };
              }

              return {
                id: userId,
                username: `Usuario ${String(userId).slice(0, 4)}`,
                display_name: userId === currentUserId ? currentUserLabel : "Usuario conectado",
                avatar_hue: 215,
                avatar_url: "",
                custom_status: "",
                is_voice_fallback: true,
                is_voice_self: userId === currentUserId,
                role_color: null,
                status: "online"
              };
            })
            .filter(Boolean);

          return [channel.id, resolvedUsers];
        })
      );
    },
    [
      activeChannel?.id,
      activeGuild?.members,
      activeGuildVoiceChannels,
      availableUsersById,
      currentUser,
      currentUserId,
      currentUserLabel,
      joinedVoiceChannelId,
      voiceSessions,
      voiceUserIds
    ]
  );
  const memberList =
    activeSelection.kind === "guild"
      ? isVoiceChannel
        ? voiceUsers
        : activeGuild?.members || []
      : activeChannel?.participants || [];
  const memberGroups = useMemo(() => buildMemberGroups(memberList), [memberList]);
  const directMessageProfile = useMemo(() => {
    if (activeSelection.kind !== "dm" || activeChannel?.type !== "dm" || !workspace?.current_user?.id) {
      return null;
    }

    const other =
      activeChannel.participants?.find((participant) => participant.id !== workspace.current_user.id) ||
      null;

    if (!other) {
      return null;
    }

    return buildProfileCardData(other, other.display_name || other.username || "Umbra user");
  }, [activeChannel, activeSelection.kind, workspace, activeGuild]);
  const isDirectCallActive =
    isCallableDirectConversation && joinedVoiceChannelId === activeChannel?.id;
  const screenShareQualityOptions = useMemo(
    () => [
      {
        description: t(
          "voice.share.quality.sdCopy",
          "Video mas fluido para chats rapidos y equipos mas modestos."
        ),
        id: "720p30",
        label: "720P 30 FPS",
        shortLabel: "SD"
      },
      {
        description: t(
          "voice.share.quality.hdCopy",
          "Mas detalle visual para apps, codigo y ventanas pequenas."
        ),
        id: "1080p30",
        label: "1080P 30 FPS",
        shortLabel: "HD"
      }
    ],
    [language]
  );
  const screenShareQualityLabel =
    screenShareQualityOptions.find((option) => option.id === voiceState.screenShareQuality)?.label ||
    SCREEN_SHARE_QUALITY_PRESETS["720p30"].label;
  const voiceStageParticipants = useMemo(
    () => {
      const activeChannelId = activeChannel?.id || "";
      const channelParticipantsById = new Map(
        (activeChannel?.participants || []).map((participant) => [participant.id, participant])
      );
      const guildMembersById = new Map(
        (activeGuild?.members || []).map((member) => [member.id, member])
      );
      const localPeerId = voiceLocalPeerIdRef.current;
      const sessionEntries = activeChannelId
        ? Object.values(voicePresencePeers || {}).filter((entry) => entry.channelId === activeChannelId)
        : [];

      if (
        activeChannelId &&
        joinedVoiceChannelId === activeChannelId &&
        currentUserId &&
        !sessionEntries.some((entry) => entry.peerId === localPeerId)
      ) {
        sessionEntries.push({
          cameraEnabled: Boolean(voiceState.cameraEnabled),
          channelId: activeChannelId,
          deafened: Boolean(voiceState.deafen),
          micMuted: Boolean(voiceState.micMuted),
          peerId: localPeerId,
          screenShareEnabled: Boolean(voiceState.screenShareEnabled),
          speaking: !voiceState.micMuted && !voiceState.deafen && voiceInputSpeaking,
          userId: currentUserId,
          videoMode: voiceState.screenShareEnabled
            ? "screen"
            : voiceState.cameraEnabled
              ? "camera"
              : ""
        });
      }

      return sessionEntries.map((peerEntry) => {
        const userId = peerEntry.userId || "";
        const resolvedUser =
          userId === currentUserId
            ? currentUser
            : isDirectConversation
              ? channelParticipantsById.get(userId) || availableUsersById[userId] || null
              : guildMembersById.get(userId) || availableUsersById[userId] || null;

        const user = resolvedUser || {
          avatar_hue: 215,
          avatar_url: "",
          custom_status: "",
          display_name:
            userId === currentUserId ? currentUserLabel : `Sesion ${String(peerEntry.peerId || "").slice(0, 6)}`,
          id: userId || peerEntry.peerId,
          role_color: null,
          status: "online",
          username: userId === currentUserId ? currentUserLabel : "Usuario conectado"
        };
        const userPrefs = getVoiceParticipantPref(user.id);
        const isCurrentVoicePeer = peerEntry.peerId === localPeerId;
        const remoteMedia = !isCurrentVoicePeer ? voicePeerMedia?.[peerEntry.peerId] || null : null;
        const remotePresence = !isCurrentVoicePeer ? voicePresenceUsers?.[userId] || null : null;
        const remoteCameraStream =
          remoteMedia?.cameraStream && !userPrefs.videoHidden ? remoteMedia.cameraStream : null;
        const remoteScreenShareStream =
          remoteMedia?.screenShareStream && !userPrefs.videoHidden
            ? remoteMedia.screenShareStream
            : null;

        return {
          ...user,
          hiddenVideoLabel: t("voice.participant.hiddenVideo", "Video oculto"),
          isCurrentUser: isCurrentVoicePeer,
          isCameraOn: isCurrentVoicePeer
            ? voiceState.cameraEnabled
            : Boolean(remoteCameraStream || peerEntry.cameraEnabled || remotePresence?.cameraEnabled),
          isDeafened: isCurrentVoicePeer
            ? Boolean(voiceState.deafen)
            : Boolean(remoteMedia?.deafened || peerEntry.deafened || remotePresence?.deafened),
          isLocallyMuted: userPrefs.muted,
          isMuted: isCurrentVoicePeer
            ? Boolean(voiceState.micMuted)
            : Boolean(remoteMedia?.micMuted || peerEntry.micMuted || remotePresence?.micMuted),
          isSpeaking:
            isCurrentVoicePeer
              ? !voiceState.micMuted && !voiceState.deafen && voiceInputSpeaking
              : Boolean(remoteMedia?.speaking || peerEntry.speaking || remotePresence?.speaking),
          isStreaming: isCurrentVoicePeer
            ? voiceState.screenShareEnabled
            : Boolean(
                remoteScreenShareStream ||
                  peerEntry.screenShareEnabled ||
                  remotePresence?.screenShareEnabled
              ),
          isVideoHiddenForMe: userPrefs.videoHidden,
          localCameraStream:
            isCurrentVoicePeer
              ? userPrefs.videoHidden
                ? null
                : cameraStream
              : remoteCameraStream,
          localScreenShareStream:
            isCurrentVoicePeer
              ? userPrefs.videoHidden
                ? null
                : screenShareStream
              : remoteScreenShareStream,
          mediaMuted: isCurrentVoicePeer ? true : userPrefs.muted,
          mediaVolume: Math.max(0, Math.min(1, userPrefs.volume / 100)),
          screenShareQualityLabel:
            isCurrentVoicePeer ? screenShareQualityLabel : "720P 30 FPS",
          stageStyle: buildVoiceStageTone(user.avatar_hue || 220),
          voicePeerId: peerEntry.peerId,
          volumeForMe: userPrefs.volume
        };
      });
    },
    [
      activeChannel?.id,
      activeChannel?.participants,
      activeGuild?.members,
      availableUsersById,
      cameraStream,
      currentUser,
      currentUserId,
      currentUserLabel,
      isDirectConversation,
      joinedVoiceChannelId,
      screenShareQualityLabel,
      screenShareStream,
      t,
      voiceInputSpeaking,
      voiceLocalPeerIdRef,
      voicePeerMedia,
      voicePresencePeers,
      voicePresenceUsers,
      voiceParticipantPrefs,
      voiceState.cameraEnabled,
      voiceState.deafen,
      voiceState.micMuted,
      voiceState.screenShareEnabled,
      voiceUsers
    ]
  );
  const headerSearchPlaceholder = activeGuild
    ? `Buscar ${activeGuild.name}`
    : `Buscar ${activeChannel?.display_name || "Umbra"}`;
  const inputMeterBars = Array.from({ length: 18 }, (_, index) => index);
  const activeInputBars = Math.max(
    0,
    Math.round((voiceInputLevel / 100) * inputMeterBars.length)
  );
  const voiceSuppressionLabel =
    voiceInputStatus.engine === "speex"
      ? t("voice.input.label.speex", "Speex DSP activo")
      : voiceInputStatus.engine === "native"
        ? t("voice.input.label.native", "Filtro nativo del navegador")
        : t("voice.input.label.off", "Sin supresion adicional");
  const voiceSuppressionCopy = voiceInputStatus.error
    ? voiceInputStatus.error
    : voiceState.noiseSuppression
      ? voiceInputStatus.ready
        ? t(
            "voice.input.copy.activeReady",
            "Umbra esta limpiando el ruido del microfono en tiempo real."
          )
        : t(
            "voice.input.copy.activePending",
            "Activa la supresion y Umbra preparara el microfono cuando abras voz."
          )
      : t(
          "voice.input.copy.off",
          "La entrada llega sin filtro adicional para mantener la voz natural."
        );
  const voiceSuppressionAmountLabel = `${voiceState.noiseSuppressionAmount}%`;
  const voiceProfileOptions = [
    {
      description: t(
        "voice.profile.isolation.description",
        "Filtro fuerte para reducir fondo y ruido continuo."
      ),
      id: "isolation",
      label: t("voice.profile.isolation.label", "Aislamiento de voz"),
      settings: {
        inputProfile: "isolation",
        inputVolume: 76,
        noiseSuppressionAmount: 78,
        noiseSuppression: true
      }
    },
    {
      description: t(
        "voice.profile.studio.description",
        "Entrada mas natural para microfonos limpios o estudio."
      ),
      id: "studio",
      label: t("voice.profile.studio.label", "Estudio"),
      settings: {
        inputProfile: "studio",
        inputVolume: 82,
        noiseSuppressionAmount: 18,
        noiseSuppression: false
      }
    },
    {
      description: t(
        "voice.profile.custom.description",
        "Control manual del volumen y del filtro."
      ),
      id: "custom",
      label: t("voice.profile.custom.label", "Personalizar"),
      settings: {
        inputProfile: "custom"
      }
    }
  ];
  const activeInputProfile = voiceState.inputProfile || "custom";
  const activeInputProfileLabel =
    voiceProfileOptions.find((option) => option.id === activeInputProfile)?.label ||
    t("voice.profile.custom.label", "Personalizar");

  useEffect(() => {
    if (voiceMenu !== "input" && voiceInputPanel) {
      setVoiceInputPanel(null);
    }
  }, [voiceInputPanel, voiceMenu]);

  useEffect(() => {
    if (voiceMenu !== "output" && voiceOutputPanel) {
      setVoiceOutputPanel(null);
    }
  }, [voiceOutputPanel, voiceMenu]);

  useEffect(
    () => () => {
      if (screenShareSessionRef.current) {
        screenShareSessionRef.current.destroy().catch(() => {});
        screenShareSessionRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    setScreenSharePicker((previous) => ({
      ...previous,
      quality: voiceState.screenShareQuality,
      shareAudio: voiceState.shareAudio
    }));
  }, [voiceState.screenShareQuality, voiceState.shareAudio]);

  useEffect(() => {
    if (joinedVoiceChannelId === activeChannel?.id) {
      return;
    }

    if (!screenShareSessionRef.current) {
      return;
    }

    screenShareSessionRef.current.destroy().catch(() => {});
    screenShareSessionRef.current = null;
    setScreenShareStream(null);
    setScreenShareStatus({
      audioAvailable: false,
      error: "",
      kind: "window",
      label: "",
      quality: SCREEN_SHARE_QUALITY_PRESETS[voiceState.screenShareQuality] || SCREEN_SHARE_QUALITY_PRESETS["720p30"],
      ready: false,
      sourceId: ""
    });
    if (voiceState.screenShareEnabled) {
      updateVoiceSetting("screenShareEnabled", false);
    }
  }, [activeChannel?.id, joinedVoiceChannelId, voiceState.screenShareEnabled, voiceState.screenShareQuality]);

  useEffect(() => {
    if (!voiceMenu && !voiceInputPanel && !voiceOutputPanel && !screenSharePicker.open) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        target?.closest?.(".screen-share-picker") ||
        target?.closest?.(".voice-control-menu") ||
        target?.closest?.(".dock-split-control") ||
        target?.closest?.(".voice-stage-menu-shell")
      ) {
        return;
      }

      setVoiceInputPanel(null);
      setVoiceOutputPanel(null);
      setScreenSharePicker((previous) =>
        previous.open
          ? {
              ...previous,
              open: false
            }
          : previous
      );
      if (voiceMenu) {
        toggleVoiceMenu(voiceMenu);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [screenSharePicker.open, toggleVoiceMenu, voiceInputPanel, voiceMenu, voiceOutputPanel]);

  function handleApplyVoiceProfile(profile) {
    updateVoiceSetting("inputProfile", profile.id);
    if (typeof profile.settings.noiseSuppression === "boolean") {
      updateVoiceSetting("noiseSuppression", profile.settings.noiseSuppression);
    }
    if (typeof profile.settings.noiseSuppressionAmount === "number") {
      updateVoiceSetting("noiseSuppressionAmount", profile.settings.noiseSuppressionAmount);
    }
    if (typeof profile.settings.inputVolume === "number") {
      updateVoiceSetting("inputVolume", profile.settings.inputVolume);
    }
    setVoiceInputPanel(null);
    showUiNotice(`${t("voice.input.profile", "Perfil de entrada")}: ${profile.label}.`);
  }

  function getDesktopBridge() {
    if (typeof window === "undefined") {
      return null;
    }

    return window.umbraDesktop || null;
  }

  function buildFallbackScreenShareSources() {
    return [
      {
        id: "native-window",
        kind: "window",
        name: t("voice.share.nativeWindow", "Elegir aplicacion o ventana"),
        thumbnailDataUrl: ""
      },
      {
        id: "native-screen",
        kind: "screen",
        name: t("voice.share.nativeScreen", "Elegir pantalla completa"),
        thumbnailDataUrl: ""
      }
    ];
  }

  async function loadScreenShareSources(nextTab = "applications") {
    const desktopBridge = getDesktopBridge();
    const fallbackSources = buildFallbackScreenShareSources();
    const fallbackSource =
      nextTab === "screen"
        ? fallbackSources.find((source) => source.kind === "screen")
        : fallbackSources.find((source) => source.kind === "window");

    if (!desktopBridge?.listDisplaySources) {
      setScreenSharePicker((previous) => ({
        ...previous,
        loading: false,
        open: true,
        selectedSourceId: previous.selectedSourceId || fallbackSource?.id || "native-window",
        shareAudio: voiceState.shareAudio,
        sources: fallbackSources,
        tab: nextTab
      }));

      return fallbackSources;
    }

    setScreenSharePicker((previous) => ({
      ...previous,
      loading: true,
      open: true,
      tab: nextTab
    }));

    try {
      const sources = await desktopBridge.listDisplaySources();
      const fallbackSource =
        sources.find((source) => source.kind === (nextTab === "screen" ? "screen" : "window")) ||
        sources[0] ||
        null;

      setScreenSharePicker((previous) => ({
        ...previous,
        loading: false,
        open: true,
        selectedSourceId: previous.selectedSourceId || fallbackSource?.id || "",
        shareAudio: voiceState.shareAudio,
        sources,
        tab: nextTab
      }));

      return sources;
    } catch (error) {
      const handlerMissing = /No handler registered/i.test(String(error?.message || ""));
      if (handlerMissing) {
        setScreenSharePicker((previous) => ({
          ...previous,
          loading: false,
          open: true,
          selectedSourceId: previous.selectedSourceId || fallbackSource?.id || "native-window",
          shareAudio: voiceState.shareAudio,
          sources: fallbackSources,
          tab: nextTab
        }));
        showUiNotice(
          t(
            "voice.share.fallbackNotice",
            "Umbra usara el selector nativo de pantalla en esta sesion."
          )
        );
        return fallbackSources;
      }

      setScreenSharePicker((previous) => ({
        ...previous,
        loading: false,
        open: false
      }));
      setScreenShareStatus((previous) => ({
        ...previous,
        error: error.message || "No se pudieron listar las fuentes para compartir."
      }));
      showUiNotice(error.message || "No se pudieron listar las fuentes para compartir.");
      return [];
    }
  }

  async function stopScreenShare({ notify = true } = {}) {
    if (screenShareSessionRef.current) {
      await screenShareSessionRef.current.destroy().catch(() => {});
      screenShareSessionRef.current = null;
    }

    setScreenShareStream(null);
    setScreenShareStatus({
      audioAvailable: false,
      error: "",
      kind: "window",
      label: "",
      quality: SCREEN_SHARE_QUALITY_PRESETS[voiceState.screenShareQuality] || SCREEN_SHARE_QUALITY_PRESETS["720p30"],
      ready: false,
      sourceId: ""
    });
    setScreenSharePicker((previous) => ({
      ...previous,
      open: false
    }));
    if (voiceState.screenShareEnabled) {
      updateVoiceSetting("screenShareEnabled", false);
    }
    if (notify) {
      showUiNotice("Transmision detenida.");
    }
  }

  async function handleLeaveVoiceSession() {
    await stopScreenShare({ notify: false });
    handleVoiceLeave();
  }

  async function startScreenShareSession({
    label = "",
    sourceId = "",
    sourceKind = "window"
  } = {}) {
    if (joinedVoiceChannelId !== activeChannel?.id) {
      showUiNotice("Unete primero a la llamada para compartir pantalla.");
      return;
    }

    if (screenShareSessionRef.current) {
      await screenShareSessionRef.current.destroy().catch(() => {});
      screenShareSessionRef.current = null;
    }

    const resolvedSourceId = String(sourceId || "").startsWith("native-") ? "" : sourceId;

    try {
      const session = await createVoiceScreenShareSession({
        includeAudio: voiceState.shareAudio,
        label,
        onEnded: () => {
          stopScreenShare({ notify: true }).catch(() => {});
        },
        quality: voiceState.screenShareQuality,
        sourceId: resolvedSourceId,
        sourceKind
      });

      screenShareSessionRef.current = session;
      session.setEnabled(true);
      setScreenShareStream(session.stream);
      setScreenShareStatus({
        audioAvailable: session.audioAvailable,
        error: "",
        kind: session.kind,
        label: session.label,
        quality: session.quality,
        ready: true,
        sourceId: sourceId === "native-display" ? "native-display" : session.sourceId
      });
      setScreenSharePicker((previous) => ({
        ...previous,
        open: false
      }));
      updateVoiceSetting("screenShareEnabled", true);
      setVoiceMenu(null);
      if (voiceState.shareAudio && !session.audioAvailable) {
        showUiNotice("La pantalla se esta compartiendo sin audio del sistema.");
      } else {
        showUiNotice(`Transmitiendo ${session.label}.`);
      }
    } catch (error) {
      setScreenShareStream(null);
      setScreenShareStatus({
        audioAvailable: false,
        error: error.message || "No se pudo iniciar la transmision.",
        kind: sourceKind,
        label,
        quality:
          SCREEN_SHARE_QUALITY_PRESETS[voiceState.screenShareQuality] ||
          SCREEN_SHARE_QUALITY_PRESETS["720p30"],
        ready: false,
        sourceId
      });
      updateVoiceSetting("screenShareEnabled", false);
      showUiNotice(error.message || "No se pudo iniciar la transmision.");
    }
  }

  async function openScreenSharePicker(tab = "applications") {
    setScreenSharePicker((previous) => ({
      ...previous,
      loading: true,
      open: true,
      quality: voiceState.screenShareQuality,
      shareAudio: voiceState.shareAudio,
      tab
    }));

    await loadScreenShareSources(tab);
  }

  async function handleToggleScreenShare() {
    if (voiceState.screenShareEnabled) {
      await stopScreenShare();
      return;
    }

    await openScreenSharePicker("applications");
  }

  async function handleConfirmScreenShare() {
    const selectedSource =
      screenSharePicker.sources.find((source) => source.id === screenSharePicker.selectedSourceId) ||
      null;

    if (!selectedSource) {
      showUiNotice("Elige una ventana o pantalla para continuar.");
      return;
    }

    await startScreenShareSession({
      label: selectedSource.name,
      sourceId: selectedSource.id,
      sourceKind: selectedSource.kind
    });
  }

  async function handleChangeScreenShareQuality(nextQuality) {
    updateVoiceSetting("screenShareQuality", nextQuality);

    if (!screenShareSessionRef.current || !voiceState.screenShareEnabled) {
      return;
    }

    await startScreenShareSession({
      label: screenShareStatus.label,
      sourceId: screenShareStatus.sourceId,
      sourceKind: screenShareStatus.kind
    });
  }

  async function handleToggleShareAudio() {
    const nextShareAudio = !voiceState.shareAudio;
    updateVoiceSetting("shareAudio", nextShareAudio);
    setScreenSharePicker((previous) => ({
      ...previous,
      shareAudio: nextShareAudio
    }));

    if (!screenShareSessionRef.current || !voiceState.screenShareEnabled) {
      return;
    }

    await startScreenShareSession({
      label: screenShareStatus.label,
      sourceId: screenShareStatus.sourceId,
      sourceKind: screenShareStatus.kind
    });
  }

  const inputMenuNode = (
    <WorkspaceInputMenu
      activeInputBars={activeInputBars}
      activeInputProfile={activeInputProfile}
      activeInputProfileLabel={activeInputProfileLabel}
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      handleApplyVoiceProfile={handleApplyVoiceProfile}
      handleVoiceDeviceChange={handleVoiceDeviceChange}
      inputMeterBars={inputMeterBars}
      language={language}
      selectedVoiceDevices={selectedVoiceDevices}
      setSettingsOpen={setSettingsOpen}
      setVoiceInputPanel={setVoiceInputPanel}
      setVoiceMenu={setVoiceMenu}
      showUiNotice={showUiNotice}
      toggleVoiceState={toggleVoiceState}
      updateVoiceSetting={updateVoiceSetting}
      voiceDevices={voiceDevices}
      voiceInputPanel={voiceInputPanel}
      voiceInputStatus={voiceInputStatus}
      voiceProfileOptions={voiceProfileOptions}
      voiceSuppressionAmountLabel={voiceSuppressionAmountLabel}
      voiceState={voiceState}
      voiceSuppressionCopy={voiceSuppressionCopy}
      voiceSuppressionLabel={voiceSuppressionLabel}
    />
  );
  const cameraMenuNode = (
    <WorkspaceCameraMenu
      cameraStatus={cameraStatus}
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      language={language}
      setSettingsOpen={setSettingsOpen}
      toggleVoiceState={toggleVoiceState}
      voiceState={voiceState}
    />
  );
  const outputMenuNode = (
    <WorkspaceOutputMenu
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      handleVoiceDeviceChange={handleVoiceDeviceChange}
      language={language}
      selectedVoiceDevices={selectedVoiceDevices}
      setSettingsOpen={setSettingsOpen}
      setVoiceOutputPanel={setVoiceOutputPanel}
      showUiNotice={showUiNotice}
      updateVoiceSetting={updateVoiceSetting}
      voiceDevices={voiceDevices}
      voiceOutputPanel={voiceOutputPanel}
      voiceState={voiceState}
    />
  );
  const shareMenuNode = (
    <WorkspaceShareMenu
      onChangeScreenShareQuality={handleChangeScreenShareQuality}
      onChangeShareSource={() => openScreenSharePicker(screenShareStatus.kind === "screen" ? "screen" : "applications")}
      onToggleScreenShare={handleToggleScreenShare}
      onToggleShareAudio={handleToggleShareAudio}
      language={language}
      screenSharePickerOpen={screenSharePicker.open}
      screenShareQualityLabel={screenShareQualityLabel}
      shareQualityOptions={screenShareQualityOptions}
      showUiNotice={showUiNotice}
      voiceShareStatus={screenShareStatus}
      voiceState={voiceState}
    />
  );
  const chatHeaderPanelNode = (
    <ChatHeaderPanel headerPanel={headerPanel} headerPanelRef={headerPanelRef} />
  );

  if (booting) {
    return <div className="boot-screen">Despertando Umbra...</div>;
  }

  if (!workspace) {
    return (
      <div className="boot-screen">
        <div className="boot-failure-card">
          <strong>No se pudo cargar tu espacio en Umbra.</strong>
          <p>{appError || "Hubo un problema al conectar la app con tu backend local."}</p>
          <button
            className="primary-button"
            onClick={() => {
              setBooting(true);
              setAppError("");
              loadBootstrap();
            }}
            type="button"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }


  function handleStartReply(message) {
    setReplyTarget(message);
    setReplyMentionEnabled(true);
    setEditingMessage(null);
    setComposerAttachments([]);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }

  function handleEditMessage(message) {
    setEditingMessage(message);
    setReplyTarget(null);
    setReplyMentionEnabled(true);
    setComposerAttachments([]);
    setComposer(message.content);
  }

  function openDialog(type, meta = {}) {
    setDialog({
      ...meta,
      type,
      currentUserId: workspace.current_user.id
    });
  }

  function handleSelectHome() {
    setActiveSelection({
      channelId: null,
      guildId: null,
      kind: "home"
    });
  }

  function handleSelectGuild(guild) {
    const defaultChannel =
      guild.channels.find((channel) => !channel.is_voice && !channel.is_category) ||
      guild.channels.find((channel) => channel.is_voice) ||
      guild.channels[0] ||
      null;

    setActiveSelection({
      channelId: defaultChannel?.id || null,
      guildId: guild.id,
      kind: "guild"
    });
  }

  async function handleCopyGuildId(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(guildOverride.id);
      showUiNotice("ID del servidor copiado.");
    } catch {
      showUiNotice(`ID del servidor: ${guildOverride.id}`);
    }
  }

  async function openInviteModal(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    setInviteModalState({
      error: "",
      guildId: guildOverride.id,
      invite: null,
      loading: true,
      open: true
    });

    try {
      const payload = await api.createGuildInvite({
        guildId: guildOverride.id
      });
      setInviteModalState({
        error: "",
        guildId: guildOverride.id,
        invite: payload.invite,
        loading: false,
        open: true
      });
      setAppError("");
    } catch (error) {
      setInviteModalState({
        error: error.message,
        guildId: guildOverride.id,
        invite: null,
        loading: false,
        open: true
      });
      setAppError(error.message);
    }
  }

  async function handleSendInviteToFriend(friend, inviteCode) {
    if (!friend?.id || !inviteCode) {
      return;
    }

    try {
      const channel = await ensureDirectDmChannel(
        {
          ...friend,
          displayName: friend.display_name || friend.username || "Umbra user",
          isCurrentUser: friend.id === currentUserId,
          username: friend.username || "umbra_user"
        },
        { loadConversation: false }
      );

      if (!channel?.id) {
        return;
      }

      await api.createMessage({
        attachments: [],
        channelId: channel.id,
        content: buildInviteUrl(inviteCode) || inviteCode,
        replyMentionUserId: null,
        replyTo: null
      });

      await loadBootstrap(activeSelectionRef.current);
      showUiNotice(`Invitacion enviada a ${friend.display_name || friend.username}.`);
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  async function handleAcceptInviteFromMessage(inviteCode) {
    if (!inviteCode) {
      return null;
    }

    const payload = await api.acceptInvite(inviteCode);
    await loadBootstrap(
      {
        channelId: payload?.channel_id || null,
        guildId: payload?.guild_id || null,
        kind: payload?.guild_id ? "guild" : "dm"
      },
      {
        selectionMode: "target"
      }
    );
    setAppError("");
    showUiNotice(payload?.already_joined ? "Abriendo servidor..." : "Te uniste al servidor.");
    return payload;
  }

  async function handleSaveGuildProfile(nextGuild) {
    if (!serverSettingsGuild?.id) {
      return;
    }

    try {
      const {
        bannerFile,
        bannerImageUrl: requestedBannerImageUrl,
        clearBanner,
        clearIcon,
        iconFile,
        iconUrl: requestedIconUrl,
        ...guildPatch
      } = nextGuild;

      let iconUrl = requestedIconUrl;
      let bannerImageUrl = requestedBannerImageUrl;

      if (iconFile) {
        const uploadPayload = await api.uploadAttachments([iconFile]);
        iconUrl = uploadPayload.attachments?.[0]?.url;

        if (!iconUrl) {
          throw new Error("No se pudo subir el icono del servidor.");
        }
      } else if (clearIcon) {
        iconUrl = "";
      }

      if (bannerFile) {
        const uploadPayload = await api.uploadAttachments([bannerFile]);
        bannerImageUrl = uploadPayload.attachments?.[0]?.url;

        if (!bannerImageUrl) {
          throw new Error("No se pudo subir el cartel del servidor.");
        }
      } else if (clearBanner) {
        bannerImageUrl = "";
      }

      await api.updateGuild({
        ...guildPatch,
        bannerImageUrl,
        guildId: serverSettingsGuild.id,
        iconUrl
      });

      await loadBootstrap(activeSelectionRef.current);
      setAppError("");
      showUiNotice("Servidor actualizado.");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  async function handleKickGuildMember({ guildId, member }) {
    if (!guildId || !member?.id) {
      return;
    }

    try {
      await api.kickGuildMember({
        guildId,
        userId: member.id
      });
      await loadBootstrap(activeSelectionRef.current);
      setAppError("");
      showUiNotice(`${member.display_name || member.username} fue expulsado.`);
    } catch (error) {
      throw error;
    }
  }

  async function handleBanGuildMember({ expiresAt = null, guildId, member }) {
    if (!guildId || !member?.id) {
      return;
    }

    try {
      await api.banGuildMember({
        expiresAt,
        guildId,
        userId: member.id
      });
      await loadBootstrap(activeSelectionRef.current);
      setAppError("");
      showUiNotice(`${member.display_name || member.username} fue baneado.`);
    } catch (error) {
      throw error;
    }
  }

  async function handleMoveGuildChannel({
    channelId,
    guildId,
    parentId = null,
    placement = "after",
    relativeToChannelId = null
  }) {
    if (!channelId || !guildId) {
      return;
    }

    try {
      await api.moveChannel({
        channelId,
        guildId,
        parentId,
        placement,
        relativeToChannelId
      });
      await loadBootstrap(activeSelectionRef.current);
      setAppError("");
    } catch (error) {
      setAppError(error.message);
      showUiNotice(error.message);
    }
  }

  async function handleMoveGuild({
    guildId,
    placement = "after",
    relativeToGuildId = null,
    nextFolderAction = null
  }) {
    if (!guildId) {
      return;
    }

    const previousWorkspace = workspace;
    const previousFolders = serverFolders;
    const currentGuilds = workspace?.guilds || [];
    const optimisticGuilds = reorderGuildList(currentGuilds, {
      guildId,
      placement,
      relativeToGuildId
    });

    setWorkspace((previous) => {
      if (!previous?.guilds?.length) {
        return previous;
      }

      return {
        ...previous,
        guilds: optimisticGuilds
      };
    });

    if (nextFolderAction) {
      setServerFolders((previous) =>
        applyServerFolderAction(previous, optimisticGuilds, {
          guildId,
          nextFolderAction
        })
      );
    }

    try {
      await api.moveGuild({
        guildId,
        placement,
        relativeToGuildId
      });
      setAppError("");
    } catch (error) {
      setWorkspace(previousWorkspace);
      setServerFolders(previousFolders);
      await loadBootstrap(activeSelectionRef.current);
      setAppError(error.message);
      showUiNotice(error.message);
    }
  }

  function handleToggleServerFolder(folderId) {
    setServerFolders((previous) => toggleServerFolder(previous, folderId));
  }

  function handleUpdateGuildMenuPref(guildId, key, value = null) {
    if (!guildId || !key) {
      return;
    }

    setGuildMenuPrefs((previous) => {
      const current = previous[guildId] || {
        hideMutedChannels: false,
        notificationLevel: "mentions",
        showAllChannels: true
      };

      return {
        ...previous,
        [guildId]: {
          ...current,
          [key]: value === null ? !current[key] : value
        }
      };
    });
  }

  function handleToggleDmMenuPref(dmOrId) {
    const dmId = typeof dmOrId === "string" ? dmOrId : dmOrId?.id;
    if (!dmId) {
      return;
    }

    setDmMenuPrefs((previous) => {
      const current = previous[dmId] || {
        muted: false
      };

      return {
        ...previous,
        [dmId]: {
          ...current,
          muted: !current.muted
        }
      };
    });
  }

  async function handleMarkDmRead(dm) {
    if (!dm?.id) {
      return;
    }

    try {
      await api.markRead({
        channelId: dm.id,
        lastReadMessageId: dm.last_message_id || null
      });
      await loadBootstrap(activeSelectionRef.current);
      showUiNotice(`Todo al dia en ${dm.display_name || "la conversacion"}.`);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleCopyDmId(dm) {
    if (!dm?.id) {
      showUiNotice("No hay ID visible para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(dm.id));
      showUiNotice("ID del chat copiado.");
    } catch {
      showUiNotice("No se pudo copiar el ID del chat.");
    }
  }

  async function handleCloseDm(dm) {
    if (!dm?.id) {
      return;
    }

    const previousSelection = activeSelectionRef.current;
    const nextVisibleDms = (workspace?.dms || []).filter((item) => item.id !== dm.id);
    const fallbackDm = nextVisibleDms[0] || null;
    const nextSelection =
      previousSelection.kind === "dm" && previousSelection.channelId === dm.id
        ? fallbackDm
          ? {
              channelId: fallbackDm.id,
              guildId: null,
              kind: "dm"
            }
          : {
              channelId: null,
              guildId: null,
              kind: "home"
            }
        : previousSelection;

    setWorkspace((previous) =>
      previous
        ? {
            ...previous,
            dms: (previous.dms || []).filter((item) => item.id !== dm.id)
          }
        : previous
    );

    if (nextSelection !== previousSelection) {
      setActiveSelection(nextSelection);
    }

    try {
      await api.setDmVisibility({
        channelId: dm.id,
        hidden: true
      });
      await loadBootstrap(nextSelection, {
        selectionMode: "target"
      });
      showUiNotice(`Se oculto ${dm.display_name || "el DM"} del lateral.`);
    } catch (error) {
      await loadBootstrap(previousSelection, {
        selectionMode: "target"
      });
      setAppError(error.message);
    }
  }

  async function handleMarkGuildRead(guild) {
    if (!guild?.id) {
      return;
    }

    try {
      await api.markGuildRead({
        guildId: guild.id
      });
      await loadBootstrap(
        activeSelection.guildId === guild.id
          ? activeSelection
          : {
              channelId: activeSelection.channelId,
              guildId: activeSelection.guildId,
              kind: activeSelection.kind
            }
      );
      showUiNotice(`Todo al dia en ${guild.name}.`);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleLeaveGuild(guild) {
    if (!guild?.id) {
      return;
    }
    setLeaveGuildTarget(guild);
  }

  async function confirmLeaveGuild() {
    if (!leaveGuildTarget?.id) {
      return;
    }

    setLeavingGuild(true);

    try {
      await api.leaveGuild({
        guildId: leaveGuildTarget.id
      });

      const fallbackGuild =
        workspace.guilds.find((item) => item.id !== leaveGuildTarget.id) || null;
      const fallbackChannel =
        fallbackGuild?.channels.find((channel) => !channel.is_voice && !channel.is_category) ||
        fallbackGuild?.channels.find((channel) => channel.is_voice) ||
        fallbackGuild?.channels[0] ||
        null;
      const fallbackSelection = fallbackGuild
        ? {
            channelId: fallbackChannel?.id || null,
            guildId: fallbackGuild.id,
            kind: "guild"
          }
        : {
            channelId: null,
            guildId: null,
            kind: "home"
          };

      setServerSettingsGuildId((previous) => (previous === leaveGuildTarget.id ? null : previous));
      setInviteModalState((previous) =>
        previous.guildId === leaveGuildTarget.id
          ? {
              error: "",
              guildId: null,
              invite: null,
              loading: false,
              open: false
            }
          : previous
      );
      setLeaveGuildTarget(null);
      await loadBootstrap(fallbackSelection, {
        selectionMode: "target"
      });
      showUiNotice(`Saliste de ${leaveGuildTarget.name}.`);
    } catch (error) {
      setAppError(error.message);
    } finally {
      setLeavingGuild(false);
    }
  }

  function handleOpenGuildSettings(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    setServerSettingsGuildId(guildOverride.id);
  }

  function handleOpenGuildPrivacy(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    showUiNotice(`Ajustes de privacidad de ${guildOverride.name} en camino.`);
  }

  function handleSelectDirectLink(id, notice = null, channelId = null) {
    if (id === "home") {
      handleSelectHome();
      return;
    }

    if (id === "requests") {
      setActiveSelection({
        channelId: null,
        guildId: null,
        kind: "requests"
      });
      return;
    }

    if (id === "dm" && channelId) {
      setActiveSelection({
        channelId,
        guildId: null,
        kind: "dm"
      });
      return;
    }

    if (notice) {
      showUiNotice(notice);
    }
  }

  return (
    <div className={`desktop-shell theme-${theme}`} ref={desktopShellRef}>
      <DesktopTopbar
        activeGuild={activeGuild}
        currentInboxItems={currentInboxItems}
        desktopTitle={desktopTitle}
        headerPanel={headerPanel}
        headerPanelRef={headerPanelRef}
        inboxCount={inboxCount}
        inboxTab={inboxTab}
        onHandleInboxItemAction={handleInboxItemAction}
        onInboxTabChange={setInboxTab}
        onShowNotice={showUiNotice}
        onToggleHeaderPanel={toggleHeaderPanel}
        topbarActionsRef={topbarActionsRef}
      />

      <div
        className={[
          "app-shell",
          effectiveMembersPanelVisible ? "" : "members-collapsed",
          effectiveNavigatorVisible ? "" : "navigator-collapsed"
        ]
          .filter(Boolean)
          .join(" ")}
        ref={appShellRef}
        style={{
          gridTemplateColumns: shellGridTemplateColumns,
          "--navigator-panel-width": effectiveNavigatorVisible ? "272px" : "0px",
          "--members-panel-min-width": `${resolvedMembersPanelMinWidth}px`,
          "--members-panel-resizer-width":
            effectiveMembersPanelVisible && isSingleDirectMessagePanel ? "10px" : "0px",
          "--members-panel-width": `${resolvedMembersPanelWidth}px`
        }}
      >
        {effectiveNavigatorVisible ? (
          <WorkspaceNavigation
            activeGuild={activeGuild}
            activeGuildTextChannels={activeGuildTextChannels}
            activeGuildVoiceChannels={activeGuildVoiceChannels}
            activeSelection={activeSelection}
            currentUserLabel={currentUserLabel}
            directUnreadCount={directUnreadCount}
            dmMenuPrefs={dmMenuPrefs}
            guildMenuPrefs={guildMenuPrefs}
            hoveredVoiceChannelId={hoveredVoiceChannelId}
            inputMenuNode={voiceMenu === "input" && !isVoiceChannel ? inputMenuNode : null}
            language={language}
            outputMenuNode={voiceMenu === "output" && !isVoiceChannel ? outputMenuNode : null}
            isVoiceChannel={isVoiceChannel}
            joinedVoiceChannel={joinedVoiceChannel}
            joinedVoiceChannelId={joinedVoiceChannelId}
            onHandleVoiceLeave={handleLeaveVoiceSession}
            onOpenDialog={openDialog}
            onOpenGuildPrivacy={handleOpenGuildPrivacy}
            onOpenGuildSettings={handleOpenGuildSettings}
            onOpenFullProfile={openFullProfile}
            onOpenInviteModal={openInviteModal}
            onOpenProfileCard={openProfileCard}
            onOpenSelfMenu={openCurrentUserMenu}
            onOpenSettings={() => openSettingsDialog()}
            onCloseDm={handleCloseDm}
            onCopyDmId={handleCopyDmId}
            onCopyGuildId={handleCopyGuildId}
            onBlockUser={handleBlockUser}
            onLeaveGuild={handleLeaveGuild}
            onMarkDmRead={handleMarkDmRead}
            onMarkGuildRead={handleMarkGuildRead}
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onRemoveFriend={handleRemoveFriend}
            onMoveGuild={handleMoveGuild}
            onMoveGuildChannel={handleMoveGuildChannel}
            onReportUser={handleReportUser}
            onSelectDirectLink={handleSelectDirectLink}
            onSelectGuild={handleSelectGuild}
            onSelectGuildChannel={handleSelectGuildChannel}
            onSelectHome={handleSelectHome}
            onSendFriendRequest={handleSendFriendRequest}
            onSetHoveredVoiceChannelId={setHoveredVoiceChannelId}
            onShowNotice={showUiNotice}
            onToggleDmMenuPref={handleToggleDmMenuPref}
            onToggleGuildMenuPref={handleUpdateGuildMenuPref}
            onToggleServerFolder={handleToggleServerFolder}
            onUpdateGuildNotificationLevel={(guildId, level) =>
              handleUpdateGuildMenuPref(guildId, "notificationLevel", level)
            }
            serverFolders={serverFolders}
            onToggleVoiceMenu={toggleVoiceMenu}
            onToggleVoiceState={toggleVoiceState}
            voiceMenu={voiceMenu}
            voiceSessions={voiceSessions}
            voiceState={voiceState}
            voiceUsersByChannel={voiceUsersByChannel}
            workspace={workspace}
          />
        ) : null}

        <main className="chat-stage">
          {activeSelection.kind === "home" ? (
            <>
              <Suspense fallback={<WorkspacePanelFallback />}>
                <FriendsHome
                  availableUsers={workspace.available_users}
                  blockedUsers={blockedUsers}
                  friends={friendUsers}
                  onAcceptFriendRequest={handleAcceptFriendRequest}
                  onCancelFriendRequest={handleCancelFriendRequest}
                  onOpenDm={handleOpenDmFromCard}
                  onOpenProfileCard={openProfileCard}
                  onRemoveFriend={handleRemoveFriend}
                  onSendFriendRequest={handleSendFriendRequest}
                  pendingReceived={pendingFriendRequestsReceived}
                  pendingSent={pendingFriendRequestsSent}
                />
              </Suspense>
            </>
          ) : activeSelection.kind === "requests" ? (
            <>
              <Suspense fallback={<WorkspacePanelFallback />}>
                <MessageRequestsHome
                  onOpenDm={handleOpenDmFromCard}
                  onShowNotice={showUiNotice}
                  requests={workspace.message_requests || []}
                  spam={workspace.message_request_spam || []}
                />
              </Suspense>
            </>
          ) : (
            <>
              <ChatHeader
                activeChannel={activeChannel}
                directMessageProfile={directMessageProfile}
                headerActionsRef={headerActionsRef}
                headerPanel={headerPanel}
                headerPanelNode={chatHeaderPanelNode}
                headerSearchPlaceholder={headerSearchPlaceholder}
                isDirectConversation={isDirectConversation}
                isDirectGroupConversation={isGroupDirectConversation}
                membersPanelVisible={effectiveMembersPanelVisible}
                onAddFriend={handleSendFriendRequest}
                onOpenDialog={openDialog}
                onStartDirectCall={() => handleJoinDirectCall()}
                onStartDirectVideoCall={() => handleJoinDirectCall({ enableCamera: true })}
                onShowNotice={showUiNotice}
                onToggleHeaderPanel={toggleHeaderPanel}
                onToggleMembersPanel={() => setMembersPanelVisible((previous) => !previous)}
                subtitle={activeGuild?.name || headerCopy.eyebrow}
                title={headerCopy.title}
              />

              {isVoiceChannel || isDirectCallActive ? (
                <Suspense fallback={<WorkspacePanelFallback />}>
                  <VoiceRoomStage
                    activeChannel={activeChannel}
                    cameraStatus={cameraStatus}
                    cameraMenuNode={voiceMenu === "camera" ? cameraMenuNode : null}
                    inputMenuNode={voiceMenu === "input" ? inputMenuNode : null}
                    isDirectCall={isDirectConversation}
                    joinedVoiceChannelId={joinedVoiceChannelId}
                    onHandleVoiceLeave={handleLeaveVoiceSession}
                    onJoinVoiceChannel={() =>
                      isVoiceChannel
                        ? handleSelectGuildChannel(activeChannel)
                        : handleJoinDirectCall()
                    }
                    onOpenParticipantMenu={openVoiceParticipantMenu}
                    onOpenProfileCard={openProfileCard}
                    onToggleScreenShare={handleToggleScreenShare}
                    onShowNotice={showUiNotice}
                    onToggleVoiceMenu={toggleVoiceMenu}
                    onToggleVoiceState={toggleVoiceState}
                    screenShareQualityLabel={screenShareQualityLabel}
                    shareMenuNode={voiceMenu === "share" ? shareMenuNode : null}
                    voiceMenu={voiceMenu}
                    voiceInputLevel={voiceInputLevel}
                    voiceStageParticipants={voiceStageParticipants}
                    voiceState={voiceState}
                    workspace={workspace}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<WorkspacePanelFallback />}>
                  <MessageStage
                    activeChannel={activeChannel}
                    activeSelectionKind={activeSelection.kind}
                    attachmentInputRef={attachmentInputRef}
                    composer={composer}
                    composerAttachments={composerAttachments}
                    composerMenuOpen={composerMenuOpen}
                    composerPicker={composerPicker}
                    composerRef={composerRef}
                    directMessageProfile={directMessageProfile}
                    editingMessage={editingMessage}
                    handleAttachmentSelection={handleAttachmentSelection}
                    handleComposerChange={handleComposerChange}
                    handleComposerShortcut={handleComposerShortcut}
                    handleDeleteMessage={handleDeleteMessage}
                    handlePickerInsert={handlePickerInsert}
                    handleStickerSelect={handleStickerSelect}
                    handleReaction={handleReaction}
                    handleScroll={handleScroll}
                    handleSubmitMessage={handleSubmitMessage}
                    guildStickers={activeGuild?.stickers || []}
                    language={language}
                    listRef={listRef}
                    loadingHistoryMessages={loadingHistoryMessages}
                    loadingMessages={loadingMessages}
                    messageLoadError={messageLoadError}
                    messageMenuFor={messageMenuFor}
                    messages={messages}
                    onAcceptFriendRequest={handleAcceptFriendRequest}
                    onAddFriend={handleSendFriendRequest}
                    onBlockUser={handleBlockUser}
                    onCancelEdit={() => {
                      setEditingMessage(null);
                      setComposerAttachments([]);
                      setComposer("");
                    }}
                    onCancelFriendRequest={handleCancelFriendRequest}
                    onCancelReply={() => {
                      setReplyTarget(null);
                      setReplyMentionEnabled(true);
                    }}
                    onEditMessage={handleEditMessage}
                    onJumpToLatest={handleJumpToLatest}
                    onAcceptInvite={handleAcceptInviteFromMessage}
                    onRetryMessages={handleRetryMessages}
                    onSetComposerMenuOpen={setComposerMenuOpen}
                    onSetComposerPicker={setComposerPicker}
                    onSetMessageMenuFor={setMessageMenuFor}
                    onSetReactionPickerFor={setReactionPickerFor}
                    onReportUser={handleReportUser}
                    onShowNotice={showUiNotice}
                    onStartReply={handleStartReply}
                    onToggleReplyMention={() => setReplyMentionEnabled((previous) => !previous)}
                    openProfileCard={openProfileCard}
                    reactionPickerFor={reactionPickerFor}
                    removeComposerAttachment={removeComposerAttachment}
                    replyMentionEnabled={replyMentionEnabled}
                    replyTarget={replyTarget}
                      showUiNotice={showUiNotice}
                      submittingMessage={submittingMessage}
                      typingUsers={typingUsers}
                      uiNotice={uiNotice}
                      updateComposerAttachment={updateComposerAttachment}
                      uploadingAttachments={uploadingAttachments}
                      availableUsersById={availableUsersById}
                      workspace={workspace}
                  />
                </Suspense>
              )}
            </>
          )}
        </main>

        {effectiveMembersPanelVisible ? (
          <>
            {isSingleDirectMessagePanel ? (
              <button
                aria-label="Ajustar ancho del panel"
                className={`members-panel-divider ${isResizingMembersPanel ? "is-dragging" : ""}`.trim()}
                onMouseDown={handleStartMembersResize}
                type="button"
              />
            ) : null}
            <MembersPanel
              activeChannel={activeChannel}
              activeNowUsers={activeNowUsers}
              activeSelectionKind={activeSelection.kind}
              directMessageProfile={directMessageProfile}
              memberGroups={memberGroups}
              memberList={memberList}
              onAcceptFriendRequest={handleAcceptFriendRequest}
              onAddFriend={handleSendFriendRequest}
              onBlockUser={handleBlockUser}
              onCancelFriendRequest={handleCancelFriendRequest}
              onCopyProfileId={handleCopyProfileId}
              onOpenDm={handleOpenDmFromCard}
              onOpenFullProfile={openFullProfile}
              onOpenProfileCard={openProfileCard}
              onRemoveFriend={handleRemoveFriend}
              onReportUser={handleReportUser}
              onShowNotice={showUiNotice}
              workspace={workspace}
            />
          </>
        ) : null}

        {settingsOpen ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <SettingsModal
              dmCount={workspace.dms.length}
              guildCount={workspace.guilds.length}
              initialEditorOpen={settingsView.initialEditorOpen}
              initialTab={settingsView.initialTab}
              language={language}
              onClose={() => setSettingsOpen(false)}
              onChangeLanguage={onChangeLanguage}
              onSignOut={onSignOut}
              onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
              onUpdateProfile={handleProfileUpdate}
              theme={theme}
              user={workspace.current_user}
            />
          </Suspense>
        ) : null}

        {currentUserMenuAnchorRect && currentUserProfile ? (
          <CurrentUserMenu
            anchorRect={currentUserMenuAnchorRect}
            language={language}
            onChangeStatus={handleCurrentUserStatusChange}
            onClose={() => setCurrentUserMenuAnchorRect(null)}
            onCopyId={handleCopyCurrentUserId}
            onEditProfile={() =>
              openSettingsDialog({
                initialEditorOpen: true,
                initialTab: "security"
              })
            }
            onManageAccounts={() =>
              openAccountManager()
            }
            onSignOut={handleCurrentUserExit}
            onSwitchAccount={openAccountManager}
            profile={currentUserProfile}
          />
        ) : null}

        {accountManagerOpen && currentUser ? (
          <AccountManagerModal
            language={language}
            onAddAccount={handleCurrentUserExit}
            onClose={() => setAccountManagerOpen(false)}
            onSignOut={handleCurrentUserExit}
            user={currentUser}
          />
        ) : null}

        {incomingCall ? (
          <div
            aria-live="assertive"
            className="incoming-call-inline-card floating-surface"
            role="dialog"
          >
            <small className="incoming-call-inline-eyebrow">Llamada entrante</small>
            <strong>{incomingCall.callerName || incomingCall.channelName || "Umbra"}</strong>
            <p>{incomingCall.body || "Hay una llamada esperandote."}</p>
            <div className="incoming-call-inline-actions">
              <button
                className="ghost-button danger"
                onClick={() => rejectIncomingCall(incomingCall.channelId)}
                type="button"
              >
                Rechazar
              </button>
              <button
                className="primary-button"
                onClick={() => acceptIncomingCall(incomingCall.channelId)}
                type="button"
              >
                Aceptar
              </button>
            </div>
          </div>
        ) : null}

        {profileCard ? (
          <UserProfileCard
            card={profileCard}
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onAddFriend={handleSendFriendRequest}
            onBlockUser={handleBlockUser}
            onCancelFriendRequest={handleCancelFriendRequest}
            onChangeStatus={handleStatusChange}
            onClose={() => setProfileCard(null)}
            onOpenDm={handleOpenDmFromCard}
            onRemoveFriend={handleRemoveFriend}
            onReportUser={handleReportUser}
            onSendDm={handleSendDmFromCard}
            onOpenSelfProfile={() => {
              setProfileCard(null);
              openSettingsDialog({
                initialEditorOpen: true,
                initialTab: "security"
              });
            }}
            onShowNotice={showUiNotice}
          />
        ) : null}

        {fullProfile ? (
          <UserProfileModal
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onClose={() => setFullProfile(null)}
            onAddFriend={handleSendFriendRequest}
            onBlockUser={handleBlockUser}
            onCancelFriendRequest={handleCancelFriendRequest}
            onOpenDm={async (profile) => {
              await handleOpenDmFromCard(profile);
              setFullProfile(null);
            }}
            onRemoveFriend={handleRemoveFriend}
            onReportUser={handleReportUser}
            onShowNotice={showUiNotice}
            profile={fullProfile}
          />
        ) : null}

        {voiceParticipantMenu ? (
          <Suspense fallback={null}>
            <VoiceParticipantContextMenu
              language={language}
              menu={voiceParticipantMenu}
              onClose={() => setVoiceParticipantMenu(null)}
              onCopyId={handleCopyProfileId}
              onOpenProfile={(profile) => setFullProfile(profile)}
              onOpenSelfProfile={() => {
                setVoiceParticipantMenu(null);
                openSettingsDialog({
                  initialEditorOpen: true,
                  initialTab: "security"
                });
              }}
              onSendMessage={handleOpenDmFromCard}
              onToggleMuted={handleToggleVoiceParticipantMuted}
              onToggleVideoHidden={handleToggleVoiceParticipantVideo}
              onUpdateVolume={handleUpdateVoiceParticipantVolume}
              prefs={getVoiceParticipantPref(voiceParticipantMenu.user.id)}
            />
          </Suspense>
        ) : null}

        {dialog ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <Dialog
              dialog={dialog}
              guildChannels={activeGuild?.channels || []}
              onClose={() => setDialog(null)}
              onSubmit={handleDialogSubmit}
              users={dialog.type === "dm_group" ? friendUsers : workspace.available_users}
            />
          </Suspense>
        ) : null}

        {serverSettingsGuild ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <ServerSettingsModal
              currentUserId={currentUserId}
              guild={serverSettingsGuild}
              language={language}
              memberCount={serverSettingsGuild.members?.length || 0}
              onBanMember={handleBanGuildMember}
              onClose={() => setServerSettingsGuildId(null)}
              onKickMember={handleKickGuildMember}
              onSave={handleSaveGuildProfile}
            />
          </Suspense>
        ) : null}

        {inviteModalState.open && inviteTargetGuild ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <InviteServerModal
              channelName={activeChannel?.name || activeChannel?.display_name || ""}
              error={inviteModalState.error}
              friends={friendUsers}
              guildName={inviteTargetGuild.name}
              invite={inviteModalState.invite}
              loading={inviteModalState.loading}
              onClose={() =>
                setInviteModalState((previous) => ({
                  ...previous,
                  open: false
                }))
              }
              onRefresh={() => openInviteModal(inviteTargetGuild)}
              onSendInviteToFriend={handleSendInviteToFriend}
              onShowNotice={showUiNotice}
            />
          </Suspense>
        ) : null}

        {leaveGuildTarget ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <ConfirmActionModal
              cancelLabel="Cancelar"
              confirmLabel="Abandonar"
              description={`Perderas acceso a ${leaveGuildTarget.name} hasta que alguien vuelva a invitarte.`}
              loading={leavingGuild}
              onClose={() => {
                if (!leavingGuild) {
                  setLeaveGuildTarget(null);
                }
              }}
              onConfirm={confirmLeaveGuild}
              title={`Abandonar ${leaveGuildTarget.name}?`}
            />
          </Suspense>
        ) : null}

        {screenSharePicker.open ? (
          <WorkspaceScreenSharePicker
            language={language}
            loading={screenSharePicker.loading}
            onClose={() =>
              setScreenSharePicker((previous) => ({
                ...previous,
                open: false
              }))
            }
            onConfirm={handleConfirmScreenShare}
            onSelectQuality={handleChangeScreenShareQuality}
            onSelectSource={(sourceId) =>
              setScreenSharePicker((previous) => ({
                ...previous,
                selectedSourceId: sourceId
              }))
            }
            onSelectTab={(tab) => {
              if (tab === "devices") {
                setScreenSharePicker((previous) => ({
                  ...previous,
                  tab
                }));
                return;
              }

              loadScreenShareSources(tab);
            }}
            onToggleShareAudio={handleToggleShareAudio}
            picker={screenSharePicker}
            qualityOptions={screenShareQualityOptions}
          />
        ) : null}

        <WorkspaceTooltipLayer />
      </div>
    </div>
  );
}
