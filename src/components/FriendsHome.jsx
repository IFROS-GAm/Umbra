import React, { useMemo, useState } from "react";

import { Avatar } from "./Avatar.jsx";

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

  return "Offline";
}

export function FriendsHome({
  onOpenDm,
  onOpenProfileCard,
  onShowNotice,
  users
}) {
  const [tab, setTab] = useState("online");
  const [query, setQuery] = useState("");

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aOnline = isActiveStatus(a.status) ? 0 : 1;
      const bOnline = isActiveStatus(b.status) ? 0 : 1;
      if (aOnline !== bOnline) {
        return aOnline - bOnline;
      }

      return String(a.username || "").localeCompare(String(b.username || ""), "es");
    });
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (tab === "pending") {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();
    const base =
      tab === "online"
        ? sortedUsers.filter((user) => isActiveStatus(user.status))
        : sortedUsers;

    if (!normalizedQuery) {
      return base;
    }

    return base.filter((user) =>
      `${user.username} ${user.custom_status || ""}`.toLowerCase().includes(normalizedQuery)
    );
  }, [query, sortedUsers, tab]);

  const onlineCount = sortedUsers.filter((user) => isActiveStatus(user.status)).length;

  return (
    <section className="friends-home">
      <header className="friends-header">
        <div className="friends-title">
          <strong>Amigos</strong>
          <span className="friends-dot">.</span>
          <span className="friends-tab-chip active">En linea</span>
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
          <button className="primary-button friends-add-button" onClick={() => onShowNotice("Invitaciones y lista de amigos llegan en una siguiente iteracion.")} type="button">
            Anadir amigos
          </button>
        </div>
      </header>

      <div className="friends-search-row">
        <label className="friends-search">
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            type="text"
            value={query}
          />
        </label>
      </div>

      {tab === "pending" ? (
        <div className="friends-empty">
          <h3>Sin solicitudes pendientes</h3>
          <p>Umbra todavia no tiene sistema de amistad completo conectado al backend.</p>
        </div>
      ) : (
        <>
          <div className="friends-count">
            {tab === "online" ? `${onlineCount} en linea` : `${filteredUsers.length} usuarios`}
          </div>

          <div className="friends-list">
            {filteredUsers.map((user) => (
              <div className="friend-row" key={user.id}>
                <button
                  className="friend-main"
                  onClick={(event) => onOpenProfileCard(event, user)}
                  type="button"
                >
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.username}
                    size={44}
                    status={user.status}
                  />
                  <div className="friend-copy">
                    <strong>{user.username}</strong>
                    <span>{statusCopy(user)}</span>
                  </div>
                </button>

                <div className="friend-actions">
                  <button className="ghost-button icon-only" onClick={() => onOpenDm(user)} type="button">
                    Chat
                  </button>
                  <button
                    className="ghost-button icon-only"
                    onClick={(event) => onOpenProfileCard(event, user)}
                    type="button"
                  >
                    Perfil
                  </button>
                </div>
              </div>
            ))}

            {!filteredUsers.length ? (
              <div className="friends-empty inline">
                <h3>No hay resultados</h3>
                <p>Prueba otra busqueda dentro de tus usuarios visibles.</p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
