import React, { memo } from "react";

import { resolveAssetUrl } from "../../api.js";
import { Icon } from "../Icon.jsx";
import {
  COMPOSER_SHORTCUTS,
  PICKER_CONTENT,
  attachmentKey,
  isImageAttachment
} from "./workspaceHelpers.js";

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
  typingUsers,
  uiNotice,
  uploadingAttachments
}) {
  return (
    <footer className="composer-shell">
      <input
        accept="image/*"
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
            <div className="composer-attachment-chip" key={attachmentKey(attachment)}>
              {isImageAttachment(attachment) ? (
                <img alt={attachment.name || "Adjunto"} src={resolveAssetUrl(attachment.url)} />
              ) : (
                <span className="composer-attachment-file-icon">
                  <Icon name="upload" size={14} />
                </span>
              )}
              <div className="composer-attachment-copy">
                <strong>{attachment.name || "Adjunto"}</strong>
                <span>{isImageAttachment(attachment) ? "Imagen lista" : "Archivo listo"}</span>
              </div>
              <button
                aria-label="Quitar adjunto"
                className="ghost-button icon-only small"
                onClick={() => removeComposerAttachment(attachment)}
                type="button"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
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
            <button
              className="composer-action-chip icon-only tooltip-anchor"
              data-tooltip="Aplicaciones"
              data-tooltip-position="top"
              onClick={() =>
                showUiNotice("Integraciones y slash apps quedan preparadas para la siguiente pasada.")
              }
              type="button"
            >
              <Icon name="appGrid" size={14} />
            </button>
            {editingMessage || uploadingAttachments ? (
              <button
                className="primary-button send-button tooltip-anchor"
                data-tooltip={uploadingAttachments ? "Subiendo adjuntos" : "Guardar cambios"}
                data-tooltip-position="top"
                disabled={uploadingAttachments}
                type="submit"
              >
                <Icon name={editingMessage ? "save" : "send"} />
                <span>{uploadingAttachments ? "Subiendo..." : "Guardar"}</span>
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
          </div>
        ) : null}
      </div>
    </footer>
  );
});
