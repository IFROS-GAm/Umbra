import React from "react";

import { translate } from "../../i18n.js";
import { DirectMessageHero } from "./DirectMessagePanels.jsx";
import { MessageComposer } from "./MessageComposer.jsx";
import { VirtualMessageFeed } from "./VirtualMessageFeed.jsx";

export function MessageStage(props) {
  const {
    activeChannel,
    activeSelectionKind,
    attachmentInputRef,
    composer,
    composerAttachments,
    composerMenuOpen,
    composerPicker,
    composerRef,
    directMessageProfile,
    editingMessage,
    handleAttachmentSelection,
    handleComposerChange,
    handleComposerShortcut,
    handleDeleteMessage,
    handlePickerInsert,
    handleReaction,
    handleStickerSelect,
    handleScroll,
    handleSubmitMessage,
    guildStickers,
    language = "es",
    listRef,
    loadingHistoryMessages,
    loadingMessages,
    messageLoadError,
    messageMenuFor,
    messages,
    onAcceptFriendRequest,
    onAddFriend,
    onBlockUser,
    onCancelEdit,
    onCancelFriendRequest,
    onCancelReply,
    onEditMessage,
    onReportUser,
    onSetComposerMenuOpen,
    onSetComposerPicker,
    onSetMessageMenuFor,
    onSetReactionPickerFor,
    onStartReply,
    onJumpToLatest,
    onRetryMessages,
    onToggleReplyMention,
    onShowNotice,
    openProfileCard,
    reactionPickerFor,
    removeComposerAttachment,
    replyMentionEnabled,
    replyTarget,
    showUiNotice,
    typingUsers,
    uiNotice,
    uploadingAttachments,
    availableUsersById
  } = props;
  const t = (key, fallback) => translate(language, key, fallback);

  async function copyToClipboard(value, successMessage) {
    if (!value) {
      showUiNotice(t("message.notice.nothingToCopy", "No hay nada para copiar."));
      return;
    }

    try {
      await navigator.clipboard.writeText(String(value));
      showUiNotice(successMessage);
    } catch {
      showUiNotice(t("message.notice.copyFailed", "No se pudo copiar al portapapeles."));
    }
  }

  async function handleMessageMenuAction(action, message) {
    onSetMessageMenuFor(null);

    switch (action) {
      case "reply":
        onStartReply(message);
        return;
      case "react":
        onSetReactionPickerFor((previous) => (previous === message.id ? null : message.id));
        return;
      case "forward":
        showUiNotice(t("message.notice.forwardPending", "Reenviar llegara con mensajes compartidos en una siguiente pasada."));
        return;
      case "thread":
        showUiNotice(t("message.notice.threadPending", "Los hilos del mensaje quedan listos para una siguiente capa."));
        return;
      case "copy-text":
        await copyToClipboard(message.content, t("message.notice.textCopied", "Texto del mensaje copiado."));
        return;
      case "pin":
        showUiNotice(t("message.notice.pinPending", "Fijar mensajes quedara conectado a backend en una siguiente pasada."));
        return;
      case "unread":
        showUiNotice(t("message.notice.unreadPending", "Marcar como no leido llega con tracking fino de lectura."));
        return;
      case "copy-link":
        await copyToClipboard(
          `${window.location.origin}${window.location.pathname}#message-${message.id}`,
          t("message.notice.linkCopied", "Enlace del mensaje copiado.")
        );
        return;
      case "edit":
        onEditMessage(message);
        return;
      case "delete":
        await handleDeleteMessage(message);
        return;
      case "copy-id":
        await copyToClipboard(message.id, t("message.notice.idCopied", "ID del mensaje copiado."));
        return;
      default:
    }
  }

  function handleQuickMessage(prefill = "") {
    handleComposerChange(prefill);
    requestAnimationFrame(() => {
      composerRef?.current?.focus?.();
      if (typeof prefill === "string" && prefill.length) {
        composerRef?.current?.setSelectionRange?.(prefill.length, prefill.length);
      }
    });
  }

  const headerContent =
    activeSelectionKind === "dm" && directMessageProfile ? (
      <DirectMessageHero
        onAcceptFriendRequest={onAcceptFriendRequest}
        onAddFriend={onAddFriend}
        onBlockUser={onBlockUser}
        onCancelFriendRequest={onCancelFriendRequest}
        onOpenProfileCard={openProfileCard}
        onQuickMessage={handleQuickMessage}
        onReportUser={onReportUser}
        onShowNotice={onShowNotice || showUiNotice}
        profile={directMessageProfile}
      />
    ) : null;

  return (
    <>
      <VirtualMessageFeed
        availableUsersById={availableUsersById}
        channelId={activeChannel?.id || activeChannel?.dm_id || activeChannel?.direct_message_id || null}
        headerContent={headerContent}
        handleReaction={handleReaction}
        handleScroll={handleScroll}
        language={language}
        listRef={listRef}
        loadingHistoryMessages={loadingHistoryMessages}
        loadingMessages={loadingMessages}
        messageLoadError={messageLoadError}
        messageMenuFor={messageMenuFor}
        messages={messages}
        onMenuAction={handleMessageMenuAction}
        onJumpToLatest={onJumpToLatest}
        onRetryMessages={onRetryMessages}
        onSetMessageMenuFor={onSetMessageMenuFor}
        onSetReactionPickerFor={onSetReactionPickerFor}
        onStartReply={onStartReply}
        openProfileCard={openProfileCard}
        reactionPickerFor={reactionPickerFor}
      />

      <MessageComposer
        activeChannel={activeChannel}
        activeSelectionKind={activeSelectionKind}
        attachmentInputRef={attachmentInputRef}
        composer={composer}
        composerAttachments={composerAttachments}
        composerMenuOpen={composerMenuOpen}
        composerPicker={composerPicker}
        composerRef={composerRef}
        editingMessage={editingMessage}
        handleAttachmentSelection={handleAttachmentSelection}
        handleComposerChange={handleComposerChange}
        handleComposerShortcut={handleComposerShortcut}
        handlePickerInsert={handlePickerInsert}
        handleStickerSelect={handleStickerSelect}
        handleSubmitMessage={handleSubmitMessage}
        guildStickers={guildStickers}
        language={language}
        onCancelEdit={onCancelEdit}
        onCancelReply={onCancelReply}
        onSetComposerMenuOpen={onSetComposerMenuOpen}
        onSetComposerPicker={onSetComposerPicker}
        onToggleReplyMention={onToggleReplyMention}
        removeComposerAttachment={removeComposerAttachment}
        replyMentionEnabled={replyMentionEnabled}
        replyTarget={replyTarget}
        showUiNotice={showUiNotice}
        typingUsers={typingUsers}
        uiNotice={uiNotice}
        uploadingAttachments={uploadingAttachments}
      />
    </>
  );
}
