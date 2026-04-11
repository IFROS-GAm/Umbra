import { api, configureApiAuth } from "../../api.js";
import { findChannelInSession, resolveSelection } from "../../utils.js";
import {
  isChannelCacheFresh,
  markChannelReadInWorkspace,
  mergeChannelMessages,
  mergeLocalReadStateIntoWorkspace
} from "./workspaceHelpers.js";

export const BACKGROUND_PREFETCH_COOLDOWN_MS = 90_000;

function messageSignature(message) {
  if (!message) {
    return "";
  }

  return [
    message.id || message.client_nonce || "",
    message.content || "",
    message.created_at || "",
    message.edited_at || "",
    message.deleted_at || "",
    message.author?.id || "",
    (message.attachments || []).length,
    (message.reactions || [])
      .map((reaction) => `${reaction.emoji}:${reaction.count}:${reaction.selected ? 1 : 0}`)
      .join("|")
  ].join("::");
}

function areMessageListsEquivalent(previousMessages = [], nextMessages = []) {
  if (previousMessages.length !== nextMessages.length) {
    return false;
  }

  for (let index = 0; index < previousMessages.length; index += 1) {
    if (messageSignature(previousMessages[index]) !== messageSignature(nextMessages[index])) {
      return false;
    }
  }

  return true;
}

export function createWorkspaceMessageStore({
  accessTokenRef,
  activeSelection,
  activeSelectionRef,
  backgroundPrefetchRef,
  inFlightMessageLoadsRef,
  listRef,
  localReadStateRef,
  messageAbortRef,
  messageCacheRef,
  messageRequestIdRef,
  onSignOut,
  pendingReadRef,
  readReceiptTimeoutRef,
  refs,
  setActiveSelection,
  setAppError,
  setBooting,
  setHasMore,
  setLoadingMessages,
  setMessages,
  setWorkspace,
  workspace
}) {
  function readChannelCache(channelId) {
    return channelId ? messageCacheRef.current.get(channelId) || null : null;
  }

  function pruneChannelCache(nextWorkspace) {
    if (!nextWorkspace) {
      messageCacheRef.current.clear();
      backgroundPrefetchRef.current.clear();
      inFlightMessageLoadsRef.current.clear();
      return;
    }

    const allowedIds = new Set([
      ...(nextWorkspace.dms || []).map((channel) => channel.id),
      ...nextWorkspace.guilds.flatMap((guild) => (guild.channels || []).map((channel) => channel.id))
    ]);

    [...messageCacheRef.current.keys()].forEach((channelId) => {
      if (!allowedIds.has(channelId)) {
        messageCacheRef.current.delete(channelId);
      }
    });

    [...backgroundPrefetchRef.current.keys()].forEach((channelId) => {
      if (!allowedIds.has(channelId)) {
        backgroundPrefetchRef.current.delete(channelId);
      }
    });

    [...inFlightMessageLoadsRef.current.keys()].forEach((requestKey) => {
      const [channelId] = String(requestKey || "").split("::");
      if (channelId && !allowedIds.has(channelId)) {
        inFlightMessageLoadsRef.current.delete(requestKey);
      }
    });
  }

  function commitChannelMessages(channelId, nextMessages, nextHasMore, fetchedAt = Date.now()) {
    if (!channelId) {
      return;
    }

    const previousEntry = messageCacheRef.current.get(channelId) || null;
    const previousMessages = previousEntry?.messages || [];
    const resolvedHasMore = nextHasMore ?? previousEntry?.hasMore ?? true;
    const isSamePayload =
      previousEntry &&
      previousEntry.hasMore === resolvedHasMore &&
      areMessageListsEquivalent(previousMessages, nextMessages);

    if (isSamePayload) {
      messageCacheRef.current.set(channelId, {
        ...previousEntry,
        fetchedAt
      });
      return;
    }

    const nextEntry = {
      fetchedAt,
      hasMore: resolvedHasMore,
      messages: nextMessages
    };
    messageCacheRef.current.set(channelId, nextEntry);

    if (activeSelectionRef.current.channelId === channelId) {
      setMessages(nextMessages);
      setHasMore(resolvedHasMore);
    }
  }

  function patchChannelMessages(channelId, updateMessages, nextHasMore) {
    if (!channelId) {
      return;
    }

    const previousEntry = readChannelCache(channelId) || {
      fetchedAt: 0,
      hasMore: true,
      messages: []
    };
    const nextMessages = updateMessages(previousEntry.messages || []);
    const resolvedHasMore = nextHasMore ?? previousEntry.hasMore ?? true;
    commitChannelMessages(channelId, nextMessages, resolvedHasMore, Date.now());
  }

  function rememberLocalRead(channelId, lastReadAt, lastReadMessageId) {
    if (!channelId || !lastReadMessageId) {
      return;
    }

    const previous = localReadStateRef.current.get(channelId);
    const previousTime = previous?.lastReadAt ? new Date(previous.lastReadAt).getTime() : 0;
    const nextTime = lastReadAt ? new Date(lastReadAt).getTime() : 0;

    if (previous && previousTime > nextTime) {
      return;
    }

    localReadStateRef.current.set(channelId, {
      lastReadAt,
      lastReadMessageId
    });
  }

  async function loadBootstrap(preferredSelection = activeSelectionRef.current) {
    configureApiAuth(() => accessTokenRef.current);

    try {
      const payload = await api.bootstrap();
      pruneChannelCache(payload);
      const resolvedSelection = resolveSelection(payload, preferredSelection);
      const normalizedWorkspace = mergeLocalReadStateIntoWorkspace(
        payload,
        localReadStateRef.current,
        resolvedSelection.channelId
      );
      setWorkspace(normalizedWorkspace);
      setActiveSelection(resolvedSelection);
      setAppError("");
    } catch (error) {
      if (String(error.message || "").toLowerCase().includes("unauthorized")) {
        onSignOut();
        return;
      }
      setAppError(error.message);
    } finally {
      setBooting(false);
    }
  }

  function queueMarkRead({ channelId, lastReadAt, lastReadMessageId }) {
    if (!channelId || !lastReadMessageId) {
      return;
    }

    rememberLocalRead(channelId, lastReadAt, lastReadMessageId);

    setWorkspace((previous) =>
      mergeLocalReadStateIntoWorkspace(
        markChannelReadInWorkspace(previous, {
          channelId,
          lastReadAt
        }),
        localReadStateRef.current,
        activeSelectionRef.current.channelId
      )
    );

    pendingReadRef.current = {
      channelId,
      lastReadAt,
      lastReadMessageId
    };

    if (readReceiptTimeoutRef.current) {
      window.clearTimeout(readReceiptTimeoutRef.current);
    }

    readReceiptTimeoutRef.current = window.setTimeout(async () => {
      const pending = pendingReadRef.current;
      pendingReadRef.current = null;
      readReceiptTimeoutRef.current = null;

      if (!pending) {
        return;
      }

      try {
        await api.markRead({
          channelId: pending.channelId,
          lastReadMessageId: pending.lastReadMessageId
        });
      } catch {
        // Keep local optimistic read state even if the ack arrives late.
      }
    }, 240);
  }

  async function loadMessages({
    background = false,
    before = null,
    channelId = activeSelection.channelId,
    force = false,
    limit,
    prepend = false,
    silent = false
  } = {}) {
    const targetChannel = findChannelInSession(workspace, channelId)?.channel;
    if (!channelId || targetChannel?.is_voice) {
      setMessages([]);
      setHasMore(false);
      return;
    }

    const isInitialPage = !before && !prepend;
    const resolvedLimit = limit || (prepend ? 28 : 24);
    const requestKey = `${channelId}::${before || "latest"}::${resolvedLimit}::${prepend ? "prepend" : "replace"}`;
    const cachedEntry = isInitialPage ? readChannelCache(channelId) : null;

    if (cachedEntry && isInitialPage) {
      commitChannelMessages(
        channelId,
        cachedEntry.messages || [],
        cachedEntry.hasMore,
        cachedEntry.fetchedAt
      );
      if (!force && isChannelCacheFresh(cachedEntry)) {
        return cachedEntry;
      }
      silent = true;
    }

    const inFlightRequest = inFlightMessageLoadsRef.current.get(requestKey);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    if (!silent && !background && activeSelectionRef.current.channelId === channelId) {
      setLoadingMessages(true);
    }

    if (isInitialPage && messageAbortRef.current) {
      messageAbortRef.current.abort();
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const requestId = messageRequestIdRef.current + 1;
    messageRequestIdRef.current = requestId;

    if (isInitialPage) {
      messageAbortRef.current = controller;
    }

    const previousHeight = refs.listRef.current?.scrollHeight || 0;

    const requestPromise = (async () => {
      try {
        const payload = await api.fetchMessages({
          before,
          channelId,
          limit: resolvedLimit,
          signal: controller?.signal
        });

        if (prepend) {
          const currentMessages = readChannelCache(channelId)?.messages || [];
          const nextMessages = mergeChannelMessages(currentMessages, payload.messages, {
            prepend: true
          });
          commitChannelMessages(channelId, nextMessages, payload.has_more);

          if (activeSelectionRef.current.channelId === channelId) {
            requestAnimationFrame(() => {
              const element = refs.listRef.current;
              if (element) {
                element.scrollTop = element.scrollHeight - previousHeight;
              }
            });
          }
        } else {
          commitChannelMessages(channelId, payload.messages, payload.has_more);
        }

        const latest = payload.messages[payload.messages.length - 1];
        if (latest && activeSelectionRef.current.channelId === channelId) {
          queueMarkRead({
            channelId,
            lastReadAt: latest.created_at,
            lastReadMessageId: latest.id
          });
        }

        if (background) {
          backgroundPrefetchRef.current.set(channelId, Date.now());
        }

        return payload;
      } catch (error) {
        if (error?.name !== "AbortError" && !background) {
          setAppError(error.message);
        }

        if (background) {
          backgroundPrefetchRef.current.set(channelId, Date.now());
        }
      } finally {
        if (
          activeSelectionRef.current.channelId === channelId &&
          (!background || !silent) &&
          (!isInitialPage || messageRequestIdRef.current === requestId)
        ) {
          setLoadingMessages(false);
        }

        if (messageAbortRef.current === controller) {
          messageAbortRef.current = null;
        }

        inFlightMessageLoadsRef.current.delete(requestKey);
      }
    })();

    inFlightMessageLoadsRef.current.set(requestKey, requestPromise);
    return requestPromise;
  }

  return {
    commitChannelMessages,
    loadBootstrap,
    loadMessages,
    patchChannelMessages,
    pruneChannelCache,
    queueMarkRead,
    readChannelCache,
    rememberLocalRead
  };
}
