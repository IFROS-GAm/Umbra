import React, { useEffect, useMemo, useState } from "react";

import { resolveAssetUrl } from "../api.js";
import { Avatar } from "./Avatar.jsx";
import { Icon } from "./Icon.jsx";

const CARD_WIDTH = 340;
const CARD_GAP = 14;
const CARD_MARGIN = 16;
const CARD_HEIGHT_ESTIMATE = 456;

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

function getPosition(anchorRect) {
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

  const maxTop = Math.max(CARD_MARGIN, window.innerHeight - CARD_HEIGHT_ESTIMATE - CARD_MARGIN);
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

export function UserProfileCard({
  card,
  onChangeStatus,
  onClose,
  onOpenDm,
  onOpenSelfProfile
}) {
  const position = useMemo(() => getPosition(card?.anchorRect), [card?.anchorRect]);
  const [copyMessage, setCopyMessage] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  if (!card) {
    return null;
  }

  const profile = card.profile;
  const bannerStyle = buildBannerStyle(profile);

  useEffect(() => {
    setCopyMessage("");
    setStatusMenuOpen(false);
  }, [card?.profile?.id]);

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

  return (
    <div className="profile-popover-layer" onClick={onClose}>
      <aside
        className="user-profile-card"
        onClick={(event) => event.stopPropagation()}
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
            {profile.primaryTag ? (
              <span
                className="user-profile-chip accent"
                style={
                  profile.roleColor
                    ? {
                        borderColor: `${profile.roleColor}66`,
                        color: profile.roleColor
                      }
                    : undefined
                }
              >
                {profile.primaryTag}
              </span>
            ) : null}
            {profile.authProvider ? (
              <span className="user-profile-chip muted">
                {String(profile.authProvider).toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="user-profile-meta">
            {profile.sharedGuildCount ? (
              <span>{profile.sharedGuildCount} servidores en comun</span>
            ) : null}
            {profile.sharedDmCount ? <span>{profile.sharedDmCount} DM visibles</span> : null}
          </div>

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
            <button className="user-profile-message-box" onClick={() => onOpenDm(profile)} type="button">
              <Icon name="mail" />
              <span>Enviar un mensaje a @{profile.username}</span>
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
