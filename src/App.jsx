import React, { useEffect, useRef, useState } from "react";

import { api } from "./api.js";
import { Avatar } from "./components/Avatar.jsx";
import { Dialog } from "./components/Dialog.jsx";
import { getSocket } from "./socket.js";
import {
  REACTION_OPTIONS,
  STATUS_OPTIONS,
  findChannelInSession,
  formatMessageHtml,
  isGrouped,
  relativeTime,
  resolveSelection
} from "./utils.js";

function renderSidebarTitle(activeGuild, activeChannel, kind) {
  if (kind === "guild") {
    return {
      eyebrow: "Canal",
      title: `# ${activeChannel?.name || "general"}`,
      description: activeChannel?.topic || "Sin descripción todavía."
    };
  }

  return {
    eyebrow: "Conversación",
    title: activeChannel?.display_name || "Mensajes directos",
    description: activeChannel?.topic || "Abre conversaciones 1 a 1 o grupos pequeños."
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(
    localStorage.getItem("ifros-mini-user-id") || ""
  );
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
  const selectedUserIdRef = useRef(selectedUserId);
  const activeSelectionRef = useRef(activeSelection);
  const loadBootstrapRef = useRef(null);

  selectedUserIdRef.current = selectedUserId;
  activeSelectionRef.current = activeSelection;

  const activeLookup = findChannelInSession(session, activeSelection.channelId);
  const activeChannel = activeLookup?.channel || null;
  const activeGuild = activeLookup?.guild || null;
  const headerCopy = renderSidebarTitle(activeGuild, activeChannel, activeSelection.kind);
  const typingUsers = typingEvents.filter(
    (item) =>
      item.channelId === activeSelection.channelId &&
      item.userId !== selectedUserId &&
      item.expires_at > Date.now()
  );

  async function loadBootstrap(preferredUserId = selectedUserIdRef.current, preferredSelection = activeSelectionRef.current) {
    try {
      const payload = await api.bootstrap(preferredUserId || undefined);
      const effectiveUserId = preferredUserId || payload.current_user.id;

      setSession(payload);
      setSelectedUserId(effectiveUserId);
      localStorage.setItem("ifros-mini-user-id", effectiveUserId);
      setActiveSelection(resolveSelection(payload, preferredSelection));
      setAppError("");
    } catch (error) {
      setAppError(error.message);
    } finally {
      setBooting(false);
    }
  }

  loadBootstrapRef.current = loadBootstrap;

  async function loadMessages({ before = null, channelId = activeSelection.channelId, prepend = false } = {}) {
    if (!channelId || !selectedUserIdRef.current) {
      return;
    }

    setLoadingMessages(true);
    const previousHeight = listRef.current?.scrollHeight || 0;

    try {
      const payload = await api.fetchMessages({
        before,
        channelId,
        limit: 30,
        userId: selectedUserIdRef.current
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
          lastReadMessageId: latest.id,
          userId: selectedUserIdRef.current
        });
      }
    } catch (error) {
      setAppError(error.message);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    loadBootstrap(selectedUserId || undefined, activeSelection);
  }, [selectedUserId]);

  useEffect(() => {
    if (session?.current_user?.id) {
      const savedTheme = localStorage.getItem(`ifros-theme-${session.current_user.id}`);
      setTheme(savedTheme || session.current_user.theme || "dark");
    }
  }, [session?.current_user?.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (session?.current_user?.id) {
      localStorage.setItem(`ifros-theme-${session.current_user.id}`, theme);
    }
  }, [theme, session?.current_user?.id]);

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
    const socket = getSocket();
    socket.connect();

    const refreshNavigation = () => {
      if (selectedUserIdRef.current) {
        loadBootstrapRef.current?.(selectedUserIdRef.current, activeSelectionRef.current);
      }
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
          if (nearBottom || message.author?.id === selectedUserIdRef.current) {
            element.scrollTop = element.scrollHeight;
          }
        });

        if (message.id) {
          await api.markRead({
            channelId: activeSelectionRef.current.channelId,
            lastReadMessageId: message.id,
            userId: selectedUserIdRef.current
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

      setSession((previous) => {
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
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      getSocket().emit("session:identify", { userId: selectedUserId });
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (activeSelection.channelId) {
      getSocket().emit("room:join", { channelId: activeSelection.channelId });
    }
  }, [activeSelection.channelId]);

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
    if (!composer.trim() || !activeSelection.channelId || !selectedUserId) {
      return;
    }

    try {
      if (editingMessage) {
        await api.updateMessage({
          content: composer,
          messageId: editingMessage.id,
          userId: selectedUserId
        });
      } else {
        await api.createMessage({
          authorId: selectedUserId,
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
    if (!window.confirm("¿Eliminar este mensaje?")) {
      return;
    }

    try {
      await api.deleteMessage({
        messageId: message.id,
        userId: selectedUserId
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleReaction(messageId, emoji) {
    try {
      await api.toggleReaction({
        emoji,
        messageId,
        userId: selectedUserId
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleStatusChange(status) {
    try {
      await api.updateStatus({
        status,
        userId: selectedUserId
      });
      await loadBootstrap(selectedUserId, activeSelection);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleDialogSubmit(values) {
    if (!dialog) {
      return;
    }

    if (dialog.type === "guild") {
      const payload = await api.createGuild({
        description: values.description,
        name: values.name,
        ownerId: selectedUserId
      });
      await loadBootstrap(selectedUserId, {
        channelId: payload.channel_id,
        guildId: payload.guild_id,
        kind: "guild"
      });
    }

    if (dialog.type === "channel") {
      const payload = await api.createChannel({
        createdBy: selectedUserId,
        guildId: activeGuild.id,
        name: values.name,
        topic: values.topic
      });
      await loadBootstrap(selectedUserId, {
        channelId: payload.channel.id,
        guildId: activeGuild.id,
        kind: "guild"
      });
    }

    if (dialog.type === "dm") {
      const payload = await api.createDm({
        ownerId: selectedUserId,
        recipientId: values.recipientId
      });
      await loadBootstrap(selectedUserId, {
        channelId: payload.channel.id,
        guildId: null,
        kind: "dm"
      });
    }

    setDialog(null);
  }

  function handleComposerChange(value) {
    setComposer(value);
    const now = Date.now();
    if (
      activeSelection.channelId &&
      selectedUserId &&
      session?.current_user &&
      now - lastTypingAtRef.current > 1200
    ) {
      getSocket().emit("typing:start", {
        channelId: activeSelection.channelId,
        userId: selectedUserId,
        username: session.current_user.username
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
    return <div className="boot-screen">Levantando IFROS Mini Discord...</div>;
  }

  if (!session) {
    return <div className="boot-screen">No se pudo cargar la sesión.</div>;
  }

  const memberList =
    activeSelection.kind === "guild"
      ? activeGuild?.members || []
      : activeChannel?.participants || [];

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="server-rail">
        <div className="server-rail-header">IFROS</div>
        <button
          className={`server-pill ${activeSelection.kind === "dm" ? "active" : ""}`}
          onClick={() => {
            if (session.dms[0]) {
              setActiveSelection({
                channelId: session.dms[0].id,
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
          {session.guilds.map((guild) => (
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
          onClick={() => setDialog({ type: "guild", currentUserId: selectedUserId })}
          type="button"
        >
          <span>+</span>
        </button>
      </aside>

      <aside className="navigator-panel">
        <div className="navigator-top">
          <div>
            <p className="eyebrow">{session.mode === "supabase" ? "Supabase activo" : "Modo demo persistente"}</p>
            <h2>{activeGuild ? activeGuild.name : "Mensajes directos"}</h2>
            <p className="subcopy">
              {activeGuild ? activeGuild.description : "Abre conversaciones 1 a 1 o grupos pequeños."}
            </p>
          </div>
          <button
            className="ghost-button"
            onClick={() =>
              setDialog({
                type: activeGuild ? "channel" : "dm",
                currentUserId: selectedUserId
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
            {session.dms.map((dm) => {
              const other = dm.participants.find((participant) => participant.id !== selectedUserId);
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
                    <span>{dm.last_message_preview || "Sin mensajes todavía"}</span>
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
              hue={session.current_user.avatar_hue}
              label={session.current_user.username}
              status={session.current_user.status}
            />
            <div className="profile-meta">
              <strong>{session.current_user.username}</strong>
              <span>#{session.current_user.discriminator}</span>
            </div>
          </div>

          <label className="select-group">
            <span>Perfil</span>
            <select onChange={(event) => setSelectedUserId(event.target.value)} value={selectedUserId}>
              {session.available_users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </label>

          <label className="select-group">
            <span>Estado</span>
            <select onChange={(event) => handleStatusChange(event.target.value)} value={session.current_user.status}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <button className="ghost-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
            {theme === "dark" ? "Tema claro" : "Tema oscuro"}
          </button>
        </div>
      </aside>

      <main className="chat-stage">
        <header className="chat-header">
          <div>
            <p className="eyebrow">{headerCopy.eyebrow}</p>
            <h1>{headerCopy.title}</h1>
            <p className="subcopy">{headerCopy.description}</p>
          </div>
          <button className="ghost-button" onClick={() => loadBootstrap(selectedUserId, activeSelection)} type="button">
            Refrescar
          </button>
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
              <h3>Este canal todavía está tranquilo.</h3>
              <p>Envía el primer mensaje y deja listo el hilo.</p>
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
              {typingUsers.map((item) => item.username).join(", ")} está escribiendo...
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
          <h4>Mini alcance implementado</h4>
          <p>
            Mensajes, replies, edición, borrado, reacciones, typing, presencia,
            servidores, canales, DMs, tema claro/oscuro y empaquetado web + Electron.
          </p>
        </div>
      </aside>

      {dialog ? (
        <Dialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSubmit={handleDialogSubmit}
          users={session.available_users}
        />
      ) : null}
    </div>
  );
}
