import React, { memo, useLayoutEffect, useMemo, useRef } from "react";
import { Virtuoso } from "react-virtuoso";

import { MessageFeedItem } from "./MessageFeedItem.jsx";
import { buildMessageStageRows } from "./messageStageHelpers.js";

const NEAR_BOTTOM_THRESHOLD = 96;

const MessageFeedScroller = React.forwardRef(function MessageFeedScroller(
  { children, context, onScroll, ...props },
  ref
) {
  return (
    <section
      {...props}
      className="message-feed"
      onScroll={(event) => {
        const element = event.currentTarget;
        if (context?.atBottomRef) {
          context.atBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            NEAR_BOTTOM_THRESHOLD;
        }

        onScroll?.(event);
        context?.handleScroll?.();
      }}
      ref={(node) => {
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }

        if (context?.listRef) {
          context.listRef.current = node;
        }

        if (node && context?.atBottomRef) {
          context.atBottomRef.current = true;
        }
      }}
    >
      {children}
    </section>
  );
});

function MessageDateDivider({ label }) {
  return (
    <div className="message-date-divider">
      <span>{label}</span>
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
  loadingMessages,
  messageMenuFor,
  messages,
  onMenuAction,
  onSetMessageMenuFor,
  onSetReactionPickerFor,
  onStartReply,
  openProfileCard,
  reactionPickerFor
}) {
  const virtuosoRef = useRef(null);
  const atBottomRef = useRef(true);
  const previousChannelRef = useRef(channelId);
  const previousLastRowKeyRef = useRef(null);

  const rows = useMemo(() => buildMessageStageRows(messages), [messages]);
  const rowIndexesByMessageId = useMemo(
    () =>
      Object.fromEntries(
        rows
          .map((row, index) => (row.type === "message" ? [row.message.id, index] : null))
          .filter(Boolean)
      ),
    [rows]
  );
  const lastRow = rows[rows.length - 1] || null;
  const lastRowKey = lastRow?.key || null;

  function scrollToBottom() {
    if (!rows.length) {
      return;
    }

    virtuosoRef.current?.scrollToIndex({
      align: "end",
      behavior: "auto",
      index: rows.length - 1
    });
  }

  function scrollToMessage(messageId) {
    const rowIndex = rowIndexesByMessageId[messageId];
    if (rowIndex === undefined) {
      return;
    }

    virtuosoRef.current?.scrollToIndex({
      align: "center",
      behavior: "smooth",
      index: rowIndex
    });

    requestAnimationFrame(() => {
      document.getElementById(`message-${messageId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  }

  useLayoutEffect(() => {
    const previousChannel = previousChannelRef.current;
    const previousLastRowKey = previousLastRowKeyRef.current;
    const channelChanged = previousChannel !== channelId;
    const lastRowChanged = previousLastRowKey !== lastRowKey;

    previousChannelRef.current = channelId;
    previousLastRowKeyRef.current = lastRowKey;

    if (channelChanged) {
      atBottomRef.current = true;
      if (rows.length) {
        scrollToBottom();
      }
      return;
    }

    if (!rows.length) {
      return;
    }

    if (!lastRowChanged) {
      return;
    }

    if (atBottomRef.current) {
      scrollToBottom();
    }
  }, [channelId, lastRowKey, rows.length]);

  if (!rows.length && loadingMessages) {
    return (
      <section className="message-feed">
        <div className="workspace-panel-fallback compact">
          <span className="workspace-panel-pulse" />
          <span className="workspace-panel-pulse short" />
          <span className="workspace-panel-pulse" />
        </div>
      </section>
    );
  }

  if (!rows.length && !loadingMessages) {
    return (
      <section className="message-feed">
        {headerContent}
        {!headerContent ? (
          <div className="empty-state">
            <h3>Este canal aun no tiene ecos.</h3>
            <p>Escribe el primer mensaje y enciende Umbra.</p>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="message-feed-host">
      <Virtuoso
        key={channelId || "message-feed"}
        className="message-feed-virtuoso"
        components={{
          Header: headerContent ? () => <div className="message-feed-header">{headerContent}</div> : undefined,
          Scroller: MessageFeedScroller
        }}
        computeItemKey={(index, row) => row.key || `${row.type}-${index}`}
        context={{ atBottomRef, handleScroll, listRef }}
        data={rows}
        increaseViewportBy={{ bottom: 720, top: 480 }}
        initialTopMostItemIndex={rows.length ? rows.length - 1 : 0}
        itemContent={(index, row) =>
          row.type === "date" ? (
            <MessageDateDivider label={row.label} />
          ) : (
            <MessageFeedItem
              availableUsersById={availableUsersById}
              grouped={row.grouped}
              isMenuOpen={messageMenuFor === row.message.id}
              isReactionPickerOpen={reactionPickerFor === row.message.id}
              language={language}
              message={row.message}
              onHandleReaction={handleReaction}
              onMenuAction={onMenuAction}
              onScrollToMessage={scrollToMessage}
              onSetMessageMenuFor={onSetMessageMenuFor}
              onSetReactionPickerFor={onSetReactionPickerFor}
              onStartReply={onStartReply}
              openProfileCard={openProfileCard}
            />
          )
        }
        overscan={320}
        ref={virtuosoRef}
      />
    </div>
  );
});
