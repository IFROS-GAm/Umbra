import React, { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

function isActiveStatus(status) {
  return status && status !== "offline" && status !== "invisible";
}

function statusCopy(user) {
  if (user.custom_status) {
    return user.custom_status;
  }

  if (user.status === "idle") {
    return "Ausente";
  }

  if (user.status === "dnd") {
    return "No molestar";
  }

  if (user.status === "online") {
    return "En linea";
  }

  return "Sin conexion";
}

function filterByQuery(items, query, projector) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => projector(item).toLowerCase().includes(normalizedQuery));
}

function FriendRowActions({ onOpenDm, onRemoveFriend, user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  return (
    <div className="friend-row-actions" ref={menuRef}>
      <button
        aria-label={`Abrir chat con ${user.username}`}
        className="ghost-button icon-only"
        onClick={() => onOpenDm?.(user)}
        type="button"
      >
        <Icon name="mail" />
      </button>
      <button
        aria-label={`Mas acciones para ${user.username}`}
        className="ghost-button icon-only"
        onClick={() => setMenuOpen((previous) => !previous)}
        type="button"
      >
        <Icon name="more" />
      </button>

      {menuOpen ? (
        <div className="friend-actions-menu">
          <button
            className="friend-actions-menu-item"
            onClick={() => {
              setMenuOpen(false);
              onOpenDm?.(user);
            }}
            type="button"
          >
            <span>Iniciar videollamada</span>
          </button>
          <button
            className="friend-actions-menu-item"
            onClick={() => {
              setMenuOpen(false);
              onOpenDm?.(user);
            }}
            type="button"
          >
            <span>Iniciar llamada de voz</span>
          </button>
          <button
            className="friend-actions-menu-item danger"
            onClick={() => {
              setMenuOpen(false);
              onRemoveFriend?.(user);
            }}
            type="button"
          >
            <span>Eliminar amigo</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FriendRow({ onOpenDm, onOpenProfileCard, onRemoveFriend, user }) {
  return (
    <div className="friend-row">
      <button
        className="friend-main"
        onClick={(event) => onOpenProfileCard(event, user)}
        type="button"
      >
        <Avatar
          hue={user.avatar_hue}
          label={user.username}
          size={44}
          src={user.avatar_url}
          status={user.status}
        />
        <div className="friend-copy">
          <strong>{user.display_name || user.username}</strong>
          <span>{statusCopy(user)}</span>
        </div>
      </button>

      <FriendRowActions onOpenDm={onOpenDm} onRemoveFriend={onRemoveFriend} user={user} />
    </div>
  );
}

function PendingReceivedRow({ onAccept, onReject, request }) {
  const user = request.user;
  return (
    <div className="request-row">
      <div className="request-row-main">
        <Avatar
          hue={user.avatar_hue}
          label={user.display_name || user.username}
          size={42}
          src={user.avatar_url}
          status={user.status}
        />
        <div className="request-row-copy">
          <strong>{user.display_name || user.username}</strong>
          <p>{user.username}</p>
          <small>Quiere unirse a tus sombras.</small>
        </div>
      </div>

      <div className="request-row-actions">
        <button className="request-action-button accept" onClick={() => onAccept?.(request)} type="button">
          Aceptar
        </button>
        <button className="request-action-button reject" onClick={() => onReject?.(request)} type="button">
          Rechazar
        </button>
      </div>
    </div>
  );
}

function PendingSentRow({ onCancel, request }) {
  const user = request.user;
  return (
    <div className="pending-row">
      <div className="pending-row-main">
        <Avatar
          hue={user.avatar_hue}
          label={user.display_name || user.username}
          size={40}
          src={user.avatar_url}
          status={user.status}
        />
        <div className="pending-row-copy">
          <strong>{user.display_name || user.username}</strong>
          <span>{user.username}</span>
        </div>
      </div>

      <button
        aria-label={`Cancelar solicitud a ${user.username}`}
        className="ghost-button icon-only"
        onClick={() => onCancel?.(request)}
        type="button"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

function AddFriendRow({ onSendRequest, requestState, user }) {
  const buttonLabel =
    requestState === "sent"
      ? "Enviado"
      : requestState === "received"
        ? "Aceptar solicitud"
        : "Enviar solicitud de amigo";

  return (
    <div className="request-row add-friend-row">
      <div className="request-row-main">
        <Avatar
          hue={user.avatar_hue}
          label={user.display_name || user.username}
          size={42}
          src={user.avatar_url}
          status={user.status}
        />
        <div className="request-row-copy">
          <strong>{user.display_name || user.username}</strong>
          <p>{user.username}</p>
          <small>{user.custom_status || statusCopy(user)}</small>
        </div>
      </div>

      <button
        className={`request-action-button accept ${requestState === "sent" ? "disabled" : ""}`.trim()}
        disabled={requestState === "sent"}
        onClick={() => onSendRequest?.(user)}
        type="button"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function FriendsHome({
  availableUsers = [],
  blockedUsers = [],
  friends = [],
  onAcceptFriendRequest,
  onCancelFriendRequest,
  onOpenDm,
  onOpenProfileCard,
  onRemoveFriend,
  onSendFriendRequest,
  pendingReceived = [],
  pendingSent = []
}) {
  const [tab, setTab] = useState("online");
  const [query, setQuery] = useState("");

  const sentIds = useMemo(
    () => new Set(pendingSent.map((request) => request.user?.id).filter(Boolean)),
    [pendingSent]
  );
  const receivedIds = useMemo(
    () => new Set(pendingReceived.map((request) => request.user?.id).filter(Boolean)),
    [pendingReceived]
  );
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);
  const blockedIds = useMemo(
    () => new Set((blockedUsers || []).map((user) => user.id).filter(Boolean)),
    [blockedUsers]
  );

  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const aOnline = isActiveStatus(a.status) ? 0 : 1;
      const bOnline = isActiveStatus(b.status) ? 0 : 1;
      if (aOnline !== bOnline) {
        return aOnline - bOnline;
      }

      return String(a.username || "").localeCompare(String(b.username || ""), "es");
    });
  }, [friends]);

  const onlineFriends = useMemo(
    () => sortedFriends.filter((user) => isActiveStatus(user.status)),
    [sortedFriends]
  );

  const addCandidates = useMemo(
    () =>
      availableUsers
        .filter((user) => !friendIds.has(user.id) && !blockedIds.has(user.id))
        .sort((a, b) => String(a.username || "").localeCompare(String(b.username || ""), "es")),
    [availableUsers, blockedIds, friendIds]
  );

  const filteredOnline = useMemo(
    () => filterByQuery(onlineFriends, query, (user) => `${user.username} ${user.custom_status || ""}`),
    [onlineFriends, query]
  );
  const filteredAll = useMemo(
    () => filterByQuery(sortedFriends, query, (user) => `${user.username} ${user.custom_status || ""}`),
    [query, sortedFriends]
  );
  const filteredReceived = useMemo(
    () =>
      filterByQuery(
        pendingReceived,
        query,
        (request) => `${request.user?.username || ""} ${request.user?.display_name || ""}`
      ),
    [pendingReceived, query]
  );
  const filteredSent = useMemo(
    () =>
      filterByQuery(
        pendingSent,
        query,
        (request) => `${request.user?.username || ""} ${request.user?.display_name || ""}`
      ),
    [pendingSent, query]
  );
  const filteredCandidates = useMemo(
    () =>
      filterByQuery(
        addCandidates,
        query,
        (user) => `${user.username} ${user.display_name || ""} ${user.custom_status || ""}`
      ),
    [addCandidates, query]
  );

  const pendingCount = pendingReceived.length + pendingSent.length;

  return (
    <section className="friends-home">
      <header className="friends-header">
        <div className="friends-title">
          <span className="friends-title-icon">
            <Icon name="friends" />
          </span>
          <strong>Amigos</strong>
          <span className="friends-dot">.</span>
          <span className="friends-tab-chip active">
            {tab === "online"
              ? "En linea"
              : tab === "all"
                ? "Todos"
                : tab === "pending"
                  ? "Pendiente"
                  : "Anadir amigos"}
          </span>
        </div>

        <div className="friends-tabs">
          <button
            className={`friends-tab ${tab === "online" ? "active" : ""}`}
            onClick={() => setTab("online")}
            type="button"
          >
            En linea
          </button>
          <button
            className={`friends-tab ${tab === "all" ? "active" : ""}`}
            onClick={() => setTab("all")}
            type="button"
          >
            Todos
          </button>
          <button
            className={`friends-tab ${tab === "pending" ? "active" : ""}`}
            onClick={() => setTab("pending")}
            type="button"
          >
            Pendiente
          </button>
          <button
            className={`primary-button friends-add-button ${tab === "add" ? "active" : ""}`.trim()}
            onClick={() => setTab("add")}
            type="button"
          >
            <span>Anadir amigos</span>
          </button>
        </div>
      </header>

      <div className="friends-search-row">
        <label className="friends-search">
          <Icon name="search" />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === "add"
                ? "Buscar por nombre de sombra"
                : tab === "pending"
                  ? "Buscar solicitudes"
                  : friends.length
                    ? "Buscar"
                    : "No tienes sombras"
            }
            type="text"
            value={query}
          />
        </label>
      </div>

      {tab === "online" ? (
        !friends.length ? (
          <div className="friends-empty">
            <h3>No tienes sombras</h3>
            <p>Cuando una solicitud sea aceptada, tu lista de amigos aparecera aqui.</p>
          </div>
        ) : (
          <>
            <div className="friends-count">{filteredOnline.length} en linea</div>
            <div className="friends-list">
              {filteredOnline.map((user) => (
                <FriendRow
                  key={user.id}
                  onOpenDm={onOpenDm}
                  onOpenProfileCard={onOpenProfileCard}
                  onRemoveFriend={onRemoveFriend}
                  user={user}
                />
              ))}
            </div>
          </>
        )
      ) : null}

      {tab === "all" ? (
        !friends.length ? (
          <div className="friends-empty">
            <h3>No tienes sombras</h3>
            <p>Aun no has conectado amistades reales en Umbra.</p>
          </div>
        ) : (
          <>
            <div className="friends-count">Todos los amigos: {filteredAll.length}</div>
            <div className="friends-list">
              {filteredAll.map((user) => (
                <FriendRow
                  key={user.id}
                  onOpenDm={onOpenDm}
                  onOpenProfileCard={onOpenProfileCard}
                  onRemoveFriend={onRemoveFriend}
                  user={user}
                />
              ))}
            </div>
          </>
        )
      ) : null}

      {tab === "pending" ? (
        <div className="friends-list pending-list">
          <div className="friends-count">Pendientes: {pendingCount}</div>

          {filteredReceived.length ? (
            <>
              <div className="friends-count subheading">Recibidas - {filteredReceived.length}</div>
              {filteredReceived.map((request) => (
                <PendingReceivedRow
                  key={request.id}
                  onAccept={onAcceptFriendRequest}
                  onReject={onCancelFriendRequest}
                  request={request}
                />
              ))}
            </>
          ) : null}

          {filteredSent.length ? (
            <>
              <div className="friends-count subheading">Enviadas - {filteredSent.length}</div>
              {filteredSent.map((request) => (
                <PendingSentRow
                  key={request.id}
                  onCancel={onCancelFriendRequest}
                  request={request}
                />
              ))}
            </>
          ) : null}

          {!filteredReceived.length && !filteredSent.length ? (
            <div className="friends-empty inline">
              <h3>No hay solicitudes pendientes</h3>
              <p>Cuando envies o recibas solicitudes de amistad, apareceran aqui.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "add" ? (
        <div className="friends-list pending-list">
          <div className="friends-count">Anadir sombras</div>
          {filteredCandidates.length ? (
            filteredCandidates.map((user) => (
              <AddFriendRow
                key={user.id}
                onSendRequest={(target) => {
                  if (receivedIds.has(target.id)) {
                    const existingRequest = pendingReceived.find((request) => request.user?.id === target.id);
                    onAcceptFriendRequest?.(existingRequest);
                    return;
                  }

                  if (!sentIds.has(target.id)) {
                    onSendFriendRequest?.(target);
                  }
                }}
                requestState={
                  receivedIds.has(user.id) ? "received" : sentIds.has(user.id) ? "sent" : null
                }
                user={user}
              />
            ))
          ) : (
            <div className="friends-empty inline">
              <h3>No hay mas perfiles sugeridos</h3>
              <p>Ya conectaste o bloqueaste las sombras visibles para este espacio.</p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
