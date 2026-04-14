import React, { memo } from "react";

import { resolveAssetUrl } from "../../../../api.js";
import { Icon } from "../../../Icon.jsx";
import { MessageImageViewer } from "../media/MessageImageViewer.jsx";
import {
  COMPOSER_SHORTCUTS,
  PICKER_CONTENT,
  attachmentKey,
  isImageAttachment
} from "../../shared/workspaceHelpers.js";

function getComposerAttachmentLabel(attachment) {
  return String(attachment?.display_name || attachment?.name || "Adjunto");
}

function getComposerAttachmentStatus(attachment) {
  if (attachment?.upload_status === "uploading") {
    return "Subiendo...";
  }

  if (attachment?.upload_status === "failed") {
    return attachment?.upload_error || "No se pudo subir";
  }

  return isImageAttachment(attachment) ? "Imagen lista" : "Archivo listo";
}

export const MessageComposer = memo(function MessageComposer({
  activeChannel,
  activeSelectionKind,
  attachmentInputRef,
  composer,
  composerAttachments,
  composerMenuOpen,
  composerPicker,
  composerRef,
  editingMessage,
  handleAttachmentSelection,
  handleComposerChange,
  handleComposerShortcut,
  handlePickerInsert,
  handleStickerSelect,
  handleSubmitMessage,
  onCancelEdit,
  onCancelReply,
  onSetComposerMenuOpen,
  onSetComposerPicker,
  onToggleReplyMention,
  removeComposerAttachment,
  replyMentionEnabled,
  replyTarget,
  showUiNotice,
  submittingMessage,
  typingUsers,
  uiNotice,
  updateComposerAttachment,
  uploadingAttachments,
  guildStickers = []
}) {
  const resolveComposerAttachmentUrl = (attachment) =>
    resolveAssetUrl(attachment.preview_url || attachment.url || "");
  const [attachmentViewerState, setAttachmentViewerState] = React.useState(null);
  const [attachmentEditorState, setAttachmentEditorState] = React.useState(null);
  const imageAttachmentsForViewer = React.useMemo(
    () =>
      composerAttachments
        .filter((attachment) => isImageAttachment(attachment))
        .map((attachment) => ({
          ...attachment,
          url: attachment.preview_url || attachment.url || ""
        })),
    [composerAttachments]
  );
  const editingAttachment = React.useMemo(
    () =>
      attachmentEditorState
        ? composerAttachments.find(
            (attachment) => attachmentKey(attachment) === attachmentEditorState.key
          ) || null
        : null,
    [attachmentEditorState, composerAttachments]
  );

  React.useEffect(() => {
    if (!attachmentEditorState) {
      return;
    }

    const exists = composerAttachments.some(
      (attachment) => attachmentKey(attachment) === attachmentEditorState.key
    );

    if (!exists) {
      setAttachmentEditorState(null);
    }
  }, [attachmentEditorState, composerAttachments]);

  function openAttachmentViewer(attachment) {
    if (!isImageAttachment(attachment)) {
      return;
    }

    const key = attachmentKey(attachment);
    const index = imageAttachmentsForViewer.findIndex(
      (item) => attachmentKey(item) === key
    );

    if (index < 0) {
      return;
    }

    setAttachmentViewerState({
      attachments: imageAttachmentsForViewer,
      index
    });
  }

  function openAttachmentEditor(attachment) {
    setAttachmentEditorState({
      altText: String(attachment?.alt_text || ""),
      displayName: getComposerAttachmentLabel(attachment),
      isSpoiler: Boolean(attachment?.is_spoiler),
      key: attachmentKey(attachment)
    });
  }

  function handleAttachmentEditorChange(field, value) {
    setAttachmentEditorState((previous) =>
      previous
        ? {
            ...previous,
            [field]: value
          }
        : previous
    );
  }

  function handleAttachmentEditorSave() {
    if (!attachmentEditorState || !editingAttachment) {
      setAttachmentEditorState(null);
      return;
    }

    updateComposerAttachment?.(editingAttachment, {
      alt_text: String(attachmentEditorState.altText || "").trim().slice(0, 240),
      display_name: String(attachmentEditorState.displayName || "").trim().slice(0, 140),
      is_spoiler: Boolean(attachmentEditorState.isSpoiler)
    });
    setAttachmentEditorState(null);
  }

  return (
    <footer className="composer-shell">
      <input
        className="hidden-file-input"
        multiple
        onChange={handleAttachmentSelection}
        ref={attachmentInputRef}
        type="file"
      />

      {replyTarget ? (
        <div className="composer-banner">
          <span>Respondiendo a {replyTarget.display_name}</span>
          <div className="composer-banner-actions">
            <button
              className={`reply-mention-toggle tooltip-anchor ${replyMentionEnabled ? "active" : ""}`}
              data-tooltip={
                replyMentionEnabled
                  ? "Haz clic para desactivar el envio de notificaciones al autor original."
                  : "Haz clic para activar el envio de notificaciones al autor original."
              }
              data-tooltip-position="top"
              onClick={onToggleReplyMention}
              type="button"
            >
              <span>@</span>
              <strong>{replyMentionEnabled ? "ACTIVAR" : "DESACTIVAR"}</strong>
            </button>
            <button
              aria-label="Cancelar respuesta"
              className="reply-cancel-button"
              onClick={onCancelReply}
              type="button"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {editingMessage ? (
        <div className="composer-banner warning">
          <span>Editando un mensaje existente</span>
          <button className="ghost-button small" onClick={onCancelEdit} type="button">
            Salir
          </button>
        </div>
      ) : null}

      {typingUsers.length ? (
        <div className="typing-line">
          {typingUsers.map((item) => item.username).join(", ")} esta escribiendo...
        </div>
      ) : null}

      {composerAttachments.length ? (
        <div className="composer-attachments">
          {composerAttachments.map((attachment) => (
            <article
              className={`composer-attachment-chip ${isImageAttachment(attachment) ? "image" : "file"} ${
                attachment.upload_status || "ready"
              } ${attachment.is_spoiler ? "spoiler" : ""}`.trim()}
              key={attachmentKey(attachment)}
            >
              <div className="composer-attachment-toolbar">
                {isImageAttachment(attachment) ? (
                  <button
                    aria-label="Ver imagen"
                    className="composer-attachment-tool"
                    onClick={() => openAttachmentViewer(attachment)}
                    type="button"
                  >
                    <Icon name="eye" size={15} />
                  </button>
                ) : null}
                <button
                  aria-label="Editar adjunto"
                  className="composer-attachment-tool"
                  onClick={() => openAttachmentEditor(attachment)}
                  type="button"
                >
                  <Icon name="edit" size={15} />
                </button>
                <button
                  aria-label="Descartar adjunto"
                  className="composer-attachment-tool danger"
                  disabled={submittingMessage}
                  onClick={() => removeComposerAttachment(attachment)}
                  type="button"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>

              {isImageAttachment(attachment) ? (
                <button
                  className="composer-attachment-preview-button"
                  onClick={() => openAttachmentViewer(attachment)}
                  type="button"
                >
                  <div className="composer-attachment-preview">
                    <img
                      alt={attachment.alt_text || getComposerAttachmentLabel(attachment)}
                      src={resolveComposerAttachmentUrl(attachment)}
                    />
                  </div>
                </button>
              ) : (
                <div className="composer-attachment-preview file">
                  <span className="composer-attachment-file-icon">
                    <Icon name="upload" size={20} />
                  </span>
                </div>
              )}

              <div className="composer-attachment-copy">
                <strong title={getComposerAttachmentLabel(attachment)}>
                  {getComposerAttachmentLabel(attachment)}
                </strong>
                <span
                  className={`composer-attachment-meta ${attachment.upload_status || "ready"}`.trim()}
                >
                  {getComposerAttachmentStatus(attachment)}
                </span>
                {attachment.is_spoiler ? (
                  <small className="composer-attachment-flag">Spoiler</small>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {uiNotice ? <div className="composer-banner subtle">{uiNotice}</div> : null}

      <div className="composer-frame">
        <div className="composer-side">
          <button
            className={`composer-icon-button tooltip-anchor ${composerMenuOpen ? "active" : ""}`}
            data-tooltip="Mas acciones"
            data-tooltip-position="top"
            onClick={() => onSetComposerMenuOpen((previous) => !previous)}
            type="button"
          >
            <Icon name="add" />
          </button>

          {composerMenuOpen ? (
            <div className="floating-surface shortcut-menu">
              {COMPOSER_SHORTCUTS.map((shortcut) => (
                <button
                  className="shortcut-item"
                  key={shortcut.id}
                  onClick={() => handleComposerShortcut(shortcut)}
                  type="button"
                >
                  <span className="shortcut-item-icon">
                    <Icon name={shortcut.icon} />
                  </span>
                  <div className="shortcut-item-copy">
                    <strong>{shortcut.label}</strong>
                    <span>{shortcut.description}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <form className="composer" onSubmit={handleSubmitMessage}>
          <textarea
            onChange={(event) => handleComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmitMessage(event);
              }
            }}
            placeholder={
              activeSelectionKind === "guild"
                ? `Mensaje #${activeChannel?.name || "general"}`
                : `Mensaje ${activeChannel?.display_name || "directo"}`
            }
            ref={composerRef}
            rows={1}
            value={composer}
          />

          <div className="composer-actions">
            <button
              className="composer-action-chip icon-only tooltip-anchor"
              data-tooltip="Hacer un regalo"
              data-tooltip-position="top"
              onClick={() => showUiNotice("Regalos y perks llegaran en una siguiente capa.")}
              type="button"
            >
              <Icon name="gift" size={14} />
            </button>
            <button
              className={`composer-action-chip icon-only tooltip-anchor ${composerPicker === "gif" ? "active" : ""}`}
              data-tooltip="GIF"
              data-tooltip-position="top"
              onClick={() => onSetComposerPicker((previous) => (previous === "gif" ? null : "gif"))}
              type="button"
            >
              <Icon name="sparkles" size={14} />
            </button>
            <button
              className={`composer-action-chip icon-only tooltip-anchor ${composerPicker === "sticker" ? "active" : ""}`}
              data-tooltip="Stickers"
              data-tooltip-position="top"
              onClick={() =>
                onSetComposerPicker((previous) => (previous === "sticker" ? null : "sticker"))
              }
              type="button"
            >
              <Icon name="sticker" size={14} />
            </button>
            <button
              className={`composer-action-chip icon-only tooltip-anchor ${composerPicker === "emoji" ? "active" : ""}`}
              data-tooltip="Emoji"
              data-tooltip-position="top"
              onClick={() => onSetComposerPicker((previous) => (previous === "emoji" ? null : "emoji"))}
              type="button"
            >
              <Icon name="emoji" size={14} />
            </button>
            {editingMessage || uploadingAttachments || composer.trim() || composerAttachments.length ? (
              <button
                className="primary-button send-button tooltip-anchor"
                data-tooltip={
                  submittingMessage
                    ? "Enviando mensaje"
                    : uploadingAttachments
                    ? "Subiendo adjuntos"
                    : editingMessage
                      ? "Guardar cambios"
                      : "Enviar mensaje"
                }
                data-tooltip-position="top"
                disabled={uploadingAttachments || submittingMessage}
                type="submit"
              >
                <Icon name={editingMessage ? "save" : "send"} />
                <span>
                  {submittingMessage
                    ? "Enviando..."
                    : uploadingAttachments
                      ? "Subiendo..."
                      : editingMessage
                        ? "Guardar"
                        : "Enviar"}
                </span>
              </button>
            ) : null}
          </div>
        </form>

        {composerPicker ? (
          <div className="floating-surface picker-panel">
            <div className="picker-panel-header">
              <div>
                <strong>{PICKER_CONTENT[composerPicker].title}</strong>
                <span>{PICKER_CONTENT[composerPicker].subtitle}</span>
              </div>
              <button
                className="ghost-button icon-only tooltip-anchor"
                data-tooltip="Cerrar selector"
                data-tooltip-position="top"
                onClick={() => onSetComposerPicker(null)}
                type="button"
              >
                <Icon name="close" />
              </button>
            </div>

            {composerPicker === "sticker" ? (
              guildStickers.length ? (
                <div className="picker-grid sticker server-stickers">
                  {guildStickers.map((sticker) => (
                    <button
                      className="picker-card sticker-real"
                      key={sticker.id}
                      onClick={() => handleStickerSelect(sticker)}
                      type="button"
                    >
                      {sticker.image_url ? (
                        <img
                          alt={sticker.name}
                          className="picker-card-thumb"
                          loading="lazy"
                          src={resolveAssetUrl(sticker.image_url)}
                        />
                      ) : (
                        <span className="picker-card-emoji">{sticker.emoji || "✨"}</span>
                      )}
                      <strong>{sticker.name}</strong>
                      <span>{sticker.is_default ? "Sticker predeterminado" : "Sticker del servidor"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="picker-empty-state">
                  <strong>No hay stickers en este servidor todavia.</strong>
                  <span>Crea uno desde Ajustes del servidor para usarlo aqui.</span>
                </div>
              )
            ) : (
              <div className={`picker-grid ${composerPicker}`}>
                {PICKER_CONTENT[composerPicker].items.map((item) => (
                  <button
                    className="picker-card"
                    key={item}
                    onClick={() =>
                      handlePickerInsert(
                        composerPicker === "emoji" ? item : `:${String(item).toLowerCase()}:`
                      )
                    }
                    type="button"
                  >
                    <strong>{item}</strong>
                    {composerPicker === "emoji" ? null : (
                      <span>{composerPicker === "gif" ? "Inserta un tag rapido" : "Sticker rapido"}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {attachmentEditorState && editingAttachment ? (
        <div
          className="attachment-editor-backdrop"
          onClick={() => setAttachmentEditorState(null)}
        >
          <div
            className="attachment-editor-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="attachment-editor-header">
              <strong>Modificar archivo adjunto</strong>
              <button
                aria-label="Cerrar editor"
                className="attachment-editor-close"
                onClick={() => setAttachmentEditorState(null)}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="attachment-editor-preview">
              {isImageAttachment(editingAttachment) ? (
                <img
                  alt={
                    attachmentEditorState.altText ||
                    getComposerAttachmentLabel(editingAttachment)
                  }
                  src={resolveComposerAttachmentUrl(editingAttachment)}
                />
              ) : (
                <div className="attachment-editor-file-preview">
                  <Icon name="upload" size={28} />
                </div>
              )}
            </div>

            <label className="attachment-editor-field">
              <span>Nombre de archivo</span>
              <input
                onChange={(event) =>
                  handleAttachmentEditorChange("displayName", event.target.value)
                }
                type="text"
                value={attachmentEditorState.displayName}
              />
            </label>

            <label className="attachment-editor-field">
              <span>Descripcion (texto alternativo)</span>
              <input
                onChange={(event) =>
                  handleAttachmentEditorChange("altText", event.target.value)
                }
                placeholder="Anadir una descripcion"
                type="text"
                value={attachmentEditorState.altText}
              />
            </label>

            <label className="attachment-editor-check">
              <input
                checked={attachmentEditorState.isSpoiler}
                onChange={(event) =>
                  handleAttachmentEditorChange("isSpoiler", event.target.checked)
                }
                type="checkbox"
              />
              <span>Marcar como spoiler</span>
            </label>

            <div className="attachment-editor-actions">
              <button
                className="ghost-button"
                onClick={() => setAttachmentEditorState(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                onClick={handleAttachmentEditorSave}
                type="button"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {attachmentViewerState?.attachments?.length ? (
        <MessageImageViewer
          attachments={attachmentViewerState.attachments}
          initialIndex={attachmentViewerState.index}
          onClose={() => setAttachmentViewerState(null)}
        />
      ) : null}
    </footer>
  );
});
