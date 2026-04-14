import { useMemo } from "react";

import { buildMemberGroups, isVisibleStatus } from "../workspaceHelpers.js";

export function useWorkspaceDerivedData({
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
  voiceSessions,
  voiceUserIds,
  workspace
}) {
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
  const availableUsersById = useMemo(
    () => Object.fromEntries((workspace?.available_users || []).map((user) => [user.id, user])),
    [workspace?.available_users]
  );
  const currentInboxItems = inboxItems[inboxTab] || [];
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
  const voiceUsersByChannel = useMemo(() => {
    const guildMembersById = new Map((activeGuild?.members || []).map((member) => [member.id, member]));

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
  }, [
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
  ]);
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
  }, [activeChannel, activeSelection.kind, buildProfileCardData, workspace]);
  const headerSearchPlaceholder = activeGuild
    ? `Buscar ${activeGuild.name}`
    : `Buscar ${activeChannel?.display_name || "Umbra"}`;

  return {
    activeNowUsers,
    availableUsersById,
    blockedUsers,
    currentInboxItems,
    desktopTitle,
    directMessageProfile,
    friendUsers,
    headerSearchPlaceholder,
    inboxCount,
    inboxItems,
    joinedVoiceChannel,
    memberGroups,
    memberList,
    pendingFriendRequestsReceived,
    pendingFriendRequestsSent,
    voiceUsers,
    voiceUsersByChannel
  };
}
