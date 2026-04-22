import { api } from "../../../api.js";
import { findChannelInSession } from "../../../utils.js";
import {
  MESSAGE_CONTENT_MAX_LENGTH,
  clampComposerContent
} from "../messaging/composer/messageComposerLimits.js";
import {
  toggleReactionBucket,
  upsertChannelMessage
} from "../workspaceHelpers.js";
import {
  buildLocalMessagePreview,
  buildOptimisticMessage
} from "../workspaceCoreActionHelpers.js";

export function createWorkspaceComposerActions(context, shared) {
  const {
    activeGuild,
    activeSelection,
    activeSelectionRef,
    attachmentInputRef,
    composer,
    composerAttachments,
    composerRef,
    currentUserLabel,
    editingMessage,
    hasMore,
    historyScrollStateRef,
    isVoiceChannel,
    lastTypingAtRef,
    listRef,
    loadBootstrap,
    loadMessages,
    loadingHistoryMessages,
    loadingMessages,
    messageLoadError,
    messages,
    patchChannelMessages,
    readChannelCache,
    replyMentionEnabled,
    replyTarget,
    setActiveSelection,
    setAppError,
    setComposer,
    setComposerAttachments,
    setComposerMenuOpen,
    setComposerPicker,
    setEditingMessage,
    setMessageLoadError,
    setReplyMentionEnabled,
    setReplyTarget,
    setSubmittingMessage,
    submittingMessage,
    workspace
  } = context;
  const {
    applyPreview,
    currentUserId,
    getLiveSocket,
    playSound,
    sanitizeAttachmentForMessage,
    scrollToBottom,
    showUiNotice
  } = shared;

  function appendToComposer(token) {
    setComposer((previous) => {
      const prefix = previous && !previous.endsWith(" ") ? `${previous} ` : previous;
      return clampComposerContent(`${prefix}${token}`);
    });

    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }

  function handleComposerChange(value) {
    setComposer(clampComposerContent(value));
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

  function resolveCurrentUserDisplayName() {
    const currentUser = workspace?.current_user || null;
    return (
      activeGuild?.members.find((member) => member.id === currentUser?.id)?.display_name ||
      currentUserLabel
    );
  }

  async function handleSubmitMessage(event) {
    event.preventDefault();
    if (composer.length > MESSAGE_CONTENT_MAX_LENGTH) {
      showUiNotice(`Los mensajes no pueden superar ${MESSAGE_CONTENT_MAX_LENGTH} caracteres.`);
      return;
    }

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
        const optimisticMessage = buildOptimisticMessage({
          activeGuild,
          attachments: draftAttachments,
          channelId: activeSelection.channelId,
          clientNonce,
          content: draftComposer,
          createdAt,
          currentUser,
          currentUserDisplayName: resolveCurrentUserDisplayName(),
          replyTo: draftReplyTarget
        });
        const optimisticPreview = {
          id: activeSelection.channelId,
          last_message_at: createdAt,
          last_message_author_id: currentUser?.id || null,
          last_message_id: optimisticMessage.id,
          last_message_preview: buildLocalMessagePreview(draftComposer, draftAttachments)
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
        playSound("messageSend");

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

  async function handleTogglePinnedMessage(message) {
    if (!message?.id) {
      return;
    }

    try {
      const payload = await api.togglePinnedMessage({
        messageId: message.id
      });

      if (payload?.message?.channel_id) {
        patchChannelMessages(payload.message.channel_id, (previous) =>
          previous.map((item) => (item.id === payload.message.id ? payload.message : item))
        );
      }

      showUiNotice(
        payload?.message?.is_pinned
          ? "Mensaje fijado."
          : "Mensaje desfijado."
      );
      setAppError("");
    } catch (error) {
      setAppError(error.message);
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
    const optimisticMessage = buildOptimisticMessage({
      activeGuild,
      attachments: [],
      channelId: activeSelection.channelId,
      clientNonce,
      content: "",
      createdAt,
      currentUser,
      currentUserDisplayName: resolveCurrentUserDisplayName(),
      replyTo: draftReplyTarget,
      sticker
    });
    const optimisticPreview = {
      id: activeSelection.channelId,
      last_message_at: createdAt,
      last_message_author_id: currentUser?.id || null,
      last_message_id: optimisticMessage.id,
      last_message_preview: buildLocalMessagePreview("", [], sticker)
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
        replyMentionUserId:
          draftReplyTarget && draftReplyMentionEnabled
            ? draftReplyTarget.author?.id || null
            : null,
        replyTo: draftReplyTarget?.id || null,
        stickerId: sticker.id
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

  return {
    appendToComposer,
    handleComposerChange,
    handleComposerShortcut,
    handleDeleteMessage,
    handleJumpToLatest,
    handlePickerInsert,
    handleReaction,
    handleRetryMessages,
    handleScroll,
    handleStickerSelect,
    handleSubmitMessage,
    handleTogglePinnedMessage
  };
}
