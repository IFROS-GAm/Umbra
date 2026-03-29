import React, { useEffect, useRef, useState } from "react";

import { api, configureApiAuth } from "../api.js";
import { getSocket } from "../socket.js";
import {
  REACTION_OPTIONS,
  STATUS_OPTIONS,
  findChannelInSession,
  formatMessageHtml,
  isGrouped,
  relativeTime,
  resolveSelection
} from "../utils.js";
import { Avatar } from "./Avatar.jsx";
import { Dialog } from "./Dialog.jsx";
import { FriendsHome } from "./FriendsHome.jsx";
import { SettingsModal } from "./SettingsModal.jsx";
import { UserProfileCard } from "./UserProfileCard.jsx";
import { UmbraLogo } from "./UmbraLogo.jsx";

const COMPOSER_SHORTCUTS = [
  {
    id: "upload",
    label: "Subir un archivo",
    description: "UI lista. El upload real ira cuando conectemos Storage."
  },
  {
    id: "thread",
    label: "Crear hilo",
    description: "Hilos y vistas anidadas quedan para la siguiente capa del chat."
  },
  {
    id: "poll",
    label: "Crear encuesta",
    description: "Las encuestas todavia no estan en backend."
  },
  {
    id: "apps",
    label: "Usar aplicaciones",
    description: "Reserva visual para slash commands e integraciones."
  }
];

const PICKER_CONTENT = {
  gif: {
    title: "GIFs",
    subtitle: "Atajos ligeros para insertar energia rapida en el composer.",
    items: ["Loop", "Wave", "Glow", "Pulse", "Orbit", "Drift"]
  },
  sticker: {
    title: "Stickers",
    subtitle: "Panel visual inspirado en Discord con respuestas rapidas.",
    items: ["Wave", "Nova", "Blink", "Pulse", "Ghost", "Echo"]
  },
  emoji: {
    title: "Emojis",
    subtitle: "Reacciones rapidas listas para insertar en un mensaje.",
    items: ["😀", "🔥", "❤️", "⚡", "🎯", "✨", "🚀", "👀", "👏", "🌙", "🫶", "🖤"]
  }
};

function isVisibleStatus(status) {
  return status && status !== "offline" && status !== "invisible";
}

function buildMemberGroups(members = []) {
  const online = members.filter((member) => isVisibleStatus(member.status));
  const offline = members.filter((member) => !isVisibleStatus(member.status));

  return [
    {
      id: "online",
      label: `En linea - ${online.length}`,
      members: online
    },
    {
      id: "offline",
      label: `Sin conexion - ${offline.length}`,
      members: offline
    }
  ].filter((group) => group.members.length > 0);
}

function renderHeaderCopy(activeChannel, kind) {
  if (kind === "guild") {
    return {
      eyebrow: "Canal",
      title: `# ${activeChannel?.name || "general"}`,
      description: activeChannel?.topic || "Sin descripcion todavia."
    };
  }

  return {
    eyebrow: "Conversacion",
    title: activeChannel?.display_name || "Mensajes directos",
    description: activeChannel?.topic || "Abre conversaciones 1 a 1 o grupos pequenos."
  };
}

function getDmSummary(dm, currentUserId) {
  if (!dm) {
    return "Sin mensajes todavia";
  }

  if (dm.type === "group_dm") {
    return `${dm.participants?.length || 0} miembros`;
  }

  const other = dm.participants?.find((participant) => participant.id !== currentUserId);
  return other?.custom_status || dm.last_message_preview || "Sin mensajes todavia";
}

export function UmbraWorkspace({ accessToken, onSignOut }) {
  const [workspace, setWorkspace] = useState(null);
  const [activeSelection, setActiveSelection] = useState({
    channelId: null,
    guildId: null,
    kind: "guild"
  });
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composer, setComposer] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [typingEvents, setTypingEvents] = useState([]);
  const [theme, setTheme] = useState("dark");
  const [appError, setAppError] = useState("");
  const [uiNotice, setUiNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [composerPicker, setComposerPicker] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [profileCard, setProfileCard] = useState(null);
  const [booting, setBooting] = useState(true);

  const listRef = useRef(null);
  const composerRef = useRef(null);
  const lastTypingAtRef = useRef(0);
  const activeSelectionRef = useRef(activeSelection);
  const loadBootstrapRef = useRef(null);
  const accessTokenRef = useRef(accessToken);

  activeSelectionRef.current = activeSelection;
  accessTokenRef.current = accessToken;

  const activeLookup = findChannelInSession(workspace, activeSelection.channelId);
  const activeChannel = activeLookup?.channel || null;
  const activeGuild = activeLookup?.guild || null;
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

  async function loadBootstrap(preferredSelection = activeSelectionRef.current) {
    configureApiAuth(() => accessTokenRef.current);

    try {
      const payload = await api.bootstrap();
      setWorkspace(payload);
      setActiveSelection(resolveSelection(payload, preferredSelection));
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

  async function loadMessages({ before = null, channelId = activeSelection.channelId, prepend = false } = {}) {
    if (!channelId) {
      return;
    }

    setLoadingMessages(true);
    const previousHeight = listRef.current?.scrollHeight || 0;

    try {
      const payload = await api.fetchMessages({
        before,
        channelId,
        limit: 30
      });

      setHasMore(payload.has_more);

      if (prepend) {
        setMessages((previous) => {
          const next = [...payload.messages, ...previous];
          return next.filter(
            (message, index, collection) =>
              collection.findIndex((item) => item.id === message.id) === index
          );
        });

        requestAnimationFrame(() => {
          const element = listRef.current;
          if (element) {
            element.scrollTop = element.scrollHeight - previousHeight;
          }
        });
      } else {
        setMessages(payload.messages);
        requestAnimationFrame(() => {
          const element = listRef.current;
          if (element) {
            element.scrollTop = element.scrollHeight;
          }
        });
      }

      const latest = payload.messages[payload.messages.length - 1];
      if (latest) {
        await api.markRead({
          channelId,
          lastReadMessageId: latest.id
        });
      }
    } catch (error) {
      setAppError(error.message);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    loadBootstrap();
  }, [accessToken]);

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
    setReplyTarget(null);
    setEditingMessage(null);
    setComposerMenuOpen(false);
    setComposerPicker(null);
    setReactionPickerFor(null);
    setProfileCard(null);
    setTypingEvents([]);

    if (activeSelection.channelId) {
      loadMessages({
        channelId: activeSelection.channelId
      });
    }
  }, [activeSelection.channelId]);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const socket = getSocket(accessToken);

    const refreshNavigation = () => {
      loadBootstrapRef.current?.(activeSelectionRef.current);
    };

    const onMessageCreate = async ({ message }) => {
      if (message?.channel_id === activeSelectionRef.current.channelId) {
        setMessages((previous) =>
          previous.some((item) => item.id === message.id) ? previous : [...previous, message]
        );

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

        if (message.id) {
          await api.markRead({
            channelId: activeSelectionRef.current.channelId,
            lastReadMessageId: message.id
          });
        }
      }

      refreshNavigation();
    };

    const onMessageUpdate = ({ message }) => {
      if (message?.channel_id === activeSelectionRef.current.channelId) {
        setMessages((previous) =>
          previous.map((item) => (item.id === message.id ? message : item))
        );
      }
      refreshNavigation();
    };

    const onMessageDelete = ({ channel_id, id }) => {
      if (channel_id === activeSelectionRef.current.channelId) {
        setMessages((previous) => previous.filter((item) => item.id !== id));
      }
      refreshNavigation();
    };

    const onReactionUpdate = ({ message }) => {
      if (message?.channel_id === activeSelectionRef.current.channelId) {
        setMessages((previous) =>
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
        return {
          ...previous,
          available_users: previous.available_users.map((item) =>
            item.id === user.id ? { ...item, ...user } : item
          ),
          current_user:
            previous.current_user.id === user.id
              ? { ...previous.current_user, ...user }
              : previous.current_user,
          guilds: previous.guilds.map((guild) => ({
            ...guild,
            members: guild.members.map((member) =>
              member.id === user.id
                ? { ...member, status: nextStatus, custom_status: user.custom_status }
                : member
            )
          })),
          dms: previous.dms.map((dm) => ({
            ...dm,
            participants: dm.participants.map((participant) =>
              participant.id === user.id
                ? { ...participant, status: nextStatus, custom_status: user.custom_status }
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

    socket.connect();
    socket.on("message:create", onMessageCreate);
    socket.on("message:update", onMessageUpdate);
    socket.on("message:delete", onMessageDelete);
    socket.on("reaction:update", onReactionUpdate);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("navigation:update", refreshNavigation);
    socket.on("typing:update", onTypingUpdate);

    return () => {
      socket.off("message:create", onMessageCreate);
      socket.off("message:update", onMessageUpdate);
      socket.off("message:delete", onMessageDelete);
      socket.off("reaction:update", onReactionUpdate);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("navigation:update", refreshNavigation);
      socket.off("typing:update", onTypingUpdate);
      socket.disconnect();
    };
  }, [accessToken, workspace?.current_user?.id]);

  useEffect(() => {
    if (activeSelection.channelId && accessToken) {
      getSocket(accessToken).emit("room:join", { channelId: activeSelection.channelId });
    }
  }, [accessToken, activeSelection.channelId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTypingEvents((previous) =>
        previous.filter((item) => item.expires_at > Date.now())
      );
    }, 1000);

    return () => window.clearInterval(interval);
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

  async function handleSubmitMessage(event) {
    event.preventDefault();
    if (!composer.trim() || !activeSelection.channelId) {
      return;
    }

    try {
      if (editingMessage) {
        await api.updateMessage({
          content: composer,
          messageId: editingMessage.id
        });
      } else {
        await api.createMessage({
          channelId: activeSelection.channelId,
          content: composer,
          replyTo: replyTarget?.id || null
        });
      }

      setComposer("");
      setReplyTarget(null);
      setEditingMessage(null);
      setAppError("");
    } catch (error) {
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
    try {
      await api.toggleReaction({
        emoji,
        messageId
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleStatusChange(status) {
    try {
      await api.updateStatus({
        status
      });
      await loadBootstrap(activeSelection);
    } catch (error) {
      setAppError(error.message);
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
          name: values.name
        });
        await loadBootstrap({
          channelId: payload.channel_id,
          guildId: payload.guild_id,
          kind: "guild"
        });
      }

      if (dialog.type === "channel") {
        const payload = await api.createChannel({
          guildId: activeGuild.id,
          name: values.name,
          topic: values.topic
        });
        await loadBootstrap({
          channelId: payload.channel.id,
          guildId: activeGuild.id,
          kind: "guild"
        });
      }

      if (dialog.type === "dm") {
        const payload = await api.createDm({
          recipientId: values.recipientId
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
    showUiNotice(shortcut.description);
  }

  function handlePickerInsert(value) {
    appendToComposer(value);
    setComposerPicker(null);
  }

  function buildProfileCardData(targetUser, displayNameOverride = null) {
    if (!workspace || !targetUser?.id) {
      return null;
    }

    const fallbackProfile =
      workspace.available_users.find((item) => item.id === targetUser.id) ||
      (workspace.current_user.id === targetUser.id ? workspace.current_user : null);

    const activeGuildMember =
      activeGuild?.members.find((member) => member.id === targetUser.id) || null;
    const activeParticipant =
      activeChannel?.participants?.find((participant) => participant.id === targetUser.id) || null;
    const sharedGuilds = workspace.guilds.filter((guild) =>
      guild.members.some((member) => member.id === targetUser.id)
    );
    const sharedDms = workspace.dms.filter((dm) =>
      dm.participants.some((participant) => participant.id === targetUser.id)
    );

    return {
      id: targetUser.id,
      authProvider:
        targetUser.auth_provider || fallbackProfile?.auth_provider || null,
      avatarHue:
        targetUser.avatar_hue || activeGuildMember?.avatar_hue || fallbackProfile?.avatar_hue || 210,
      bio: targetUser.bio || activeGuildMember?.bio || fallbackProfile?.bio || "",
      customStatus:
        targetUser.custom_status ||
        activeGuildMember?.custom_status ||
        activeParticipant?.custom_status ||
        fallbackProfile?.custom_status ||
        "",
      discriminator:
        targetUser.discriminator || fallbackProfile?.discriminator || null,
      displayName:
        displayNameOverride ||
        targetUser.display_name ||
        activeGuildMember?.display_name ||
        targetUser.username ||
        fallbackProfile?.username ||
        "Umbra user",
      isCurrentUser: workspace.current_user.id === targetUser.id,
      primaryTag: activeGuildMember ? activeGuild?.name || "Miembro" : sharedGuilds[0]?.name || null,
      roleColor: targetUser.role_color || activeGuildMember?.role_color || null,
      sharedDmCount: sharedDms.length,
      sharedGuildCount: sharedGuilds.length,
      status:
        targetUser.status ||
        activeGuildMember?.status ||
        activeParticipant?.status ||
        fallbackProfile?.status ||
        "offline",
      username:
        targetUser.username || fallbackProfile?.username || targetUser.display_name || "umbra_user"
    };
  }

  function openProfileCard(event, targetUser, displayNameOverride = null) {
    const resolved = buildProfileCardData(targetUser, displayNameOverride);
    if (!resolved) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard({
      anchorRect: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      },
      profile: resolved
    });
  }

  async function handleOpenDmFromCard(profile) {
    if (!profile?.id) {
      return;
    }

    if (profile.isCurrentUser) {
      setSettingsOpen(true);
      setProfileCard(null);
      return;
    }

    try {
      const payload = await api.createDm({
        recipientId: profile.id
      });

      setProfileCard(null);
      setActiveSelection({
        channelId: payload.channel.id,
        guildId: null,
        kind: "dm"
      });
      await loadBootstrap({
        channelId: payload.channel.id,
        guildId: null,
        kind: "dm"
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  if (booting) {
    return <div className="boot-screen">Despertando Umbra...</div>;
  }

  if (!workspace) {
    return <div className="boot-screen">No se pudo cargar tu espacio en Umbra.</div>;
  }

  const memberList =
    activeSelection.kind === "guild"
      ? activeGuild?.members || []
      : activeChannel?.participants || [];
  const memberGroups = buildMemberGroups(memberList);
  const friendUsers = (workspace.available_users || [])
    .filter((user) => user.id !== workspace.current_user.id)
    .sort((a, b) => {
      const aStatus = isVisibleStatus(a.status) ? 0 : 1;
      const bStatus = isVisibleStatus(b.status) ? 0 : 1;
      if (aStatus !== bStatus) {
        return aStatus - bStatus;
      }

      return String(a.username || "").localeCompare(String(b.username || ""), "es");
    });
  const activeNowUsers = friendUsers.filter((user) => isVisibleStatus(user.status)).slice(0, 3);
  const headerSearchPlaceholder =
    activeSelection.kind === "guild"
      ? `Buscar en #${activeChannel?.name || "general"}`
      : `Buscar en ${activeChannel?.display_name || "este chat"}`;

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="server-rail">
        <div className="server-rail-header">
          <UmbraLogo alt="Umbra" className="server-rail-logo" size={30} />
          <span>UMBRA</span>
        </div>
        <button
          className={`server-pill ${activeSelection.kind === "dm" || activeSelection.kind === "home" ? "active" : ""}`}
          onClick={() =>
            setActiveSelection({
              channelId: null,
              guildId: null,
              kind: "home"
            })
          }
          type="button"
        >
          <span>DM</span>
          {directUnreadCount ? <i>{directUnreadCount}</i> : null}
        </button>
        <div className="server-stack">
          {workspace.guilds.map((guild) => (
            <button
              className={`server-pill ${activeGuild?.id === guild.id ? "active" : ""}`}
              key={guild.id}
              onClick={() =>
                setActiveSelection({
                  channelId: guild.channels[0]?.id || null,
                  guildId: guild.id,
                  kind: "guild"
                })
              }
              title={guild.name}
              type="button"
            >
              <span>{guild.icon_text || guild.name.slice(0, 2).toUpperCase()}</span>
              {guild.unread_count ? <i>{guild.unread_count}</i> : null}
            </button>
          ))}
        </div>
        <button
          className="server-pill add"
          onClick={() =>
            setDialog({
              type: "guild",
              currentUserId: workspace.current_user.id
            })
          }
          type="button"
        >
          <span>+</span>
        </button>
      </aside>

      <aside className="navigator-panel">
        <div className="navigator-top">
          <div className="navigator-title-block">
            <p className="eyebrow">{workspace.mode === "supabase" ? "Umbra Cloud" : "Modo demo"}</p>
            <h2>{activeGuild ? activeGuild.name : "Mensajes directos"}</h2>
            <p className="subcopy">
              {activeGuild
                ? activeGuild.description
                : "Accesos directos, charlas privadas y grupos oscuros."}
            </p>
          </div>
          <button
            className="ghost-button navigator-create-button"
            onClick={() =>
              setDialog({
                type: activeGuild ? "channel" : "dm",
                currentUserId: workspace.current_user.id
              })
            }
            type="button"
          >
            {activeGuild ? "Nuevo canal" : "Nuevo DM"}
          </button>
        </div>

        <div className="navigator-search">
          <input
            aria-label="Buscar en el panel lateral"
            placeholder={
              activeGuild
                ? `Buscar en ${activeGuild.name}`
                : activeSelection.kind === "home"
                  ? "Buscar o iniciar una conversacion"
                  : "Buscar mensajes directos"
            }
            type="text"
          />
        </div>

        {activeGuild ? (
          <div className="channel-list">
            <div className="panel-section-label">
              <span>Canales de texto</span>
              <button
                className="ghost-button icon-only"
                onClick={() =>
                  setDialog({
                    type: "channel",
                    currentUserId: workspace.current_user.id
                  })
                }
                type="button"
              >
                +
              </button>
            </div>
            {activeGuild.channels.map((channel) => (
              <button
                className={`channel-row ${activeSelection.channelId === channel.id ? "active" : ""}`}
                key={channel.id}
                onClick={() =>
                  setActiveSelection({
                    channelId: channel.id,
                    guildId: activeGuild.id,
                    kind: "guild"
                  })
                }
                type="button"
              >
                <span className="channel-label">
                  <small>#</small>
                  {channel.name}
                </span>
                {channel.unread_count ? <b>Nuevo</b> : null}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="direct-home-nav">
              <button
                className={`direct-home-link ${activeSelection.kind === "home" ? "active" : ""}`}
                onClick={() =>
                  setActiveSelection({
                    channelId: null,
                    guildId: null,
                    kind: "home"
                  })
                }
                type="button"
              >
                Amigos
              </button>
              <button
                className="direct-home-link"
                onClick={() => showUiNotice("Solicitudes de mensajes llegaran cuando conectemos social graph real.")}
                type="button"
              >
                Solicitudes de mensajes
              </button>
              <button
                className="direct-home-link"
                onClick={() => showUiNotice("Nitro y perks quedan fuera del MVP funcional de Umbra.")}
                type="button"
              >
                Nitro
              </button>
              <button
                className="direct-home-link"
                onClick={() => showUiNotice("Misiones y tienda son placeholders visuales por ahora.")}
                type="button"
              >
                Misiones
              </button>
            </div>

            <div className="dm-list">
              <div className="panel-section-label">
                <span>Mensajes directos</span>
                <button
                  className="ghost-button icon-only"
                  onClick={() =>
                    setDialog({
                      type: "dm",
                      currentUserId: workspace.current_user.id
                    })
                  }
                  type="button"
                >
                  +
                </button>
              </div>
              {workspace.dms.map((dm) => {
                const other = dm.participants.find(
                  (participant) => participant.id !== workspace.current_user.id
                );

                return (
                  <button
                    className={`dm-row ${activeSelection.channelId === dm.id ? "active" : ""}`}
                    key={dm.id}
                    onClick={() =>
                      setActiveSelection({
                        channelId: dm.id,
                        guildId: null,
                        kind: "dm"
                      })
                    }
                    type="button"
                  >
                    <Avatar
                      hue={other?.avatar_hue || 210}
                      label={dm.display_name}
                      size={38}
                      status={dm.type === "dm" ? other?.status : null}
                    />
                    <div className="dm-copy">
                      <strong>{dm.display_name}</strong>
                      <span>{getDmSummary(dm, workspace.current_user.id)}</span>
                    </div>
                    {dm.unread_count ? <i>{dm.unread_count}</i> : null}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="navigator-footer">
          <button
            className="profile-card profile-card-button"
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            <Avatar
              hue={workspace.current_user.avatar_hue}
              label={workspace.current_user.username}
              status={workspace.current_user.status}
            />
            <div className="profile-meta">
              <strong>{currentUserLabel}</strong>
              <span>{workspace.current_user.email || "Sin email visible"}</span>
            </div>
          </button>

          <div className="footer-status-row">
            <label className="select-group">
              <span>Estado</span>
              <select
                onChange={(event) => handleStatusChange(event.target.value)}
                value={workspace.current_user.status}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ghost-button icon-only"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              Ajustes
            </button>
          </div>

          <div className="footer-actions compact">
            <button
              className="ghost-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              type="button"
            >
              {theme === "dark" ? "Tema claro" : "Tema oscuro"}
            </button>
            <button className="ghost-button" onClick={() => loadBootstrap(activeSelection)} type="button">
              Refrescar
            </button>
          </div>

          <div className="footer-actions">
            <button
              className="ghost-button icon-only"
              onClick={() => showUiNotice("Controles de micro llegan junto al stack de voz.")}
              type="button"
            >
              Mic
            </button>
            <button
              className="ghost-button icon-only"
              onClick={() => showUiNotice("Audio y salida de voz se conectan en la capa de llamadas.")}
              type="button"
            >
              Audio
            </button>
            <button className="ghost-button icon-only" onClick={() => setSettingsOpen(true)} type="button">
              Cfg
            </button>
            <button className="ghost-button danger" onClick={onSignOut} type="button">
              Cerrar sesion
            </button>
          </div>
        </div>
      </aside>

      <main className="chat-stage">
        {activeSelection.kind === "home" ? (
          <>
            {appError ? <div className="error-banner">{appError}</div> : null}
            <FriendsHome
              onOpenDm={handleOpenDmFromCard}
              onOpenProfileCard={openProfileCard}
              onShowNotice={showUiNotice}
              users={friendUsers}
            />
          </>
        ) : (
          <>
        <header className="chat-header">
          <div className="chat-title-block">
            <p className="eyebrow">{headerCopy.eyebrow}</p>
            <div className="chat-title-line">
              <h1>{headerCopy.title}</h1>
              <span className="chat-topic-pill">
                {activeSelection.kind === "guild" ? "Texto" : "Directo"}
              </span>
            </div>
            <p className="subcopy">{headerCopy.description}</p>
          </div>

          <div className="chat-header-tools">
            <button className="ghost-button icon-only" type="button">
              Hilos
            </button>
            <button className="ghost-button icon-only" type="button">
              Inbox
            </button>
            <button className="ghost-button icon-only" type="button">
              Ayuda
            </button>
            <label className="chat-search">
              <input placeholder={headerSearchPlaceholder} type="text" />
            </label>
            <div className="chat-header-mark">
              <UmbraLogo alt="Umbra" size={20} />
              <span>Umbra</span>
            </div>
          </div>
        </header>

        {appError ? <div className="error-banner">{appError}</div> : null}

        <section className="message-feed" onScroll={handleScroll} ref={listRef}>
          {messages.map((message, index) => {
            const grouped = isGrouped(messages[index - 1], message);

            return (
              <article
                className={`message-card ${grouped ? "grouped" : ""} ${message.is_mentioning_me ? "mention-hit" : ""}`}
                id={`message-${message.id}`}
                key={message.id}
              >
                {!grouped ? (
                  <button
                    className="message-avatar-trigger"
                    onClick={(event) =>
                      openProfileCard(
                        event,
                        {
                          ...message.author,
                          bio: workspace.available_users.find((item) => item.id === message.author?.id)?.bio
                        },
                        message.display_name
                      )
                    }
                    type="button"
                  >
                    <Avatar
                      hue={message.author?.avatar_hue}
                      label={message.display_name}
                      size={44}
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
                        onClick={(event) =>
                          openProfileCard(
                            event,
                            {
                              ...message.author,
                              bio: workspace.available_users.find((item) => item.id === message.author?.id)?.bio
                            },
                            message.display_name
                          )
                        }
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
                      onClick={() =>
                        document
                          .getElementById(`message-${message.reply_preview.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                      type="button"
                    >
                      <span>{message.reply_preview.author_name}</span>
                      <small>{message.reply_preview.content}</small>
                    </button>
                  ) : null}

                  <div
                    className="message-body"
                    dangerouslySetInnerHTML={{ __html: formatMessageHtml(message.content) }}
                  />

                  <div className="message-toolbar">
                    <button className="ghost-button small" onClick={() => setReplyTarget(message)} type="button">
                      Responder
                    </button>
                    {message.can_edit ? (
                      <button
                        className="ghost-button small"
                        onClick={() => {
                          setEditingMessage(message);
                          setReplyTarget(null);
                          setComposer(message.content);
                        }}
                        type="button"
                      >
                        Editar
                      </button>
                    ) : null}
                    <button
                      className={`ghost-button small ${reactionPickerFor === message.id ? "active" : ""}`}
                      onClick={() =>
                        setReactionPickerFor((previous) =>
                          previous === message.id ? null : message.id
                        )
                      }
                      type="button"
                    >
                      Reaccionar
                    </button>
                    {message.can_delete ? (
                      <button className="ghost-button small danger" onClick={() => handleDeleteMessage(message)} type="button">
                        Eliminar
                      </button>
                    ) : null}
                  </div>

                  <div className="reactions-row">
                    {message.reactions.map((reaction) => (
                      <button
                        className={`reaction-chip ${reaction.selected ? "selected" : ""}`}
                        key={`${message.id}-${reaction.emoji}`}
                        onClick={() => handleReaction(message.id, reaction.emoji)}
                        type="button"
                      >
                        <span>{reaction.emoji}</span>
                        <b>{reaction.count}</b>
                      </button>
                    ))}
                    <button
                      className="reaction-chip add"
                      onClick={() =>
                        setReactionPickerFor((previous) =>
                          previous === message.id ? null : message.id
                        )
                      }
                      type="button"
                    >
                      +
                    </button>
                  </div>

                  {reactionPickerFor === message.id ? (
                    <div className="reaction-picker-inline">
                      {REACTION_OPTIONS.map((emoji) => (
                        <button
                          className="reaction-chip"
                          key={`${message.id}-picker-${emoji}`}
                          onClick={() => {
                            handleReaction(message.id, emoji);
                            setReactionPickerFor(null);
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
          })}

          {!messages.length && !loadingMessages ? (
            <div className="empty-state">
              <h3>Este canal aun no tiene ecos.</h3>
              <p>Escribe el primer mensaje y enciende Umbra.</p>
            </div>
          ) : null}
        </section>

        <footer className="composer-shell">
          {replyTarget ? (
            <div className="composer-banner">
              <span>Respondiendo a {replyTarget.display_name}</span>
              <button className="ghost-button small" onClick={() => setReplyTarget(null)} type="button">
                Cancelar
              </button>
            </div>
          ) : null}

          {editingMessage ? (
            <div className="composer-banner warning">
              <span>Editando un mensaje existente</span>
              <button
                className="ghost-button small"
                onClick={() => {
                  setEditingMessage(null);
                  setComposer("");
                }}
                type="button"
              >
                Salir
              </button>
            </div>
          ) : null}

          {typingUsers.length ? (
            <div className="typing-line">
              {typingUsers.map((item) => item.username).join(", ")} esta escribiendo...
            </div>
          ) : null}

          {uiNotice ? <div className="composer-banner subtle">{uiNotice}</div> : null}

          <div className="composer-frame">
            <div className="composer-side">
              <button
                className={`composer-icon-button ${composerMenuOpen ? "active" : ""}`}
                onClick={() => setComposerMenuOpen((previous) => !previous)}
                type="button"
              >
                +
              </button>

              {composerMenuOpen ? (
                <div className="floating-surface shortcut-menu">
                  {COMPOSER_SHORTCUTS.map((shortcut) => (
                    <button
                      className="shortcut-item"
                      key={shortcut.id}
                      onClick={() => handleComposerShortcut(shortcut)}
                      type="button"
                    >
                      <strong>{shortcut.label}</strong>
                      <span>{shortcut.description}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <form className="composer" onSubmit={handleSubmitMessage}>
              <textarea
                onChange={(event) => handleComposerChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmitMessage(event);
                  }
                }}
                placeholder={
                  activeSelection.kind === "guild"
                    ? `Mensaje #${activeChannel?.name || "general"}`
                    : `Mensaje para ${activeChannel?.display_name || "este DM"}`
                }
                ref={composerRef}
                rows={2}
                value={composer}
              />

              <div className="composer-actions">
                <button
                  className={`composer-action-chip ${composerPicker === "gif" ? "active" : ""}`}
                  onClick={() =>
                    setComposerPicker((previous) => (previous === "gif" ? null : "gif"))
                  }
                  type="button"
                >
                  GIF
                </button>
                <button
                  className={`composer-action-chip ${composerPicker === "sticker" ? "active" : ""}`}
                  onClick={() =>
                    setComposerPicker((previous) => (previous === "sticker" ? null : "sticker"))
                  }
                  type="button"
                >
                  Stickers
                </button>
                <button
                  className={`composer-action-chip ${composerPicker === "emoji" ? "active" : ""}`}
                  onClick={() =>
                    setComposerPicker((previous) => (previous === "emoji" ? null : "emoji"))
                  }
                  type="button"
                >
                  Emoji
                </button>
                <button className="primary-button send-button" type="submit">
                  {editingMessage ? "Guardar" : "Enviar"}
                </button>
              </div>
            </form>

            {composerPicker ? (
              <div className="floating-surface picker-panel">
                <div className="picker-panel-header">
                  <div>
                    <strong>{PICKER_CONTENT[composerPicker].title}</strong>
                    <span>{PICKER_CONTENT[composerPicker].subtitle}</span>
                  </div>
                  <button
                    className="ghost-button icon-only"
                    onClick={() => setComposerPicker(null)}
                    type="button"
                  >
                    x
                  </button>
                </div>

                <div className={`picker-grid ${composerPicker}`}>
                  {PICKER_CONTENT[composerPicker].items.map((item) => (
                    <button
                      className="picker-card"
                      key={item}
                      onClick={() =>
                        handlePickerInsert(
                          composerPicker === "emoji" ? item : `:${String(item).toLowerCase()}:`
                        )
                      }
                      type="button"
                    >
                      <strong>{item}</strong>
                      {composerPicker === "emoji" ? null : (
                        <span>{composerPicker === "gif" ? "Inserta un tag rapido" : "Sticker rapido"}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </footer>
          </>
        )}
      </main>

      <aside className="members-panel">
        {activeSelection.kind === "home" ? (
          <>
            <div className="members-header">
              <p className="eyebrow">Activo ahora</p>
              <h3>{activeNowUsers.length ? "Usuarios conectados" : "Sin actividad"}</h3>
            </div>

            <div className="activity-panel">
              {activeNowUsers.map((user) => (
                <button
                  className="activity-card"
                  key={user.id}
                  onClick={(event) => openProfileCard(event, user)}
                  type="button"
                >
                  <div className="activity-card-header">
                    <Avatar
                      hue={user.avatar_hue}
                      label={user.username}
                      size={42}
                      status={user.status}
                    />
                    <div className="activity-card-copy">
                      <strong>{user.username}</strong>
                      <span>{user.custom_status || "Online"}</span>
                    </div>
                  </div>
                  <div className="activity-card-body">
                    <p>{user.bio || "Sin bio visible."}</p>
                  </div>
                </button>
              ))}

              {!activeNowUsers.length ? (
                <div className="guide-note">
                  <h4>Sin actividad destacada</h4>
                  <p>Cuando tus usuarios esten online, aqui aparecera su presencia reciente.</p>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="members-header">
              <p className="eyebrow">{activeSelection.kind === "guild" ? "Miembros" : "Participantes"}</p>
              <h3>
                {activeSelection.kind === "guild"
                  ? `${memberList.length} personas`
                  : `${memberList.length} en el chat`}
              </h3>
            </div>

            <div className="member-list">
              {memberGroups.map((group) => (
                <section className="member-group" key={group.id}>
                  <p className="member-group-label">{group.label}</p>
                  {group.members.map((member) => (
                    <button
                      className="member-row member-row-button"
                      key={member.id}
                      onClick={(event) => openProfileCard(event, member)}
                      type="button"
                    >
                      <Avatar
                        hue={member.avatar_hue}
                        label={member.display_name || member.username}
                        size={38}
                        status={member.status}
                      />
                      <div className="member-copy">
                        <strong style={member.role_color ? { color: member.role_color } : undefined}>
                          {member.display_name || member.username}
                        </strong>
                        <span>{member.custom_status || member.status}</span>
                      </div>
                    </button>
                  ))}
                </section>
              ))}
            </div>

            <div className="guide-note">
              <h4>Umbra desktop + cloud</h4>
              <p>
                Shell mas cercana a Discord, composer mas rico, menus laterales y una
                base lista para seguir conectando features reales.
              </p>
            </div>
          </>
        )}
      </aside>

      {settingsOpen ? (
        <SettingsModal
          dmCount={workspace.dms.length}
          guildCount={workspace.guilds.length}
          onClose={() => setSettingsOpen(false)}
          onShowNotice={showUiNotice}
          onSignOut={onSignOut}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          theme={theme}
          user={workspace.current_user}
        />
      ) : null}

      {profileCard ? (
        <UserProfileCard
          card={profileCard}
          onClose={() => setProfileCard(null)}
          onOpenDm={handleOpenDmFromCard}
          onOpenSelfProfile={() => {
            setProfileCard(null);
            setSettingsOpen(true);
          }}
        />
      ) : null}

      {dialog ? (
        <Dialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSubmit={handleDialogSubmit}
          users={workspace.available_users}
        />
      ) : null}
    </div>
  );
}
