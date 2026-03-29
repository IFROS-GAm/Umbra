import React, { useMemo } from "react";

import { Avatar } from "./Avatar.jsx";

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
  if (profile.roleColor) {
    return {
      background: `linear-gradient(135deg, ${profile.roleColor}, hsl(${(profile.avatarHue + 36) % 360} 45% 18%))`
    };
  }

  return {
    background: `linear-gradient(135deg, hsl(${profile.avatarHue} 48% 34%), hsl(${(profile.avatarHue + 42) % 360} 42% 18%))`
  };
}

export function UserProfileCard({ card, onClose, onOpenDm, onOpenSelfProfile }) {
  const position = useMemo(() => getPosition(card?.anchorRect), [card?.anchorRect]);

  if (!card) {
    return null;
  }

  const profile = card.profile;
  const bannerStyle = buildBannerStyle(profile);

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
                Editar perfil
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={() => onOpenDm(profile)}
                type="button"
              >
                Mensaje directo
              </button>
            )}
            <button className="ghost-button" onClick={onClose} type="button">
              Cerrar
            </button>
          </div>

          {!profile.isCurrentUser ? (
            <button className="user-profile-message-box" onClick={() => onOpenDm(profile)} type="button">
              Enviar un mensaje a @{profile.username}
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
