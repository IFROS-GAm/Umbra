import { startTransition, useEffect, useRef, useState } from "react";

import { api, configureApiAuth } from "../../api.js";
import { getSocket } from "../../socket.js";
import { findChannelInSession, resolveSelection } from "../../utils.js";
import {
  applyChannelPreviewToWorkspace,
  findDirectDmByUserId,
  isChannelCacheFresh,
  listLikelyChannelIds,
  fallbackDeviceLabel,
  mergeLocalReadStateIntoWorkspace,
  mergeChannelMessages,
  markChannelReadInWorkspace,
  removeChannelMessage,
  renderHeaderCopy,
  toggleReactionBucket,
  upsertChannelMessage
} from "./workspaceHelpers.js";
import { createVoiceCameraSession } from "./voiceCameraSession.js";
import { createVoiceInputProcessingSession } from "./voiceInputProcessing.js";

export function useUmbraWorkspaceCore({ accessToken, initialSelection = null, onSignOut }) {
  const [workspace, setWorkspace] = useState(null);
  const [activeSelection, setActiveSelection] = useState({
    channelId: initialSelection?.channelId || null,
    guildId: initialSelection?.guildId || null,
    kind: initialSelection?.kind || "guild"
  });
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composer, setComposer] = useState("");
  const [composerAttachments, setComposerAttachments] = useState([]);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyMentionEnabled, setReplyMentionEnabled] = useState(true);
  const [editingMessage, setEditingMessage] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [typingEvents, setTypingEvents] = useState([]);
  const [theme, setTheme] = useState("dark");
  const [appError, setAppError] = useState("");
  const [uiNotice, setUiNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersPanelVisible, setMembersPanelVisible] = useState(true);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [composerPicker, setComposerPicker] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [messageMenuFor, setMessageMenuFor] = useState(null);
  const [profileCard, setProfileCard] = useState(null);
  const [headerPanel, setHeaderPanel] = useState(null);
  const [inboxTab, setInboxTab] = useState("for_you");
  const [voiceMenu, setVoiceMenu] = useState(null);
  const [hoveredVoiceChannelId, setHoveredVoiceChannelId] = useState(null);
  const [voiceInputLevel, setVoiceInputLevel] = useState(0);
  const [voiceInputSpeaking, setVoiceInputSpeaking] = useState(false);
  const [voiceInputStatus, setVoiceInputStatus] = useState({
    engine: "off",
    error: "",
    ready: false
  });
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraStatus, setCameraStatus] = useState({
    error: "",
    label: "",
    ready: false
  });
  const [voiceState, setVoiceState] = useState({
    cameraEnabled: false,
    deafen: false,
    inputProfile: "custom",
    inputVolume: 84,
    micMuted: false,
    noiseSuppression: true,
    pushToTalk: false,
    outputVolume: 52,
    screenShareEnabled: false,
    shareAudio: true
  });
  const [voiceSessions, setVoiceSessions] = useState({});
  const [voiceDevices, setVoiceDevices] = useState({
    audioinput: [],
    audiooutput: [],
    videoinput: []
  });
  const [selectedVoiceDevices, setSelectedVoiceDevices] = useState({
    audioinput: "default",
    audiooutput: "default",
    videoinput: "default"
  });
  const [joinedVoiceChannelId, setJoinedVoiceChannelId] = useState(null);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [booting, setBooting] = useState(true);

  const listRef = useRef(null);
  const composerRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const headerActionsRef = useRef(null);
  const headerPanelRef = useRef(null);
  const topbarActionsRef = useRef(null);
  const lastTypingAtRef = useRef(0);
  const pendingReadRef = useRef(null);
  const readReceiptTimeoutRef = useRef(null);
  const activeSelectionRef = useRef(activeSelection);
  const loadBootstrapRef = useRef(null);
  const accessTokenRef = useRef(accessToken);
  const joinedVoiceChannelIdRef = useRef(joinedVoiceChannelId);
  const voiceInputSessionRef = useRef(null);
  const cameraSessionRef = useRef(null);
  const messageCacheRef = useRef(new Map());
  const messageRequestIdRef = useRef(0);
  const messageAbortRef = useRef(null);
  const localReadStateRef = useRef(new Map());
  const pendingDirectDmRef = useRef(new Set());

  activeSelectionRef.current = activeSelection;
  accessTokenRef.current = accessToken;
  joinedVoiceChannelIdRef.current = joinedVoiceChannelId;

  const activeLookup = findChannelInSession(workspace, activeSelection.channelId);
  const activeChannel = activeLookup?.channel || null;
  const activeGuild = activeLookup?.guild || null;
  const isVoiceChannel = Boolean(activeChannel?.is_voice);
  const activeGuildTextChannels =
    activeGuild?.channels.filter((channel) => !channel.is_voice && !channel.is_category) || [];
  const activeGuildVoiceChannels = activeGuild?.channels.filter((channel) => channel.is_voice) || [];
  const headerCopy = renderHeaderCopy(activeChannel, activeSelection.kind);
  const currentUserLabel =
    workspace?.current_user?.display_name || workspace?.current_user?.username || "Umbra user";
  const directUnreadCount =
    workspace?.dms?.reduce((count, dm) => count + (dm.unread_count || 0), 0) || 0;
  const typingUsers = typingEvents.filter(
    (item) =>
      item.channelId === activeSelection.channelId &&
      item.userId !== workspace?.current_user?.id &&
      item.expires_at > Date.now()
  );
  const voiceUserIds = activeChannel?.id ? voiceSessions[activeChannel.id] || [] : [];

  function readChannelCache(channelId) {
    return channelId ? messageCacheRef.current.get(channelId) || null : null;
  }

  function pruneChannelCache(nextWorkspace) {
    if (!nextWorkspace) {
      messageCacheRef.current.clear();
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
  }

  function commitChannelMessages(channelId, nextMessages, nextHasMore, fetchedAt = Date.now()) {
    if (!channelId) {
      return;
    }

    const nextEntry = {
      fetchedAt,
      hasMore: nextHasMore,
      messages: nextMessages
    };
    messageCacheRef.current.set(channelId, nextEntry);

    if (activeSelectionRef.current.channelId === channelId) {
      startTransition(() => {
        setMessages(nextMessages);
        setHasMore(nextHasMore);
      });
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

  loadBootstrapRef.current = loadBootstrap;

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

  function buildLocalMessagePreview(content = "", attachments = []) {
    const normalized = String(content || "").replace(/\s+/g, " ").trim();
    if (normalized) {
      return normalized.length > 84 ? `${normalized.slice(0, 81)}...` : normalized;
    }

    if (!attachments.length) {
      return "";
    }

    if (attachments.length === 1) {
      return attachments[0]?.content_type?.startsWith("image/")
        ? "[imagen]"
        : `[${attachments[0]?.name || "archivo"}]`;
    }

    return `[${attachments.length} adjuntos]`;
  }

  function buildOptimisticMessage({
    attachments,
    channelId,
    clientNonce,
    content,
    createdAt,
    currentUser,
    currentUserDisplayName,
    replyTo
  }) {
    return {
      id: `temp-${clientNonce}`,
      client_nonce: clientNonce,
      optimistic: true,
      channel_id: channelId,
      guild_id: activeGuild?.id || null,
      author_id: currentUser?.id || "",
      content: String(content || "").trim(),
      reply_to: replyTo?.id || null,
      attachments,
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: createdAt,
      author: currentUser
        ? {
            id: currentUser.id,
            username: currentUser.username,
            discriminator: currentUser.discriminator,
            avatar_hue: currentUser.avatar_hue,
            avatar_url: currentUser.avatar_url || "",
            profile_banner_url: currentUser.profile_banner_url || "",
            profile_color: currentUser.profile_color || "#5865F2",
            status: currentUser.status === "invisible" ? "offline" : currentUser.status
          }
        : null,
      display_name: currentUserDisplayName,
      can_edit: true,
      can_delete: true,
      is_mentioning_me: false,
      reply_preview: replyTo
        ? {
            id: replyTo.id,
            author_name:
              replyTo.display_name ||
              replyTo.author?.username ||
              replyTo.author?.display_name ||
              "Usuario",
            content: String(replyTo.content || "").replace(/\s+/g, " ").trim().slice(0, 120)
          }
        : null,
      reactions: []
    };
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
    const cachedEntry = isInitialPage ? readChannelCache(channelId) : null;

    if (cachedEntry && isInitialPage) {
      commitChannelMessages(channelId, cachedEntry.messages || [], cachedEntry.hasMore, cachedEntry.fetchedAt);
      if (!force && isChannelCacheFresh(cachedEntry)) {
        return cachedEntry;
      }
      silent = true;
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

    const previousHeight = listRef.current?.scrollHeight || 0;

    try {
      const payload = await api.fetchMessages({
        before,
        channelId,
        limit: limit || (prepend ? 28 : 24),
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
            const element = listRef.current;
            if (element) {
              element.scrollTop = element.scrollHeight - previousHeight;
            }
          });
        }
      } else {
        commitChannelMessages(channelId, payload.messages, payload.has_more);
        if (activeSelectionRef.current.channelId === channelId) {
          requestAnimationFrame(() => {
            const element = listRef.current;
            if (element) {
              element.scrollTop = element.scrollHeight;
            }
          });
        }
      }

      const latest = payload.messages[payload.messages.length - 1];
      if (latest && activeSelectionRef.current.channelId === channelId) {
        queueMarkRead({
          channelId,
          lastReadAt: latest.created_at,
          lastReadMessageId: latest.id
        });
      }

      return payload;
    } catch (error) {
      if (error?.name !== "AbortError" && !background) {
        setAppError(error.message);
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
    }
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    loadBootstrap(initialSelection || activeSelectionRef.current);
  }, [accessToken, initialSelection]);

  useEffect(() => {
    if (workspace?.current_user?.id) {
      const savedTheme = localStorage.getItem(`umbra-theme-${workspace.current_user.id}`);
      setTheme(savedTheme || workspace.current_user.theme || "dark");
    }
  }, [workspace?.current_user?.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (workspace?.current_user?.id) {
      localStorage.setItem(`umbra-theme-${workspace.current_user.id}`, theme);
    }
  }, [theme, workspace?.current_user?.id]);

  useEffect(() => {
    setComposer("");
    setComposerAttachments([]);
    setReplyTarget(null);
    setEditingMessage(null);
    setComposerMenuOpen(false);
    setComposerPicker(null);
    setReactionPickerFor(null);
    setProfileCard(null);
    setVoiceMenu(null);
    setTypingEvents([]);

    if (activeSelection.channelId && !activeChannel?.is_voice) {
      const cachedEntry = readChannelCache(activeSelection.channelId);
      if (cachedEntry) {
        startTransition(() => {
          setMessages(cachedEntry.messages || []);
          setHasMore(cachedEntry.hasMore ?? true);
        });
        setLoadingMessages(false);

        const latestCached = cachedEntry.messages?.[cachedEntry.messages.length - 1];
        if (latestCached?.id) {
          queueMarkRead({
            channelId: activeSelection.channelId,
            lastReadAt: latestCached.created_at,
            lastReadMessageId: latestCached.id
          });
        }
      } else {
        setMessages([]);
        setHasMore(true);
      }

      loadMessages({
        channelId: activeSelection.channelId,
        force: !cachedEntry,
        silent: Boolean(cachedEntry)
      });
    } else {
      setMessages([]);
      setHasMore(false);
    }
  }, [activeSelection.channelId, activeChannel?.is_voice]);

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
          "profile:update",
          "friends:update"
        ].includes(payload?.type)
      ) {
        return;
      }

      await loadBootstrapRef.current?.(activeSelectionRef.current);

      if (payload?.type === "profile:update" && activeSelectionRef.current.channelId) {
        await loadMessages({
          channelId: activeSelectionRef.current.channelId
        });
      }
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

      if (message?.channel_id === activeSelectionRef.current.channelId) {
        requestAnimationFrame(() => {
          const element = listRef.current;
          if (!element) {
            return;
          }
          const nearBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 160;
          if (nearBottom || message.author?.id === workspace?.current_user?.id) {
            element.scrollTop = element.scrollHeight;
          }
        });

        if (message.id && message.author?.id !== workspace?.current_user?.id) {
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

    const onPresenceUpdate = ({ user }) => {
      if (!user) {
        return;
      }

      setWorkspace((previous) => {
        if (!previous) {
          return previous;
        }

        const nextStatus = user.status === "invisible" ? "offline" : user.status;
        const nextUserPatch = {
          ...user,
          status: nextStatus
        };

        return {
          ...previous,
          available_users: previous.available_users.map((item) =>
            item.id === user.id ? { ...item, ...nextUserPatch } : item
          ),
          current_user:
            previous.current_user.id === user.id
              ? { ...previous.current_user, ...nextUserPatch }
              : previous.current_user,
          guilds: previous.guilds.map((guild) => ({
            ...guild,
            members: guild.members.map((member) =>
              member.id === user.id
                ? { ...member, ...nextUserPatch }
                : member
            )
          })),
          dms: previous.dms.map((dm) => ({
            ...dm,
            participants: dm.participants.map((participant) =>
              participant.id === user.id
                ? { ...participant, ...nextUserPatch }
                : participant
            )
          }))
        };
      });
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
      setVoiceSessions(payload || {});
    };

    const onVoiceUpdate = ({ channelId, userIds }) => {
      if (!channelId) {
        return;
      }

      setVoiceSessions((previous) => ({
        ...previous,
        [channelId]: userIds || []
      }));
    };

    const onChannelPreview = ({ preview }) => {
      if (!preview) {
        return;
      }

      setWorkspace((previous) =>
        applyChannelPreviewToWorkspace(previous, preview, {
          localReadStateByChannel: localReadStateRef.current,
          openChannelId: activeSelectionRef.current.channelId
        })
      );
    };

    const onRoomError = (payload) => {
      if (!payload?.error) {
        return;
      }

      setAppError(payload.error);
      if (payload.channelId && joinedVoiceChannelIdRef.current === payload.channelId) {
        setJoinedVoiceChannelId(null);
      }
    };

    const onConnect = () => {
      if (joinedVoiceChannelIdRef.current) {
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
    socket.on("channel:preview", onChannelPreview);
    socket.on("room:error", onRoomError);

    return () => {
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
      socket.off("channel:preview", onChannelPreview);
      socket.off("room:error", onRoomError);
      socket.disconnect();
    };
  }, [accessToken, workspace?.current_user?.id]);

  useEffect(() => {
    if (activeSelection.channelId && accessToken) {
      getSocket(accessToken).emit("room:join", { channelId: activeSelection.channelId });
    }
  }, [accessToken, activeSelection.channelId]);

  useEffect(() => {
    if (!workspace || !accessToken) {
      return undefined;
    }

    const candidateIds = listLikelyChannelIds(workspace, activeSelection, 5).filter(
      (channelId) => !readChannelCache(channelId)
    );

    if (!candidateIds.length) {
      return undefined;
    }

    let cancelled = false;
    const scheduleIdle =
      typeof window.requestIdleCallback === "function"
        ? (callback) => window.requestIdleCallback(callback, { timeout: 1400 })
        : (callback) => window.setTimeout(callback, 700);
    const cancelIdle =
      typeof window.cancelIdleCallback === "function"
        ? (handle) => window.cancelIdleCallback(handle)
        : (handle) => window.clearTimeout(handle);

    const handle = scheduleIdle(async () => {
      for (const channelId of candidateIds) {
        if (cancelled || readChannelCache(channelId)) {
          continue;
        }

        await loadMessages({
          background: true,
          channelId,
          limit: 18,
          silent: true
        });
      }
    });

    return () => {
      cancelled = true;
      cancelIdle(handle);
    };
  }, [accessToken, activeSelection.channelId, activeSelection.guildId, activeSelection.kind, workspace]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTypingEvents((previous) =>
        previous.filter((item) => item.expires_at > Date.now())
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (readReceiptTimeoutRef.current) {
        window.clearTimeout(readReceiptTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!uiNotice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setUiNotice("");
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [uiNotice]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return undefined;
    }

    let cancelled = false;

    async function syncDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) {
          return;
        }

        const nextDevices = {
          audioinput: devices.filter((device) => device.kind === "audioinput"),
          audiooutput: devices.filter((device) => device.kind === "audiooutput"),
          videoinput: devices.filter((device) => device.kind === "videoinput")
        };

        setVoiceDevices(nextDevices);
        setSelectedVoiceDevices((previous) => ({
          audioinput:
            previous.audioinput !== "default" &&
            nextDevices.audioinput.some((device) => device.deviceId === previous.audioinput)
              ? previous.audioinput
              : nextDevices.audioinput[0]?.deviceId || "default",
          audiooutput:
            previous.audiooutput !== "default" &&
            nextDevices.audiooutput.some((device) => device.deviceId === previous.audiooutput)
              ? previous.audiooutput
              : nextDevices.audiooutput[0]?.deviceId || "default",
          videoinput:
            previous.videoinput !== "default" &&
            nextDevices.videoinput.some((device) => device.deviceId === previous.videoinput)
              ? previous.videoinput
              : nextDevices.videoinput[0]?.deviceId || "default"
        }));
      } catch {
        // Ignore device enumeration issues in unsupported contexts.
      }
    }

    syncDevices();

    navigator.mediaDevices.addEventListener?.("devicechange", syncDevices);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", syncDevices);
    };
  }, []);

  useEffect(() => {
    const shouldProcessInput = Boolean(
      joinedVoiceChannelId || voiceMenu === "input"
    );

    if (!shouldProcessInput) {
      setVoiceInputLevel(0);
      setVoiceInputSpeaking(false);
      setVoiceInputStatus({
        engine: voiceState.noiseSuppression ? "native" : "off",
        error: "",
        ready: false
      });

      if (voiceInputSessionRef.current) {
        voiceInputSessionRef.current.destroy().catch(() => {});
        voiceInputSessionRef.current = null;
      }

      return undefined;
    }

    let cancelled = false;

    async function startVoiceInputSession() {
      if (voiceInputSessionRef.current) {
        await voiceInputSessionRef.current.destroy().catch(() => {});
        voiceInputSessionRef.current = null;
      }

      try {
        const session = await createVoiceInputProcessingSession({
          deviceId: selectedVoiceDevices.audioinput,
          inputVolume: voiceState.micMuted ? 0 : voiceState.inputVolume,
          noiseSuppressionEnabled: voiceState.noiseSuppression,
          onLevelChange: (level) => {
            if (!cancelled) {
              setVoiceInputLevel(level);
            }
          },
          onSpeakingChange: (nextSpeaking) => {
            if (!cancelled) {
              setVoiceInputSpeaking(Boolean(nextSpeaking));
            }
          }
        });

        if (cancelled) {
          await session.destroy();
          return;
        }

        voiceInputSessionRef.current = session;
        setVoiceInputStatus({
          engine: session.engine,
          error: "",
          ready: true
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setVoiceInputLevel(0);
        setVoiceInputSpeaking(false);
        setVoiceInputStatus({
          engine: "off",
          error: error.message || "No se pudo abrir el microfono.",
          ready: false
        });
      }
    }

    startVoiceInputSession();

    return () => {
      cancelled = true;
      if (voiceInputSessionRef.current) {
        voiceInputSessionRef.current.destroy().catch(() => {});
        voiceInputSessionRef.current = null;
      }
    };
  }, [
    joinedVoiceChannelId,
    selectedVoiceDevices.audioinput,
    voiceMenu,
    voiceState.noiseSuppression
  ]);

  useEffect(() => {
    voiceInputSessionRef.current?.setInputVolume(
      voiceState.micMuted ? 0 : voiceState.inputVolume
    );
  }, [voiceState.inputVolume, voiceState.micMuted]);

  useEffect(() => {
    const shouldProcessCamera = Boolean(
      voiceState.cameraEnabled && (joinedVoiceChannelId || voiceMenu === "camera")
    );

    if (!shouldProcessCamera) {
      setCameraStatus({
        error: "",
        label: "",
        ready: false
      });
      setCameraStream(null);

      if (cameraSessionRef.current) {
        cameraSessionRef.current.destroy().catch(() => {});
        cameraSessionRef.current = null;
      }

      return undefined;
    }

    let cancelled = false;

    async function startCameraSession() {
      if (cameraSessionRef.current) {
        await cameraSessionRef.current.destroy().catch(() => {});
        cameraSessionRef.current = null;
      }

      try {
        const session = await createVoiceCameraSession({
          deviceId: selectedVoiceDevices.videoinput
        });

        if (cancelled) {
          await session.destroy();
          return;
        }

        cameraSessionRef.current = session;
        session.setEnabled(true);
        setCameraStream(session.stream);
        setCameraStatus({
          error: "",
          label: session.label,
          ready: true
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCameraStream(null);
        setCameraStatus({
          error: error.message || "No se pudo abrir la camara.",
          label: "",
          ready: false
        });
        setVoiceState((previous) =>
          previous.cameraEnabled
            ? {
                ...previous,
                cameraEnabled: false
              }
            : previous
        );
      }
    }

    startCameraSession();

    return () => {
      cancelled = true;
      if (cameraSessionRef.current) {
        cameraSessionRef.current.destroy().catch(() => {});
        cameraSessionRef.current = null;
      }
      setCameraStream(null);
    };
  }, [joinedVoiceChannelId, selectedVoiceDevices.videoinput, voiceMenu, voiceState.cameraEnabled]);

  useEffect(() => {
    if (!headerPanel) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        headerPanelRef.current?.contains(target) ||
        headerActionsRef.current?.contains(target) ||
        topbarActionsRef.current?.contains(target)
      ) {
        return;
      }

      setHeaderPanel(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [headerPanel]);

  useEffect(() => {
    if (!messageMenuFor) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (event.target.closest(".message-menu-anchor")) {
        return;
      }

      setMessageMenuFor(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [messageMenuFor]);

  useEffect(() => {
    setHeaderPanel(null);
  }, [activeSelection.channelId, activeSelection.guildId, activeSelection.kind]);

  async function handleSubmitMessage(event) {
    event.preventDefault();
    if ((!composer.trim() && !composerAttachments.length) || !activeSelection.channelId || isVoiceChannel) {
      return;
    }

    const draftComposer = composer;
    const draftAttachments = composerAttachments;
    const draftReplyTarget = replyTarget;
    const draftReplyMentionEnabled = replyMentionEnabled;
    let pendingClientNonce = null;

    try {
      if (editingMessage) {
        await api.updateMessage({
          content: composer,
          messageId: editingMessage.id
        });
      } else {
        const clientNonce =
          globalThis.crypto?.randomUUID?.() ||
          `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        pendingClientNonce = clientNonce;
        const createdAt = new Date().toISOString();
        const currentUser = workspace?.current_user || null;
        const currentUserDisplayName =
          activeGuild?.members.find((member) => member.id === currentUser?.id)?.display_name ||
          currentUserLabel;
        const optimisticMessage = buildOptimisticMessage({
          attachments: draftAttachments,
          channelId: activeSelection.channelId,
          clientNonce,
          content: draftComposer,
          createdAt,
          currentUser,
          currentUserDisplayName,
          replyTo: draftReplyTarget
        });
        const optimisticPreview = {
          id: activeSelection.channelId,
          last_message_id: optimisticMessage.id,
          last_message_author_id: currentUser?.id || null,
          last_message_preview: buildLocalMessagePreview(draftComposer, draftAttachments),
          last_message_at: createdAt
        };

        patchChannelMessages(activeSelection.channelId, (previous) =>
          upsertChannelMessage(previous, optimisticMessage)
        );
        setWorkspace((previous) =>
          applyChannelPreviewToWorkspace(previous, optimisticPreview, {
            localReadStateByChannel: localReadStateRef.current,
            openChannelId: activeSelectionRef.current.channelId
          })
        );
        requestAnimationFrame(() => {
          const element = listRef.current;
          if (element) {
            element.scrollTop = element.scrollHeight;
          }
        });

        setComposer("");
        setComposerAttachments([]);
        setReplyTarget(null);
        setReplyMentionEnabled(true);
        setEditingMessage(null);

        const payload = await api.createMessage({
          attachments: draftAttachments,
          channelId: activeSelection.channelId,
          clientNonce,
          content: draftComposer,
          replyMentionUserId:
            draftReplyTarget && draftReplyMentionEnabled
              ? draftReplyTarget.author?.id || null
              : null,
          replyTo: draftReplyTarget?.id || null
        });

        if (payload?.preview) {
          setWorkspace((previous) =>
            applyChannelPreviewToWorkspace(previous, payload.preview, {
              localReadStateByChannel: localReadStateRef.current,
              openChannelId: activeSelectionRef.current.channelId
            })
          );
        }

        if (payload?.message) {
          patchChannelMessages(activeSelection.channelId, (previous) =>
            previous.map((item) =>
              item.client_nonce === clientNonce ? payload.message : item
            )
          );
        }
      }

      if (editingMessage) {
        setComposer("");
        setComposerAttachments([]);
        setReplyTarget(null);
        setReplyMentionEnabled(true);
        setEditingMessage(null);
      }
      setAppError("");
    } catch (error) {
      if (!editingMessage) {
        patchChannelMessages(activeSelection.channelId, (previous) =>
          previous.filter((item) => item.client_nonce !== pendingClientNonce)
        );
        setComposer(draftComposer);
        setComposerAttachments(draftAttachments);
        setReplyTarget(draftReplyTarget);
        setReplyMentionEnabled(draftReplyMentionEnabled);
        await loadBootstrap(activeSelectionRef.current);
      }
      setAppError(error.message);
    }
  }

  async function handleDeleteMessage(message) {
    if (!window.confirm("Eliminar este mensaje?")) {
      return;
    }

    try {
      await api.deleteMessage({
        messageId: message.id
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleReaction(messageId, emoji) {
    const channelId = activeSelectionRef.current.channelId;
    const currentUserId = workspace?.current_user?.id;
    const cachedMessage = (readChannelCache(channelId)?.messages || []).find(
      (message) => message.id === messageId
    );

    if (channelId && currentUserId) {
      patchChannelMessages(channelId, (previous) =>
        toggleReactionBucket(previous, {
          emoji,
          messageId,
          userId: currentUserId
        })
      );
    }

    try {
      const payload = await api.toggleReaction({
        emoji,
        messageId
      });

      if (payload?.message?.channel_id) {
        patchChannelMessages(payload.message.channel_id, (previous) =>
          previous.map((item) => (item.id === payload.message.id ? payload.message : item))
        );
      }
    } catch (error) {
      if (channelId && cachedMessage) {
        patchChannelMessages(channelId, (previous) =>
          previous.map((message) => (message.id === messageId ? cachedMessage : message))
        );
      }
      setAppError(error.message);
    }
  }

  async function handleStatusChange(status) {
    try {
      await api.updateStatus({
        status
      });
      setProfileCard((previous) =>
        previous?.profile?.id === workspace?.current_user?.id
          ? {
              ...previous,
              profile: {
                ...previous.profile,
                status
              }
            }
          : previous
      );
      await loadBootstrap(activeSelection);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleProfileUpdate(nextProfile) {
    try {
      const {
        avatarFile,
        avatarUrl: requestedAvatarUrl,
        bannerFile,
        bannerImageUrl: requestedBannerImageUrl,
        clearAvatar,
        clearBanner,
        ...profilePatch
      } =
        nextProfile;
      let avatarUrl = requestedAvatarUrl;
      let bannerImageUrl = requestedBannerImageUrl;

      if (avatarFile) {
        const uploadPayload = await api.uploadAttachments([avatarFile]);
        avatarUrl = uploadPayload.attachments?.[0]?.url;

        if (!avatarUrl) {
          throw new Error("No se pudo subir la foto de perfil.");
        }
      } else if (clearAvatar) {
        avatarUrl = "";
      }

      if (bannerFile) {
        const uploadPayload = await api.uploadAttachments([bannerFile]);
        bannerImageUrl = uploadPayload.attachments?.[0]?.url;

        if (!bannerImageUrl) {
          throw new Error("No se pudo subir la imagen del panel.");
        }
      } else if (clearBanner) {
        bannerImageUrl = "";
      }

      await api.updateProfile({
        ...profilePatch,
        avatarUrl,
        bannerImageUrl
      });
      await loadBootstrap(activeSelectionRef.current);

      if (activeSelectionRef.current.channelId) {
        await loadMessages({
          channelId: activeSelectionRef.current.channelId
        });
      }

      setAppError("");
      showUiNotice("Perfil actualizado.");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  async function handleDialogSubmit(values) {
    if (!dialog) {
      return;
    }

    try {
      if (dialog.type === "guild") {
        const payload = await api.createGuild({
          description: values.description,
          name: values.name,
          templateId: values.templateId
        });
        await loadBootstrap({
          channelId: payload.channel_id,
          guildId: payload.guild_id,
          kind: "guild"
        });
      }

        if (dialog.type === "channel") {
          if (!activeGuild?.permissions?.can_manage_channels) {
            throw new Error("Solo el administrador puede cambiar la estructura del servidor.");
          }

          const payload = await api.createChannel({
            guildId: activeGuild.id,
            kind: values.kind,
            name: values.name,
            parentId: values.parentId,
            topic: values.topic
          });
          await loadBootstrap({
            channelId: payload.channel.id,
            guildId: activeGuild.id,
            kind: "guild"
          });
        }

        if (dialog.type === "category") {
          if (!activeGuild?.permissions?.can_manage_channels) {
            throw new Error("Solo el administrador puede cambiar la estructura del servidor.");
          }

          await api.createCategory({
            guildId: activeGuild.id,
            name: values.name
          });
          await loadBootstrap({
            channelId: activeSelectionRef.current.channelId,
            guildId: activeGuild.id,
            kind: "guild"
          });
        }

      if (dialog.type === "dm") {
        const recipientId = values.recipientId;
        const existingDm = findDirectDmByUserId(workspace?.dms || [], workspace?.current_user?.id, recipientId);

        if (existingDm) {
          await loadBootstrap({
            channelId: existingDm.id,
            guildId: null,
            kind: "dm"
          });
        } else {
          if (pendingDirectDmRef.current.has(recipientId)) {
            return;
          }

          pendingDirectDmRef.current.add(recipientId);

          try {
            const payload = await api.createDm({
              recipientId
            });
            await loadBootstrap({
              channelId: payload.channel.id,
              guildId: null,
              kind: "dm"
            });
          } finally {
            pendingDirectDmRef.current.delete(recipientId);
          }
        }
      }

      if (dialog.type === "dm_group") {
        const payload = await api.createGroupDm({
          name: values.name,
          recipientIds: values.recipientIds
        });
        await loadBootstrap({
          channelId: payload.channel.id,
          guildId: null,
          kind: "dm"
        });
      }

      setDialog(null);
      setAppError("");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  function handleComposerChange(value) {
    setComposer(value);
    const now = Date.now();
    if (
      activeSelection.channelId &&
      workspace?.current_user &&
      now - lastTypingAtRef.current > 1200
    ) {
      getSocket(accessToken).emit("typing:start", {
        channelId: activeSelection.channelId
      });
      lastTypingAtRef.current = now;
    }
  }

  function handleScroll() {
    const element = listRef.current;
    if (!element || loadingMessages || !hasMore || !messages.length) {
      return;
    }
    if (element.scrollTop < 80) {
      loadMessages({
        before: messages[0].id,
        prepend: true
      });
    }
  }

  function showUiNotice(message) {
    setUiNotice(message);
  }

  function toggleHeaderPanel(panelName) {
    setHeaderPanel((previous) => (previous === panelName ? null : panelName));
  }

  function toggleVoiceState(key) {
    setVoiceState((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  }

  function toggleVoiceMenu(name) {
    setVoiceMenu((previous) => (previous === name ? null : name));
  }

  function updateVoiceSetting(key, value) {
    setVoiceState((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  function handleVoiceDeviceChange(kind, value) {
    setSelectedVoiceDevices((previous) => ({
      ...previous,
      [kind]: value
    }));
  }

  function cycleVoiceDevice(kind) {
    const devices = voiceDevices[kind] || [];
    if (!devices.length) {
      return;
    }

    const currentIndex = devices.findIndex(
      (device) => device.deviceId === selectedVoiceDevices[kind]
    );
    const nextDevice = devices[(currentIndex + 1 + devices.length) % devices.length];
    handleVoiceDeviceChange(kind, nextDevice.deviceId);
    showUiNotice(`Ahora usando ${nextDevice.label || fallbackDeviceLabel(kind, (currentIndex + 1) % devices.length)}.`);
  }

  function getSelectedDeviceLabel(kind) {
    const selectedId = selectedVoiceDevices[kind];
    const devices = voiceDevices[kind] || [];
    const index = devices.findIndex((device) => device.deviceId === selectedId);
    const device = index >= 0 ? devices[index] : devices[0];

    if (!device) {
      return "Configuracion predeterminada";
    }

    return device.label || fallbackDeviceLabel(kind, Math.max(index, 0));
  }

  function appendToComposer(token) {
    setComposer((previous) => {
      const prefix = previous && !previous.endsWith(" ") ? `${previous} ` : previous;
      return `${prefix}${token}`;
    });

    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }

  function handleComposerShortcut(shortcut) {
    setComposerMenuOpen(false);
    if (shortcut.id === "upload") {
      if (editingMessage) {
        showUiNotice("Por ahora los adjuntos nuevos se agregan solo en mensajes nuevos.");
        return;
      }

      if (isVoiceChannel) {
        showUiNotice("Los canales de voz no aceptan mensajes ni adjuntos.");
        return;
      }

      attachmentInputRef.current?.click();
      return;
    }

    showUiNotice(shortcut.description);
  }

  function handlePickerInsert(value) {
    appendToComposer(value);
    setComposerPicker(null);
  }

  async function handleAttachmentSelection(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";

    if (!files.length) {
      return;
    }

    try {
      setUploadingAttachments(true);
      const payload = await api.uploadAttachments(files);
      setComposerAttachments((previous) =>
        [...previous, ...(payload.attachments || [])].slice(0, 8)
      );
      showUiNotice(
        `${payload.attachments?.length || files.length} adjunto(s) listos para enviar.`
      );
      setAppError("");
    } catch (error) {
      setAppError(error.message);
    } finally {
      setUploadingAttachments(false);
    }
  }

  function removeComposerAttachment(targetAttachment) {
    setComposerAttachments((previous) =>
      previous.filter((attachment) => attachmentKey(attachment) !== attachmentKey(targetAttachment))
    );
  }

  function handleSelectGuildChannel(channel) {
    setVoiceMenu(null);
    setActiveSelection({
      channelId: channel.id,
      guildId: activeGuild.id,
      kind: "guild"
    });

    if (channel.is_voice && accessToken) {
      getSocket(accessToken).emit("voice:join", {
        channelId: channel.id
      });
      setJoinedVoiceChannelId(channel.id);
    }
  }

  function handleVoiceLeave() {
    if (!joinedVoiceChannelId || !accessToken) {
      return;
    }

    getSocket(accessToken).emit("voice:leave");
    setVoiceMenu(null);
    setJoinedVoiceChannelId(null);
    setVoiceState((previous) => ({
      ...previous,
      cameraEnabled: false,
      screenShareEnabled: false
    }));
  }

  return {
    accessTokenRef, activeChannel, activeGuild, activeGuildTextChannels, activeGuildVoiceChannels, activeLookup,
    activeSelection, activeSelectionRef, appError, attachmentInputRef, booting, composer, composerAttachments,
    cameraStatus, cameraStream,
    composerMenuOpen, composerPicker, composerRef, currentUserLabel, cycleVoiceDevice, dialog, directUnreadCount, editingMessage,
    handleAttachmentSelection, handleComposerChange, handleComposerShortcut, handleDeleteMessage, handleDialogSubmit,
    handlePickerInsert, handleProfileUpdate, handleReaction, handleScroll, handleSelectGuildChannel,
    handleStatusChange, handleSubmitMessage, handleVoiceDeviceChange, handleVoiceLeave, hasMore, headerActionsRef,
    getSelectedDeviceLabel, headerCopy, headerPanel, headerPanelRef, hoveredVoiceChannelId, inboxTab, isVoiceChannel, joinedVoiceChannelId,
    joinedVoiceChannelIdRef, lastTypingAtRef, listRef, loadBootstrap, loadBootstrapRef, loadMessages,
    loadingMessages, messageMenuFor, messages, membersPanelVisible, profileCard,
    reactionPickerFor, removeComposerAttachment, replyMentionEnabled, replyTarget, selectedVoiceDevices,
    setActiveSelection, setAppError, setBooting, setComposer, setComposerAttachments, setComposerMenuOpen,
    setComposerPicker, setDialog, setEditingMessage, setHeaderPanel, setHoveredVoiceChannelId, setInboxTab,
    setJoinedVoiceChannelId, setMembersPanelVisible, setMessageMenuFor, setProfileCard, setWorkspace,
    setReactionPickerFor, setReplyMentionEnabled, setReplyTarget, setSettingsOpen, setTheme, setTypingEvents,
    setUiNotice, setVoiceDevices, setVoiceMenu, setVoiceSessions, setVoiceState, settingsOpen, showUiNotice,
    theme, toggleHeaderPanel, toggleVoiceMenu, toggleVoiceState, topbarActionsRef, typingEvents, typingUsers,
    uiNotice, updateVoiceSetting, uploadingAttachments, voiceDevices, voiceInputLevel, voiceInputStatus,
    voiceInputSpeaking, voiceMenu, voiceSessions, voiceState, voiceUserIds, workspace
  };
}
