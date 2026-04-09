import React, { Suspense, lazy, useEffect, useMemo, useRef } from "react";

import { api } from "../api.js";
import { UserProfileCard } from "./UserProfileCard.jsx";
import { UserProfileModal } from "./UserProfileModal.jsx";
import { ChatHeaderPanel } from "./workspace/ChatHeaderPanel.jsx";
import { ChatHeader } from "./workspace/ChatHeader.jsx";
import { DesktopTopbar } from "./workspace/DesktopTopbar.jsx";
import { MembersPanel } from "./workspace/MembersPanel.jsx";
import {
  WorkspaceCameraMenu,
  WorkspaceInputMenu,
  WorkspaceOutputMenu,
  WorkspaceShareMenu
} from "./workspace/WorkspaceVoiceMenus.jsx";
import { WorkspaceNavigation } from "./workspace/WorkspaceNavigation.jsx";
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
  const {
    activeChannel, activeGuild, activeGuildTextChannels, activeGuildVoiceChannels, activeSelection,
    appError, attachmentInputRef, booting, cameraStatus, cameraStream, composer, composerAttachments, composerMenuOpen,
    composerPicker, composerRef, currentUserLabel, dialog, directUnreadCount, editingMessage,
    handleAttachmentSelection, handleComposerChange, handleComposerShortcut, handleDeleteMessage,
    handleDialogSubmit, handlePickerInsert, handleProfileUpdate, handleReaction, handleScroll,
    handleStickerSelect,
    handleJoinDirectCall, handleSelectGuildChannel, handleStatusChange, handleSubmitMessage, handleVoiceDeviceChange, handleVoiceLeave,
    headerActionsRef, headerCopy, headerPanel, headerPanelRef, hoveredVoiceChannelId, inboxTab,
    isVoiceChannel, joinedVoiceChannelId, listRef, loadBootstrap, loadingMessages, messageMenuFor, messages,
    membersPanelVisible, profileCard, reactionPickerFor, removeComposerAttachment,
    replyMentionEnabled, replyTarget, setActiveSelection, setBooting, setComposer,
    setComposerAttachments, setComposerMenuOpen, setComposerPicker, setDialog, setEditingMessage,
    setHeaderPanel, setHoveredVoiceChannelId, setInboxTab, setMembersPanelVisible,
    setMessageMenuFor, setProfileCard, setReactionPickerFor, setAppError, setWorkspace,
    setReplyMentionEnabled, setReplyTarget, setSettingsOpen, setTheme, setVoiceMenu, theme, settingsOpen,
    showUiNotice, toggleHeaderPanel, toggleVoiceMenu, toggleVoiceState, topbarActionsRef,
    typingUsers, uiNotice, updateVoiceSetting, uploadingAttachments, voiceDevices, voiceMenu,
    voiceSessions, voiceState, voiceUserIds, voiceInputLevel, voiceInputSpeaking, voiceInputStatus, workspace,
    cycleVoiceDevice, getSelectedDeviceLabel, selectedVoiceDevices
  } = useUmbraWorkspaceCore({ accessToken, initialSelection, onSignOut });
  const openingDmRequestsRef = useRef(new Map());
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
    setVoiceInputPanel,
    setVoiceOutputPanel,
    viewportWidth,
    voiceInputPanel,
    voiceOutputPanel
  } = useWorkspaceShellState({
    currentUserId: workspace?.current_user?.id || "",
    guilds: workspace?.guilds
  });

  const currentUser = workspace?.current_user || null;
  const currentUserId = currentUser?.id || "";
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
  const effectiveNavigatorVisible =
    viewportWidth >= 78 + minimumNavigatorWidth + minimumChatStageWidth;
  const requiredViewportWidth =
    78 +
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
    const columns = ["78px"];

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
    resolvedMembersPanelWidth
  ]);

  useEffect(
    () => () => {
      if (membersResizeCleanupRef.current) {
        membersResizeCleanupRef.current();
        membersResizeCleanupRef.current = null;
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
    () =>
      Object.fromEntries(
        activeGuildVoiceChannels.map((channel) => [
          channel.id,
          (voiceSessions[channel.id] || [])
            .map((userId) => {
              if (currentUserId === userId) {
                return currentUser;
              }

              return (
                activeGuild?.members.find((member) => member.id === userId) ||
                availableUsersById[userId] ||
                null
              );
            })
            .filter(Boolean)
        ])
      ),
    [activeGuild?.members, activeGuildVoiceChannels, availableUsersById, currentUser, currentUserId, voiceSessions]
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
  const voiceStageParticipants = useMemo(
    () =>
      voiceUsers.map((user) => ({
        ...user,
        isStreaming: user.id === currentUserId && voiceState.screenShareEnabled,
        isCameraOn: user.id === currentUserId && voiceState.cameraEnabled,
        localCameraStream: user.id === currentUserId ? cameraStream : null,
        isSpeaking:
          user.id === currentUserId &&
          !voiceState.micMuted &&
          !voiceState.deafen &&
          voiceInputSpeaking,
        stageStyle: buildVoiceStageTone(user.avatar_hue || 220)
      })),
    [
      cameraStream,
      currentUserId,
      voiceInputSpeaking,
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
      ? "Speex DSP activo"
      : voiceInputStatus.engine === "native"
        ? "Filtro nativo del navegador"
        : "Sin supresion adicional";
  const voiceSuppressionCopy = voiceInputStatus.error
    ? voiceInputStatus.error
    : voiceState.noiseSuppression
      ? voiceInputStatus.ready
        ? "Umbra esta limpiando el ruido del microfono en tiempo real."
        : "Activa la supresion y Umbra preparara el microfono cuando abras voz."
      : "La entrada llega sin filtro adicional para mantener la voz natural.";
  const voiceProfileOptions = [
    {
      description: "Filtro fuerte para reducir fondo y ruido continuo.",
      id: "isolation",
      label: "Aislamiento de voz",
      settings: {
        inputProfile: "isolation",
        inputVolume: 76,
        noiseSuppression: true
      }
    },
    {
      description: "Entrada mas natural para microfonos limpios o estudio.",
      id: "studio",
      label: "Estudio",
      settings: {
        inputProfile: "studio",
        inputVolume: 82,
        noiseSuppression: false
      }
    },
    {
      description: "Control manual del volumen y del filtro.",
      id: "custom",
      label: "Personalizar",
      settings: {
        inputProfile: "custom"
      }
    }
  ];
  const activeInputProfile = voiceState.inputProfile || "custom";
  const activeInputProfileLabel =
    voiceProfileOptions.find((option) => option.id === activeInputProfile)?.label || "Personalizar";

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

  useEffect(() => {
    if (!voiceMenu && !voiceInputPanel && !voiceOutputPanel) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        target?.closest?.(".voice-control-menu") ||
        target?.closest?.(".dock-split-control") ||
        target?.closest?.(".voice-stage-menu-shell")
      ) {
        return;
      }

      setVoiceInputPanel(null);
      setVoiceOutputPanel(null);
      if (voiceMenu) {
        toggleVoiceMenu(voiceMenu);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [toggleVoiceMenu, voiceInputPanel, voiceMenu, voiceOutputPanel]);

  function handleApplyVoiceProfile(profile) {
    updateVoiceSetting("inputProfile", profile.id);
    if (typeof profile.settings.noiseSuppression === "boolean") {
      updateVoiceSetting("noiseSuppression", profile.settings.noiseSuppression);
    }
    if (typeof profile.settings.inputVolume === "number") {
      updateVoiceSetting("inputVolume", profile.settings.inputVolume);
    }
    setVoiceInputPanel(null);
    showUiNotice(`Perfil de entrada: ${profile.label}.`);
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
      voiceState={voiceState}
      voiceSuppressionCopy={voiceSuppressionCopy}
      voiceSuppressionLabel={voiceSuppressionLabel}
    />
  );
  const cameraMenuNode = (
    <WorkspaceCameraMenu
      cameraStatus={cameraStatus}
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      setSettingsOpen={setSettingsOpen}
      toggleVoiceState={toggleVoiceState}
      voiceState={voiceState}
    />
  );
  const outputMenuNode = (
    <WorkspaceOutputMenu
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      handleVoiceDeviceChange={handleVoiceDeviceChange}
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
      showUiNotice={showUiNotice}
      toggleVoiceState={toggleVoiceState}
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

      await loadBootstrap(activeSelection);
      setAppError("");
      showUiNotice("Servidor actualizado.");
    } catch (error) {
      setAppError(error.message);
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
      await loadBootstrap(activeSelection);
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
      await loadBootstrap(activeSelection);
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
      await loadBootstrap(activeSelection);
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

    const nextVisibleDms = (workspace?.dms || []).filter((item) => item.id !== dm.id);
    const fallbackDm = nextVisibleDms[0] || null;
    const nextSelection =
      activeSelection.kind === "dm" && activeSelection.channelId === dm.id
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
        : activeSelection;

    setWorkspace((previous) =>
      previous
        ? {
            ...previous,
            dms: (previous.dms || []).filter((item) => item.id !== dm.id)
          }
        : previous
    );

    if (nextSelection !== activeSelection) {
      setActiveSelection(nextSelection);
    }

    try {
      await api.setDmVisibility({
        channelId: dm.id,
        hidden: true
      });
      await loadBootstrap(nextSelection);
      showUiNotice(`Se oculto ${dm.display_name || "el DM"} del lateral.`);
    } catch (error) {
      await loadBootstrap(activeSelection);
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
      await loadBootstrap(fallbackSelection);
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
            onHandleVoiceLeave={handleVoiceLeave}
            onOpenDialog={openDialog}
            onOpenGuildPrivacy={handleOpenGuildPrivacy}
            onOpenGuildSettings={handleOpenGuildSettings}
            onOpenFullProfile={openFullProfile}
            onOpenInviteModal={openInviteModal}
            onOpenProfileCard={openProfileCard}
            onOpenSettings={() => setSettingsOpen(true)}
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
              {appError ? <div className="error-banner">{appError}</div> : null}
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
              {appError ? <div className="error-banner">{appError}</div> : null}
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

              {appError ? <div className="error-banner">{appError}</div> : null}

              {isVoiceChannel || isDirectCallActive ? (
                <Suspense fallback={<WorkspacePanelFallback />}>
                  <VoiceRoomStage
                    activeChannel={activeChannel}
                    cameraStatus={cameraStatus}
                    cameraMenuNode={voiceMenu === "camera" ? cameraMenuNode : null}
                    inputMenuNode={voiceMenu === "input" ? inputMenuNode : null}
                    isDirectCall={isDirectConversation}
                    joinedVoiceChannelId={joinedVoiceChannelId}
                    onHandleVoiceLeave={handleVoiceLeave}
                    onJoinVoiceChannel={() =>
                      isVoiceChannel
                        ? handleSelectGuildChannel(activeChannel)
                        : handleJoinDirectCall()
                    }
                    onOpenProfileCard={openProfileCard}
                    onShowNotice={showUiNotice}
                    onToggleVoiceMenu={toggleVoiceMenu}
                    onToggleVoiceState={toggleVoiceState}
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
                    loadingMessages={loadingMessages}
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
                    typingUsers={typingUsers}
                    uiNotice={uiNotice}
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
              setSettingsOpen(true);
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
              guild={serverSettingsGuild}
              language={language}
              memberCount={serverSettingsGuild.members?.length || 0}
              onClose={() => setServerSettingsGuildId(null)}
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
      </div>
    </div>
  );
}
