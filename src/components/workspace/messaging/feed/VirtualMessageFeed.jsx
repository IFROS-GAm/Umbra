import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { MessageFeedItem } from "./MessageFeedItem.jsx";
import { MessageImageViewer } from "../media/MessageImageViewer.jsx";
import { buildMessageStageRows } from "../../shared/messageStageHelpers.js";

const AUTO_FOLLOW_DISABLE_THRESHOLD = 72;
const AUTO_FOLLOW_ENABLE_THRESHOLD = 20;
const HISTORY_BANNER_HIDE_THRESHOLD = 36;
const HISTORY_BANNER_SHOW_THRESHOLD = 140;

function MessageDateDivider({ label }) {
  return (
    <div className="message-date-divider">
      <span>{label}</span>
    </div>
  );
}

function MessageFeedFooterSpacer() {
  return <div aria-hidden="true" className="message-feed-tail" />;
}

function MessageHistoryLoader({ position = "top", shifted = false }) {
  return (
    <div
      aria-hidden="true"
      className={`message-history-loader-shell ${position} ${shifted ? "with-banner" : ""}`.trim()}
    >
      <div className="message-history-loader">
        {[0, 1, 2].map((item) => (
          <div className="message-history-loader-card" key={item}>
            <div className="message-history-loader-avatar" />
            <div className="message-history-loader-copy">
              <div className={`message-history-loader-line short tone-${item + 1}`} />
              <div className={`message-history-loader-line medium tone-${(item % 2) + 1}`} />
              <div className={`message-history-loader-line wide tone-${((item + 1) % 3) + 1}`} />
              <div className={`message-history-loader-line medium tone-${((item + 2) % 3) + 1}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageLoadState({ compact = false, loading = false, message, onRetry }) {
  return (
    <div className={`message-load-state ${compact ? "compact" : ""}`.trim()} role="status">
      <div className="message-load-state-copy">
        <strong>
          {compact
            ? "No se pudieron actualizar los mensajes."
            : "No se pudieron cargar los mensajes del canal."}
        </strong>
        <p>{message || "Revisa el backend y vuelve a intentarlo."}</p>
      </div>
      <div className="message-load-state-actions">
        <button
          className="message-load-state-button"
          disabled={loading}
          onClick={onRetry}
          type="button"
        >
          {loading ? "Reintentando..." : "Reintentar"}
        </button>
      </div>
    </div>
  );
}

export const VirtualMessageFeed = memo(function VirtualMessageFeed({
  availableUsersById,
  channelId = null,
  headerContent,
  handleReaction,
  handleScroll,
  language = "es",
  listRef,
  loadingHistoryMessages = false,
  loadingMessages,
  messageLoadError,
  messageMenuFor,
  messages,
  onJumpToLatest,
  onMenuAction,
  onAcceptInvite,
  onRetryMessages,
  onSetMessageMenuFor,
  onSetReactionPickerFor,
  onStartReply,
  openProfileCard,
  reactionPickerFor
}) {
  const feedRef = useRef(null);
  const contentRef = useRef(null);
  const autoFollowRef = useRef(true);
  const historyBannerVisibleRef = useRef(false);
  const previousStateRef = useRef({
    channelId,
    firstRowKey: null,
    lastRowKey: null,
    rowCount: 0
  });
  const [showHistoryBanner, setShowHistoryBanner] = useState(false);
  const [imageViewerState, setImageViewerState] = useState(null);

  const rows = useMemo(() => buildMessageStageRows(messages), [messages]);
  const firstRowKey = rows[0]?.key || null;
  const lastRowKey = rows[rows.length - 1]?.key || null;

  const updateViewportState = useCallback(
    (element) => {
      if (!element) {
        return;
      }

      if (listRef) {
        listRef.current = element;
      }

      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;

      autoFollowRef.current = autoFollowRef.current
        ? distanceFromBottom <= AUTO_FOLLOW_DISABLE_THRESHOLD
        : distanceFromBottom <= AUTO_FOLLOW_ENABLE_THRESHOLD;

      const nextShowHistoryBanner = historyBannerVisibleRef.current
        ? distanceFromBottom > HISTORY_BANNER_HIDE_THRESHOLD
        : distanceFromBottom > HISTORY_BANNER_SHOW_THRESHOLD;

      if (historyBannerVisibleRef.current !== nextShowHistoryBanner) {
        historyBannerVisibleRef.current = nextShowHistoryBanner;
        setShowHistoryBanner(nextShowHistoryBanner);
      }
    },
    [listRef]
  );

  const scrollToBottom = useCallback(
    (behavior = "auto") => {
      const element = feedRef.current;
      if (!element) {
        return;
      }

      if (behavior === "smooth") {
        element.scrollTo({
          behavior: "smooth",
          top: element.scrollHeight
        });
      } else {
        element.scrollTop = element.scrollHeight;
      }

      updateViewportState(element);
    },
    [updateViewportState]
  );

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver !== "function") {
      return undefined;
    }

    let frameId = null;
    const observer = new ResizeObserver(() => {
      if (!autoFollowRef.current) {
        return;
      }

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        scrollToBottom();
        frameId = window.requestAnimationFrame(() => {
          if (autoFollowRef.current) {
            scrollToBottom();
          }
        });
      });
    });

    observer.observe(content);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, [channelId, scrollToBottom]);

  useEffect(() => {
    setImageViewerState(null);
  }, [channelId]);

  function scrollToMessage(messageId) {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function handleFeedScroll(event) {
    updateViewportState(event.currentTarget);
    handleScroll?.();
  }

  useLayoutEffect(() => {
    const element = feedRef.current;
    const wasAutoFollow = autoFollowRef.current;
    if (element) {
      if (listRef) {
        listRef.current = element;
      }
      updateViewportState(element);
    }

    const previous = previousStateRef.current;
    const channelChanged = previous.channelId !== channelId;
    const rowCountDelta = rows.length - previous.rowCount;
    const prependedRows =
      !channelChanged &&
      rowCountDelta > 0 &&
      previous.firstRowKey !== firstRowKey &&
      previous.lastRowKey === lastRowKey;
    const appendedRows =
      !channelChanged &&
      rowCountDelta > 0 &&
      previous.lastRowKey !== lastRowKey;
    const initialRowsLoaded = previous.rowCount === 0 && rows.length > 0;

    previousStateRef.current = {
      channelId,
      firstRowKey,
      lastRowKey,
      rowCount: rows.length
    };

    if (channelChanged) {
      autoFollowRef.current = true;
      historyBannerVisibleRef.current = false;
      setShowHistoryBanner(false);

      if (rows.length) {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }
      return;
    }

    if (!rows.length) {
      return;
    }

    if (initialRowsLoaded) {
      autoFollowRef.current = true;
      historyBannerVisibleRef.current = false;
      setShowHistoryBanner(false);
      requestAnimationFrame(() => {
        scrollToBottom();
      });
      return;
    }

    if (prependedRows) {
      requestAnimationFrame(() => {
        updateViewportState(feedRef.current);
      });
      return;
    }

    if (appendedRows && wasAutoFollow) {
      requestAnimationFrame(() => {
        scrollToBottom();
        requestAnimationFrame(() => {
          if (autoFollowRef.current) {
            scrollToBottom();
          }
        });
      });
      return;
    }

    requestAnimationFrame(() => {
      updateViewportState(feedRef.current);
    });
  }, [
    channelId,
    firstRowKey,
    lastRowKey,
    listRef,
    rows.length,
    scrollToBottom,
    updateViewportState
  ]);

  if (!rows.length && loadingMessages) {
    return (
      <section className="message-feed">
        <div className="message-feed-content">
          {headerContent ? <div className="message-feed-header">{headerContent}</div> : null}
          <MessageHistoryLoader position="top" />
        </div>
      </section>
    );
  }

  if (!rows.length && messageLoadError && !loadingMessages) {
    return (
      <section className="message-feed">
        <div className="message-feed-content">
          {headerContent ? <div className="message-feed-header">{headerContent}</div> : null}
          <div className="message-load-state-shell">
            <MessageLoadState
              loading={loadingMessages}
              message={messageLoadError.message}
              onRetry={onRetryMessages}
            />
          </div>
        </div>
      </section>
    );
  }

  if (!rows.length && !loadingMessages) {
    return (
      <section className="message-feed">
        <div className="message-feed-content">
          {headerContent ? <div className="message-feed-header">{headerContent}</div> : null}
          {!headerContent ? (
            <div className="empty-state">
              <h3>Este canal aun no tiene ecos.</h3>
              <p>Escribe el primer mensaje y enciende Umbra.</p>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="message-feed-host">
      {showHistoryBanner ? (
        <div className="message-history-banner-shell">
          <div className="message-history-banner">
            <span>Estas viendo mensajes antiguos</span>
            <button
              className="message-history-banner-button"
              onClick={() => {
                autoFollowRef.current = true;
                historyBannerVisibleRef.current = false;
                setShowHistoryBanner(false);
                if (onJumpToLatest) {
                  onJumpToLatest();
                } else {
                  scrollToBottom("smooth");
                }
              }}
              type="button"
            >
              Ir al mensaje actual
            </button>
          </div>
        </div>
      ) : null}

      <section className="message-feed" onScroll={handleFeedScroll} ref={feedRef}>
        <div className="message-feed-content" ref={contentRef}>
          {headerContent ? <div className="message-feed-header">{headerContent}</div> : null}

          {messageLoadError && !loadingMessages ? (
            <MessageLoadState
              compact
              loading={loadingMessages}
              message={messageLoadError.message}
              onRetry={onRetryMessages}
            />
          ) : null}

          {loadingHistoryMessages ? (
            <MessageHistoryLoader position="top" shifted={showHistoryBanner} />
          ) : null}

          {rows.map((row) =>
            row.type === "date" ? (
              <MessageDateDivider key={row.key} label={row.label} />
            ) : (
              <MessageFeedItem
                availableUsersById={availableUsersById}
                grouped={row.grouped}
                isMenuOpen={messageMenuFor === row.message.id}
                isReactionPickerOpen={reactionPickerFor === row.message.id}
                key={row.key}
                language={language}
                message={row.message}
                onHandleReaction={handleReaction}
                onMenuAction={onMenuAction}
                onAcceptInvite={onAcceptInvite}
                onOpenAttachmentViewer={(attachments, index) =>
                  setImageViewerState({
                    attachments,
                    index
                  })
                }
                onScrollToMessage={scrollToMessage}
                onSetMessageMenuFor={onSetMessageMenuFor}
                onSetReactionPickerFor={onSetReactionPickerFor}
                onStartReply={onStartReply}
                openProfileCard={openProfileCard}
              />
            )
          )}

          {loadingMessages && rows.length ? <MessageHistoryLoader position="bottom" /> : null}

          <MessageFeedFooterSpacer />
        </div>
      </section>

      {imageViewerState?.attachments?.length ? (
        <MessageImageViewer
          attachments={imageViewerState.attachments}
          initialIndex={imageViewerState.index}
          onClose={() => setImageViewerState(null)}
        />
      ) : null}
    </div>
  );
});
