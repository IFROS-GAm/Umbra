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
import { UmbraLogo } from "./UmbraLogo.jsx";

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
  const [booting, setBooting] = useState(true);

  const listRef = useRef(null);
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

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="server-rail">
        <div className="server-rail-header">
          <UmbraLogo alt="Umbra" className="server-rail-logo" size={30} />
          <span>UMBRA</span>
        </div>
        <button
          className={`server-pill ${activeSelection.kind === "dm" ? "active" : ""}`}
          onClick={() => {
            if (workspace.dms[0]) {
              setActiveSelection({
                channelId: workspace.dms[0].id,
                guildId: null,
                kind: "dm"
              });
            }
          }}
          type="button"
        >
          <span>DM</span>
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
          <div>
            <p className="eyebrow">{workspace.mode === "supabase" ? "Umbra Cloud" : "Modo demo"}</p>
            <h2>{activeGuild ? activeGuild.name : "Mensajes directos"}</h2>
            <p className="subcopy">
              {activeGuild
                ? activeGuild.description
                : "Accesos directos, charlas privadas y grupos oscuros."}
            </p>
          </div>
          <button
            className="ghost-button"
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

        {activeGuild ? (
          <div className="channel-list">
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
                <span className="channel-label"># {channel.name}</span>
                {channel.unread_count ? <b>Nuevo</b> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="dm-list">
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
                    <span>{dm.last_message_preview || "Sin mensajes todavia"}</span>
                  </div>
                  {dm.unread_count ? <i>{dm.unread_count}</i> : null}
                </button>
              );
            })}
          </div>
        )}

        <div className="navigator-footer">
          <div className="profile-card">
            <Avatar
              hue={workspace.current_user.avatar_hue}
              label={workspace.current_user.username}
              status={workspace.current_user.status}
            />
            <div className="profile-meta">
              <strong>{workspace.current_user.username}</strong>
              <span>{workspace.current_user.email || "Sin email visible"}</span>
            </div>
          </div>

          <label className="select-group">
            <span>Estado</span>
            <select onChange={(event) => handleStatusChange(event.target.value)} value={workspace.current_user.status}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <div className="footer-actions">
            <button className="ghost-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
              {theme === "dark" ? "Tema claro" : "Tema oscuro"}
            </button>
            <button className="ghost-button" onClick={() => loadBootstrap(activeSelection)} type="button">
              Refrescar
            </button>
            <button className="ghost-button danger" onClick={onSignOut} type="button">
              Cerrar sesion
            </button>
          </div>
        </div>
      </aside>

      <main className="chat-stage">
        <header className="chat-header">
          <div>
            <p className="eyebrow">{headerCopy.eyebrow}</p>
            <h1>{headerCopy.title}</h1>
            <p className="subcopy">{headerCopy.description}</p>
          </div>
          <div className="chat-header-mark">
            <UmbraLogo alt="Umbra" size={20} />
            <span>Umbra</span>
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
                  <Avatar
                    hue={message.author?.avatar_hue}
                    label={message.display_name}
                    size={44}
                    status={message.author?.status}
                  />
                ) : (
                  <div className="message-gutter" />
                )}

                <div className="message-main">
                  {!grouped ? (
                    <div className="message-headline">
                      <strong>{message.display_name}</strong>
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
                    {REACTION_OPTIONS.map((emoji) => (
                      <button
                        className="reaction-chip add"
                        key={`${message.id}-add-${emoji}`}
                        onClick={() => handleReaction(message.id, emoji)}
                        type="button"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
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
                  ? `Enviar mensaje en #${activeChannel?.name || "general"}`
                  : `Hablar con ${activeChannel?.display_name || "este DM"}`
              }
              rows={3}
              value={composer}
            />
            <button className="primary-button" type="submit">
              {editingMessage ? "Guardar cambio" : "Enviar"}
            </button>
          </form>
        </footer>
      </main>

      <aside className="members-panel">
        <div className="members-header">
          <p className="eyebrow">{activeSelection.kind === "guild" ? "Miembros" : "Participantes"}</p>
          <h3>
            {activeSelection.kind === "guild"
              ? `${memberList.length} personas`
              : `${memberList.length} en el chat`}
          </h3>
        </div>

        <div className="member-list">
          {memberList.map((member) => (
            <div className="member-row" key={member.id}>
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
            </div>
          ))}
        </div>

        <div className="guide-note">
          <h4>Umbra desktop + cloud</h4>
          <p>
            Auth real, Google, OTP, mensajes en tiempo real, DMs, reacciones y un
            tono visual mas oscuro para despliegue y empaquetado.
          </p>
        </div>
      </aside>

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
