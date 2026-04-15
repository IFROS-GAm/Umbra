import { useEffect, useRef } from "react";

import { api } from "../../../api.js";
import { getSocket } from "../../../socket.js";
import {
  logVoiceClient,
  patchWorkspaceUser
} from "../workspaceCoreEffectHelpers.js";
import {
  applyChannelPreviewToWorkspace,
  removeChannelMessage,
  upsertChannelMessage
} from "../workspaceHelpers.js";

export function useWorkspaceSocketRealtimeEffects({
  activeSelection,
  accessToken,
  activeSelectionRef,
  historyScrollStateRef,
  joinedVoiceChannelIdRef,
  listRef,
  loadBootstrapRef,
  loadMessages,
  localReadStateRef,
  onIncomingMessage,
  onVoiceUpdateNotification,
  patchChannelMessages,
  queueMarkRead,
  readChannelCache,
  setAppError,
  setJoinedVoiceChannelId,
  setVoiceJoinReadyChannelId,
  setTypingEvents,
  setVoiceSessions,
  setWorkspace,
  voiceSessionsRef,
  workspace,
  workspaceRef,
  applyVoiceSessions
}) {
  const previewRefreshTimersRef = useRef(new Map());

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const socket = getSocket(accessToken);

    const refreshNavigation = async (payload = {}) => {
      if (
        ![
          "guild:create",
          "guild:update",
          "channel:create",
          "channel:move",
          "dm:create",
          "friends:update"
        ].includes(payload?.type)
      ) {
        return;
      }

      await loadBootstrapRef.current?.(activeSelectionRef.current);
    };

    const onMessageCreate = async ({ message, preview }) => {
      if (preview) {
        setWorkspace((previous) =>
          applyChannelPreviewToWorkspace(previous, preview, {
            localReadStateByChannel: localReadStateRef.current,
            openChannelId: activeSelectionRef.current.channelId
          })
        );
      }

      if (message?.channel_id) {
        patchChannelMessages(message.channel_id, (previous) =>
          upsertChannelMessage(previous, message)
        );
      }

      if (
        message?.author?.id &&
        message.author.id !== workspaceRef.current?.current_user?.id &&
        typeof onIncomingMessage === "function"
      ) {
        onIncomingMessage({
          message,
          preview,
          workspace: workspaceRef.current
        });
      }

      if (message?.channel_id === activeSelectionRef.current.channelId) {
        requestAnimationFrame(() => {
          const element = listRef.current;
          if (!element) {
            return;
          }

          const autoSyncToLatest = historyScrollStateRef?.current?.autoSyncToLatest !== false;
          const nearBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 160;
          if (
            autoSyncToLatest ||
            nearBottom ||
            message.author?.id === workspaceRef.current?.current_user?.id
          ) {
            element.scrollTop = element.scrollHeight;
            requestAnimationFrame(() => {
              const settledElement = listRef.current;
              if (settledElement) {
                settledElement.scrollTop = settledElement.scrollHeight;
              }
            });
          }
        });

        if (
          message.id &&
          message.author?.id !== workspaceRef.current?.current_user?.id &&
          historyScrollStateRef?.current?.autoSyncToLatest !== false
        ) {
          queueMarkRead({
            channelId: activeSelectionRef.current.channelId,
            lastReadAt: message.created_at,
            lastReadMessageId: message.id
          });
        }
      }
    };

    const onMessageUpdate = ({ message, preview }) => {
      if (preview) {
        setWorkspace((previous) =>
          applyChannelPreviewToWorkspace(previous, preview, {
            localReadStateByChannel: localReadStateRef.current,
            openChannelId: activeSelectionRef.current.channelId
          })
        );
      }

      if (message?.channel_id) {
        patchChannelMessages(message.channel_id, (previous) =>
          previous.map((item) => (item.id === message.id ? message : item))
        );
      }
    };

    const onMessageDelete = ({ channel_id, id, preview }) => {
      if (preview) {
        setWorkspace((previous) =>
          applyChannelPreviewToWorkspace(previous, preview, {
            localReadStateByChannel: localReadStateRef.current,
            openChannelId: activeSelectionRef.current.channelId
          })
        );
      }

      if (channel_id) {
        patchChannelMessages(channel_id, (previous) => removeChannelMessage(previous, id));
      }
    };

    const onReactionUpdate = ({ message }) => {
      if (message?.channel_id) {
        patchChannelMessages(message.channel_id, (previous) =>
          previous.map((item) => (item.id === message.id ? message : item))
        );
      }
    };

    const syncVoiceSessionsNow = async () => {
      if (workspaceRef.current?.mode === "supabase") {
        return;
      }

      try {
        const payload = await api.fetchVoiceState();
        applyVoiceSessions(payload?.sessions || {});
      } catch {
        // Socket remains the primary path; this is a silent consistency sweep.
      }
    };

    const onPresenceUpdate = ({ user }) => {
      if (!user) {
        return;
      }

      const nextStatus = user.status === "invisible" ? "offline" : user.status;
      const nextUserPatch = {
        ...user,
        status: nextStatus
      };

      setWorkspace((previous) => {
        if (!previous) {
          return previous;
        }

        return patchWorkspaceUser(previous, nextUserPatch);
      });

      if (activeSelectionRef.current.channelId) {
        patchChannelMessages(activeSelectionRef.current.channelId, (previousMessages) =>
          previousMessages.map((message) =>
            message.author?.id === user.id
              ? {
                  ...message,
                  author: {
                    ...message.author,
                    ...user,
                    status: nextStatus
                  }
                }
              : message
          )
        );
      }
    };

    const onTypingUpdate = (payload) => {
      setTypingEvents((previous) => {
        const filtered = previous.filter(
          (item) =>
            !(
              item.channelId === payload.channelId && item.userId === payload.userId
            ) && item.expires_at > Date.now()
        );
        return [...filtered, payload];
      });
    };

    const onVoiceState = (payload) => {
      logVoiceClient(socket, "state", {
        activeVoiceChannels: Object.keys(payload || {})
      });
      if (workspaceRef.current?.mode === "supabase") {
        return;
      }
      applyVoiceSessions(payload || {});
    };

    const onVoiceUpdate = ({ channelId, userIds }) => {
      const previousUserIds = voiceSessionsRef.current?.[channelId] || [];
      if (!channelId) {
        return;
      }

      const normalizedUserIds = [...new Set((userIds || []).filter(Boolean))];
      logVoiceClient(socket, "update", {
        channelId,
        previousUserIds,
        userIds: normalizedUserIds
      });
      if (workspaceRef.current?.mode === "supabase") {
        return;
      }

      const currentUserId = workspaceRef.current?.current_user?.id || "";
      setVoiceSessions((previous) => {
        const nextVoiceSessions = { ...previous };
        if (normalizedUserIds.length) {
          nextVoiceSessions[channelId] = normalizedUserIds;
        } else {
          delete nextVoiceSessions[channelId];
        }
        voiceSessionsRef.current = nextVoiceSessions;
        return nextVoiceSessions;
      });

      if (
        currentUserId &&
        joinedVoiceChannelIdRef.current === channelId &&
        !normalizedUserIds.includes(currentUserId)
      ) {
        setJoinedVoiceChannelId(null);
      }

      if (
        socket.connected &&
        currentUserId &&
        joinedVoiceChannelIdRef.current === channelId &&
        normalizedUserIds.includes(currentUserId)
      ) {
        logVoiceClient(socket, "sync-peers:emit", {
          channelId
        });
        socket.emit("voice:sync-peers", {
          channelId
        });
      }

      if (typeof onVoiceUpdateNotification === "function") {
        onVoiceUpdateNotification({
          channelId,
          previousUserIds,
          userIds: normalizedUserIds,
          workspace: workspaceRef.current
        });
      }
    };

    const onVoiceJoined = ({ channelId, peers, peerId }) => {
      logVoiceClient(socket, "join:ack", {
        channelId,
        peerId,
        peerIds: (peers || []).map((peer) => peer.peerId),
        peerUserIds: (peers || []).map((peer) => peer.userId)
      });
      if (channelId && workspaceRef.current?.mode !== "supabase") {
        setVoiceJoinReadyChannelId(channelId);
      }
    };

    const onChannelPreview = ({ preview }) => {
      if (!preview) {
        return;
      }

      const openChannelId = activeSelectionRef.current.channelId;
      const isOpenChannel = preview.id === openChannelId;
      const cachedOpenChannel = isOpenChannel ? readChannelCache(preview.id) : null;
      const cachedLastMessageId = String(
        cachedOpenChannel?.messages?.[cachedOpenChannel.messages.length - 1]?.id || ""
      ).trim();
      const previewLastMessageId = String(preview.last_message_id || "").trim();

      setWorkspace((previous) =>
        applyChannelPreviewToWorkspace(previous, preview, {
          localReadStateByChannel: localReadStateRef.current,
          openChannelId
        })
      );

      if (
        isOpenChannel &&
        previewLastMessageId &&
        previewLastMessageId !== cachedLastMessageId
      ) {
        const existingTimer = previewRefreshTimersRef.current.get(preview.id);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        const timer = window.setTimeout(() => {
          previewRefreshTimersRef.current.delete(preview.id);

          const latestCachedLastMessageId = String(
            readChannelCache(preview.id)?.messages?.[
              (readChannelCache(preview.id)?.messages?.length || 1) - 1
            ]?.id || ""
          ).trim();

          if (
            activeSelectionRef.current.channelId === preview.id &&
            latestCachedLastMessageId !== previewLastMessageId &&
            historyScrollStateRef?.current?.autoSyncToLatest !== false
          ) {
            loadMessages({
              channelId: preview.id,
              force: true,
              silent: true
            });
          }
        }, 900);

        previewRefreshTimersRef.current.set(preview.id, timer);
      }
    };

    const onRoomError = (payload) => {
      if (!payload?.error) {
        return;
      }

      logVoiceClient(socket, "room:error", {
        channelId: payload.channelId || null,
        error: payload.error
      });

      setAppError(payload.error);
      if (payload.channelId && joinedVoiceChannelIdRef.current === payload.channelId) {
        setJoinedVoiceChannelId(null);
        setVoiceJoinReadyChannelId(null);
      }
    };

    const onConnect = () => {
      syncVoiceSessionsNow();
      logVoiceClient(socket, "socket:connect", {
        activeChannelId: activeSelectionRef.current?.channelId || null,
        joinedVoiceChannelId: joinedVoiceChannelIdRef.current || null
      });

      if (activeSelectionRef.current?.channelId) {
        socket.emit("room:join", {
          channelId: activeSelectionRef.current.channelId
        });
      }

      if (joinedVoiceChannelIdRef.current) {
        if (workspaceRef.current?.mode === "supabase") {
          logVoiceClient(socket, "join:deferred", {
            channelId: joinedVoiceChannelIdRef.current,
            reason: "waiting-for-supabase-presence"
          });
          return;
        }
        setVoiceJoinReadyChannelId(null);
        logVoiceClient(socket, "join:re-emit", {
          channelId: joinedVoiceChannelIdRef.current
        });
        socket.emit("voice:join", {
          channelId: joinedVoiceChannelIdRef.current
        });
      }
    };

    socket.connect();
    socket.on("connect", onConnect);
    socket.on("message:create", onMessageCreate);
    socket.on("message:update", onMessageUpdate);
    socket.on("message:delete", onMessageDelete);
    socket.on("reaction:update", onReactionUpdate);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("navigation:update", refreshNavigation);
    socket.on("typing:update", onTypingUpdate);
    socket.on("voice:state", onVoiceState);
    socket.on("voice:update", onVoiceUpdate);
    socket.on("voice:joined", onVoiceJoined);
    socket.on("channel:preview", onChannelPreview);
    socket.on("room:error", onRoomError);

    return () => {
      previewRefreshTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      previewRefreshTimersRef.current.clear();
      socket.off("message:create", onMessageCreate);
      socket.off("message:update", onMessageUpdate);
      socket.off("message:delete", onMessageDelete);
      socket.off("reaction:update", onReactionUpdate);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("navigation:update", refreshNavigation);
      socket.off("typing:update", onTypingUpdate);
      socket.off("connect", onConnect);
      socket.off("voice:state", onVoiceState);
      socket.off("voice:update", onVoiceUpdate);
      socket.off("voice:joined", onVoiceJoined);
      socket.off("channel:preview", onChannelPreview);
      socket.off("room:error", onRoomError);
      socket.disconnect();
    };
  }, [accessToken, workspace?.current_user?.id]);

  useEffect(() => {
    if (activeSelection.channelId && accessToken) {
      const socket = getSocket(accessToken);
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit("room:join", { channelId: activeSelection.channelId });
    }
  }, [accessToken, activeSelection.channelId]);
}
