import { api, buildInviteUrl } from "../../../api.js";
import { playUmbraSound } from "../../../audio/umbraSoundEffects.js";

import {
  applyServerFolderAction,
  reorderGuildList,
  toggleServerFolder
} from "../serverFolders.js";

export function createWorkspaceNavigationActions({
  activeGuild,
  activeSelection,
  activeSelectionRef,
  composerRef,
  currentUserId,
  ensureDirectDmChannel,
  leaveGuildTarget,
  loadBootstrap,
  serverSettingsGuild,
  serverFolders,
  setActiveSelection,
  setAppError,
  setComposer,
  setComposerAttachments,
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
}) {
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

  async function handleRefreshWorkspace() {
    await loadBootstrap(activeSelectionRef.current);
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
        allowMemberInvites: guildPatch.allowMemberInvites,
        bannerImageUrl,
        guildId: serverSettingsGuild.id,
        iconUrl
      });

      await loadBootstrap(activeSelectionRef.current);
      setAppError("");
      playUmbraSound("saveChanges");
      showUiNotice("Servidor actualizado.");
    } catch (error) {
      playUmbraSound("error");
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

  return {
    confirmLeaveGuild,
    handleAcceptInviteFromMessage,
    handleBanGuildMember,
    handleCloseDm,
    handleCopyDmId,
    handleCopyGuildId,
    handleEditMessage,
    handleLeaveGuild,
    handleMarkDmRead,
    handleMarkGuildRead,
    handleMoveGuild,
    handleMoveGuildChannel,
    handleOpenGuildPrivacy,
    handleOpenGuildSettings,
    handleSaveGuildProfile,
    handleRefreshWorkspace,
    handleSelectDirectLink,
    handleSelectGuild,
    handleSelectHome,
    handleSendInviteToFriend,
    handleStartReply,
    handleToggleDmMenuPref,
    handleToggleServerFolder,
    handleUpdateGuildMenuPref,
    handleKickGuildMember,
    openDialog,
    openInviteModal
  };
}
