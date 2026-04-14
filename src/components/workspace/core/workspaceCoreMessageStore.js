import { startTransition } from "react";
import { flushSync } from "react-dom";
import { api, configureApiAuth } from "../../../api.js";
import { findChannelInSession, resolveSelection } from "../../../utils.js";
import {
  isChannelCacheFresh,
  markChannelReadInWorkspace,
  mergeChannelMessages,
  mergeLocalReadStateIntoWorkspace
} from "../workspaceHelpers.js";

export const BACKGROUND_PREFETCH_COOLDOWN_MS = 90_000;

function cloneSelection(selection) {
  return {
    channelId: selection?.channelId ?? null,
    guildId: selection?.guildId ?? null,
    kind: selection?.kind || "guild"
  };
}

function buildMessageLoadError(error, fallbackMessage) {
  const status = Number(error?.status || 0);
  const normalizedMessage = String(error?.message || "").trim();

  if (status === 404) {
    return {
      kind: "missing-channel",
      message: "Este canal ya no existe o el ID ya no es valido."
    };
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      message: "Ya no tienes acceso a este canal."
    };
  }

  if (status === 401) {
    return {
      kind: "unauthorized",
      message: "Tu sesion ya no puede leer este canal."
    };
  }

  if (normalizedMessage.toLowerCase().includes("no se pudo conectar")) {
    return {
      kind: "network",
      message: "No se pudo conectar con el backend. Reintenta cuando vuelva a responder."
    };
  }

  return {
    kind: "unknown",
    message: normalizedMessage || fallbackMessage || "No se pudieron cargar los mensajes."
  };
}
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

function captureViewportSnapshot(element) {
  if (!element) {
    return null;
  }

  return {
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  };
}

function restoreViewportSnapshot(element, snapshot) {
  if (!element || !snapshot) {
    return snapshot || null;
  }

  const nextScrollTop = Math.max(
    0,
    Number(snapshot.scrollTop || 0) +
      (Number(element.scrollHeight || 0) - Number(snapshot.scrollHeight || 0))
  );

  element.scrollTop = nextScrollTop;

  return {
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  };
}

function createViewportSnapshotTracker(element) {
  if (!element) {
    return {
      read() {
        return null;
      },
      write() {},
      stop() {}
    };
  }

  let currentSnapshot = captureViewportSnapshot(element);
  let frameId = null;

  function refreshSnapshot() {
    frameId = null;
    currentSnapshot = captureViewportSnapshot(element);
  }

  function scheduleSnapshotRefresh() {
    if (frameId !== null) {
      return;
    }

    frameId = window.requestAnimationFrame(refreshSnapshot);
  }

  element.addEventListener("scroll", scheduleSnapshotRefresh, { passive: true });

  return {
    read() {
      return currentSnapshot || captureViewportSnapshot(element);
    },
    write(nextSnapshot) {
      currentSnapshot = nextSnapshot || captureViewportSnapshot(element);
    },
    stop() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      element.removeEventListener("scroll", scheduleSnapshotRefresh);
    }
  };
}

function stabilizeViewportSnapshot(element, tracker, onSettle) {
  if (!element || !tracker) {
    onSettle?.();
    return () => {};
  }

  let settled = false;
  let settleTimer = null;
  let maxTimer = null;
  let resizeObserver = null;

  function finish() {
    if (settled) {
      return;
    }

    settled = true;
    if (settleTimer) {
      window.clearTimeout(settleTimer);
    }
    if (maxTimer) {
      window.clearTimeout(maxTimer);
    }
    resizeObserver?.disconnect();
    onSettle?.();
  }

  function refreshSnapshot() {
    if (settled) {
      return;
    }

    const nextSnapshot = restoreViewportSnapshot(element, tracker.read());
    tracker.write(nextSnapshot);

    if (settleTimer) {
      window.clearTimeout(settleTimer);
    }

    settleTimer = window.setTimeout(finish, 140);
  }

  refreshSnapshot();
  requestAnimationFrame(() => {
    refreshSnapshot();
    requestAnimationFrame(refreshSnapshot);
  });

  if (typeof ResizeObserver === "function") {
    const observedNode = element.firstElementChild || element;
    resizeObserver = new ResizeObserver(() => {
      refreshSnapshot();
    });
    resizeObserver.observe(observedNode);
  }

  maxTimer = window.setTimeout(finish, 900);
  return finish;
}

export function createWorkspaceMessageStore({
  accessTokenRef,
  activeSelection,
  activeSelectionRef,
  backgroundPrefetchRef,
  bootstrapRequestIdRef,
  historyScrollStateRef,
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
  selectionVersionRef,
  setActiveSelection,
  setAppError,
  setBooting,
  setHasMore,
  setLoadingHistoryMessages,
  setLoadingMessages,
  setMessageLoadError,
  setMessages,
  setWorkspace,
  workspaceRef,
  workspace
}) {
  const MAX_CHANNEL_MESSAGES = 100;

  function trimChannelMessages(channelId, messages, hasMore) {
    if (!messages || messages.length <= MAX_CHANNEL_MESSAGES) {
      return {
        hasMore,
        messages,
        windowMode: "latest"
      };
    }

    const isActive = activeSelectionRef.current.channelId === channelId;
    const autoSyncToLatest = historyScrollStateRef?.current?.autoSyncToLatest !== false;

    if (isActive && !autoSyncToLatest) {
      return {
        messages: messages.slice(0, MAX_CHANNEL_MESSAGES),
        hasMore,
        windowMode: "history"
      };
    }

    return {
      messages: messages.slice(-MAX_CHANNEL_MESSAGES),
      hasMore: true,
      windowMode: "latest"
    };
  }

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

  function commitChannelMessages(
    channelId,
    nextMessages,
    nextHasMore,
    fetchedAt = Date.now(),
    { sync = false } = {}
  ) {
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

    const trimmed = trimChannelMessages(channelId, nextMessages, resolvedHasMore);
    const nextEntry = {
      fetchedAt,
      hasMore: trimmed.hasMore,
      messages: trimmed.messages,
      windowMode: trimmed.windowMode
    };
    messageCacheRef.current.set(channelId, nextEntry);

    if (activeSelectionRef.current.channelId === channelId) {
      const applyState = () => {
        setMessages(trimmed.messages);
        setHasMore(trimmed.hasMore);
      };

      if (sync) {
        flushSync(applyState);
      } else {
        startTransition(applyState);
      }
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

  async function loadBootstrap(
    preferredSelection = activeSelectionRef.current,
    options = {}
  ) {
    const { selectionMode = "preserve-current", silentError = false } = options;
    const requestId = bootstrapRequestIdRef.current + 1;
    const preferredSelectionSnapshot = cloneSelection(preferredSelection);
    const selectionVersionAtStart = selectionVersionRef.current;

    bootstrapRequestIdRef.current = requestId;
    configureApiAuth(() => accessTokenRef.current);

    try {
      const payload = await api.bootstrap();
      if (requestId !== bootstrapRequestIdRef.current) {
        return payload;
      }

      pruneChannelCache(payload);
      const shouldPreserveCurrentSelection =
        selectionMode !== "target" ||
        selectionVersionRef.current !== selectionVersionAtStart;
      const resolvedSelection = resolveSelection(
        payload,
        shouldPreserveCurrentSelection
          ? activeSelectionRef.current
          : preferredSelectionSnapshot
      );
      const normalizedWorkspace = mergeLocalReadStateIntoWorkspace(
        payload,
        localReadStateRef.current,
        resolvedSelection.channelId
      );
      if (workspaceRef) {
        workspaceRef.current = normalizedWorkspace;
      }
      setWorkspace(normalizedWorkspace);
      setActiveSelection(resolvedSelection);
      setAppError("");
      return normalizedWorkspace;
    } catch (error) {
      if (requestId !== bootstrapRequestIdRef.current) {
        return null;
      }

      if (String(error.message || "").toLowerCase().includes("unauthorized")) {
        onSignOut();
        return;
      }
      if (!silentError) {
        setAppError(error.message);
      }
    } finally {
      if (requestId === bootstrapRequestIdRef.current) {
        setBooting(false);
      }
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
    resetWindow = false,
    silent = false
  } = {}) {
    const workspaceSnapshot = workspaceRef?.current || workspace;
    const targetChannel = findChannelInSession(workspaceSnapshot, channelId)?.channel;
    if (!channelId || targetChannel?.is_voice) {
      setMessages([]);
      setHasMore(false);
      setMessageLoadError(null);
      return;
    }

    if (!targetChannel) {
      if (activeSelectionRef.current.channelId === channelId) {
        setMessages([]);
        setHasMore(false);
        setLoadingHistoryMessages(false);
        setLoadingMessages(false);
        setMessageLoadError({
          kind: "missing-channel",
          message: "El canal seleccionado ya no esta disponible en tu espacio actual."
        });
      }
      return null;
    }

    const isInitialPage = !before && !prepend;
    const resolvedLimit = limit || (prepend ? 28 : 24);
    const requestKey = `${channelId}::${before || "latest"}::${resolvedLimit}::${prepend ? "prepend" : "replace"}`;
    const cachedEntry = isInitialPage && !resetWindow ? readChannelCache(channelId) : null;

    if (cachedEntry && isInitialPage) {
      if (activeSelectionRef.current.channelId === channelId) {
        setMessageLoadError(null);
      }
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

    const isActiveChannel = activeSelectionRef.current.channelId === channelId;

    if (!silent && !background && activeSelectionRef.current.channelId === channelId) {
      setMessageLoadError(null);
      if (prepend) {
        historyScrollStateRef?.current?.cancelViewportStabilizer?.();
        if (historyScrollStateRef?.current) {
          historyScrollStateRef.current.cancelViewportStabilizer = null;
          historyScrollStateRef.current.pendingViewportTracker?.stop?.();
          historyScrollStateRef.current.pendingViewportTracker = createViewportSnapshotTracker(
            refs.listRef.current
          );
        }
        setLoadingHistoryMessages(true);
        requestAnimationFrame(() => {
          const element = refs.listRef.current;
          const viewportTracker = historyScrollStateRef?.current?.pendingViewportTracker;
          if (!element || !viewportTracker) {
            return;
          }

          const nextSnapshot = restoreViewportSnapshot(element, viewportTracker.read());
          viewportTracker.write(nextSnapshot);
        });
      } else {
        setLoadingMessages(true);
      }
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

    const requestPromise = (async () => {
      let deferredHistoryLoadingReset = false;

      try {
        const payload = await api.fetchMessages({
          before,
          channelId,
          limit: resolvedLimit,
          signal: controller?.signal
        });

        if (prepend) {
          const viewportTracker =
            historyScrollStateRef?.current?.pendingViewportTracker ||
            createViewportSnapshotTracker(refs.listRef.current);
          const currentMessages = readChannelCache(channelId)?.messages || [];
          const nextMessages = mergeChannelMessages(currentMessages, payload.messages, {
            prepend: true
          });
          commitChannelMessages(channelId, nextMessages, payload.has_more, Date.now(), {
            sync: isActiveChannel
          });

          if (isActiveChannel) {
            deferredHistoryLoadingReset = true;
            const element = refs.listRef.current;
            historyScrollStateRef?.current?.cancelViewportStabilizer?.();
            const cancelViewportStabilizer = stabilizeViewportSnapshot(element, viewportTracker, () => {
              const settledElement = refs.listRef.current;
              if (settledElement && historyScrollStateRef?.current) {
                historyScrollStateRef.current.lastScrollTop = settledElement.scrollTop;
                historyScrollStateRef.current.loadArmed = true;
                if (
                  historyScrollStateRef.current.cancelViewportStabilizer === cancelViewportStabilizer
                ) {
                  historyScrollStateRef.current.cancelViewportStabilizer = null;
                }
                if (historyScrollStateRef.current.pendingViewportTracker === viewportTracker) {
                  historyScrollStateRef.current.pendingViewportTracker = null;
                }
              }
              viewportTracker.stop();
            });

            if (historyScrollStateRef?.current) {
              historyScrollStateRef.current.cancelViewportStabilizer = cancelViewportStabilizer;
            }

            setLoadingHistoryMessages(false);
          } else {
            viewportTracker.stop();
            if (
              historyScrollStateRef?.current?.pendingViewportTracker === viewportTracker
            ) {
              historyScrollStateRef.current.pendingViewportTracker = null;
            }
          }
        } else {
          const cachedMessages =
            isInitialPage && !resetWindow ? readChannelCache(channelId)?.messages || [] : [];
          const nextMessages =
            isInitialPage && cachedMessages.length
              ? mergeChannelMessages(cachedMessages, payload.messages)
              : payload.messages;
          const nextHasMore =
            isInitialPage && cachedMessages.length
              ? readChannelCache(channelId)?.hasMore ?? payload.has_more
              : payload.has_more;
          commitChannelMessages(channelId, nextMessages, nextHasMore);

          if (resetWindow && activeSelectionRef.current.channelId === channelId) {
            requestAnimationFrame(() => {
              const element = refs.listRef.current;
              if (element) {
                element.scrollTop = element.scrollHeight;
                if (historyScrollStateRef?.current) {
                  historyScrollStateRef.current.lastScrollTop = element.scrollTop;
                  historyScrollStateRef.current.loadArmed = true;
                }
              }
            });
          }
        }

        const latest = payload.messages[payload.messages.length - 1];
        const shouldAcknowledgeLatest =
          latest &&
          !prepend &&
          activeSelectionRef.current.channelId === channelId &&
          historyScrollStateRef?.current?.autoSyncToLatest !== false;
        if (shouldAcknowledgeLatest) {
          queueMarkRead({
            channelId,
            lastReadAt: latest.created_at,
            lastReadMessageId: latest.id
          });
        }

        if (background) {
          backgroundPrefetchRef.current.set(channelId, Date.now());
        }

        if (activeSelectionRef.current.channelId === channelId) {
          setMessageLoadError(null);
        }

        return payload;
      } catch (error) {
        if (
          error?.name !== "AbortError" &&
          !background &&
          activeSelectionRef.current.channelId === channelId
        ) {
          setMessageLoadError(
            buildMessageLoadError(error, "No se pudieron cargar los mensajes del canal.")
          );
        }

        if (background) {
          backgroundPrefetchRef.current.set(channelId, Date.now());
        }
      } finally {
        if (!background || !silent) {
          if (prepend) {
            if (!deferredHistoryLoadingReset) {
              const viewportTracker = historyScrollStateRef?.current?.pendingViewportTracker || null;
              if (viewportTracker && isActiveChannel) {
                historyScrollStateRef?.current?.cancelViewportStabilizer?.();
                const cancelViewportStabilizer = stabilizeViewportSnapshot(
                  refs.listRef.current,
                  viewportTracker,
                  () => {
                    const settledElement = refs.listRef.current;
                    if (settledElement && historyScrollStateRef?.current) {
                      historyScrollStateRef.current.lastScrollTop = settledElement.scrollTop;
                      historyScrollStateRef.current.loadArmed = true;
                      if (
                        historyScrollStateRef.current.cancelViewportStabilizer ===
                        cancelViewportStabilizer
                      ) {
                        historyScrollStateRef.current.cancelViewportStabilizer = null;
                      }
                      if (historyScrollStateRef.current.pendingViewportTracker === viewportTracker) {
                        historyScrollStateRef.current.pendingViewportTracker = null;
                      }
                    }
                    viewportTracker.stop();
                  }
                );
                if (historyScrollStateRef?.current) {
                  historyScrollStateRef.current.cancelViewportStabilizer = cancelViewportStabilizer;
                }
              } else {
                viewportTracker?.stop();
                if (historyScrollStateRef?.current?.pendingViewportTracker === viewportTracker) {
                  historyScrollStateRef.current.pendingViewportTracker = null;
                }
              }
              setLoadingHistoryMessages(false);
            }
          } else if (
            activeSelectionRef.current.channelId === channelId &&
            (!isInitialPage || messageRequestIdRef.current === requestId)
          ) {
            setLoadingMessages(false);
          }
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
