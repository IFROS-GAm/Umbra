export function areVoiceSessionsEqual(previous = {}, next = {}) {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every((key) => {
    const previousUsers = previous[key] || [];
    const nextUsers = next[key] || [];

    if (previousUsers.length !== nextUsers.length) {
      return false;
    }

    return previousUsers.every((userId, index) => userId === nextUsers[index]);
  });
}

export function normalizeVoiceSessions(sessions = {}) {
  return Object.fromEntries(
    Object.entries(sessions || {})
      .map(([channelId, userIds]) => [
        channelId,
        [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))]
      ])
      .filter(([channelId, userIds]) => channelId && userIds.length)
  );
}

function patchProfileEntry(entry, userPatch) {
  if (!entry || entry.id !== userPatch.id) {
    return entry;
  }

  return {
    ...entry,
    ...userPatch
  };
}

function patchFriendRequestEntry(entry, userPatch) {
  if (!entry?.user || entry.user.id !== userPatch.id) {
    return entry;
  }

  return {
    ...entry,
    user: {
      ...entry.user,
      ...userPatch
    }
  };
}

export function patchWorkspaceUser(previous, userPatch) {
  if (!previous || !userPatch?.id) {
    return previous;
  }

  return {
    ...previous,
    available_users: (previous.available_users || []).map((item) =>
      patchProfileEntry(item, userPatch)
    ),
    blocked_users: (previous.blocked_users || []).map((item) =>
      patchProfileEntry(item, userPatch)
    ),
    current_user:
      previous.current_user?.id === userPatch.id
        ? {
            ...previous.current_user,
            ...userPatch
          }
        : previous.current_user,
    dms: (previous.dms || []).map((dm) => {
      const nextParticipants = (dm.participants || []).map((participant) =>
        patchProfileEntry(participant, userPatch)
      );

      if (
        dm.type === "dm" &&
        nextParticipants.some((participant) => participant.id === userPatch.id) &&
        previous.current_user?.id !== userPatch.id
      ) {
        return {
          ...dm,
          display_name: userPatch.username || dm.display_name,
          participants: nextParticipants
        };
      }

      return {
        ...dm,
        participants: nextParticipants
      };
    }),
    friend_requests_received: (previous.friend_requests_received || []).map((entry) =>
      patchFriendRequestEntry(entry, userPatch)
    ),
    friend_requests_sent: (previous.friend_requests_sent || []).map((entry) =>
      patchFriendRequestEntry(entry, userPatch)
    ),
    friends: (previous.friends || []).map((item) => patchProfileEntry(item, userPatch)),
    guilds: (previous.guilds || []).map((guild) => ({
      ...guild,
      members: (guild.members || []).map((member) => patchProfileEntry(member, userPatch))
    }))
  };
}

export function logVoiceClient(socket, event, details = {}) {
  console.info(`[voice/client] ${event}`, {
    socketId: socket?.id || null,
    ...details
  });
}
