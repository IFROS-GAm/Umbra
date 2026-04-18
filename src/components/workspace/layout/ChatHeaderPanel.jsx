import React from "react";

import { api } from "../../../api.js";
import { translate } from "../../../i18n.js";
import { relativeTime } from "../../../utils.js";
import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";

function describePinnedMessage(message) {
  const content = String(message?.content || "").trim();
  if (content) {
    return content;
  }

  if (message?.sticker?.name) {
    return `Sticker: ${message.sticker.name}`;
  }

  const attachmentCount = Array.isArray(message?.attachments) ? message.attachments.length : 0;
  if (attachmentCount > 0) {
    return attachmentCount === 1 ? "1 adjunto" : `${attachmentCount} adjuntos`;
  }

  return "Sin contenido de texto.";
}

function mergePinnedMessages(fetchedMessages = [], liveMessages = []) {
  const liveMessagesById = new Map(
    (liveMessages || []).map((message) => [message.id, message])
  );
  const mergedMessages = [];
  const seenIds = new Set();

  (fetchedMessages || []).forEach((message) => {
    const liveMessage = liveMessagesById.get(message.id);
    if (liveMessage && !liveMessage.is_pinned) {
      return;
    }

    mergedMessages.push(liveMessage || message);
    seenIds.add(message.id);
  });

  (liveMessages || []).forEach((message) => {
    if (!message?.is_pinned || seenIds.has(message.id)) {
      return;
    }

    mergedMessages.push(message);
  });

  return mergedMessages.sort((left, right) => {
    const leftPinnedAt = new Date(left?.pinned_at || left?.created_at || 0).getTime();
    const rightPinnedAt = new Date(right?.pinned_at || right?.created_at || 0).getTime();
    return rightPinnedAt - leftPinnedAt;
  });
}

function ChatHeaderPinsPanel({
  activeChannel,
  headerPanelRef,
  language = "es",
  messages
}) {
  const [pinsState, setPinsState] = React.useState({
    error: "",
    loading: false,
    messages: []
  });
  const t = (key, fallback) => translate(language, key, fallback);

  React.useEffect(() => {
    if (!activeChannel?.id) {
      setPinsState({
        error: "",
        loading: false,
        messages: []
      });
      return undefined;
    }

    let cancelled = false;
    setPinsState((previous) => ({
      ...previous,
      error: "",
      loading: true
    }));

    api
      .listPinnedMessages({
        channelId: activeChannel.id
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setPinsState({
          error: "",
          loading: false,
          messages: payload?.messages || []
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setPinsState({
          error: error.message,
          loading: false,
          messages: []
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeChannel?.id]);

  const pinnedMessages = React.useMemo(
    () => mergePinnedMessages(pinsState.messages, messages),
    [messages, pinsState.messages]
  );

  function handleJumpToPinnedMessage(messageId) {
    const messageNode = document.getElementById(`message-${messageId}`);
    if (!messageNode) {
      return;
    }

    messageNode.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  return (
    <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
      <div className="header-panel-title">
        <Icon name="pin" size={18} />
        <strong>Mensajes fijados</strong>
      </div>

      {pinsState.loading ? (
        <div className="header-empty-state pins-empty-state compact">
          <Icon name="pin" size={30} />
          <strong>{t("channel.pins.loading", "Cargando fijados...")}</strong>
          <span>Umbra esta reuniendo los mensajes fijados de este canal.</span>
        </div>
      ) : null}

      {!pinsState.loading && pinsState.error ? (
        <div className="header-empty-state pins-empty-state compact">
          <Icon name="pin" size={30} />
          <strong>{t("channel.pins.error", "No se pudieron cargar los fijados.")}</strong>
          <span>{pinsState.error}</span>
        </div>
      ) : null}

      {!pinsState.loading && !pinsState.error && !pinnedMessages.length ? (
        <div className="header-empty-state pins-empty-state">
          <Icon name="pin" size={38} />
          <strong>Este canal no tiene ningun mensaje fijado.</strong>
          <span>Cuando fijes mensajes desde el chat, Umbra los mostrara aqui.</span>
        </div>
      ) : null}

      {!pinsState.loading && !pinsState.error && pinnedMessages.length ? (
        <div className="header-panel-list pins-list">
          {pinnedMessages.map((message) => (
            <button
              className="header-panel-row pin-row"
              key={message.id}
              onClick={() => handleJumpToPinnedMessage(message.id)}
              type="button"
            >
              <Avatar
                hue={message.author?.avatar_hue}
                label={message.display_name}
                size={36}
                src={message.author?.avatar_url}
                status={message.author?.status}
              />
              <span className="header-panel-row-copy">
                <span className="header-panel-row-head">
                  <strong>{message.display_name || "Umbra"}</strong>
                  <small>{relativeTime(message.pinned_at || message.created_at)}</small>
                </span>
                <span className="header-panel-row-body">{describePinnedMessage(message)}</span>
              </span>
              <Icon name="arrowRight" size={16} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatHeaderPanel({
  activeChannel,
  headerPanel,
  headerPanelRef,
  language = "es",
  messages = []
}) {
  if (headerPanel === "threads") {
    return (
      <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
        <div className="header-panel-title">
          <Icon name="threads" size={18} />
          <strong>Hilos</strong>
        </div>
        <div className="header-empty-state">
          <Icon name="threads" size={34} />
          <strong>No hay hilos activos.</strong>
          <span>Cuando abras o sigas hilos en este canal apareceran aqui.</span>
        </div>
      </div>
    );
  }

  if (headerPanel === "notifications") {
    return (
      <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
        <div className="header-notification-menu">
          <button className="header-menu-row" type="button">
            <span>
              <strong>Silenciar canal</strong>
            </span>
            <Icon name="arrowRight" size={16} />
          </button>
          <div className="header-menu-divider" />
          <div className="header-menu-choice active">
            <span>
              <strong>Usar la categoria predeterminada</strong>
              <small>Todos los mensajes</small>
            </span>
            <i />
          </div>
          <div className="header-menu-choice">
            <span>
              <strong>Todos los mensajes</strong>
            </span>
            <i />
          </div>
          <div className="header-menu-choice">
            <span>
              <strong>Solo @mentions</strong>
            </span>
            <i />
          </div>
          <div className="header-menu-choice">
            <span>
              <strong>Nada</strong>
            </span>
            <i />
          </div>
        </div>
      </div>
    );
  }

  if (headerPanel === "pins") {
    return (
      <ChatHeaderPinsPanel
        activeChannel={activeChannel}
        headerPanelRef={headerPanelRef}
        language={language}
        messages={messages}
      />
    );
  }

  return null;
}
