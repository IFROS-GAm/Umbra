import React from "react";

import { WorkspaceNavigationContent } from "../WorkspaceNavigationContent.jsx";
import { useWorkspaceNavigationState } from "../useWorkspaceNavigationState.jsx";

export function WorkspaceNavigation(props) {
  const canManageStructure = Boolean(props.activeGuild?.permissions?.can_manage_channels);
  const canManageGuild = Boolean(props.activeGuild?.permissions?.can_manage_guild);

  const navigation = useWorkspaceNavigationState({
    activeGuild: props.activeGuild,
    activeSelection: props.activeSelection,
    canManageGuild,
    canManageStructure,
    currentUserLabel: props.currentUserLabel,
    dmMenuPrefs: props.dmMenuPrefs,
    guildMenuPrefs: props.guildMenuPrefs,
    hoveredVoiceChannelId: props.hoveredVoiceChannelId,
    joinedVoiceChannelId: props.joinedVoiceChannelId,
    onAcceptFriendRequest: props.onAcceptFriendRequest,
    onBlockUser: props.onBlockUser,
    onCloseDm: props.onCloseDm,
    onCopyDmId: props.onCopyDmId,
    onCopyGuildId: props.onCopyGuildId,
    onLeaveGuild: props.onLeaveGuild,
    onMarkDmRead: props.onMarkDmRead,
    onMarkGuildRead: props.onMarkGuildRead,
    onMoveGuild: props.onMoveGuild,
    onMoveGuildChannel: props.onMoveGuildChannel,
    onOpenFullProfile: props.onOpenFullProfile,
    onOpenGuildPrivacy: props.onOpenGuildPrivacy,
    onOpenGuildSettings: props.onOpenGuildSettings,
    onOpenInviteModal: props.onOpenInviteModal,
    onOpenProfileCard: props.onOpenProfileCard,
    onReportUser: props.onReportUser,
    onRemoveFriend: props.onRemoveFriend,
    onSelectDirectLink: props.onSelectDirectLink,
    onSelectGuild: props.onSelectGuild,
    onSelectGuildChannel: props.onSelectGuildChannel,
    onSendFriendRequest: props.onSendFriendRequest,
    onSetHoveredVoiceChannelId: props.onSetHoveredVoiceChannelId,
    onToggleDmMenuPref: props.onToggleDmMenuPref,
    onToggleGuildMenuPref: props.onToggleGuildMenuPref,
    onToggleServerFolder: props.onToggleServerFolder,
    onUpdateGuildNotificationLevel: props.onUpdateGuildNotificationLevel,
    serverFolders: props.serverFolders,
    voiceSessions: props.voiceSessions,
    voiceState: props.voiceState,
    voiceUsersByChannel: props.voiceUsersByChannel,
    workspace: props.workspace
  });

  return (
    <WorkspaceNavigationContent
      activeGuild={props.activeGuild}
      activeSelection={props.activeSelection}
      canManageGuild={canManageGuild}
      canManageStructure={canManageStructure}
      currentUserLabel={props.currentUserLabel}
      directUnreadCount={props.directUnreadCount}
      dmMenuPrefs={props.dmMenuPrefs}
      inputMenuNode={props.inputMenuNode}
      joinedVoiceChannel={props.joinedVoiceChannel}
      language={props.language}
      navigation={navigation}
      onAcceptFriendRequest={props.onAcceptFriendRequest}
      onBlockUser={props.onBlockUser}
      onCloseDm={props.onCloseDm}
      onCopyDmId={props.onCopyDmId}
      onCopyGuildId={props.onCopyGuildId}
      onHandleVoiceLeave={props.onHandleVoiceLeave}
      onLeaveGuild={props.onLeaveGuild}
      onMarkDmRead={props.onMarkDmRead}
      onMarkGuildRead={props.onMarkGuildRead}
      onOpenDialog={props.onOpenDialog}
      onOpenFullProfile={props.onOpenFullProfile}
      onOpenGuildPrivacy={props.onOpenGuildPrivacy}
      onOpenGuildSettings={props.onOpenGuildSettings}
      onOpenInviteModal={props.onOpenInviteModal}
      onOpenSelfMenu={props.onOpenSelfMenu}
      onOpenSettings={props.onOpenSettings}
      onRemoveFriend={props.onRemoveFriend}
      onReportUser={props.onReportUser}
      onSelectDirectLink={props.onSelectDirectLink}
      onSelectGuildChannel={props.onSelectGuildChannel}
      onSelectHome={props.onSelectHome}
      onSendFriendRequest={props.onSendFriendRequest}
      onToggleDmMenuPref={props.onToggleDmMenuPref}
      onToggleGuildMenuPref={props.onToggleGuildMenuPref}
      onToggleServerFolder={props.onToggleServerFolder}
      onToggleVoiceMenu={props.onToggleVoiceMenu}
      onToggleVoiceState={props.onToggleVoiceState}
      onUpdateGuildNotificationLevel={props.onUpdateGuildNotificationLevel}
      outputMenuNode={props.outputMenuNode}
      voiceMenu={props.voiceMenu}
      voiceSessions={props.voiceSessions}
      voiceUsersByChannel={props.voiceUsersByChannel}
      voiceState={props.voiceState}
      workspace={props.workspace}
    />
  );
}
