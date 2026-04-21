import { api } from "../../../api.js";
import { findDirectDmByUserId } from "../workspaceHelpers.js";

function normalizeUser(user = {}) {
  if (!user?.id) {
    return null;
  }

  return {
    ...user,
    avatar_hue: user.avatar_hue ?? user.avatarHue ?? 210,
    avatar_url: user.avatar_url ?? user.avatarUrl ?? "",
    custom_status: user.custom_status ?? user.customStatus ?? "",
    display_name: user.display_name ?? user.displayName ?? "",
    profile_banner_url: user.profile_banner_url ?? user.profileBannerUrl ?? "",
    profile_color: user.profile_color ?? user.profileColor ?? "#5865F2",
    username: user.username || user.display_name || user.displayName || "umbra_user"
  };
}

function sortUsers(users = []) {
  return [...users].sort((left, right) =>
    String(left?.username || left?.display_name || "").localeCompare(
      String(right?.username || right?.display_name || ""),
      "es"
    )
  );
}

function sortRequests(requests = []) {
  return [...requests].sort((left, right) => {
    const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

function mergeUsers(users = []) {
  const byId = new Map();

  users.forEach((entry) => {
    const normalized = normalizeUser(entry);
    if (!normalized?.id) {
      return;
    }

    const previous = byId.get(normalized.id) || null;
    byId.set(normalized.id, previous ? { ...previous, ...normalized } : normalized);
  });

  return sortUsers([...byId.values()]);
}

function collectWorkspaceUsers(workspace = {}) {
  return [
    workspace.current_user,
    ...(workspace.available_users || []),
    ...(workspace.friends || []),
    ...(workspace.blocked_users || []),
    ...(workspace.friend_requests_received || []).map((request) => request.user),
    ...(workspace.friend_requests_sent || []).map((request) => request.user),
    ...(workspace.dms || []).flatMap((dm) => dm.participants || []),
    ...(workspace.guilds || []).flatMap((guild) => guild.members || [])
  ].filter(Boolean);
}

function resolveWorkspaceUser(workspace, candidate = {}) {
  const candidateId = candidate?.id || null;
  if (!candidateId) {
    return normalizeUser(candidate);
  }

  const merged = collectWorkspaceUsers(workspace).reduce((accumulator, entry) => {
    if (entry?.id !== candidateId) {
      return accumulator;
    }

    return {
      ...accumulator,
      ...normalizeUser(entry)
    };
  }, {});

  return normalizeUser({
    ...merged,
    ...candidate
  });
}

function getRequestOtherUserId(request, direction) {
  if (!request) {
    return null;
  }

  return direction === "received"
    ? request.user?.id || request.requester_id || null
    : request.user?.id || request.recipient_id || null;
}

function filterRequests(requests = [], direction, { requestId = null, userId = null } = {}) {
  return requests.filter((entry) => {
    if (!entry) {
      return false;
    }

    if (requestId && entry.id === requestId) {
      return false;
    }

    if (userId && getRequestOtherUserId(entry, direction) === userId) {
      return false;
    }

    return true;
  });
}

function filterUsers(users = [], userId = null) {
  if (!userId) {
    return users.filter(Boolean);
  }

  return sortUsers(
    users.filter((entry) => entry?.id && String(entry.id) !== String(userId))
  );
}

function buildPendingRequest({
  currentUserId,
  direction,
  otherUser,
  request
}) {
  const normalizedUser = normalizeUser(otherUser);
  const fallbackCreatedAt = new Date().toISOString();

  return {
    ...(request || {}),
    created_at: request?.created_at || fallbackCreatedAt,
    id:
      request?.id ||
      `local-friend-request-${direction}-${currentUserId}-${normalizedUser?.id || "unknown"}`,
    recipient_id:
      request?.recipient_id ||
      (direction === "sent" ? normalizedUser?.id || null : currentUserId),
    requester_id:
      request?.requester_id ||
      (direction === "received" ? normalizedUser?.id || null : currentUserId),
    status: "pending",
    user: normalizedUser
  };
}

export function createWorkspaceSocialActions({
  activeGuild,
  activeSelection,
  currentUserId,
  loadBootstrap,
  openingDmRequestsRef,
  pendingSocialRealtimeActionsRef,
  setActiveSelection,
  setAppError,
  setFullProfile,
  setHeaderPanel,
  setProfileCard,
  setSettingsOpen,
  setWorkspace,
  showUiNotice,
  workspace
}) {
  function queueLocalSocialSyncSkip(targetUserId) {
    if (!pendingSocialRealtimeActionsRef?.current || !currentUserId || !targetUserId) {
      return;
    }

    const normalizedUserId = String(currentUserId);
    const normalizedTargetUserId = String(targetUserId);
    const now = Date.now();
    const existingEntries = Array.isArray(pendingSocialRealtimeActionsRef.current)
      ? pendingSocialRealtimeActionsRef.current
      : [];

    pendingSocialRealtimeActionsRef.current = [
      ...existingEntries.filter(
        (entry) =>
          entry?.expiresAt > now &&
          !(
            String(entry.userId || "") === normalizedUserId &&
            String(entry.targetUserId || "") === normalizedTargetUserId
          )
      ),
      {
        expiresAt: now + 5_000,
        targetUserId: normalizedTargetUserId,
        userId: normalizedUserId
      }
    ];
  }

  function updateWorkspaceSocialState(updater) {
    setWorkspace((previous) => {
      if (!previous) {
        return previous;
      }

      return updater(previous) || previous;
    });
  }

  function applyFriendshipState({
    requestId = null,
    targetUser,
    targetUserId = null
  }) {
    updateWorkspaceSocialState((previous) => {
      const resolvedUserId = String(targetUser?.id || targetUserId || "").trim();
      if (!resolvedUserId) {
        return previous;
      }

      const friend = resolveWorkspaceUser(previous, targetUser || { id: resolvedUserId });

      return {
        ...previous,
        friend_requests_received: filterRequests(previous.friend_requests_received, "received", {
          requestId,
          userId: resolvedUserId
        }),
        friend_requests_sent: filterRequests(previous.friend_requests_sent, "sent", {
          requestId,
          userId: resolvedUserId
        }),
        friends: mergeUsers([...(previous.friends || []), friend])
      };
    });
  }

  function applyPendingFriendRequestState({ request, targetUser }) {
    updateWorkspaceSocialState((previous) => {
      const resolvedUser = resolveWorkspaceUser(previous, targetUser);
      if (!resolvedUser?.id) {
        return previous;
      }

      const nextRequest = buildPendingRequest({
        currentUserId,
        direction: "sent",
        otherUser: resolvedUser,
        request
      });

      return {
        ...previous,
        friend_requests_sent: sortRequests([
          ...filterRequests(previous.friend_requests_sent, "sent", {
            requestId: nextRequest.id,
            userId: resolvedUser.id
          }),
          nextRequest
        ])
      };
    });
  }

  function clearPendingFriendRequestState({
    requestId = null,
    targetUserId = null
  }) {
    updateWorkspaceSocialState((previous) => {
      const resolvedUserId = String(targetUserId || "").trim();

      return {
        ...previous,
        friend_requests_received: filterRequests(previous.friend_requests_received, "received", {
          requestId,
          userId: resolvedUserId || null
        }),
        friend_requests_sent: filterRequests(previous.friend_requests_sent, "sent", {
          requestId,
          userId: resolvedUserId || null
        })
      };
    });
  }

  function removeFriendshipState(targetUserId) {
    updateWorkspaceSocialState((previous) => ({
      ...previous,
      friends: filterUsers(previous.friends, String(targetUserId || "").trim() || null)
    }));
  }

  function applyBlockedUserState(targetUser) {
    updateWorkspaceSocialState((previous) => {
      const blockedUser = resolveWorkspaceUser(previous, targetUser);
      if (!blockedUser?.id) {
        return previous;
      }

      return {
        ...previous,
        blocked_users: mergeUsers([...(previous.blocked_users || []), blockedUser]),
        friend_requests_received: filterRequests(previous.friend_requests_received, "received", {
          userId: blockedUser.id
        }),
        friend_requests_sent: filterRequests(previous.friend_requests_sent, "sent", {
          userId: blockedUser.id
        }),
        friends: filterUsers(previous.friends, blockedUser.id)
      };
    });
  }

  async function ensureDirectDmChannel(profile, { loadConversation = true } = {}) {
    if (!profile?.id) {
      return null;
    }

    if (profile.isCurrentUser) {
      setSettingsOpen(true);
      setProfileCard(null);
      return null;
    }

    const existingDm = findDirectDmByUserId(workspace?.dms || [], currentUserId, profile.id);
    if (existingDm) {
      if (loadConversation) {
        setProfileCard(null);
        setActiveSelection({
          channelId: existingDm.id,
          guildId: null,
          kind: "dm"
        });
        await loadBootstrap(
          {
            channelId: existingDm.id,
            guildId: null,
            kind: "dm"
          },
          {
            selectionMode: "target"
          }
        );
      }
      return existingDm;
    }

    let pendingRequest = openingDmRequestsRef.current.get(profile.id);
    if (!pendingRequest) {
      pendingRequest = api
        .createDm({
          recipientId: profile.id
        })
        .then((payload) => payload.channel)
        .finally(() => {
          if (openingDmRequestsRef.current.get(profile.id) === pendingRequest) {
            openingDmRequestsRef.current.delete(profile.id);
          }
        });
      openingDmRequestsRef.current.set(profile.id, pendingRequest);
    }

    const channel = await pendingRequest;

    if (loadConversation && channel) {
      setProfileCard(null);
      setActiveSelection({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
      await loadBootstrap(
        {
          channelId: channel.id,
          guildId: null,
          kind: "dm"
        },
        {
          selectionMode: "target"
        }
      );
    }

    return channel;
  }

  async function handleOpenDmFromCard(profile) {
    try {
      await ensureDirectDmChannel(profile, {
        loadConversation: true
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleSendDmFromCard(profile, content) {
    const trimmed = String(content || "").trim();
    if (!trimmed) {
      return;
    }

    try {
      const channel = await ensureDirectDmChannel(profile, {
        loadConversation: false
      });

      if (!channel?.id) {
        return;
      }

      await api.createMessage({
        attachments: [],
        channelId: channel.id,
        content: trimmed,
        replyMentionUserId: null,
        replyTo: null
      });

      setProfileCard(null);
      setActiveSelection({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
      await loadBootstrap(
        {
          channelId: channel.id,
          guildId: null,
          kind: "dm"
        },
        {
          selectionMode: "target"
        }
      );
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleSendFriendRequest(profile) {
    const targetUserId = String(profile?.id || "").trim();
    if (!targetUserId) {
      return;
    }

    const latestTargetUser = resolveWorkspaceUser(workspace, profile || { id: targetUserId });
    const receivedRequest = (workspace?.friend_requests_received || []).find(
      (request) =>
        String(request?.user?.id || request?.requester_id || "").trim() === targetUserId
    );
    const sentRequest = (workspace?.friend_requests_sent || []).find(
      (request) =>
        String(request?.user?.id || request?.recipient_id || "").trim() === targetUserId
    );
    const isCurrentUser = String(workspace?.current_user?.id || "").trim() === targetUserId;
    const isBlockedByMe = (workspace?.blocked_users || []).some(
      (user) => String(user?.id || "").trim() === targetUserId
    );
    const isFriend = (workspace?.friends || []).some(
      (user) => String(user?.id || "").trim() === targetUserId
    );

    if (isCurrentUser) {
      showUiNotice("No puedes enviarte una solicitud a ti mismo.");
      return;
    }

    if (isBlockedByMe) {
      showUiNotice("Desbloquea a esta persona para enviarle una solicitud.");
      return;
    }

    if (isFriend) {
      showUiNotice("Ya son sombras.");
      return;
    }

    let optimisticRequest = null;

    try {
      if (receivedRequest?.id) {
        await api.acceptFriendRequest({ requestId: receivedRequest.id });
        queueLocalSocialSyncSkip(targetUserId);
        applyFriendshipState({
          requestId: receivedRequest.id,
          targetUser: latestTargetUser,
          targetUserId
        });
        showUiNotice("Ahora son sombras.");
        return;
      }

      if (sentRequest?.id) {
        showUiNotice("La solicitud ya fue enviada.");
        return;
      }

      optimisticRequest = buildPendingRequest({
        currentUserId,
        direction: "sent",
        otherUser: latestTargetUser,
        request: null
      });

      applyPendingFriendRequestState({
        request: optimisticRequest,
        targetUser: latestTargetUser
      });

      const payload = await api.sendFriendRequest({ recipientId: targetUserId });
      queueLocalSocialSyncSkip(targetUserId);
      if (payload?.status === "accepted") {
        applyFriendshipState({
          requestId:
            payload?.request_id ||
            payload?.request?.id ||
            receivedRequest?.id ||
            optimisticRequest.id,
          targetUser: latestTargetUser,
          targetUserId
        });
        showUiNotice("Ahora son sombras.");
        return;
      }

      applyPendingFriendRequestState({
        request: payload?.request || null,
        targetUser: latestTargetUser
      });
      showUiNotice(
        `Solicitud enviada a ${latestTargetUser?.display_name || latestTargetUser?.displayName || latestTargetUser?.username || profile.displayName || profile.username}.`
      );
    } catch (error) {
      if (optimisticRequest?.id) {
        clearPendingFriendRequestState({
          requestId: optimisticRequest.id,
          targetUserId
        });
      }
      setAppError(error.message);
    }
  }

  async function handleAcceptFriendRequest(requestOrProfile) {
    const requestId = requestOrProfile?.id || requestOrProfile?.friendRequestId;
    if (!requestId) {
      return;
    }

    try {
      await api.acceptFriendRequest({ requestId });
      const targetUser = requestOrProfile?.user || (requestOrProfile?.friendRequestId ? requestOrProfile : null);
      const targetUserId =
        targetUser?.id ||
        requestOrProfile?.requester_id ||
        requestOrProfile?.recipient_id ||
        null;

      queueLocalSocialSyncSkip(targetUserId);
      applyFriendshipState({
        requestId,
        targetUser,
        targetUserId
      });
      showUiNotice("Ahora son sombras.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleCancelFriendRequest(requestOrProfile) {
    const requestId = requestOrProfile?.id || requestOrProfile?.friendRequestId;
    if (!requestId) {
      return;
    }

    try {
      await api.cancelFriendRequest({ requestId });
      const targetUserId =
        requestOrProfile?.user?.id ||
        (requestOrProfile?.friendRequestId ? requestOrProfile?.id : null) ||
        requestOrProfile?.requester_id ||
        requestOrProfile?.recipient_id ||
        null;

      queueLocalSocialSyncSkip(targetUserId);
      clearPendingFriendRequestState({
        requestId,
        targetUserId
      });
      showUiNotice("Solicitud actualizada.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleRemoveFriend(profile) {
    if (!profile?.id) {
      return;
    }

    try {
      await api.removeFriend({ friendId: profile.id });
      queueLocalSocialSyncSkip(profile.id);
      removeFriendshipState(profile.id);
      showUiNotice("Sombra eliminada.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleBlockUser(profile) {
    if (!profile?.id) {
      return;
    }

    try {
      await api.blockUser({ userId: profile.id });
      setProfileCard(null);
      setFullProfile(null);
      queueLocalSocialSyncSkip(profile.id);
      applyBlockedUserState(profile);
      showUiNotice(`${profile.displayName || profile.username} ha sido bloqueado.`);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleReportUser(profile, reason = "spam") {
    if (!profile?.id) {
      return;
    }

    try {
      await api.reportUser({ reason, userId: profile.id });
      showUiNotice("Reporte enviado.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleInboxItemAction(item) {
    if (!item) {
      return;
    }

    if (item.channelId && item.tab !== "for_you") {
      setHeaderPanel(null);
      setActiveSelection((previous) => ({
        channelId: item.channelId,
        guildId: item.tab === "mentions" ? activeGuild?.id || previous.guildId : null,
        kind: item.tab === "mentions" ? "guild" : "dm"
      }));
      return;
    }

    if (item.user?.id) {
      setHeaderPanel(null);
      await handleOpenDmFromCard({
        id: item.user.id,
        isCurrentUser: item.user.id === workspace.current_user.id
      });
    }
  }

  return {
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
  };
}
