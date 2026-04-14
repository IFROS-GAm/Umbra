import React, { memo } from "react";

import { api, resolveAssetUrl } from "../../../../api.js";
import { translate } from "../../../../i18n.js";
import {
  REACTION_OPTIONS,
  extractFirstInviteCode,
  formatMessageHtml,
  relativeTime
} from "../../../../utils.js";
import { Avatar } from "../../../Avatar.jsx";
import { Icon } from "../../../Icon.jsx";
import { MessageActionMenu } from "../menus/MessageActionMenu.jsx";
import {
  MESSAGE_TOOLBAR_REACTIONS,
  attachmentKey,
  isImageAttachment
} from "../../shared/workspaceHelpers.js";

function buildImageAttachmentGridClassName(imageCount) {
  if (imageCount <= 1) {
    return "message-attachment-grid attachment-count-1";
  }

  if (imageCount === 2) {
    return "message-attachment-grid attachment-count-2";
  }

  if (imageCount === 4) {
    return "message-attachment-grid attachment-count-4";
  }

  if (imageCount > 4) {
    return "message-attachment-grid attachment-count-stack";
  }

  return "message-attachment-grid attachment-count-3";
}

function buildImageAttachmentClassName(imageCount, index) {
  const classNames = ["message-attachment", "image"];

  if ((imageCount === 3 && index === 0) || (imageCount > 4 && index === 0)) {
    classNames.push("featured");
  }

  return classNames.join(" ");
}

export const MessageFeedItem = memo(function MessageFeedItem({
  availableUsersById,
  grouped,
  isMenuOpen,
  isReactionPickerOpen,
  language = "es",
  message,
  onAcceptInvite,
  onHandleReaction,
  onMenuAction,
  onOpenAttachmentViewer,
  onScrollToMessage,
  onSetMessageMenuFor,
  onSetReactionPickerFor,
  onStartReply,
  openProfileCard
}) {
  const toolbarRef = React.useRef(null);
  const t = (key, fallback) => translate(language, key, fallback);
  const inviteCode = React.useMemo(
    () => extractFirstInviteCode(message.content || ""),
    [message.content]
  );
  const authorProfile = {
    ...message.author,
    bio: availableUsersById?.[message.author?.id]?.bio
  };
  const reactions = message.reactions || [];
  const imageAttachments = React.useMemo(
    () => (message.attachments || []).filter((attachment) => isImageAttachment(attachment)),
    [message.attachments]
  );
  const fileAttachments = React.useMemo(
    () => (message.attachments || []).filter((attachment) => !isImageAttachment(attachment)),
    [message.attachments]
  );

  return (
    <article
      className={`message-card ${grouped ? "grouped" : ""} ${message.is_mentioning_me ? "mention-hit" : ""} ${
        isMenuOpen || isReactionPickerOpen ? "overlay-open" : ""
      }`}
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
            {message.edited_at ? <em>{t("message.edited", "(editado)")}</em> : null}
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

        {inviteCode ? (
          <MessageInviteCard
            inviteCode={inviteCode}
            language={language}
            onAcceptInvite={onAcceptInvite}
          />
        ) : null}

        {message.sticker ? (
          <div className={`message-sticker ${message.sticker.image_url ? "image" : "emoji"}`}>
            {message.sticker.image_url ? (
              <img
                alt={message.sticker.name}
                loading="lazy"
                src={resolveAssetUrl(message.sticker.image_url)}
              />
            ) : (
              <span className="message-sticker-emoji">{message.sticker.emoji || "✨"}</span>
            )}
            {!message.sticker.image_url ? <strong>{message.sticker.name}</strong> : null}
          </div>
        ) : null}

        {imageAttachments.length ? (
          <div className={buildImageAttachmentGridClassName(imageAttachments.length)}>
            {imageAttachments.map((attachment, index) => (
              <button
                className={buildImageAttachmentClassName(imageAttachments.length, index)}
                key={attachmentKey(attachment)}
                onClick={() => onOpenAttachmentViewer?.(imageAttachments, index)}
                type="button"
              >
                <img
                  alt={attachment.alt_text || attachment.name || "Adjunto"}
                  decoding="async"
                  fetchPriority="low"
                  loading="lazy"
                  src={resolveAssetUrl(attachment.url)}
                />
              </button>
            ))}
          </div>
        ) : null}

        {fileAttachments.length ? (
          <div className="message-file-attachment-list">
            {fileAttachments.map((attachment) => (
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
            ))}
          </div>
        ) : null}

        <div className={`message-toolbar message-menu-anchor ${isMenuOpen ? "menu-open" : ""}`}>
          <div className="message-toolbar-strip" ref={toolbarRef}>
            {MESSAGE_TOOLBAR_REACTIONS.map((emoji) => (
              <button
                className="message-toolbar-reaction tooltip-anchor"
                data-tooltip={t("message.tooltip.quickReaction", "Reaccion rapida")}
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
              data-tooltip={t("message.menu.react", "Agregar reaccion")}
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
              data-tooltip={t("message.menu.reply", "Responder")}
              data-tooltip-position="top"
              onClick={() => onStartReply(message)}
              type="button"
            >
              <Icon name="replyArrow" size={16} />
            </button>
            <button
              className="message-toolbar-icon tooltip-anchor"
              data-tooltip={t("message.menu.forward", "Reenviar")}
              data-tooltip-position="top"
              onClick={() => onMenuAction("forward", message)}
              type="button"
            >
              <Icon name="forward" size={16} />
            </button>
            <button
              className={`message-toolbar-icon tooltip-anchor ${isMenuOpen ? "active" : ""}`}
              data-tooltip={t("message.tooltip.more", "Mas")}
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
              anchorRef={toolbarRef}
              language={language}
              message={message}
              onAction={onMenuAction}
              onClose={() => onSetMessageMenuFor(null)}
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

const invitePreviewCache = new Map();

function formatInviteEstablished(value, language = "es") {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(language === "en" ? "en-US" : language === "fr" ? "fr-FR" : "es-CO", {
    month: "short",
    year: "numeric"
  }).format(date);
}

function MessageInviteCard({ inviteCode, language = "es", onAcceptInvite }) {
  const [invite, setInvite] = React.useState(() => invitePreviewCache.get(inviteCode) || null);
  const [loading, setLoading] = React.useState(() => !invitePreviewCache.has(inviteCode));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    if (!inviteCode) {
      setInvite(null);
      setLoading(false);
      setError("");
      return undefined;
    }

    const cachedInvite = invitePreviewCache.get(inviteCode);
    if (cachedInvite) {
      setInvite(cachedInvite);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    setError("");

    api
      .getInviteByCode(inviteCode)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const nextInvite = payload?.invite || null;
        if (nextInvite) {
          invitePreviewCache.set(inviteCode, nextInvite);
        }
        setInvite(nextInvite);
      })
      .catch((inviteError) => {
        if (cancelled) {
          return;
        }
        setError(inviteError.message || "No se pudo cargar la invitacion.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  async function handleJoinInvite() {
    if (!inviteCode || busy || !onAcceptInvite) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const payload = await onAcceptInvite(inviteCode, invite);
      const nextInvite = payload?.invite || null;
      if (nextInvite) {
        invitePreviewCache.set(inviteCode, nextInvite);
        setInvite(nextInvite);
      }
    } catch (inviteError) {
      setError(inviteError.message || "No se pudo abrir la invitacion.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="message-invite-card loading" aria-hidden="true">
        <div className="message-invite-card-banner" />
        <div className="message-invite-card-body">
          <div className="message-invite-card-icon skeleton" />
          <div className="message-invite-card-copy">
            <div className="message-invite-card-line wide" />
            <div className="message-invite-card-line medium" />
            <div className="message-invite-card-line short" />
          </div>
        </div>
      </div>
    );
  }

  if (!invite?.guild) {
    return null;
  }

  const guild = invite.guild;
  const established = formatInviteEstablished(guild.created_at, language);
  const guildIcon = guild.icon_url ? resolveAssetUrl(guild.icon_url) : "";
  const guildBanner = guild.banner_image_url ? resolveAssetUrl(guild.banner_image_url) : "";
  const buttonLabel = invite.already_joined ? "Ir al servidor" : "Unirte al servidor";

  return (
    <div className="message-invite-card">
      <div
        className={`message-invite-card-banner ${guildBanner ? "image" : ""}`.trim()}
        style={
          guildBanner
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.12), rgba(10,12,18,0.04)), url("${guildBanner}")`
              }
            : {
                background: `linear-gradient(135deg, color-mix(in srgb, ${guild.banner_color || "#5865F2"} 42%, #eef4fb), #f6fbff 78%)`
              }
        }
      />
      <div className="message-invite-card-body">
        <div className="message-invite-card-icon-wrap">
          {guildIcon ? (
            <img
              alt={guild.name}
              className="message-invite-card-icon"
              draggable="false"
              src={guildIcon}
            />
          ) : (
            <div className="message-invite-card-icon fallback">
              {(guild.icon_text || guild.name?.slice(0, 2) || "UM").toUpperCase()}
            </div>
          )}
        </div>

        <div className="message-invite-card-copy">
          <strong>{guild.name}</strong>
          <span className="message-invite-card-stats">
            <i className="invite-dot online" />
            {invite.stats?.online_count || 0} en linea
            <i className="invite-dot" />
            {invite.stats?.member_count || 0} miembros
          </span>
          {established ? <small>Est. {established}</small> : null}
          {guild.description ? <p>{guild.description}</p> : null}
          {error ? <em>{error}</em> : null}
          <button
            className="message-invite-card-button"
            disabled={busy || !onAcceptInvite}
            onClick={handleJoinInvite}
            type="button"
          >
            {busy ? "Entrando..." : buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
