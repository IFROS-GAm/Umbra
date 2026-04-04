import React, { memo } from "react";

import { resolveAssetUrl } from "../../api.js";
import { REACTION_OPTIONS, formatMessageHtml, relativeTime } from "../../utils.js";
import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { MessageActionMenu } from "./MessageActionMenu.jsx";
import {
  MESSAGE_TOOLBAR_REACTIONS,
  attachmentKey,
  isImageAttachment
} from "./workspaceHelpers.js";

export const MessageFeedItem = memo(function MessageFeedItem({
  availableUsersById,
  grouped,
  isMenuOpen,
  isReactionPickerOpen,
  message,
  onHandleReaction,
  onMenuAction,
  onScrollToMessage,
  onSetMessageMenuFor,
  onSetReactionPickerFor,
  onStartReply,
  openProfileCard
}) {
  const authorProfile = {
    ...message.author,
    bio: availableUsersById?.[message.author?.id]?.bio
  };
  const reactions = message.reactions || [];

  return (
    <article
      className={`message-card ${grouped ? "grouped" : ""} ${message.is_mentioning_me ? "mention-hit" : ""}`}
      id={`message-${message.id}`}
    >
      {!grouped ? (
        <button
          className="message-avatar-trigger"
          onClick={(event) => openProfileCard(event, authorProfile, message.display_name)}
          type="button"
        >
          <Avatar
            hue={message.author?.avatar_hue}
            label={message.display_name}
            size={44}
            src={message.author?.avatar_url}
            status={message.author?.status}
          />
        </button>
      ) : (
        <div className="message-gutter" />
      )}

      <div className="message-main">
        {!grouped ? (
          <div className="message-headline">
            <button
              className="message-author-trigger"
              onClick={(event) => openProfileCard(event, authorProfile, message.display_name)}
              type="button"
            >
              {message.display_name}
            </button>
            <span>{relativeTime(message.created_at)}</span>
            {message.edited_at ? <em>(editado)</em> : null}
          </div>
        ) : null}

        {message.reply_preview ? (
          <button
            className="reply-preview"
            onClick={() => onScrollToMessage(message.reply_preview.id)}
            type="button"
          >
            <span>{message.reply_preview.author_name}</span>
            <small>{message.reply_preview.content}</small>
          </button>
        ) : null}

        {message.content ? (
          <div
            className="message-body"
            dangerouslySetInnerHTML={{ __html: formatMessageHtml(message.content) }}
          />
        ) : null}

        {message.attachments?.length ? (
          <div
            className={`message-attachment-grid attachment-count-${Math.min(
              message.attachments.length,
              4
            )}`}
          >
            {message.attachments.map((attachment) =>
              isImageAttachment(attachment) ? (
                <a
                  className="message-attachment image"
                  href={resolveAssetUrl(attachment.url)}
                  key={attachmentKey(attachment)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <img
                    alt={attachment.name || "Adjunto"}
                    decoding="async"
                    fetchPriority="low"
                    loading="lazy"
                    src={resolveAssetUrl(attachment.url)}
                  />
                </a>
              ) : (
                <a
                  className="message-attachment file"
                  href={resolveAssetUrl(attachment.url)}
                  key={attachmentKey(attachment)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon name="upload" />
                  <span>{attachment.name || "Archivo"}</span>
                </a>
              )
            )}
          </div>
        ) : null}

        <div className={`message-toolbar message-menu-anchor ${isMenuOpen ? "menu-open" : ""}`}>
          <div className="message-toolbar-strip">
            {MESSAGE_TOOLBAR_REACTIONS.map((emoji) => (
              <button
                className="message-toolbar-reaction"
                data-tooltip="Reaccion rapida"
                data-tooltip-position="top"
                key={`${message.id}-toolbar-${emoji}`}
                onClick={() => onHandleReaction(message.id, emoji)}
                type="button"
              >
                {emoji}
              </button>
            ))}

            <div className="message-toolbar-divider" />

            <button
              className="message-toolbar-icon tooltip-anchor"
              data-tooltip="Agregar reaccion"
              data-tooltip-position="top"
              onClick={() => {
                onSetMessageMenuFor(null);
                onSetReactionPickerFor((previous) => (previous === message.id ? null : message.id));
              }}
              type="button"
            >
              <Icon name="emoji" size={16} />
            </button>
            <button
              className="message-toolbar-icon tooltip-anchor"
              data-tooltip="Responder"
              data-tooltip-position="top"
              onClick={() => onStartReply(message)}
              type="button"
            >
              <Icon name="replyArrow" size={16} />
            </button>
            <button
              className="message-toolbar-icon tooltip-anchor"
              data-tooltip="Reenviar"
              data-tooltip-position="top"
              onClick={() => onMenuAction("forward", message)}
              type="button"
            >
              <Icon name="forward" size={16} />
            </button>
            <button
              className={`message-toolbar-icon tooltip-anchor ${isMenuOpen ? "active" : ""}`}
              data-tooltip="Mas"
              data-tooltip-position="top"
              onClick={() =>
                onSetMessageMenuFor((previous) => (previous === message.id ? null : message.id))
              }
              type="button"
            >
              <Icon name="more" size={16} />
            </button>
          </div>

          {isMenuOpen ? (
            <MessageActionMenu
              message={message}
              onAction={onMenuAction}
              onQuickReact={(emoji) => {
                onHandleReaction(message.id, emoji);
                onSetMessageMenuFor(null);
              }}
            />
          ) : null}
        </div>

        {reactions.length ? (
          <div className="reactions-row">
            {reactions.map((reaction) => (
              <button
                className={`reaction-chip ${reaction.selected ? "selected" : ""}`}
                key={`${message.id}-${reaction.emoji}`}
                onClick={() => onHandleReaction(message.id, reaction.emoji)}
                type="button"
              >
                <span>{reaction.emoji}</span>
                <b>{reaction.count}</b>
              </button>
            ))}
            <button
              className="reaction-chip add"
              onClick={() =>
                onSetReactionPickerFor((previous) => (previous === message.id ? null : message.id))
              }
              type="button"
            >
              <Icon name="add" size={14} />
            </button>
          </div>
        ) : null}

        {isReactionPickerOpen ? (
          <div className="reaction-picker-inline">
            {REACTION_OPTIONS.map((emoji) => (
              <button
                className="reaction-chip"
                key={`${message.id}-picker-${emoji}`}
                onClick={() => {
                  onHandleReaction(message.id, emoji);
                  onSetReactionPickerFor(null);
                }}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
});
