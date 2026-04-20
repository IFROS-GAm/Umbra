import React from "react";

import { Icon } from "../../Icon.jsx";
import { UmbraLogo } from "../../UmbraLogo.jsx";
import { DmContextMenu } from "../DmContextMenu.jsx";
import { ServerAdminMenu } from "../ServerAdminMenu.jsx";
import { ServerContextMenu } from "../ServerContextMenu.jsx";
import { WorkspaceChannelList } from "../WorkspaceChannelList.jsx";
import { WorkspaceDirectHome } from "../WorkspaceDirectHome.jsx";
import { WorkspaceNavigatorFooter } from "../WorkspaceNavigatorFooter.jsx";
import { WorkspaceServerRail } from "../WorkspaceServerRail.jsx";

export function WorkspaceNavigationContent({
  activeGuild,
  activeSelection,
  canInviteGuild,
  canManageGuild,
  canManageStructure,
  currentUserLabel,
  directUnreadCount,
  dmMenuPrefs,
  inputMenuNode,
  joinedVoiceChannel,
  language,
  navigation,
  onAcceptFriendRequest,
  onBlockUser,
  onCloseDm,
  onCopyDmId,
  onCopyGuildId,
  onHandleVoiceLeave,
  onLeaveGuild,
  onMarkDmRead,
  onMarkGuildRead,
  onOpenDialog,
  onOpenFullProfile,
  onOpenGuildPrivacy,
  onOpenGuildSettings,
  onOpenInviteModal,
  onOpenSelfMenu,
  onOpenSettings,
  onRemoveFriend,
  onReportUser,
  onSelectDirectLink,
  onSelectGuildChannel,
  onSelectHome,
  onSendFriendRequest,
  onToggleDmMenuPref,
  onToggleGuildMenuPref,
  onToggleServerFolder,
  onToggleVoiceMenu,
  onToggleVoiceState,
  onUpdateGuildNotificationLevel,
  outputMenuNode,
  voiceMenu,
  voiceSessions,
  voiceUsersByChannel,
  voiceState,
  workspace
}) {
  return (
    <>
      <WorkspaceServerRail
        activeChannelId={activeSelection.channelId}
        activeGuildId={activeGuild?.id}
        activeSelectionKind={activeSelection.kind}
        beginGuildPointerDrag={navigation.beginGuildPointerDrag}
        canDragGuild={navigation.canDragGuild}
        directMessageShortcuts={navigation.directMessageShortcuts}
        directUnreadCount={directUnreadCount}
        draggedGuildId={navigation.draggedGuildId}
        guildDropHint={navigation.guildDropHint}
        handleGuildClick={navigation.handleGuildClick}
        onOpenContextMenu={navigation.openServerContextMenu}
        onOpenDialog={onOpenDialog}
        onSelectDirectLink={onSelectDirectLink}
        onSelectHome={onSelectHome}
        onToggleServerFolder={onToggleServerFolder}
        serverRailItems={navigation.serverRailItems}
        setServerDropTargetNode={navigation.setServerDropTargetNode}
      />

      {navigation.serverContextGuild ? (
        <ServerContextMenu
          canInviteGuild={Boolean(navigation.serverContextGuild?.permissions?.can_create_invite)}
          canManageGuild={Boolean(
            navigation.serverContextGuild?.permissions?.can_manage_guild ||
              navigation.serverContextGuild?.permissions?.can_manage_roles
          )}
          guild={navigation.serverContextGuild}
          language={language}
          onClose={() => navigation.setServerContextMenu(null)}
          onCopyId={onCopyGuildId}
          onInvite={onOpenInviteModal}
          onLeaveGuild={onLeaveGuild}
          onMarkRead={onMarkGuildRead}
          onOpenPrivacy={onOpenGuildPrivacy}
          onOpenSettings={onOpenGuildSettings}
          onTogglePref={onToggleGuildMenuPref}
          onUpdateNotificationLevel={onUpdateGuildNotificationLevel}
          position={navigation.serverContextMenu}
          prefs={navigation.serverContextPrefs}
        />
      ) : null}

      {navigation.dmContextChannel ? (
        <DmContextMenu
          dm={navigation.dmContextChannel}
          muted={Boolean(navigation.dmContextPrefs?.muted)}
          onBlockUser={onBlockUser}
          onClose={() => navigation.setDmContextMenu(null)}
          onCloseDm={onCloseDm}
          onCopyId={onCopyDmId}
          onMarkRead={onMarkDmRead}
          onOpenProfile={onOpenFullProfile}
          onRelationshipAction={(profile) => {
            if (!profile) {
              return;
            }

            if (profile.isFriend) {
              onRemoveFriend?.(profile);
              return;
            }

            if (profile.friendRequestState === "received") {
              onAcceptFriendRequest?.(profile);
              return;
            }

            if (profile.friendRequestState === "sent") {
              return;
            }

            onSendFriendRequest?.(profile);
          }}
          onReportUser={onReportUser}
          onToggleMute={onToggleDmMenuPref}
          position={navigation.dmContextMenu}
          profile={navigation.dmContextProfile}
        />
      ) : null}

      <aside className="navigator-panel">
        <div className={`navigator-top ${activeGuild ? "" : "direct-home-header"}`.trim()}>
          {activeGuild ? (
            <>
              <div className="navigator-server-header">
                <div className="navigator-server-header-copy">
                  <small>UMBRA VEIL</small>
                  <ServerAdminMenu
                    canInviteGuild={canInviteGuild}
                    canManageGuild={canManageGuild}
                    guild={activeGuild}
                    language={language}
                    onCopyId={onCopyGuildId}
                    onCreateCategory={() => onOpenDialog("category")}
                    onCreateChannel={() => onOpenDialog("channel", { initialKind: "text" })}
                    onInvite={onOpenInviteModal}
                    onOpenSettings={onOpenGuildSettings}
                  />
                </div>
              </div>
              <div className="navigator-top-actions">
                {canInviteGuild ? (
                  <button
                    className="ghost-button icon-only tooltip-anchor"
                    data-tooltip="Invitar al servidor"
                    data-tooltip-position="bottom"
                    onClick={() => onOpenInviteModal?.()}
                    type="button"
                  >
                    <Icon name="userAdd" />
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="navigator-title-block compact navigator-title-brand">
                <UmbraLogo alt="Umbra" className="navigator-title-logo" size={34} />
                <div className="navigator-title-copy">
                  <small>UMBRA DIRECT</small>
                  <h2>Mensajes directos</h2>
                  <p className="subcopy">Ecos privados, grupos y accesos.</p>
                </div>
              </div>
              <button
                className="ghost-button navigator-create-button"
                onClick={() => onOpenDialog("dm_group")}
                type="button"
              >
                <Icon name="add" />
                <span>Nuevo DM</span>
              </button>
            </>
          )}
        </div>

        <div className="navigator-search">
          <input
            aria-label="Buscar en el panel lateral"
            placeholder={
              activeGuild
                ? `Buscar en ${activeGuild.name}`
                : activeSelection.kind === "home"
                  ? "Buscar o iniciar una conversacion"
                  : "Buscar mensajes directos"
            }
            type="text"
          />
        </div>

        {activeGuild ? (
          <WorkspaceChannelList
            activeSelection={activeSelection}
            canManageStructure={canManageStructure}
            categoryEntries={navigation.categoryEntries}
            channelDropHint={navigation.channelDropHint}
            collapsedSectionIds={navigation.collapsedSectionIds}
            handleCategoryDragOver={navigation.handleCategoryDragOver}
            handleCategoryDrop={navigation.handleCategoryDrop}
            handleRootSectionDragOver={navigation.handleRootSectionDragOver}
            handleRootSectionDrop={navigation.handleRootSectionDrop}
            onOpenDialog={onOpenDialog}
            renderTextChannelRow={navigation.renderTextChannelRow}
            renderVoiceChannel={navigation.renderVoiceChannel}
            toggleSection={navigation.toggleSection}
            uncategorizedTextChannels={navigation.uncategorizedTextChannels}
            uncategorizedVoiceChannels={navigation.uncategorizedVoiceChannels}
          />
        ) : (
          <WorkspaceDirectHome
            activeSelection={activeSelection}
            dmMenuPrefs={dmMenuPrefs}
            onOpenDialog={onOpenDialog}
            onOpenDmContextMenu={navigation.openDmContextMenu}
            onSelectDirectLink={onSelectDirectLink}
            workspace={workspace}
          />
        )}

        <WorkspaceNavigatorFooter
          currentUserLabel={currentUserLabel}
          inputMenuNode={inputMenuNode}
          joinedVoiceChannel={joinedVoiceChannel}
          onHandleVoiceLeave={onHandleVoiceLeave}
          onOpenSelfMenu={onOpenSelfMenu}
          onOpenSettings={onOpenSettings}
          onSelectGuildChannel={onSelectGuildChannel}
          onToggleVoiceMenu={onToggleVoiceMenu}
          onToggleVoiceState={onToggleVoiceState}
          outputMenuNode={outputMenuNode}
          truncatedCurrentUserLabel={navigation.truncatedCurrentUserLabel}
          voiceMenu={voiceMenu}
          voiceSessions={voiceSessions}
          voiceUsersByChannel={voiceUsersByChannel}
          voiceState={voiceState}
          workspace={workspace}
        />
      </aside>
    </>
  );
}
