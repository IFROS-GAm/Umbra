import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { resolveAssetUrl } from "../../api.js";
import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

const CARD_WIDTH = 340;
const CARD_GAP = 14;
const CARD_MARGIN = 16;
function statusLabel(status) {
  switch (status) {
    case "online":
      return "Online";
    case "idle":
      return "Ausente";
    case "dnd":
      return "No molestar";
    case "invisible":
      return "Invisible";
    default:
      return "Offline";
  }
}

function getPosition(anchorRect, cardHeight = 456) {
  if (!anchorRect || typeof window === "undefined") {
    return {
      left: CARD_MARGIN,
      top: CARD_MARGIN
    };
  }

  let left = anchorRect.right + CARD_GAP;
  if (left + CARD_WIDTH > window.innerWidth - CARD_MARGIN) {
    left = Math.max(CARD_MARGIN, anchorRect.left - CARD_WIDTH - CARD_GAP);
  }

  const bottomSafeSpace = 24;
  const maxTop = Math.max(
    CARD_MARGIN,
    window.innerHeight - cardHeight - bottomSafeSpace
  );
  const top = Math.min(Math.max(CARD_MARGIN, anchorRect.top), maxTop);

  return {
    left,
    top
  };
}

function buildBannerStyle(profile) {
  if (profile.profileBannerUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.62)), url("${resolveAssetUrl(profile.profileBannerUrl)}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  if (profile.profileColor) {
    return {
      background: `linear-gradient(135deg, ${profile.profileColor}, hsl(${(profile.avatarHue + 42) % 360} 28% 14%))`
    };
  }

  if (profile.roleColor) {
    return {
      background: `linear-gradient(135deg, ${profile.roleColor}, hsl(${(profile.avatarHue + 36) % 360} 45% 18%))`
    };
  }

  return {
    background: `linear-gradient(135deg, hsl(${profile.avatarHue} 48% 34%), hsl(${(profile.avatarHue + 42) % 360} 42% 18%))`
  };
}

const STATUS_MENU_OPTIONS = [
  {
    description: "Visible para tus contactos y servidores.",
    icon: "mission",
    label: "En linea",
    value: "online"
  },
  {
    description: "Umbra seguira abierta, pero en modo ausente.",
    icon: "moon",
    label: "Inactivo",
    value: "idle"
  },
  {
    description: "Silencia notificaciones y reduce interrupciones.",
    icon: "close",
    label: "No molestar",
    value: "dnd"
  },
  {
    description: "Apareces sin conexion aunque sigues dentro.",
    icon: "profile",
    label: "Invisible",
    value: "invisible"
  }
];

function currentStatusLabel(status) {
  switch (status) {
    case "online":
      return "En linea";
    case "idle":
      return "Inactivo";
    case "dnd":
      return "No molestar";
    case "invisible":
      return "Invisible";
    default:
      return "Offline";
  }
}

function relationshipAction(profile, handlers) {
  if (!profile) {
    return {
      action: () => {},
      disabled: true,
      label: "Enviar solicitud de amigo",
      visible: true
    };
  }

  if (profile.isFriend) {
    return {
      action: null,
      disabled: true,
      label: "Amigos",
      visible: false
    };
  }

  if (profile.friendRequestState === "received") {
    return {
      action: () => handlers.onAcceptFriendRequest?.(profile),
      disabled: false,
      label: "Aceptar solicitud",
      visible: true
    };
  }

  if (profile.friendRequestState === "sent") {
    return {
      action: () => {},
      disabled: true,
      label: "Enviado",
      visible: true
    };
  }

  return {
    action: () => handlers.onAddFriend?.(profile),
    disabled: false,
    label: "Enviar solicitud de amigo",
    visible: true
  };
}

export function UserProfileCard({
  card,
  onAcceptFriendRequest,
  onAddFriend,
  onBlockUser,
  onCancelFriendRequest,
  onChangeStatus,
  onClose,
  onOpenDm,
  onRemoveFriend,
  onReportUser,
  onSendDm,
  onOpenSelfProfile,
  onShowNotice
}) {
  const cardRef = useRef(null);
  const [position, setPosition] = useState(() => getPosition(card?.anchorRect));
  const [copyMessage, setCopyMessage] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [messageBusy, setMessageBusy] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  if (!card) {
    return null;
  }

  const profile = card.profile;
  const bannerStyle = buildBannerStyle(profile);
  const friendAction = relationshipAction(profile, {
    onAcceptFriendRequest,
    onAddFriend,
    onCancelFriendRequest,
    onShowNotice
  });

  useEffect(() => {
    setCopyMessage("");
    setMessageDraft("");
    setMessageBusy(false);
    setStatusMenuOpen(false);
  }, [card?.profile?.id]);

  useLayoutEffect(() => {
    if (!card?.anchorRect || !cardRef.current) {
      return;
    }

    function updatePosition() {
      const rect = cardRef.current?.getBoundingClientRect();
      const next = getPosition(card.anchorRect, rect?.height || 456);
      setPosition((previous) =>
        previous.left === next.left && previous.top === next.top ? previous : next
      );
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [card?.anchorRect, card?.profile?.id, statusMenuOpen]);

  useEffect(() => {
    if (!copyMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setCopyMessage("");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [copyMessage]);

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopyMessage("ID copiado.");
    } catch {
      setCopyMessage("No se pudo copiar el ID.");
    }
  }

  async function handleDirectMessageSubmit(event) {
    event.preventDefault();

    if (!onSendDm || !messageDraft.trim() || messageBusy) {
      return;
    }

    setMessageBusy(true);
    try {
      await onSendDm(profile, messageDraft);
      setMessageDraft("");
    } finally {
      setMessageBusy(false);
    }
  }

  return (
    <div className="profile-popover-layer" onClick={onClose}>
      <aside
        className="user-profile-card"
        onClick={(event) => event.stopPropagation()}
        ref={cardRef}
        style={position}
      >
        <div className="user-profile-banner" style={bannerStyle} />

        <div className="user-profile-body">
          <div className="user-profile-avatar-wrap">
            <Avatar
              hue={profile.avatarHue}
              label={profile.displayName || profile.username}
              size={82}
              src={profile.avatarUrl}
              status={profile.status}
            />
            {profile.customStatus ? (
              <span className="user-profile-status-bubble">{profile.customStatus}</span>
            ) : null}
          </div>

          <div className="user-profile-title">
            <div>
              <h3 style={profile.roleColor ? { color: profile.roleColor } : undefined}>
                {profile.displayName}
              </h3>
              <p className="user-profile-subline">
                {profile.username}
                {profile.discriminator ? ` #${profile.discriminator}` : ""}
              </p>
            </div>
            {profile.isCurrentUser ? (
              <span className="user-profile-badge">TU</span>
            ) : null}
          </div>

          <div className="user-profile-chip-row">
            <span className="user-profile-chip">{statusLabel(profile.status)}</span>
          </div>

          {profile.serverRole ? (
            <section className="user-profile-section user-profile-role-section">
              <h4>Rol en este servidor</h4>
              <div className="user-profile-role-card">
                <div
                  className="user-profile-role-icon"
                  style={
                    profile.serverRole.color
                      ? { "--profile-role-color": profile.serverRole.color }
                      : undefined
                  }
                >
                  {profile.serverRole.iconUrl ? (
                    <img
                      alt={profile.serverRole.name}
                      src={resolveAssetUrl(profile.serverRole.iconUrl)}
                    />
                  ) : profile.serverRole.icon ? (
                    <span>{profile.serverRole.icon}</span>
                  ) : (
                    <Icon name="sparkles" size={16} />
                  )}
                </div>
                <div className="user-profile-role-copy">
                  <strong
                    style={profile.serverRole.color ? { color: profile.serverRole.color } : undefined}
                  >
                    {profile.serverRole.name}
                  </strong>
                  <small>{profile.serverRole.scope}</small>
                </div>
              </div>
            </section>
          ) : null}

          <div className="user-profile-meta user-profile-meta-grid">
            {profile.sharedGuildCount ? (
              <div className="user-profile-meta-card">
                <strong>{profile.sharedGuildCount}</strong>
                <span>servidores en comun</span>
              </div>
            ) : null}
            {profile.sharedDmCount ? (
              <div className="user-profile-meta-card">
                <strong>{profile.sharedDmCount}</strong>
                <span>DM visibles</span>
              </div>
            ) : null}
          </div>

          {profile.sharedGuilds?.length ? (
            <section className="user-profile-section">
              <h4>Servidores en comun</h4>
              <div className="user-profile-chip-row">
                {profile.sharedGuilds.slice(0, 3).map((guild) => (
                  <span className="user-profile-chip accent" key={guild.id}>
                    {guild.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {profile.authProvider || profile.connections?.length ? (
            <section className="user-profile-section">
              <h4>Conexiones</h4>
              <div className="user-profile-chip-row">
                {profile.authProvider ? (
                  <span className="user-profile-chip muted">
                    {String(profile.authProvider).toUpperCase()}
                  </span>
                ) : null}
                {profile.connections?.slice(0, 2).map((connection) => (
                  connection.href ? (
                    <a
                      className="user-profile-chip user-profile-chip-link muted"
                      href={connection.href}
                      key={connection.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {connection.label}
                    </a>
                  ) : (
                    <span className="user-profile-chip muted" key={connection.id}>
                      {connection.label}
                    </span>
                  )
                ))}
              </div>
            </section>
          ) : null}

          <section className="user-profile-section">
            <h4>Acerca de mi</h4>
            <p>{profile.bio || "Sin bio todavia."}</p>
          </section>

          <section className="user-profile-section">
            <h4>Actividad</h4>
            <p>{profile.customStatus || "Sin estado personalizado por ahora."}</p>
          </section>

          <div className="user-profile-action-row">
            {profile.isCurrentUser ? (
              <button className="primary-button" onClick={onOpenSelfProfile} type="button">
                <Icon name="edit" />
                <span>Editar perfil</span>
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={() => onOpenDm(profile)}
                type="button"
              >
                <Icon name="mail" />
                <span>Mensaje directo</span>
              </button>
            )}
            <button
              aria-label="Cerrar perfil"
              className="ghost-button icon-only"
              onClick={onClose}
              title="Cerrar"
              type="button"
            >
              <Icon name="close" />
            </button>
          </div>

          {profile.isCurrentUser ? (
            <>
              <button
                className="user-profile-status-trigger"
                onClick={() => setStatusMenuOpen((previous) => !previous)}
                type="button"
              >
                <span className="user-profile-status-main">
                  <span className={`user-profile-status-dot ${profile.status}`} />
                  <span>
                    <strong>{currentStatusLabel(profile.status)}</strong>
                    <small>{profile.customStatus || "Sin estado personalizado."}</small>
                  </span>
                </span>
                <Icon name="chevronDown" size={16} />
              </button>

              {statusMenuOpen ? (
                <div className="user-profile-status-menu">
                  {STATUS_MENU_OPTIONS.map((item) => (
                    <button
                      className={`user-profile-status-option ${
                        profile.status === item.value ? "active" : ""
                      }`}
                      key={item.value}
                      onClick={async () => {
                        await onChangeStatus(item.value);
                        setStatusMenuOpen(false);
                      }}
                      type="button"
                    >
                      <span className={`user-profile-status-dot ${item.value}`} />
                      <span className="user-profile-status-option-copy">
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <Icon name="arrowRight" size={14} />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="user-profile-utility-list">
                <button className="user-profile-utility-row" onClick={onOpenSelfProfile} type="button">
                  <span className="user-profile-utility-copy">
                    <Icon name="profile" />
                    <span>Cambiar cuentas</span>
                  </span>
                  <Icon name="arrowRight" size={14} />
                </button>
                <button className="user-profile-utility-row" onClick={handleCopyId} type="button">
                  <span className="user-profile-utility-copy">
                    <Icon name="server" />
                    <span>{copyMessage || "Copiar ID del usuario"}</span>
                  </span>
                  <Icon name="arrowRight" size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="user-profile-action-row">
                {friendAction.visible ? (
                  <button
                    className="ghost-button"
                    disabled={friendAction.disabled}
                    onClick={friendAction.action}
                    type="button"
                  >
                    <Icon name="userAdd" />
                    <span>{friendAction.label}</span>
                  </button>
                ) : null}
                {profile.isFriend ? (
                  <button className="ghost-button danger" onClick={() => onRemoveFriend?.(profile)} type="button">
                    <span>Eliminar</span>
                  </button>
                ) : null}
              </div>

              <form className="user-profile-message-box" onSubmit={handleDirectMessageSubmit}>
                <input
                  className="user-profile-message-input"
                  disabled={messageBusy}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder={`Enviar un mensaje a @${profile.username}`}
                  type="text"
                  value={messageDraft}
                />
                <button
                  aria-label="Bloquear usuario"
                  className="user-profile-message-icon ghost-button icon-only"
                  onClick={() => onBlockUser?.(profile)}
                  type="button"
                >
                  <Icon name="close" size={16} />
                </button>
                <button
                  aria-label="Denunciar perfil"
                  className="user-profile-message-icon ghost-button icon-only"
                  onClick={() => onReportUser?.(profile, "perfil")}
                  type="button"
                >
                  <Icon name="flag" size={16} />
                </button>
                <button
                  aria-label="Enviar mensaje"
                  className="user-profile-message-icon ghost-button icon-only"
                  disabled={!messageDraft.trim() || messageBusy}
                  type="submit"
                >
                  <Icon name="emoji" size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
