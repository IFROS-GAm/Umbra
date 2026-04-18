import React, { useEffect, useMemo, useState } from "react";

import { resolveAssetUrl } from "../../api.js";
import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

function buildBannerStyle(profile) {
  if (profile?.profileBannerUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.52)), url("${resolveAssetUrl(profile.profileBannerUrl)}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  if (profile?.profileColor) {
    return {
      background: `linear-gradient(135deg, ${profile.profileColor}, hsl(${(profile.avatarHue + 36) % 360} 22% 16%))`
    };
  }

  return {
    background: `linear-gradient(135deg, hsl(${profile?.avatarHue || 220} 28% 34%), hsl(${((profile?.avatarHue || 220) + 32) % 360} 24% 16%))`
  };
}

function connectionLabel(connection) {
  if (!connection) {
    return "";
  }

  if (connection.kind === "link") {
    return connection.label;
  }

  return connection.label;
}

function getRelationshipAction(profile, handlers) {
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

export function UserProfileModal({
  onAcceptFriendRequest,
  onAddFriend,
  onBlockUser,
  onCancelFriendRequest,
  onClose,
  onOpenDm,
  onRemoveFriend,
  onReportUser,
  onShowNotice,
  profile
}) {
  const [note, setNote] = useState("");

  const noteKey = useMemo(
    () => (profile?.id ? `umbra-profile-note-${profile.id}` : ""),
    [profile?.id]
  );

  useEffect(() => {
    if (!noteKey) {
      setNote("");
      return;
    }

    try {
      setNote(localStorage.getItem(noteKey) || "");
    } catch {
      setNote("");
    }
  }, [noteKey]);

  useEffect(() => {
    if (!noteKey) {
      return;
    }

    try {
      localStorage.setItem(noteKey, note);
    } catch {
      // Ignore local-only note persistence issues.
    }
  }, [note, noteKey]);

  if (!profile) {
    return null;
  }

  const bannerStyle = buildBannerStyle(profile);
  const relationshipAction = getRelationshipAction(profile, {
    onAcceptFriendRequest,
    onAddFriend,
    onCancelFriendRequest,
    onShowNotice
  });

  return (
    <div className="profile-detail-layer" onClick={onClose}>
      <section
        className="profile-detail-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="profile-detail-banner" style={bannerStyle} />

        <div className="profile-detail-content">
          <button
            aria-label="Cerrar perfil"
            className="ghost-button icon-only profile-detail-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>

          <div className="profile-detail-avatar-row">
            <Avatar
              hue={profile.avatarHue}
              label={profile.displayName || profile.username}
              size={122}
              src={profile.avatarUrl}
              status={profile.status}
            />
            {profile.customStatus ? (
              <span className="profile-detail-status-bubble">{profile.customStatus}</span>
            ) : null}
          </div>

          <div className="profile-detail-identity">
            <h2>{profile.displayName}</h2>
            <p>
              @{profile.username}
              {profile.pronouns ? ` - ${profile.pronouns}` : ""}
            </p>
          </div>

          <div className="profile-detail-chip-row">
            {profile.statusLabel ? <span className="user-profile-chip">{profile.statusLabel}</span> : null}
          </div>

          <div className="profile-detail-action-row">
            <button className="primary-button" onClick={() => onOpenDm?.(profile)} type="button">
              <Icon name="mail" />
              <span>Enviar mensaje</span>
            </button>
            {relationshipAction.visible ? (
              <button
                className="ghost-button"
                disabled={relationshipAction.disabled}
                onClick={relationshipAction.action}
                type="button"
              >
                <Icon name="userAdd" />
                <span>{relationshipAction.label}</span>
              </button>
            ) : null}
            <button className="ghost-button danger" onClick={() => onBlockUser?.(profile)} type="button">
              <span>Bloquear</span>
            </button>
          </div>

          <section className="profile-detail-section">
            <div className="profile-detail-about">
              {(profile.infoLines?.length ? profile.infoLines : [profile.bio || "Sin informacion adicional visible."]).map(
                (line, index) => (
                  <p key={`${profile.id}-about-${index}`}>{line}</p>
                )
              )}
            </div>
          </section>

          <section className="profile-detail-section">
            <h4>Miembro desde</h4>
            <p>{profile.memberSinceLabel || "Sin fecha visible por ahora."}</p>
          </section>

          {profile.serverRole ? (
            <section className="profile-detail-section">
              <h4>Rol en este servidor</h4>
              <div className="profile-detail-role-card">
                <span
                  className="profile-detail-role-icon"
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
                </span>
                <div className="profile-detail-role-copy">
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

          {profile.sharedGuilds?.length ? (
            <section className="profile-detail-section">
              <h4>Servidores en comun</h4>
              <div className="profile-detail-connections">
                {profile.sharedGuilds.map((guild) => (
                  <div className="profile-detail-connection" key={guild.id}>
                    <div className="profile-detail-connection-main">
                      <span className="profile-detail-connection-icon">
                        {guild.iconUrl ? (
                          <img alt={guild.name} src={resolveAssetUrl(guild.iconUrl)} />
                        ) : (
                          <Icon name="server" size={16} />
                        )}
                      </span>
                      <div className="profile-detail-connection-copy">
                        <strong>{guild.name}</strong>
                        <small>
                          {guild.joinedAtLabel
                            ? `Miembro desde ${guild.joinedAtLabel}`
                            : `${guild.memberCount} miembros visibles`}
                        </small>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {profile.authProvider || profile.connections?.length ? (
            <section className="profile-detail-section">
              <h4>Conexiones</h4>
              <div className="profile-detail-connections">
                {profile.authProvider ? (
                  <div className="profile-detail-connection" key="auth-provider">
                    <div className="profile-detail-connection-main">
                      <span className="profile-detail-connection-icon">
                        <Icon name="profile" size={16} />
                      </span>
                      <div className="profile-detail-connection-copy">
                        <strong>{String(profile.authProvider).toUpperCase()}</strong>
                        <small>Proveedor de acceso visible</small>
                      </div>
                    </div>
                  </div>
                ) : null}
                {profile.connections?.map((connection) => (
                  connection.kind === "link" && connection.href ? (
                    <a
                      className="profile-detail-connection profile-detail-connection-link"
                      href={connection.href}
                      key={connection.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <div className="profile-detail-connection-main">
                        <span className="profile-detail-connection-icon">
                          {connection.iconUrl ? (
                            <img alt={connection.label} src={resolveAssetUrl(connection.iconUrl)} />
                          ) : (
                            <Icon name="link" size={16} />
                          )}
                        </span>
                        <div className="profile-detail-connection-copy">
                          <strong>{connectionLabel(connection)}</strong>
                          {connection.meta ? <small>{connection.meta}</small> : null}
                        </div>
                      </div>
                      <Icon name="arrowRight" size={14} />
                    </a>
                  ) : (
                    <div className="profile-detail-connection" key={connection.id}>
                      <div className="profile-detail-connection-main">
                        <span className="profile-detail-connection-icon">
                          {connection.iconUrl ? (
                            <img alt={connection.label} src={resolveAssetUrl(connection.iconUrl)} />
                          ) : (
                            <Icon name="server" size={16} />
                          )}
                        </span>
                        <div className="profile-detail-connection-copy">
                          <strong>{connectionLabel(connection)}</strong>
                          {connection.meta ? <small>{connection.meta}</small> : null}
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </section>
          ) : null}

          <section className="profile-detail-section">
            <h4>Nota (solo visible para ti)</h4>
            <textarea
              className="profile-detail-note"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Escribe una nota privada sobre este perfil..."
              rows={3}
              value={note}
            />
          </section>

          <div className="profile-detail-action-row profile-detail-action-row-bottom">
            {profile.isFriend ? (
              <button className="ghost-button danger" onClick={() => onRemoveFriend?.(profile)} type="button">
                <span>Eliminar amigo</span>
              </button>
            ) : null}
            <button className="ghost-button danger" onClick={() => onReportUser?.(profile, "perfil")} type="button">
              <span>Denunciar perfil</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
