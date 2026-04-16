import { useCallback, useEffect, useRef, useState } from "react";

import {
  playUmbraSound,
  startUmbraLoopingSound,
  stopAllUmbraSounds,
  stopUmbraSound
} from "../../../audio/umbraSoundEffects.js";
import { translate } from "../../../i18n.js";
import { getSocket } from "../../../socket.js";
import { findChannelInSession } from "../../../utils.js";

function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.umbraDesktop || null;
}

function getMessagePreview(message, preview) {
  if (preview?.last_message_preview) {
    return preview.last_message_preview;
  }

  const content = String(message?.content || "").replace(/\s+/g, " ").trim();
  if (content) {
    return content.length > 92 ? `${content.slice(0, 89)}...` : content;
  }

  if (message?.sticker?.name) {
    return `[sticker] ${message.sticker.name}`;
  }

  if (Array.isArray(message?.attachments) && message.attachments.length) {
    return message.attachments.length > 1 ? "[adjuntos]" : "[adjunto]";
  }

  return "Nuevo mensaje";
}

function isGuildMessageNotifiable(message, guildPrefs, currentUserId) {
  const notificationLevel = guildPrefs?.notificationLevel || "mentions";

  if (notificationLevel === "none") {
    return false;
  }

  if (notificationLevel === "all") {
    return true;
  }

  return Boolean(
    message?.is_mentioning_me ||
      (Array.isArray(message?.mention_user_ids) && message.mention_user_ids.includes(currentUserId))
  );
}

function findCallParticipant(workspace, channel, callerId) {
  if (!callerId) {
    return null;
  }

  return (
    channel?.participants?.find((participant) => participant.id === callerId) ||
    workspace?.available_users?.find((user) => user.id === callerId) ||
    null
  );
}

export function useWorkspaceDesktopNotifications({
  accessToken,
  dmMenuPrefs,
  guildMenuPrefs,
  joinVoiceChannelById,
  joinedVoiceChannelId,
  language = "es",
  showUiNotice,
  voiceSessions,
  workspace
}) {
  const desktopBridge = getDesktopBridge();
  const currentUserId = workspace?.current_user?.id || "";
  const stateRef = useRef({
    currentUserId,
    dmMenuPrefs,
    guildMenuPrefs,
    joinedVoiceChannelId,
    language,
    voiceSessions,
    workspace
  });
  const notifiedMessageIdsRef = useRef(new Set());
  const notifiedFriendRequestIdsRef = useRef(new Set());
  const dismissedIncomingCallsRef = useRef(new Set());
  const incomingCallTimeoutRef = useRef(null);
  const activeIncomingCallRef = useRef(null);
  const previousVoiceSessionsRef = useRef({});
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    stateRef.current = {
      currentUserId,
      dmMenuPrefs,
      guildMenuPrefs,
      joinedVoiceChannelId,
      language,
      voiceSessions,
      workspace
    };
  }, [
    currentUserId,
    dmMenuPrefs,
    guildMenuPrefs,
    joinedVoiceChannelId,
    language,
    voiceSessions,
    workspace
  ]);

  const clearIncomingCallTimer = useCallback(() => {
    if (!incomingCallTimeoutRef.current) {
      return;
    }

    window.clearTimeout(incomingCallTimeoutRef.current);
    incomingCallTimeoutRef.current = null;
  }, []);

  const hideIncomingCallPopup = useCallback(({ clearDismissed = false } = {}) => {
    if (clearDismissed && activeIncomingCallRef.current?.callId) {
      dismissedIncomingCallsRef.current.delete(activeIncomingCallRef.current.callId);
    }

    clearIncomingCallTimer();
    setIncomingCall(null);
    activeIncomingCallRef.current = null;
    stopUmbraSound("incomingCall");
  }, [clearIncomingCallTimer]);

  const acceptIncomingCall = useCallback((channelId = null) => {
    const activeCall = activeIncomingCallRef.current;
    const resolvedChannelId = String(
      channelId || activeCall?.channelId || incomingCall?.channelId || ""
    ).trim();
    const resolvedCallId = String(activeCall?.callId || incomingCall?.callId || "").trim();

    if (!resolvedChannelId) {
      return false;
    }

    const joined = joinVoiceChannelById(resolvedChannelId, {
      notifyParticipants: false
    });
    if (!joined) {
      showUiNotice?.("No se pudo abrir la llamada entrante.");
      playUmbraSound("error");
      return false;
    }

    if (accessToken && resolvedCallId) {
      const socket = getSocket(accessToken);
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit("call:response", {
        callId: resolvedCallId,
        channelId: resolvedChannelId,
        status: "accepted"
      });
    }

    hideIncomingCallPopup({ clearDismissed: true });
    return true;
  }, [accessToken, hideIncomingCallPopup, incomingCall?.callId, incomingCall?.channelId, joinVoiceChannelById, showUiNotice]);

  const rejectIncomingCall = useCallback((channelId = null, reason = "rejected") => {
    const activeCall = activeIncomingCallRef.current;
    const resolvedChannelId = String(
      channelId || activeCall?.channelId || incomingCall?.channelId || ""
    ).trim();
    const resolvedCallId = String(activeCall?.callId || incomingCall?.callId || "").trim();

    if (!resolvedChannelId || !resolvedCallId) {
      return false;
    }

    dismissedIncomingCallsRef.current.add(resolvedCallId);
    if (accessToken) {
      const socket = getSocket(accessToken);
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit("call:response", {
        callId: resolvedCallId,
        channelId: resolvedChannelId,
        status: reason === "missed" ? "missed" : "rejected"
      });
    }
    hideIncomingCallPopup();
    return true;
  }, [accessToken, hideIncomingCallPopup, incomingCall?.callId, incomingCall?.channelId]);

  useEffect(() => {
    const currentCall = activeIncomingCallRef.current;
    if (!currentCall) {
      return;
    }

    const currentUserIds = Array.isArray(voiceSessions?.[currentCall.channelId])
      ? voiceSessions[currentCall.channelId]
      : [];
    const otherParticipants = currentUserIds.filter((userId) => userId !== currentUserId);

    if (joinedVoiceChannelId === currentCall.channelId || otherParticipants.length === 0) {
      hideIncomingCallPopup({ clearDismissed: true });
    }
  }, [currentUserId, hideIncomingCallPopup, joinedVoiceChannelId, voiceSessions]);

  useEffect(() => {
    clearIncomingCallTimer();
    if (!incomingCall?.callId) {
      return undefined;
    }

    const remainingMs = Math.max(
      0,
      Number(incomingCall.expiresAt || Date.now() + 28000) - Date.now()
    );
    incomingCallTimeoutRef.current = window.setTimeout(() => {
      rejectIncomingCall(incomingCall.channelId, "missed");
    }, remainingMs);

    return () => {
      clearIncomingCallTimer();
    };
  }, [
    clearIncomingCallTimer,
    incomingCall?.callId,
    incomingCall?.channelId,
    incomingCall?.expiresAt,
    rejectIncomingCall
  ]);

  const handleIncomingMessage = useCallback(
    ({ message, preview, workspace: nextWorkspace }) => {
      const {
        currentUserId: nextCurrentUserId,
        dmMenuPrefs: nextDmPrefs,
        guildMenuPrefs: nextGuildPrefs,
        language: nextLanguage,
        workspace: currentWorkspace
      } = stateRef.current;
      const runtimeWorkspace = nextWorkspace || currentWorkspace;

      if (!message?.id || message.author?.id === nextCurrentUserId || !runtimeWorkspace) {
        return;
      }

      const messageId = String(message.id);
      if (notifiedMessageIdsRef.current.has(messageId)) {
        return;
      }
      notifiedMessageIdsRef.current.add(messageId);

      if (notifiedMessageIdsRef.current.size > 500) {
        const [firstId] = notifiedMessageIdsRef.current;
        if (firstId) {
          notifiedMessageIdsRef.current.delete(firstId);
        }
      }

      const target = findChannelInSession(runtimeWorkspace, message.channel_id);
      if (!target) {
        return;
      }

      let shouldNotify = false;
      let title = "Umbra";
      const senderName = message.display_name || message.author?.username || "Usuario";
      const bodyPreview = getMessagePreview(message, preview);
      const t = (key, fallback) => translate(nextLanguage, key, fallback);

      if (target.kind === "dm") {
        const dmPrefs = nextDmPrefs?.[target.channel.id] || { muted: false };
        shouldNotify = !dmPrefs.muted;
        title = target.channel.display_name || senderName;
      } else if (target.kind === "guild") {
        const guildPrefs = nextGuildPrefs?.[target.guild.id] || {
          notificationLevel: "mentions"
        };
        shouldNotify = isGuildMessageNotifiable(message, guildPrefs, nextCurrentUserId);
        title = `#${target.channel.name} • ${target.guild.name}`;
      }

      if (!shouldNotify) {
        return;
      }

      playUmbraSound("notification");
      desktopBridge?.showNativeNotification?.({
        body: `${senderName}: ${bodyPreview}`,
        kind: "message",
        title: t("notifications.messageTitle", title)
      })?.catch?.(() => {});
    },
    [desktopBridge]
  );

  const handleIncomingFriendRequest = useCallback(
    ({ request, requester }) => {
      const {
        currentUserId: nextCurrentUserId,
        language: nextLanguage
      } = stateRef.current;

      const requestId = String(request?.id || "").trim();
      if (!requestId || notifiedFriendRequestIdsRef.current.has(requestId)) {
        return;
      }

      const recipientId = String(request?.recipient_id || "").trim();
      if (recipientId && recipientId !== String(nextCurrentUserId || "").trim()) {
        return;
      }

      notifiedFriendRequestIdsRef.current.add(requestId);
      if (notifiedFriendRequestIdsRef.current.size > 200) {
        const [firstId] = notifiedFriendRequestIdsRef.current;
        if (firstId) {
          notifiedFriendRequestIdsRef.current.delete(firstId);
        }
      }

      const t = (key, fallback) => translate(nextLanguage, key, fallback);
      const senderName =
        requester?.display_name || requester?.username || t("friends.request.userFallback", "Una sombra");
      const title = t("friends.request.notificationTitle", "Nueva solicitud de amistad");
      const body = t(
        "friends.request.notificationBody",
        `${senderName} quiere unirse a tus sombras.`
      );

      playUmbraSound("notification");
      if (desktopBridge?.showNativeNotification) {
        desktopBridge.showNativeNotification({
          body,
          iconDataUrl: requester?.avatar_url || "",
          kind: "friend-request",
          title
        })?.catch?.(() => {});
        return;
      }

      showUiNotice?.(body);
    },
    [desktopBridge, showUiNotice]
  );

  const handleVoiceUpdateNotification = useCallback(
    ({ channelId, previousUserIds = [], userIds = [], workspace: nextWorkspace }) => {
      const {
        currentUserId: nextCurrentUserId,
        dmMenuPrefs: nextDmPrefs,
        language: nextLanguage,
        joinedVoiceChannelId: nextJoinedVoiceChannelId,
        workspace: currentWorkspace
      } = stateRef.current;
      const runtimeWorkspace = nextWorkspace || currentWorkspace;

      if (!channelId || !runtimeWorkspace) {
        return;
      }

      const target = findChannelInSession(runtimeWorkspace, channelId);
      if (!target || target.kind !== "dm") {
        return;
      }

      const channel = target.channel;
      if ((channel?.type || "") === "dm") {
        return;
      }

      if ((channel?.type || "") !== "group_dm") {
        return;
      }

      const dmPrefs = nextDmPrefs?.[channel.id] || { muted: false };
      if (dmPrefs.muted) {
        return;
      }

      const activeOtherParticipants = userIds.filter((userId) => userId && userId !== nextCurrentUserId);

      if (
        nextJoinedVoiceChannelId === channel.id ||
        userIds.includes(nextCurrentUserId) ||
        activeOtherParticipants.length === 0
      ) {
        if (activeIncomingCallRef.current?.channelId === channel.id) {
          hideIncomingCallPopup();
        }
        return;
      }

      const newlyJoined = activeOtherParticipants.filter(
        (userId) => !previousUserIds.includes(userId)
      );

      if (!newlyJoined.length) {
        return;
      }

      const caller = findCallParticipant(runtimeWorkspace, channel, newlyJoined[0]);
      const callerName = caller?.display_name || caller?.username || channel.display_name || "Umbra";
      const groupName = channel.display_name || callerName;
      const t = (key, fallback) => translate(nextLanguage, key, fallback);
      const body =
        channel.type === "group_dm"
          ? t("notifications.groupCallBody", `Llamada entrante en ${groupName}`)
          : t("notifications.directCallBody", `${callerName} te esta llamando`);
      const popupPayload = {
        avatarUrl: caller?.avatar_url || "",
        body,
        callId: channel.id,
        callerName,
        channelId: channel.id,
        channelName: groupName,
        kind: "call"
      };

      activeIncomingCallRef.current = popupPayload;
      setIncomingCall(popupPayload);
      startUmbraLoopingSound("incomingCall");

      desktopBridge?.showNativeNotification?.({
        body,
        kind: "call",
        playSound: false,
        title: t("notifications.incomingCall", "Llamada entrante")
      })?.catch?.(() => {});
    },
    [desktopBridge, hideIncomingCallPopup]
  );

  const handleIncomingCallInvite = useCallback(
    (payload = {}) => {
      const runtimeWorkspace = stateRef.current.workspace;
      const nextJoinedVoiceChannelId = stateRef.current.joinedVoiceChannelId;
      const callId = String(payload.callId || "").trim();
      const channelId = String(payload.channelId || "").trim();
      const callerId = String(payload.caller?.id || "").trim();

      if (!runtimeWorkspace || !callId || !channelId || !callerId || callerId === currentUserId) {
        return;
      }

      const target = findChannelInSession(runtimeWorkspace, channelId);
      if (!target || target.kind !== "dm" || target.channel?.type !== "dm") {
        return;
      }

      if (nextJoinedVoiceChannelId === channelId || dismissedIncomingCallsRef.current.has(callId)) {
        return;
      }

      const caller =
        payload.caller ||
        findCallParticipant(runtimeWorkspace, target.channel, callerId) ||
        null;
      const callerName =
        caller?.display_name || caller?.username || target.channel.display_name || "Umbra";
      const body =
        payload.mode === "video"
          ? `${callerName} te esta llamando por video.`
          : `${callerName} te esta llamando.`;
      const popupPayload = {
        avatarUrl: caller?.avatar_url || "",
        body,
        callId,
        callerId,
        callerName,
        channelId,
        channelName: target.channel.display_name || callerName,
        expiresAt: Number(payload.expiresAt || Date.now() + 28000),
        kind: "call"
      };

      activeIncomingCallRef.current = popupPayload;
      setIncomingCall(popupPayload);
      startUmbraLoopingSound("incomingCall");

      desktopBridge?.showNativeNotification?.({
        body,
        kind: "call",
        playSound: false,
        title: translate(stateRef.current.language, "notifications.incomingCall", "Llamada entrante")
      })?.catch?.(() => {});
    },
    [currentUserId, desktopBridge]
  );

  const handleIncomingCallResponse = useCallback(
    (payload = {}) => {
      const callId = String(payload.callId || "").trim();
      const status = String(payload.status || "").trim();
      const responderName =
        payload.responder?.display_name ||
        payload.responder?.username ||
        "La otra persona";

      if (!callId || !status) {
        return;
      }

      playUmbraSound("notification");
      if (status === "accepted") {
        showUiNotice?.(`${responderName} acepto la llamada.`);
        return;
      }

      if (status === "missed") {
        showUiNotice?.(`${responderName} no respondio la llamada.`);
        return;
      }

      showUiNotice?.(`${responderName} rechazo la llamada.`);
    },
    [showUiNotice]
  );

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const socket = getSocket(accessToken);
    if (!socket.connected) {
      socket.connect();
    }

    const onMessageCreate = ({ message, preview }) => {
      handleIncomingMessage({
        message,
        preview,
        workspace: stateRef.current.workspace
      });
    };

    const onVoiceState = (payload = {}) => {
      previousVoiceSessionsRef.current = payload || {};
    };

    const onVoiceUpdate = ({ channelId, userIds = [] }) => {
      handleVoiceUpdateNotification({
        channelId,
        previousUserIds: previousVoiceSessionsRef.current?.[channelId] || [],
        userIds,
        workspace: stateRef.current.workspace
      });

      previousVoiceSessionsRef.current = {
        ...previousVoiceSessionsRef.current,
        [channelId]: userIds
      };
    };

    const onFriendRequest = (payload = {}) => {
      handleIncomingFriendRequest(payload);
    };

    const onCallIncoming = (payload = {}) => {
      handleIncomingCallInvite(payload);
    };

    const onCallResponse = (payload = {}) => {
      handleIncomingCallResponse(payload);
    };

    socket.on("message:create", onMessageCreate);
    socket.on("friend:request", onFriendRequest);
    socket.on("call:incoming", onCallIncoming);
    socket.on("call:response", onCallResponse);
    socket.on("voice:state", onVoiceState);
    socket.on("voice:update", onVoiceUpdate);

    return () => {
      socket.off("message:create", onMessageCreate);
      socket.off("friend:request", onFriendRequest);
      socket.off("call:incoming", onCallIncoming);
      socket.off("call:response", onCallResponse);
      socket.off("voice:state", onVoiceState);
      socket.off("voice:update", onVoiceUpdate);
    };
  }, [
    accessToken,
    handleIncomingCallInvite,
    handleIncomingCallResponse,
    handleIncomingFriendRequest,
    handleIncomingMessage,
    handleVoiceUpdateNotification
  ]);

  useEffect(() => {
    return () => {
      clearIncomingCallTimer();
      stopUmbraSound("incomingCall");
      stopAllUmbraSounds();
    };
  }, [clearIncomingCallTimer]);

  return {
    acceptIncomingCall,
    incomingCall,
    rejectIncomingCall
  };
}
