import { api } from "../../api.js";
import { getSocket } from "../../socket.js";
import { findChannelInSession } from "../../utils.js";
import {
  MAX_COMPOSER_ATTACHMENTS,
  applyChannelPreviewToWorkspace,
  attachmentKey,
  fallbackDeviceLabel,
  findDirectDmByUserId,
  toggleReactionBucket,
  upsertChannelMessage
} from "./workspaceHelpers.js";

const DIRECT_CALL_TYPES = new Set(["dm", "group_dm"]);

function logVoiceClient(socket, event, details = {}) {
  console.info(`[voice/client] ${event}`, {
    socketId: socket?.id || null,
    ...details
  });
}

function buildLocalMessagePreview(content = "", attachments = [], sticker = null) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (normalized) {
    return normalized.length > 84 ? `${normalized.slice(0, 81)}...` : normalized;
  }

  if (sticker?.name) {
    return `[sticker] ${sticker.name}`;
  }

  if (!attachments.length) {
    return "";
  }

  if (attachments.length === 1) {
    return attachments[0]?.content_type?.startsWith("image/")
      ? "[imagen]"
      : `[${attachments[0]?.name || "archivo"}]`;
  }

  return `[${attachments.length} adjuntos]`;
}

function buildOptimisticMessage({
  activeGuild,
  attachments,
  channelId,
  clientNonce,
  content,
  createdAt,
  currentUser,
  currentUserDisplayName,
  replyTo,
  sticker = null
}) {
  return {
    id: `temp-${clientNonce}`,
    client_nonce: clientNonce,
    optimistic: true,
    channel_id: channelId,
    guild_id: activeGuild?.id || null,
    author_id: currentUser?.id || "",
    content: String(content || "").trim(),
    reply_to: replyTo?.id || null,
    sticker,
    attachments,
    mention_user_ids: [],
    edited_at: null,
    deleted_at: null,
    created_at: createdAt,
    author: currentUser
      ? {
          id: currentUser.id,
          username: currentUser.username,
          discriminator: currentUser.discriminator,
          avatar_hue: currentUser.avatar_hue,
          avatar_url: currentUser.avatar_url || "",
          profile_banner_url: currentUser.profile_banner_url || "",
          profile_color: currentUser.profile_color || "#5865F2",
          status: currentUser.status === "invisible" ? "offline" : currentUser.status
        }
      : null,
    display_name: currentUserDisplayName,
    can_edit: true,
    can_delete: true,
    is_mentioning_me: false,
    reply_preview: replyTo
      ? {
          id: replyTo.id,
          author_name:
            replyTo.display_name ||
            replyTo.author?.username ||
            replyTo.author?.display_name ||
            "Usuario",
          content: String(replyTo.content || "").replace(/\s+/g, " ").trim().slice(0, 120)
        }
      : null,
    reactions: []
  };
}

export function createWorkspaceCoreActions(context) {
  const {
    accessToken,
    activeGuild,
    activeSelection,
    activeSelectionRef,
    attachmentInputRef,
    attachmentUploadCounterRef,
    composer,
    composerAttachments,
    composerRef,
    currentUserLabel,
    dialog,
    editingMessage,
    hasMore,
    historyScrollStateRef,
    isVoiceChannel,
    joinedVoiceChannelId,
    lastTypingAtRef,
    listRef,
    loadBootstrap,
    loadMessages,
    loadingHistoryMessages,
    loadingMessages,
    localReadStateRef,
    messageLoadError,
    messages,
    patchChannelMessages,
    pendingDirectDmRef,
    readChannelCache,
    replyMentionEnabled,
    replyTarget,
    selectedVoiceDevices,
    submittingMessage,
    setActiveSelection,
    setAppError,
    setComposer,
    setComposerAttachments,
    setComposerMenuOpen,
    setComposerPicker,
    setDialog,
    setEditingMessage,
    setHeaderPanel,
    setJoinedVoiceChannelId,
    setMessageLoadError,
    setProfileCard,
    setReplyMentionEnabled,
    setReplyTarget,
    setSelectedVoiceDevices,
    setSubmittingMessage,
    setUiNotice,
    setUploadingAttachments,
    setVoiceMenu,
    setVoiceJoinReadyChannelId,
    setVoiceSessions,
    setVoiceState,
    setWorkspace,
    voiceDevices,
    workspace
  } = context;
  const currentUserId = workspace?.current_user?.id || "";

  function sanitizeAttachmentForMessage(attachment) {
    if (!attachment) {
      return attachment;
    }

    const {
      alt_text,
      display_name,
      is_spoiler,
      local_id: _localId,
      preview_url: _previewUrl,
      upload_error: _uploadError,
      upload_status: _uploadStatus,
      ...sanitized
    } = attachment;

    const nextName = String(display_name || sanitized.name || "").trim();
    const nextAltText = String(alt_text || "").trim();

    return {
      ...sanitized,
      alt_text: nextAltText,
      is_spoiler: Boolean(is_spoiler),
      name: nextName || sanitized.name || "Adjunto"
    };
  }

  function isAttachmentReady(attachment) {
    return attachment?.upload_status !== "uploading" && attachment?.upload_status !== "failed";
  }

  function applyLocalVoicePresence(nextChannelId = null) {
    if (!currentUserId) {
      return;
    }

    setVoiceSessions((previous) => {
      const nextState = {};

      Object.entries(previous || {}).forEach(([channelId, userIds]) => {
        const filteredIds = (Array.isArray(userIds) ? userIds : []).filter(
          (userId) => userId !== currentUserId
        );
        if (filteredIds.length) {
          nextState[channelId] = filteredIds;
        }
      });

      if (nextChannelId) {
        const existing = nextState[nextChannelId] || [];
        nextState[nextChannelId] = existing.includes(currentUserId)
          ? existing
          : [...existing, currentUserId];
      }

      return nextState;
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const element = listRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }

  function applyPreview(preview) {
    if (!preview) {
      return;
    }

    setWorkspace((previous) =>
      applyChannelPreviewToWorkspace(previous, preview, {
        localReadStateByChannel: localReadStateRef.current,
        openChannelId: activeSelectionRef.current.channelId
      })
    );
  }

  function showUiNotice(message) {
    setUiNotice(message);
  }

  function toggleHeaderPanel(panelName) {
    setHeaderPanel((previous) => (previous === panelName ? null : panelName));
  }

  function toggleVoiceState(key) {
    setVoiceState((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  }

  function toggleVoiceMenu(name) {
    setVoiceMenu((previous) => (previous === name ? null : name));
  }

  function updateVoiceSetting(key, value) {
    setVoiceState((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  function handleVoiceDeviceChange(kind, value) {
    setSelectedVoiceDevices((previous) => ({
      ...previous,
      [kind]: value
    }));
  }

  function cycleVoiceDevice(kind) {
    const devices = voiceDevices[kind] || [];
    if (!devices.length) {
      return;
    }

    const currentIndex = devices.findIndex(
      (device) => device.deviceId === selectedVoiceDevices[kind]
    );
    const nextDevice = devices[(currentIndex + 1 + devices.length) % devices.length];
    handleVoiceDeviceChange(kind, nextDevice.deviceId);
    showUiNotice(
      `Ahora usando ${nextDevice.label || fallbackDeviceLabel(kind, (currentIndex + 1) % devices.length)}.`
    );
  }

  function getSelectedDeviceLabel(kind) {
    const selectedId = selectedVoiceDevices[kind];
    const devices = voiceDevices[kind] || [];
    const index = devices.findIndex((device) => device.deviceId === selectedId);
    const device = index >= 0 ? devices[index] : devices[0];

    if (!device) {
      return "Configuracion predeterminada";
    }

    return device.label || fallbackDeviceLabel(kind, Math.max(index, 0));
  }

  function appendToComposer(token) {
    setComposer((previous) => {
      const prefix = previous && !previous.endsWith(" ") ? `${previous} ` : previous;
      return `${prefix}${token}`;
    });

    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }

  function getLiveSocket() {
    const socket = getSocket(accessToken);
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  function handleComposerChange(value) {
    setComposer(value);
    const now = Date.now();
    if (
      activeSelection.channelId &&
      workspace?.current_user &&
      now - lastTypingAtRef.current > 1200
    ) {
      getLiveSocket().emit("typing:start", {
        channelId: activeSelection.channelId
      });
      lastTypingAtRef.current = now;
    }
  }

  function handleComposerShortcut(shortcut) {
    setComposerMenuOpen(false);
    if (shortcut.id === "upload") {
      if (editingMessage) {
        showUiNotice("Por ahora los adjuntos nuevos se agregan solo en mensajes nuevos.");
        return;
      }

      if (isVoiceChannel) {
        showUiNotice("Los canales de voz no aceptan mensajes ni adjuntos.");
        return;
      }

      attachmentInputRef.current?.click();
      return;
    }

    showUiNotice(shortcut.description);
  }

  function handlePickerInsert(value) {
    appendToComposer(value);
    setComposerPicker(null);
  }

  function handleScroll() {
    const element = listRef.current;
    const scrollState = historyScrollStateRef?.current;
    const scrollTop = element?.scrollTop ?? 0;
    const previousScrollTop = scrollState?.lastScrollTop ?? scrollTop;
    const distanceFromBottom = element
      ? element.scrollHeight - element.scrollTop - element.clientHeight
      : 0;
    const scrollingDown = scrollTop > previousScrollTop + 1;

    if (scrollState && (scrollingDown || distanceFromBottom <= 120)) {
      scrollState.cancelViewportStabilizer?.();
      scrollState.pendingViewportTracker?.stop?.();
      scrollState.cancelViewportStabilizer = null;
      scrollState.pendingViewportTracker = null;
    }

    if (scrollState) {
      if (distanceFromBottom <= 20) {
        scrollState.autoSyncToLatest = true;
      } else if (distanceFromBottom > 72) {
        scrollState.autoSyncToLatest = false;
      }

      if (scrollTop > 140) {
        scrollState.loadArmed = true;
      }
    }

    if (element && distanceFromBottom <= 4) {
      element.scrollTop = element.scrollHeight;
    }

    const settledScrollTop = element?.scrollTop ?? scrollTop;

    if (!element || loadingMessages || loadingHistoryMessages || !hasMore || !messages.length) {
      if (scrollState) {
        scrollState.lastScrollTop = settledScrollTop;
      }
      return;
    }

    const shouldLoadHistory =
      scrollTop < 120 && (!scrollState || scrollState.loadArmed);

    if (shouldLoadHistory) {
      if (scrollState) {
        scrollState.loadArmed = false;
      }

      loadMessages({
        before: messages[0].id,
        prepend: true
      });
    }

    if (scrollState) {
      scrollState.lastScrollTop = settledScrollTop;
    }
  }

  async function handleJumpToLatest() {
    if (!activeSelectionRef.current.channelId) {
      return;
    }

    if (historyScrollStateRef?.current) {
      historyScrollStateRef.current.cancelViewportStabilizer?.();
      historyScrollStateRef.current.pendingViewportTracker?.stop?.();
      historyScrollStateRef.current.cancelViewportStabilizer = null;
      historyScrollStateRef.current.pendingViewportTracker = null;
      historyScrollStateRef.current.autoSyncToLatest = true;
      historyScrollStateRef.current.loadArmed = true;
    }

    try {
      await loadMessages({
        channelId: activeSelectionRef.current.channelId,
        force: true,
        limit: 24,
        resetWindow: true
      });

      requestAnimationFrame(() => {
        const element = listRef.current;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      });
    } catch {
      // keep silent on jump-to-latest
    }
  }

  async function handleRetryMessages() {
    const currentSelection = {
      channelId: activeSelectionRef.current?.channelId || null,
      guildId: activeSelectionRef.current?.guildId || null,
      kind: activeSelectionRef.current?.kind || "guild"
    };
    const currentChannelId = currentSelection.channelId;

    if (!currentChannelId) {
      return;
    }

    if (historyScrollStateRef?.current) {
      historyScrollStateRef.current.cancelViewportStabilizer?.();
      historyScrollStateRef.current.pendingViewportTracker?.stop?.();
      historyScrollStateRef.current.cancelViewportStabilizer = null;
      historyScrollStateRef.current.pendingViewportTracker = null;
      historyScrollStateRef.current.loadArmed = true;
    }

    setAppError("");
    setMessageLoadError?.(null);

    const currentLookup = findChannelInSession(workspace, currentChannelId);
    const shouldResyncWorkspace =
      !currentLookup?.channel ||
      messageLoadError?.kind === "missing-channel" ||
      messageLoadError?.kind === "forbidden" ||
      messageLoadError?.kind === "unauthorized";

    if (shouldResyncWorkspace) {
      await loadBootstrap(currentSelection);

      const nextSelection = activeSelectionRef.current;
      const selectionChanged =
        nextSelection?.channelId !== currentSelection.channelId ||
        nextSelection?.guildId !== currentSelection.guildId ||
        (nextSelection?.kind || "guild") !== currentSelection.kind;

      if (selectionChanged || !nextSelection?.channelId) {
        return;
      }
    }

    const retryChannelId = activeSelectionRef.current.channelId;
    const cachedEntry = readChannelCache(retryChannelId);

    await loadMessages({
      channelId: retryChannelId,
      force: true,
      resetWindow: !(cachedEntry?.messages?.length > 0)
    });
  }

  async function handleSubmitMessage(event) {
    event.preventDefault();
    if (
      submittingMessage ||
      (!composer.trim() && !composerAttachments.length) ||
      !activeSelection.channelId ||
      isVoiceChannel
    ) {
      return;
    }

    const pendingAttachments = composerAttachments.filter(
      (attachment) => attachment?.upload_status === "uploading"
    );
    if (pendingAttachments.length) {
      showUiNotice("Espera a que terminen de subirse los adjuntos antes de enviarlos.");
      return;
    }

    const failedAttachments = composerAttachments.filter(
      (attachment) => attachment?.upload_status === "failed"
    );
    if (failedAttachments.length) {
      showUiNotice("Quita o vuelve a subir los adjuntos que fallaron antes de enviar.");
      return;
    }

    const draftComposer = composer;
    const draftComposerAttachments = composerAttachments;
    const draftAttachments = draftComposerAttachments.map(sanitizeAttachmentForMessage);
    const draftReplyTarget = replyTarget;
    const draftReplyMentionEnabled = replyMentionEnabled;
    let pendingClientNonce = null;

    try {
      setSubmittingMessage(true);

      if (editingMessage) {
        await api.updateMessage({
          content: composer,
          messageId: editingMessage.id
        });
      } else {
        const clientNonce =
          globalThis.crypto?.randomUUID?.() ||
          `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        pendingClientNonce = clientNonce;
        const createdAt = new Date().toISOString();
        const currentUser = workspace?.current_user || null;
        const currentUserDisplayName =
          activeGuild?.members.find((member) => member.id === currentUser?.id)?.display_name ||
          currentUserLabel;
        const optimisticMessage = buildOptimisticMessage({
          activeGuild,
          attachments: draftAttachments,
          channelId: activeSelection.channelId,
          clientNonce,
          content: draftComposer,
          createdAt,
          currentUser,
          currentUserDisplayName,
          replyTo: draftReplyTarget
        });
        const optimisticPreview = {
          id: activeSelection.channelId,
          last_message_id: optimisticMessage.id,
          last_message_author_id: currentUser?.id || null,
          last_message_preview: buildLocalMessagePreview(draftComposer, draftAttachments),
          last_message_at: createdAt
        };

        patchChannelMessages(activeSelection.channelId, (previous) =>
          upsertChannelMessage(previous, optimisticMessage)
        );
        applyPreview(optimisticPreview);
        if (historyScrollStateRef?.current) {
          historyScrollStateRef.current.cancelViewportStabilizer?.();
          historyScrollStateRef.current.pendingViewportTracker?.stop?.();
          historyScrollStateRef.current.cancelViewportStabilizer = null;
          historyScrollStateRef.current.pendingViewportTracker = null;
          historyScrollStateRef.current.autoSyncToLatest = true;
          historyScrollStateRef.current.loadArmed = true;
        }
        scrollToBottom();

        setComposer("");
        setReplyTarget(null);
        setReplyMentionEnabled(true);
        setEditingMessage(null);

        const payload = await api.createMessage({
          attachments: draftAttachments,
          channelId: activeSelection.channelId,
          clientNonce,
          content: draftComposer,
          replyMentionUserId:
            draftReplyTarget && draftReplyMentionEnabled
              ? draftReplyTarget.author?.id || null
              : null,
          replyTo: draftReplyTarget?.id || null
        });

        applyPreview(payload?.preview);

        if (payload?.message) {
          patchChannelMessages(activeSelection.channelId, (previous) =>
            previous.map((item) =>
              item.client_nonce === clientNonce ? payload.message : item
            )
          );
        }

        setComposerAttachments([]);
      }

      if (editingMessage) {
        setComposer("");
        setComposerAttachments([]);
        setReplyTarget(null);
        setReplyMentionEnabled(true);
        setEditingMessage(null);
      }
      setAppError("");
    } catch (error) {
      if (!editingMessage) {
        patchChannelMessages(activeSelection.channelId, (previous) =>
          previous.filter((item) => item.client_nonce !== pendingClientNonce)
        );
        setComposer(draftComposer);
        setComposerAttachments(draftComposerAttachments);
        setReplyTarget(draftReplyTarget);
        setReplyMentionEnabled(draftReplyMentionEnabled);
        await loadBootstrap(activeSelectionRef.current);
      }
      setAppError(error.message);
    } finally {
      setSubmittingMessage(false);
    }
  }

  async function handleDeleteMessage(message) {
    if (!window.confirm("Eliminar este mensaje?")) {
      return;
    }

    try {
      await api.deleteMessage({
        messageId: message.id
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleReaction(messageId, emoji) {
    const channelId = activeSelectionRef.current.channelId;
    const currentUserId = workspace?.current_user?.id;
    const cachedMessage = (readChannelCache(channelId)?.messages || []).find(
      (message) => message.id === messageId
    );

    if (channelId && currentUserId) {
      patchChannelMessages(channelId, (previous) =>
        toggleReactionBucket(previous, {
          emoji,
          messageId,
          userId: currentUserId
        })
      );
    }

    try {
      const payload = await api.toggleReaction({
        emoji,
        messageId
      });

      if (payload?.message?.channel_id) {
        patchChannelMessages(payload.message.channel_id, (previous) =>
          previous.map((item) => (item.id === payload.message.id ? payload.message : item))
        );
      }
    } catch (error) {
      if (channelId && cachedMessage) {
        patchChannelMessages(channelId, (previous) =>
          previous.map((message) => (message.id === messageId ? cachedMessage : message))
        );
      }
      setAppError(error.message);
    }
  }

  async function handleStatusChange(status) {
    try {
      await api.updateStatus({
        status
      });
      setProfileCard((previous) =>
        previous?.profile?.id === workspace?.current_user?.id
          ? {
              ...previous,
              profile: {
                ...previous.profile,
                status
              }
            }
          : previous
      );
      await loadBootstrap(activeSelectionRef.current);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleProfileUpdate(nextProfile) {
    try {
      const {
        avatarFile,
        avatarUrl: requestedAvatarUrl,
        bannerFile,
        bannerImageUrl: requestedBannerImageUrl,
        clearAvatar,
        clearBanner,
        ...profilePatch
      } = nextProfile;
      let avatarUrl = requestedAvatarUrl;
      let bannerImageUrl = requestedBannerImageUrl;

      if (avatarFile) {
        const uploadPayload = await api.uploadAttachments([avatarFile]);
        avatarUrl = uploadPayload.attachments?.[0]?.url;

        if (!avatarUrl) {
          throw new Error("No se pudo subir la foto de perfil.");
        }
      } else if (clearAvatar) {
        avatarUrl = "";
      }

      if (bannerFile) {
        const uploadPayload = await api.uploadAttachments([bannerFile]);
        bannerImageUrl = uploadPayload.attachments?.[0]?.url;

        if (!bannerImageUrl) {
          throw new Error("No se pudo subir la imagen del panel.");
        }
      } else if (clearBanner) {
        bannerImageUrl = "";
      }

      await api.updateProfile({
        ...profilePatch,
        avatarUrl,
        bannerImageUrl
      });
      await loadBootstrap(activeSelectionRef.current);

      if (activeSelectionRef.current.channelId) {
        await loadMessages({
          channelId: activeSelectionRef.current.channelId
        });
      }

      setAppError("");
      showUiNotice("Perfil actualizado.");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  async function handleDialogSubmit(values) {
    if (!dialog) {
      return;
    }

    try {
      if (dialog.type === "guild") {
        const payload = await api.createGuild({
          description: values.description,
          name: values.name,
          templateId: values.templateId
        });
        await loadBootstrap(
          {
            channelId: payload.channel_id,
            guildId: payload.guild_id,
            kind: "guild"
          },
          {
            selectionMode: "target"
          }
        );
      }

      if (dialog.type === "channel") {
        if (!activeGuild?.permissions?.can_manage_channels) {
          throw new Error("Solo el administrador puede cambiar la estructura del servidor.");
        }

        const payload = await api.createChannel({
          guildId: activeGuild.id,
          kind: values.kind,
          name: values.name,
          parentId: values.parentId,
          topic: values.topic
        });
        await loadBootstrap(
          {
            channelId: payload.channel.id,
            guildId: activeGuild.id,
            kind: "guild"
          },
          {
            selectionMode: "target"
          }
        );
      }

      if (dialog.type === "category") {
        if (!activeGuild?.permissions?.can_manage_channels) {
          throw new Error("Solo el administrador puede cambiar la estructura del servidor.");
        }

        await api.createCategory({
          guildId: activeGuild.id,
          name: values.name
        });
        await loadBootstrap(
          {
            channelId: activeSelectionRef.current.channelId,
            guildId: activeGuild.id,
            kind: "guild"
          },
          {
            selectionMode: "target"
          }
        );
      }

      if (dialog.type === "dm") {
        const recipientId = values.recipientId;
        const existingDm = findDirectDmByUserId(
          workspace?.dms || [],
          workspace?.current_user?.id,
          recipientId
        );

        if (existingDm) {
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
        } else {
          if (pendingDirectDmRef.current.has(recipientId)) {
            return;
          }

          pendingDirectDmRef.current.add(recipientId);

          try {
            const payload = await api.createDm({
              recipientId
            });
            await loadBootstrap(
              {
                channelId: payload.channel.id,
                guildId: null,
                kind: "dm"
              },
              {
                selectionMode: "target"
              }
            );
          } finally {
            pendingDirectDmRef.current.delete(recipientId);
          }
        }
      }

      if (dialog.type === "dm_group") {
        const payload = await api.createGroupDm({
          name: values.name,
          recipientIds: values.recipientIds
        });
        await loadBootstrap(
          {
            channelId: payload.channel.id,
            guildId: null,
            kind: "dm"
          },
          {
            selectionMode: "target"
          }
        );
      }

      setDialog(null);
      setAppError("");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  async function handleStickerSelect(sticker) {
    if (!sticker?.id) {
      return;
    }

    if (editingMessage) {
      showUiNotice("Por ahora los stickers se envian como mensajes nuevos.");
      return;
    }

    if (activeSelection.kind !== "guild" || !activeSelection.channelId || isVoiceChannel) {
      showUiNotice("Los stickers del servidor solo funcionan en canales de texto del servidor.");
      return;
    }

    const draftReplyTarget = replyTarget;
    const draftReplyMentionEnabled = replyMentionEnabled;
    const clientNonce =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `nonce-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const createdAt = new Date().toISOString();
    const currentUser = workspace?.current_user || null;
    const currentUserDisplayName =
      activeGuild?.members.find((member) => member.id === currentUser?.id)?.display_name ||
      currentUserLabel;
    const optimisticMessage = buildOptimisticMessage({
      activeGuild,
      attachments: [],
      channelId: activeSelection.channelId,
      clientNonce,
      content: "",
      createdAt,
      currentUser,
      currentUserDisplayName,
      replyTo: draftReplyTarget,
      sticker
    });
    const optimisticPreview = {
      id: activeSelection.channelId,
      last_message_id: optimisticMessage.id,
      last_message_author_id: currentUser?.id || null,
      last_message_preview: buildLocalMessagePreview("", [], sticker),
      last_message_at: createdAt
    };

    patchChannelMessages(activeSelection.channelId, (previous) =>
      upsertChannelMessage(previous, optimisticMessage)
    );
    applyPreview(optimisticPreview);
    scrollToBottom();

    setComposerPicker(null);
    setReplyTarget(null);
    setReplyMentionEnabled(true);

    try {
      const payload = await api.createMessage({
        attachments: [],
        channelId: activeSelection.channelId,
        clientNonce,
        content: "",
        stickerId: sticker.id,
        replyMentionUserId:
          draftReplyTarget && draftReplyMentionEnabled
            ? draftReplyTarget.author?.id || null
            : null,
        replyTo: draftReplyTarget?.id || null
      });

      applyPreview(payload?.preview);

      if (payload?.message) {
        patchChannelMessages(activeSelection.channelId, (previous) =>
          previous.map((item) =>
            item.client_nonce === clientNonce ? payload.message : item
          )
        );
      }

      setAppError("");
    } catch (error) {
      patchChannelMessages(activeSelection.channelId, (previous) =>
        previous.filter((item) => item.client_nonce !== clientNonce)
      );
      setReplyTarget(draftReplyTarget);
      setReplyMentionEnabled(draftReplyMentionEnabled);
      await loadBootstrap(activeSelectionRef.current);
      setAppError(error.message);
    }
  }

  async function handleAttachmentSelection(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";

    if (!files.length) {
      return;
    }

    if (submittingMessage) {
      showUiNotice("Espera a que el mensaje actual termine de enviarse antes de subir mas archivos.");
      return;
    }

    const remainingSlots = Math.max(0, MAX_COMPOSER_ATTACHMENTS - composerAttachments.length);
    if (!remainingSlots) {
      showUiNotice(`Solo puedes preparar hasta ${MAX_COMPOSER_ATTACHMENTS} adjuntos por mensaje.`);
      return;
    }

    const nextFiles = files.slice(0, remainingSlots);
    const discardedCount = files.length - nextFiles.length;
    const localDrafts = nextFiles.map((file, index) => {
      const localId =
        globalThis.crypto?.randomUUID?.() ||
        `attachment-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

      return {
        alt_text: "",
        content_type: file.type || "application/octet-stream",
        display_name: file.name || `Adjunto ${composerAttachments.length + index + 1}`,
        is_spoiler: false,
        local_id: localId,
        name: file.name || `Adjunto ${composerAttachments.length + index + 1}`,
        preview_url: file.type?.startsWith("image/") ? URL.createObjectURL(file) : "",
        size: file.size || 0,
        upload_error: "",
        upload_status: "uploading"
      };
    });

    const localIds = new Set(localDrafts.map((attachment) => attachment.local_id));
    setComposerAttachments((previous) => [...previous, ...localDrafts].slice(0, MAX_COMPOSER_ATTACHMENTS));
    attachmentUploadCounterRef.current += 1;
    setUploadingAttachments(true);

    try {
      const payload = await api.uploadAttachments(nextFiles);
      const uploadedAttachments = payload.attachments || [];

      setComposerAttachments((previous) =>
        previous.map((attachment) => {
          if (!localIds.has(attachment.local_id)) {
            return attachment;
          }

          const draftIndex = localDrafts.findIndex((draft) => draft.local_id === attachment.local_id);
          const uploadedAttachment = draftIndex >= 0 ? uploadedAttachments[draftIndex] : null;

          if (!uploadedAttachment) {
            return {
              ...attachment,
              upload_error: "No se pudo procesar este adjunto.",
              upload_status: "failed"
            };
          }

          return {
            ...attachment,
            ...uploadedAttachment,
            local_id: attachment.local_id,
            preview_url: attachment.preview_url,
            upload_error: "",
            upload_status: "ready"
          };
        })
      );

      const uploadedCount = uploadedAttachments.length || nextFiles.length;
      showUiNotice(
        discardedCount
          ? `${uploadedCount} adjunto(s) listos. Solo se guardaron ${nextFiles.length} porque el maximo es ${MAX_COMPOSER_ATTACHMENTS}.`
          : `${uploadedCount} adjunto(s) listos para enviar.`
      );
      setAppError("");
    } catch (error) {
      setComposerAttachments((previous) =>
        previous.map((attachment) =>
          localIds.has(attachment.local_id)
            ? {
                ...attachment,
                upload_error: error.message,
                upload_status: "failed"
              }
            : attachment
        )
      );
      setAppError(error.message);
    } finally {
      attachmentUploadCounterRef.current = Math.max(0, attachmentUploadCounterRef.current - 1);
      setUploadingAttachments(attachmentUploadCounterRef.current > 0);
    }
  }

  function removeComposerAttachment(targetAttachment) {
    setComposerAttachments((previous) =>
      previous.filter((attachment) => attachmentKey(attachment) !== attachmentKey(targetAttachment))
    );
  }

  function updateComposerAttachment(targetAttachment, patch = {}) {
    const targetKey = attachmentKey(targetAttachment);
    if (!targetKey) {
      return;
    }

    setComposerAttachments((previous) =>
      previous.map((attachment) => {
        if (attachmentKey(attachment) !== targetKey) {
          return attachment;
        }

        return {
          ...attachment,
          ...patch
        };
      })
    );
  }

  function joinVoiceChannelById(channelId, { enableCamera = false } = {}) {
    if (!accessToken || !channelId) {
      return false;
    }

    const targetLookup = findChannelInSession(workspace, channelId);
    const targetChannel = targetLookup?.channel || null;

    if (!targetChannel) {
      return false;
    }

    if (targetLookup.kind === "guild") {
      if (!targetChannel.is_voice || !targetLookup.guild) {
        return false;
      }

      setVoiceMenu(null);
      setActiveSelection({
        channelId: targetChannel.id,
        guildId: targetLookup.guild.id,
        kind: "guild"
      });
      setVoiceJoinReadyChannelId(null);
      applyLocalVoicePresence(targetChannel.id);
      const socket = getLiveSocket();
      logVoiceClient(socket, "join:emit", {
        channelId: targetChannel.id,
        selectionKind: "guild"
      });
      socket.emit("voice:join", {
        channelId: targetChannel.id
      });
      setJoinedVoiceChannelId(targetChannel.id);
      return true;
    }

    if (targetLookup.kind === "dm" && DIRECT_CALL_TYPES.has(targetChannel.type)) {
      setVoiceMenu(null);
      setActiveSelection({
        channelId: targetChannel.id,
        guildId: null,
        kind: "dm"
      });

      if (enableCamera) {
        setVoiceState((previous) => ({
          ...previous,
          cameraEnabled: true
        }));
      }

      setVoiceJoinReadyChannelId(null);
      applyLocalVoicePresence(targetChannel.id);
      const socket = getLiveSocket();
      logVoiceClient(socket, "join:emit", {
        channelId: targetChannel.id,
        selectionKind: targetChannel.type || "dm"
      });
      socket.emit("voice:join", {
        channelId: targetChannel.id
      });
      setJoinedVoiceChannelId(targetChannel.id);
      return true;
    }

    return false;
  }

  function handleSelectGuildChannel(channel) {
    if (channel.is_voice) {
      if (joinVoiceChannelById(channel.id)) {
        return;
      }
    }

    setVoiceMenu(null);
    setActiveSelection({
      channelId: channel.id,
      guildId: activeGuild.id,
      kind: "guild"
    });
  }

  function handleJoinDirectCall({ enableCamera = false } = {}) {
    const selectedChannel = activeSelectionRef.current?.channelId
      ? findChannelInSession(workspace, activeSelectionRef.current.channelId)?.channel
      : null;

    if (
      !accessToken ||
      activeSelectionRef.current?.kind !== "dm" ||
      !selectedChannel ||
      !DIRECT_CALL_TYPES.has(selectedChannel.type)
    ) {
      return;
    }

    joinVoiceChannelById(selectedChannel.id, { enableCamera });
  }

  function handleVoiceLeave() {
    const previousChannelId = joinedVoiceChannelId;
    applyLocalVoicePresence(null);
    setVoiceMenu(null);
    setHeaderPanel(null);
    setJoinedVoiceChannelId(null);
    setVoiceJoinReadyChannelId(null);
    setVoiceState((previous) => ({
      ...previous,
      cameraEnabled: false,
      deafen: false,
      inputMonitoring: false,
      micMuted: false,
      screenShareEnabled: false
    }));
    setAppError("");

    if (!previousChannelId || !accessToken) {
      return;
    }

    try {
      const socket = getLiveSocket();
      logVoiceClient(socket, "leave:emit", {
        channelId: previousChannelId
      });
      socket.emit("voice:leave", {
        channelId: previousChannelId
      });
    } catch {
      // Keep optimistic local cleanup even if the socket is not ready.
    }
  }

  return {
    appendToComposer,
    cycleVoiceDevice,
    getSelectedDeviceLabel,
    handleAttachmentSelection,
    handleComposerChange,
    handleComposerShortcut,
    handleDeleteMessage,
    handleDialogSubmit,
    handleJoinDirectCall,
    handlePickerInsert,
    handleProfileUpdate,
    handleReaction,
    handleRetryMessages,
    handleScroll,
    handleJumpToLatest,
    joinVoiceChannelById,
    handleSelectGuildChannel,
    handleStatusChange,
    handleStickerSelect,
    handleSubmitMessage,
    updateComposerAttachment,
    handleVoiceDeviceChange,
    handleVoiceLeave,
    removeComposerAttachment,
    showUiNotice,
    toggleHeaderPanel,
    toggleVoiceMenu,
    toggleVoiceState,
    updateVoiceSetting
  };
}
