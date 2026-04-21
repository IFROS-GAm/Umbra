import React, { Suspense } from "react";

import { AccountManagerModal } from "../../AccountManagerModal.jsx";
import { CurrentUserMenu } from "../../CurrentUserMenu.jsx";
import { UserProfileCard } from "../../UserProfileCard.jsx";
import { UserProfileModal } from "../../UserProfileModal.jsx";
import { WorkspacePanelFallback } from "../WorkspacePanelFallback.jsx";
import { WorkspaceScreenSharePicker } from "../WorkspaceScreenSharePicker.jsx";
import { WorkspaceTooltipLayer } from "../WorkspaceTooltipLayer.jsx";
import { IncomingCallPopup } from "./IncomingCallPopup.jsx";

export function UmbraWorkspaceOverlays({
  ConfirmActionModal,
  Dialog,
  InviteServerModal,
  ServerSettingsModal,
  SettingsModal,
  VoiceParticipantContextMenu,
  acceptIncomingCall,
  accountManagerOpen,
  activeChannel,
  activeGuild,
  confirmDeleteGuild,
  confirmLeaveGuild,
  deleteGuildTarget,
  deletingGuild,
  currentUser,
  currentUserId,
  currentUserMenuAnchorRect,
  currentUserProfile,
  dialog,
  friendUsers,
  fullProfile,
  handleAcceptFriendRequest,
  handleBanGuildMember,
  handleBlockUser,
  handleCancelFriendRequest,
  handleChangeScreenShareQuality,
  handleCopyCurrentUserId,
  handleCopyProfileId,
  handleConfirmScreenShare,
  handleCurrentUserExit,
  handleCurrentUserStatusChange,
  handleDeleteGuild,
  handleDialogSubmit,
  handleKickGuildMember,
  handleOpenDmFromCard,
  handleProfileUpdate,
  handleRefreshWorkspace,
  handleRemoveFriend,
  handleReportUser,
  handleSaveGuildProfile,
  handleSendDmFromCard,
  handleSendFriendRequest,
  handleSendInviteToFriend,
  handleStatusChange,
  handleToggleVoiceParticipantMuted,
  handleToggleVoiceParticipantVideo,
  handleUpdateVoiceParticipantIntensity,
  handleUpdateVoiceParticipantVolume,
  incomingCall,
  inviteModalState,
  inviteTargetGuild,
  language,
  leaveGuildTarget,
  leavingGuild,
  loadScreenShareSources,
  onChangeLanguage,
  onOpenAccountManager,
  onOpenInviteModal,
  onOpenSettingsDialog,
  onSignOut,
  onUninstallApp,
  onToggleShareAudio,
  openSettingsDialog,
  profileCard,
  rejectIncomingCall,
  screenSharePicker,
  screenShareQualityOptions,
  serverSettingsGuild,
  setAccountManagerOpen,
  setCurrentUserMenuAnchorRect,
  setDeleteGuildTarget,
  setDialog,
  setFullProfile,
  setInviteModalState,
  setLeaveGuildTarget,
  setProfileCard,
  setScreenSharePicker,
  setServerSettingsGuildId,
  setSettingsOpen,
  setTheme,
  setVoiceParticipantMenu,
  settingsOpen,
  settingsView,
  showUiNotice,
  theme,
  voiceParticipantMenu,
  getVoiceParticipantPref,
  workspace
}) {
  return (
    <>
      {settingsOpen ? (
        <Suspense fallback={<WorkspacePanelFallback compact />}>
          <SettingsModal
            dmCount={workspace.dms.length}
            guildCount={workspace.guilds.length}
            initialEditorOpen={settingsView.initialEditorOpen}
            initialTab={settingsView.initialTab}
            language={language}
            onChangeLanguage={onChangeLanguage}
            onClose={() => setSettingsOpen(false)}
            onSignOut={onSignOut}
            onToggleTheme={() => {
              const nextTheme = theme === "dark" ? "light" : "dark";
              setTheme(nextTheme);
              showUiNotice(
                nextTheme === "light"
                  ? "Modo blanco activado."
                  : "Modo oscuro activado."
              );
            }}
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
            onOpenSettingsDialog({
              initialEditorOpen: true,
              initialTab: "security"
            })
          }
          onManageAccounts={() => onOpenAccountManager()}
          onSignOut={handleCurrentUserExit}
          onSwitchAccount={onOpenAccountManager}
          onUninstall={onUninstallApp}
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

      {!settingsOpen && !serverSettingsGuild && incomingCall ? (
        <IncomingCallPopup
          call={incomingCall}
          onAccept={acceptIncomingCall}
          onReject={(channelId) => rejectIncomingCall(channelId, "rejected")}
        />
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
          onOpenSelfProfile={() => {
            setProfileCard(null);
            openSettingsDialog({
              initialEditorOpen: true,
              initialTab: "security"
            });
          }}
          onRemoveFriend={handleRemoveFriend}
          onReportUser={handleReportUser}
          onSendDm={handleSendDmFromCard}
          onShowNotice={showUiNotice}
        />
      ) : null}

      {fullProfile ? (
        <UserProfileModal
          onAcceptFriendRequest={handleAcceptFriendRequest}
          onAddFriend={handleSendFriendRequest}
          onBlockUser={handleBlockUser}
          onCancelFriendRequest={handleCancelFriendRequest}
          onClose={() => setFullProfile(null)}
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
              onOpenSettingsDialog({
                initialEditorOpen: true,
                initialTab: "security"
              });
            }}
            onSendMessage={handleOpenDmFromCard}
            onUpdateIntensity={handleUpdateVoiceParticipantIntensity}
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
            users={
              ["dm_group", "dm_group_invite", "dm_group_edit"].includes(dialog.type)
                ? friendUsers
                : workspace.available_users
            }
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
            onDeleteServer={handleDeleteGuild}
            onKickMember={handleKickGuildMember}
            onRefresh={handleRefreshWorkspace}
            onSave={handleSaveGuildProfile}
          />
        </Suspense>
      ) : null}

      {deleteGuildTarget ? (
        <Suspense fallback={<WorkspacePanelFallback compact />}>
          <ConfirmActionModal
            cancelLabel="Cancelar"
            confirmLabel="Eliminar servidor"
            description={`Esta accion borrara ${deleteGuildTarget.name} para todos sus miembros. No se puede deshacer.`}
            loading={deletingGuild}
            loadingLabel="Eliminando..."
            onClose={() => {
              if (!deletingGuild) {
                setDeleteGuildTarget(null);
              }
            }}
            onConfirm={confirmDeleteGuild}
            title={`Eliminar ${deleteGuildTarget.name}?`}
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
            onRefresh={() => onOpenInviteModal(inviteTargetGuild)}
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
            loadingLabel="Saliendo..."
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
          onToggleShareAudio={onToggleShareAudio}
          picker={screenSharePicker}
          qualityOptions={screenShareQualityOptions}
        />
      ) : null}

      <WorkspaceTooltipLayer />
    </>
  );
}
