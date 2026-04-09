import { api } from "../../api.js";
import { findDirectDmByUserId } from "./workspaceHelpers.js";

export function createWorkspaceSocialActions({
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
}) {
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
        await loadBootstrap({
          channelId: existingDm.id,
          guildId: null,
          kind: "dm"
        });
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
      await loadBootstrap({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
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
      await loadBootstrap({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function refreshSocialSelection(notice = "") {
    await loadBootstrap({
      channelId: activeSelection.channelId,
      guildId: activeSelection.guildId,
      kind: activeSelection.kind
    });
    if (notice) {
      showUiNotice(notice);
    }
  }

  async function handleSendFriendRequest(profile) {
    if (!profile?.id || profile.isCurrentUser || profile.isBlockedByMe || profile.isFriend) {
      return;
    }

    try {
      if (profile.friendRequestState === "received" && profile.friendRequestId) {
        await api.acceptFriendRequest({ requestId: profile.friendRequestId });
        await refreshSocialSelection("Ahora son sombras.");
        return;
      }

      if (profile.friendRequestState === "sent") {
        return;
      }

      const payload = await api.sendFriendRequest({ recipientId: profile.id });
      if (payload?.status === "accepted") {
        await refreshSocialSelection("Ahora son sombras.");
        return;
      }

      await refreshSocialSelection(`Solicitud enviada a ${profile.displayName || profile.username}.`);
    } catch (error) {
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
      await refreshSocialSelection("Ahora son sombras.");
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
      await refreshSocialSelection("Solicitud actualizada.");
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
      await refreshSocialSelection("Sombra eliminada.");
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
      await refreshSocialSelection(`${profile.displayName || profile.username} ha sido bloqueado.`);
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
