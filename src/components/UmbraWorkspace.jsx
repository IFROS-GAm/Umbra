import React, { lazy, useEffect, useMemo, useRef, useState } from "react";

import { translate } from "../i18n.js";
import { ChatHeaderPanel } from "./workspace/ChatHeaderPanel.jsx";
import { DesktopTopbar } from "./workspace/DesktopTopbar.jsx";
import { UmbraBootScreen } from "./shared/UmbraBootScreen.jsx";
import { UmbraWorkspaceOverlays } from "./workspace/UmbraWorkspaceOverlays.jsx";
import { UmbraWorkspaceStage } from "./workspace/UmbraWorkspaceStage.jsx";
import { WorkspaceNavigation } from "./workspace/WorkspaceNavigation.jsx";
import { createWorkspaceNavigationActions } from "./workspace/createWorkspaceNavigationActions.js";
import { buildWorkspaceProfileCardData } from "./workspace/workspaceProfileCard.js";
import { createWorkspaceSocialActions } from "./workspace/workspaceSocialActions.js";
import { useWorkspaceCurrentUserUi } from "./workspace/useWorkspaceCurrentUserUi.js";
import { useWorkspaceDerivedData } from "./workspace/useWorkspaceDerivedData.js";
import { useWorkspaceProfileUi } from "./workspace/useWorkspaceProfileUi.js";
import { useWorkspaceScreenShare } from "./workspace/useWorkspaceScreenShare.js";
import { useWorkspaceVoiceMenus } from "./workspace/useWorkspaceVoiceMenus.jsx";
import { useUmbraWorkspaceCore } from "./workspace/useUmbraWorkspaceCore.js";
import { useWorkspaceDesktopNotifications } from "./workspace/useWorkspaceDesktopNotifications.js";
import { useWorkspaceShellState } from "./workspace/useWorkspaceShellState.js";
import { buildVoiceStageParticipants } from "./workspace/voiceStageParticipants.js";

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
    handleDialogSubmit, handleForwardMessage, handlePickerInsert, handleProfileUpdate, handleReaction, handleRetryMessages, handleScroll, handleJumpToLatest,
    handleStickerSelect,
    handleJoinDirectCall, joinVoiceChannelById, handleSelectGuildChannel, handleStatusChange, handleSubmitMessage, handleTogglePinnedMessage, handleVoiceDeviceChange, handleVoiceLeave,
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
  const {
    appShellRef,
    deleteGuildTarget,
    deletingGuild,
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
    setDeleteGuildTarget,
    setDeletingGuild,
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

  const currentUser = workspace?.current_user || null;
  const currentUserId = currentUser?.id || "";
  const {
    accountManagerOpen,
    currentUserMenuAnchorRect,
    settingsView,
    setAccountManagerOpen,
    setCurrentUserMenuAnchorRect,
    openAccountManager,
    openCurrentUserMenu,
    openSettingsDialog,
    handleCopyCurrentUserId,
    handleCurrentUserExit,
    handleCurrentUserStatusChange
  } = useWorkspaceCurrentUserUi({
    currentUser,
    currentUserId,
    handleStatusChange,
    onSignOut,
    setProfileCard,
    setSettingsOpen,
    setVoiceParticipantMenu,
    showUiNotice
  });
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
  const [directCallLayoutMode, setDirectCallLayoutMode] = useState("chat");
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
  const {
    buildProfileCardData,
    getVoiceParticipantPref,
    handleCopyProfileId,
    handleStartMembersResize,
    handleToggleVoiceParticipantMuted,
    handleToggleVoiceParticipantVideo,
    handleUpdateVoiceParticipantVolume,
    openFullProfile,
    openProfileCard,
    openVoiceParticipantMenu
  } = useWorkspaceProfileUi({
    activeChannel,
    activeGuild,
    appShellRef,
    currentUserId,
    effectiveMembersPanelVisible,
    fullProfile,
    isSingleDirectMessagePanel,
    membersResizeCleanupRef,
    membersResizeRef,
    profileCard,
    setFullProfile,
    setIsResizingMembersPanel,
    setMembersPanelWidth,
    setProfileCard,
    setVoiceParticipantMenu,
    setVoiceParticipantPrefs,
    showUiNotice,
    voiceParticipantPrefs,
    workspace
  });
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
  const {
    confirmDeleteGuild,
    confirmLeaveGuild,
    handleAcceptInviteFromMessage,
    handleBanGuildMember,
    handleCloseDm,
    handleCopyDmId,
    handleCopyGuildId,
    handleDeleteGuild,
    handleEditMessage,
    handleRefreshWorkspace,
    handleKickGuildMember,
    handleLeaveGuild,
    handleMarkDmRead,
    handleMarkGuildRead,
    handleMoveGuild,
    handleMoveGuildChannel,
    handleOpenGuildPrivacy,
    handleOpenGuildSettings,
    handleSaveGuildProfile,
    handleSelectDirectLink,
    handleSelectGuild,
    handleSelectHome,
    handleSendInviteToFriend,
    handleStartReply,
    handleToggleDmMenuPref,
    handleToggleServerFolder,
    handleUpdateGuildMenuPref,
    openDialog,
    openInviteModal
  } = createWorkspaceNavigationActions({
    activeGuild,
    activeSelection,
    activeSelectionRef,
    composerRef,
    currentUserId,
    deleteGuildTarget,
    ensureDirectDmChannel,
    leaveGuildTarget,
    loadBootstrap,
    serverFolders,
    serverSettingsGuild,
    setActiveSelection,
    setAppError,
    setComposer,
    setComposerAttachments,
    setDeleteGuildTarget,
    setDeletingGuild,
    setDmMenuPrefs,
    setDialog,
    setEditingMessage,
    setGuildMenuPrefs,
    setInviteModalState,
    setLeaveGuildTarget,
    setLeavingGuild,
    setReplyMentionEnabled,
    setReplyTarget,
    setServerFolders,
    setServerSettingsGuildId,
    setWorkspace,
    showUiNotice,
    workspace
  });

  const {
    activeNowUsers,
    availableUsersById,
    blockedUsers,
    currentInboxItems,
    desktopTitle,
    directMessageProfile,
    friendUsers,
    headerSearchPlaceholder,
    inboxCount,
    joinedVoiceChannel,
    memberGroups,
    memberList,
    pendingFriendRequestsReceived,
    pendingFriendRequestsSent,
    voiceUsers,
    voiceUsersByChannel
  } = useWorkspaceDerivedData({
    activeChannel,
    activeGuild,
    activeGuildVoiceChannels,
    activeSelection,
    buildProfileCardData,
    currentUser,
    currentUserId,
    currentUserLabel,
    inboxTab,
    isDirectConversation,
    isVoiceChannel,
    joinedVoiceChannelId,
    voicePresencePeers,
    voicePresenceUsers,
    voiceSessions,
    voiceUserIds,
    workspace
  });
  const isDirectCallActive =
    isCallableDirectConversation && joinedVoiceChannelId === activeChannel?.id;
  useEffect(() => {
    if (isDirectCallActive && !isGroupDirectConversation) {
      setDirectCallLayoutMode("split");
      return;
    }

    setDirectCallLayoutMode("chat");
  }, [activeChannel?.id, isDirectCallActive, isGroupDirectConversation]);
  const {
    screenSharePicker,
    screenShareQualityLabel,
    screenShareQualityOptions,
    screenShareStatus,
    setScreenSharePicker,
    handleChangeScreenShareQuality,
    handleConfirmScreenShare,
    handleLeaveVoiceSession,
    handleToggleScreenShare,
    handleToggleShareAudio,
    loadScreenShareSources,
    openScreenSharePicker
  } = useWorkspaceScreenShare({
    activeChannelId: activeChannel?.id || "",
    joinedVoiceChannelId,
    language,
    onLeaveVoice: handleVoiceLeave,
    setScreenShareStream,
    setVoiceInputPanel,
    setVoiceMenu,
    setVoiceOutputPanel,
    showUiNotice,
    t,
    toggleVoiceMenu,
    updateVoiceSetting,
    voiceInputPanel,
    voiceMenu,
    voiceOutputPanel,
    voiceState
  });
  const {
    acceptIncomingCall,
    incomingCall,
    rejectIncomingCall
  } = useWorkspaceDesktopNotifications({
    accessToken,
    dmMenuPrefs,
    guildMenuPrefs,
    handleVoiceLeave: handleLeaveVoiceSession,
    joinVoiceChannelById,
    joinedVoiceChannelId,
    language,
    showUiNotice,
    voiceSessions,
    workspace
  });
  const voiceStageParticipants = useMemo(
    () =>
      buildVoiceStageParticipants({
        activeChannel,
        activeGuild,
        availableUsersById,
        cameraStream,
        currentUser,
        currentUserId,
        currentUserLabel,
        getVoiceParticipantPref,
        isDirectConversation,
        joinedVoiceChannelId,
        screenShareQualityLabel,
        screenShareStream,
        t,
        voiceInputSpeaking,
        voiceLocalPeerIdRef,
        voicePeerMedia,
        voicePresenceUsers,
        voicePresencePeers,
        voiceUserIds,
        voiceState
      }),
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
      voicePresenceUsers,
      voicePresencePeers,
      voiceParticipantPrefs,
      voiceState.cameraEnabled,
      voiceState.deafen,
      voiceState.micMuted,
      voiceState.screenShareEnabled,
      voiceUserIds,
      voiceUsers
    ]
  );
  const {
    cameraMenuNode,
    inputMenuNode,
    outputMenuNode,
    shareMenuNode
  } = useWorkspaceVoiceMenus({
    cameraStatus,
    getSelectedDeviceLabel,
    handleChangeScreenShareQuality,
    handleToggleScreenShare,
    handleToggleShareAudio,
    handleVoiceDeviceChange,
    language,
    openScreenSharePicker,
    screenSharePicker,
    screenShareQualityLabel,
    screenShareQualityOptions,
    screenShareStatus,
    setSettingsOpen,
    setVoiceInputPanel,
    setVoiceMenu,
    setVoiceOutputPanel,
    showUiNotice,
    toggleVoiceState,
    t,
    updateVoiceSetting,
    voiceDevices,
    voiceInputLevel,
    voiceInputPanel,
    voiceInputStatus,
    voiceMenu,
    voiceOutputPanel,
    voiceState,
    selectedVoiceDevices
  });

  async function handleOpenDesktopUninstaller() {
    const desktopBridge =
      typeof window !== "undefined" ? window.umbraDesktop || null : null;

    if (!desktopBridge?.openUninstaller) {
      showUiNotice("La desinstalacion solo esta disponible en la app de escritorio.");
      return;
    }

    try {
      const result = await desktopBridge.openUninstaller();
      if (result?.ok) {
        showUiNotice(
          result.kind === "uninstaller"
            ? "Se abrio el desinstalador de Umbra."
            : "Se abrio la configuracion de aplicaciones de Windows."
        );
        return;
      }
    } catch {
      // Fall through to the generic notice below.
    }

    showUiNotice("No se pudo abrir el desinstalador de Umbra.");
  }

  const chatHeaderPanelNode = (
    <ChatHeaderPanel
      activeChannel={activeChannel}
      headerPanel={headerPanel}
      headerPanelRef={headerPanelRef}
      language={language}
      messages={messages}
    />
  );

  if (booting) {
    return (
      <UmbraBootScreen
        subtitle="Reconectando servidores, mensajes y presencia en tiempo real."
        title="Despertando Umbra..."
      />
    );
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

        <UmbraWorkspaceStage
          FriendsHome={FriendsHome}
          MessageRequestsHome={MessageRequestsHome}
          MessageStage={MessageStage}
          VoiceRoomStage={VoiceRoomStage}
          activeChannel={activeChannel}
          activeGuild={activeGuild}
          activeNowUsers={activeNowUsers}
          activeSelection={activeSelection}
          attachmentInputRef={attachmentInputRef}
          availableUsersById={availableUsersById}
          blockedUsers={blockedUsers}
          cameraMenuNode={cameraMenuNode}
          cameraStatus={cameraStatus}
          chatHeaderPanelNode={chatHeaderPanelNode}
          composer={composer}
          composerAttachments={composerAttachments}
          composerMenuOpen={composerMenuOpen}
          composerPicker={composerPicker}
          composerRef={composerRef}
          canInvitePeople={Boolean(activeGuild?.permissions?.can_create_invite)}
          currentUser={currentUser}
          directMessageProfile={directMessageProfile}
          directCallLayoutMode={directCallLayoutMode}
          editingMessage={editingMessage}
          effectiveMembersPanelVisible={effectiveMembersPanelVisible}
          friendUsers={friendUsers}
          guildStickers={activeGuild?.stickers || []}
          handleAcceptFriendRequest={handleAcceptFriendRequest}
          handleAttachmentSelection={handleAttachmentSelection}
          handleBlockUser={handleBlockUser}
          handleCancelFriendRequest={handleCancelFriendRequest}
          handleComposerChange={handleComposerChange}
          handleComposerShortcut={handleComposerShortcut}
          handleDeleteMessage={handleDeleteMessage}
          handleEditMessage={handleEditMessage}
          handleJoinDirectCall={handleJoinDirectCall}
          handleJumpToLatest={handleJumpToLatest}
          handleOpenDmFromCard={handleOpenDmFromCard}
          handleOpenDialog={openDialog}
          handleOpenInviteModal={openInviteModal}
          handleOpenFullProfile={openFullProfile}
          handleOpenParticipantMenu={openVoiceParticipantMenu}
          handleOpenProfileCard={openProfileCard}
          handleCopyProfileId={handleCopyProfileId}
          handlePickerInsert={handlePickerInsert}
          handleReaction={handleReaction}
          handleRemoveFriend={handleRemoveFriend}
          handleReportUser={handleReportUser}
          handleRetryMessages={handleRetryMessages}
          handleScroll={handleScroll}
          handleSelectGuildChannel={handleSelectGuildChannel}
          handleSendFriendRequest={handleSendFriendRequest}
          handleForwardMessage={handleForwardMessage}
          handleStartMembersResize={handleStartMembersResize}
          handleStartReply={handleStartReply}
          handleStickerSelect={handleStickerSelect}
          handleSubmitMessage={handleSubmitMessage}
          handleTogglePinnedMessage={handleTogglePinnedMessage}
          handleToggleScreenShare={handleToggleScreenShare}
          handleToggleVoiceMenu={toggleVoiceMenu}
          handleToggleVoiceState={toggleVoiceState}
          handleVoiceLeave={handleLeaveVoiceSession}
          headerActionsRef={headerActionsRef}
          headerCopy={headerCopy}
          headerPanel={headerPanel}
          headerSearchPlaceholder={headerSearchPlaceholder}
          inputMenuNode={inputMenuNode}
          isDirectCallActive={isDirectCallActive}
          isDirectConversation={isDirectConversation}
          isGroupDirectConversation={isGroupDirectConversation}
          isResizingMembersPanel={isResizingMembersPanel}
          isSingleDirectMessagePanel={isSingleDirectMessagePanel}
          isVoiceChannel={isVoiceChannel}
          joinedVoiceChannelId={joinedVoiceChannelId}
          language={language}
          listRef={listRef}
          loadingHistoryMessages={loadingHistoryMessages}
          loadingMessages={loadingMessages}
          memberGroups={memberGroups}
          memberList={memberList}
          membersPanelVisible={membersPanelVisible}
          messageLoadError={messageLoadError}
          messageMenuFor={messageMenuFor}
          messages={messages}
          onAcceptInviteFromMessage={handleAcceptInviteFromMessage}
          reactionPickerFor={reactionPickerFor}
          removeComposerAttachment={removeComposerAttachment}
          replyMentionEnabled={replyMentionEnabled}
          replyTarget={replyTarget}
          screenShareQualityLabel={screenShareQualityLabel}
          setDirectCallLayoutMode={setDirectCallLayoutMode}
          setComposer={setComposer}
          setComposerAttachments={setComposerAttachments}
          setComposerMenuOpen={setComposerMenuOpen}
          setComposerPicker={setComposerPicker}
          setEditingMessage={setEditingMessage}
          setMembersPanelVisible={setMembersPanelVisible}
          setMessageMenuFor={setMessageMenuFor}
          setReactionPickerFor={setReactionPickerFor}
          setReplyMentionEnabled={setReplyMentionEnabled}
          setReplyTarget={setReplyTarget}
          shareMenuNode={shareMenuNode}
          showUiNotice={showUiNotice}
          submittingMessage={submittingMessage}
          toggleHeaderPanel={toggleHeaderPanel}
          typingUsers={typingUsers}
          uiNotice={uiNotice}
          updateComposerAttachment={updateComposerAttachment}
          uploadingAttachments={uploadingAttachments}
          voiceInputLevel={voiceInputLevel}
          voiceMenu={voiceMenu}
          voiceStageParticipants={voiceStageParticipants}
          voiceState={voiceState}
          workspace={workspace}
        />

        <UmbraWorkspaceOverlays
          ConfirmActionModal={ConfirmActionModal}
          Dialog={Dialog}
          InviteServerModal={InviteServerModal}
          ServerSettingsModal={ServerSettingsModal}
          SettingsModal={SettingsModal}
          VoiceParticipantContextMenu={VoiceParticipantContextMenu}
          acceptIncomingCall={acceptIncomingCall}
          accountManagerOpen={accountManagerOpen}
          activeChannel={activeChannel}
          activeGuild={activeGuild}
          confirmDeleteGuild={confirmDeleteGuild}
          confirmLeaveGuild={confirmLeaveGuild}
          deleteGuildTarget={deleteGuildTarget}
          deletingGuild={deletingGuild}
          currentUser={currentUser}
          currentUserId={currentUserId}
          currentUserMenuAnchorRect={currentUserMenuAnchorRect}
          currentUserProfile={currentUserProfile}
          dialog={dialog}
          friendUsers={friendUsers}
          fullProfile={fullProfile}
          getVoiceParticipantPref={getVoiceParticipantPref}
          handleAcceptFriendRequest={handleAcceptFriendRequest}
          handleBanGuildMember={handleBanGuildMember}
          handleBlockUser={handleBlockUser}
          handleCancelFriendRequest={handleCancelFriendRequest}
          handleChangeScreenShareQuality={handleChangeScreenShareQuality}
          handleCopyCurrentUserId={handleCopyCurrentUserId}
          handleCopyProfileId={handleCopyProfileId}
          handleConfirmScreenShare={handleConfirmScreenShare}
          handleCurrentUserExit={handleCurrentUserExit}
          handleCurrentUserStatusChange={handleCurrentUserStatusChange}
          handleDeleteGuild={handleDeleteGuild}
          handleDialogSubmit={handleDialogSubmit}
          handleKickGuildMember={handleKickGuildMember}
          handleOpenDmFromCard={handleOpenDmFromCard}
          handleProfileUpdate={handleProfileUpdate}
          handleRefreshWorkspace={handleRefreshWorkspace}
          handleRemoveFriend={handleRemoveFriend}
          handleReportUser={handleReportUser}
          handleSaveGuildProfile={handleSaveGuildProfile}
          handleSendDmFromCard={handleSendDmFromCard}
          handleSendFriendRequest={handleSendFriendRequest}
          handleSendInviteToFriend={handleSendInviteToFriend}
          handleStatusChange={handleStatusChange}
          handleToggleVoiceParticipantMuted={handleToggleVoiceParticipantMuted}
          handleToggleVoiceParticipantVideo={handleToggleVoiceParticipantVideo}
          handleUpdateVoiceParticipantVolume={handleUpdateVoiceParticipantVolume}
          incomingCall={incomingCall}
          inviteModalState={inviteModalState}
          inviteTargetGuild={inviteTargetGuild}
          language={language}
          leaveGuildTarget={leaveGuildTarget}
          leavingGuild={leavingGuild}
          loadScreenShareSources={loadScreenShareSources}
          onChangeLanguage={onChangeLanguage}
          onOpenAccountManager={openAccountManager}
          onOpenInviteModal={openInviteModal}
          onOpenSettingsDialog={openSettingsDialog}
          onSignOut={onSignOut}
          onUninstallApp={handleOpenDesktopUninstaller}
          onToggleShareAudio={handleToggleShareAudio}
          openSettingsDialog={openSettingsDialog}
          profileCard={profileCard}
          rejectIncomingCall={rejectIncomingCall}
          screenSharePicker={screenSharePicker}
          screenShareQualityOptions={screenShareQualityOptions}
          serverSettingsGuild={serverSettingsGuild}
          setAccountManagerOpen={setAccountManagerOpen}
          setCurrentUserMenuAnchorRect={setCurrentUserMenuAnchorRect}
          setDialog={setDialog}
          setDeleteGuildTarget={setDeleteGuildTarget}
          setFullProfile={setFullProfile}
          setInviteModalState={setInviteModalState}
          setLeaveGuildTarget={setLeaveGuildTarget}
          setProfileCard={setProfileCard}
          setScreenSharePicker={setScreenSharePicker}
          setServerSettingsGuildId={setServerSettingsGuildId}
          setSettingsOpen={setSettingsOpen}
          setTheme={setTheme}
          setVoiceParticipantMenu={setVoiceParticipantMenu}
          settingsOpen={settingsOpen}
          settingsView={settingsView}
          showUiNotice={showUiNotice}
          theme={theme}
          voiceParticipantMenu={voiceParticipantMenu}
          workspace={workspace}
        />
      </div>
    </div>
  );
}
