import React, { useEffect, useRef, useState } from "react";

import { resolveAssetUrl } from "../../../api.js";
import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";
import {
  formatGroupDmCreatorLabel,
  resolveGroupDmCreator
} from "../shared/workspaceHelpers.js";

function buildBannerStyle(profile) {
  if (profile?.profileBannerUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.56)), url("${resolveAssetUrl(profile.profileBannerUrl)}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  if (profile?.profileColor) {
    return {
      background: `linear-gradient(135deg, ${profile.profileColor}, hsl(${(profile.avatarHue + 42) % 360} 20% 20%))`
    };
  }

  return {
    background: `linear-gradient(135deg, hsl(${profile?.avatarHue || 220} 32% 34%), hsl(${((profile?.avatarHue || 220) + 42) % 360} 24% 18%))`
  };
}

function GuildIconChip({ guild }) {
  const iconUrl = resolveAssetUrl(guild?.iconUrl);

  return (
    <span className="dm-guild-chip-avatar" title={guild?.name}>
      {iconUrl ? (
        <img alt={guild?.name} src={iconUrl} />
      ) : (
        (guild?.name || "?").slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function SharedListSection({ children, defaultOpen = true, title }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="dm-sidebar-section dm-sidebar-section-collapsible">
      <button
        className="dm-sidebar-section-toggle"
        onClick={() => setOpen((previous) => !previous)}
        type="button"
      >
        <span>{title}</span>
        <Icon className={open ? "is-open" : ""} name="chevronDown" size={16} />
      </button>
      {open ? <div className="dm-sidebar-shared-list">{children}</div> : null}
    </section>
  );
}

function MoreActionsMenu({
  onBlockUser,
  onClose,
  onCopyId,
  onReportUser,
  onShowNotice,
  profile
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handlePointer(event) {
      if (!menuRef.current?.contains(event.target)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [onClose]);

  return (
    <div className="dm-sidebar-more-menu" ref={menuRef}>
      <button
        className="dm-sidebar-more-item"
        onClick={() => onShowNotice?.("Las invitaciones directas llegan en una siguiente pasada.")}
        type="button"
      >
        <span>Invitar al servidor</span>
        <Icon name="arrowRight" size={15} />
      </button>
      <button
        className="dm-sidebar-more-item"
        onClick={() => onShowNotice?.("Ignorar llegara conectado a una siguiente pasada.")}
        type="button"
      >
        <span>Ignorar</span>
      </button>
      <button
        className="dm-sidebar-more-item danger"
        onClick={() => {
          onClose();
          onBlockUser?.(profile);
        }}
        type="button"
      >
        <span>Bloquear</span>
      </button>
      <button
        className="dm-sidebar-more-item danger"
        onClick={() => {
          onClose();
          onReportUser?.(profile, "perfil");
        }}
        type="button"
      >
        <span>Denunciar perfil de usuario</span>
      </button>
      <button className="dm-sidebar-more-item" onClick={() => onCopyId?.(profile)} type="button">
        <span>Copiar ID del usuario</span>
        <span className="dm-sidebar-id-chip">ID</span>
      </button>
    </div>
  );
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

function buildGroupBannerStyle(group) {
  if (group?.icon_url) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.56)), url("${resolveAssetUrl(group.icon_url)}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  const creator = resolveGroupDmCreator(group);
  const hue = creator?.avatar_hue || 248;

  return {
    background: `linear-gradient(135deg, hsl(${hue} 48% 42%), hsl(${(hue + 40) % 360} 26% 18%))`
  };
}

function formatGroupCreatedLabel(isoDate) {
  if (!isoDate) {
    return "";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(isoDate));
}

export function DirectMessageHero({
  onAcceptFriendRequest,
  onAddFriend,
  onBlockUser,
  onCancelFriendRequest,
  onOpenProfileCard,
  onQuickMessage,
  onReportUser,
  onShowNotice,
  profile
}) {
  if (!profile) {
    return null;
  }

  const friendAction = relationshipAction(profile, {
    onAcceptFriendRequest,
    onAddFriend,
    onCancelFriendRequest,
    onShowNotice
  });

  return (
    <section className="dm-hero">
      <button
        className="dm-hero-avatar"
        onClick={(event) => onOpenProfileCard?.(event, profile, profile.displayName)}
        type="button"
      >
        <Avatar
          hue={profile.avatarHue}
          label={profile.displayName || profile.username}
          size={96}
          src={profile.avatarUrl}
          status={profile.status}
        />
      </button>

      <div className="dm-hero-copy">
        <h2>{profile.displayName}</h2>
        <p className="dm-hero-handle">@{profile.username}</p>
        <p className="dm-hero-blurb">
          Este es el inicio de tu historial de mensajes directos con {profile.displayName}.
        </p>

        <div className="dm-hero-meta">
          {profile.sharedGuilds?.length ? (
            <div className="dm-hero-meta-block">
              <div className="dm-hero-server-avatars">
                {profile.sharedGuilds.slice(0, 4).map((guild) => (
                  <GuildIconChip guild={guild} key={guild.id} />
                ))}
              </div>
              <span>{profile.sharedGuildCount || 0} servidores en comun</span>
            </div>
          ) : (
            <span>No hay servidores en comun</span>
          )}
        </div>

        <div className="dm-hero-actions">
          {friendAction.visible ? (
            <button
              className="primary-button dm-hero-button"
              disabled={friendAction.disabled}
              onClick={friendAction.action}
              type="button"
            >
              <span>{friendAction.label}</span>
            </button>
          ) : null}
          <button
            className="ghost-button dm-hero-button"
            onClick={() => onBlockUser?.(profile)}
            type="button"
          >
            <span>Bloquear</span>
          </button>
          <button
            className="ghost-button danger dm-hero-button danger-fill"
            onClick={() => onReportUser?.(profile, "spam")}
            type="button"
          >
            <span>Denunciar spam</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function GroupDirectSidebar({
  currentUserId,
  group,
  onEditGroup,
  onInvitePeople,
  onOpenProfileCard
}) {
  if (!group) {
    return null;
  }

  const creator = resolveGroupDmCreator(group);
  const creatorLabel = formatGroupDmCreatorLabel(group, currentUserId) || "Grupo directo";
  const createdAtLabel = formatGroupCreatedLabel(group.created_at);
  const memberCount = group.participants?.length || 0;
  const displayName = group.display_name || group.name || "Grupo directo";
  const isFullGroup = memberCount >= 10;

  return (
    <aside className="dm-sidebar-card">
      <div className="dm-sidebar-banner" style={buildGroupBannerStyle(group)} />

      <div className="dm-sidebar-body">
        <button
          className="dm-sidebar-avatar"
          onClick={() => onEditGroup?.(group)}
          type="button"
        >
          <Avatar
            hue={creator?.avatar_hue || 248}
            label={displayName}
            size={94}
            src={group.icon_url || ""}
          />
        </button>

        <div className="dm-sidebar-title">
          <h3>{displayName}</h3>
          <p>{creatorLabel}</p>
        </div>

        <div className="dm-sidebar-chips">
          <span className="user-profile-chip">{memberCount} miembros</span>
          {group.icon_url ? (
            <span className="user-profile-chip muted">Foto personalizada</span>
          ) : (
            <span className="user-profile-chip muted">Avatar automatico</span>
          )}
        </div>

        <section className="dm-sidebar-section">
          <h4>Gestion</h4>
          <div className="dm-sidebar-list">
            <p>Cambia el nombre, actualiza la foto del grupo o suma amistades nuevas sin recrearlo.</p>
          </div>
          <div className="dm-sidebar-action-row">
            <button className="ghost-button dm-sidebar-inline-button" onClick={() => onEditGroup?.(group)} type="button">
              <Icon name="edit" size={16} />
              <span>Editar grupo</span>
            </button>
            <button
              className="primary-button dm-sidebar-inline-button"
              disabled={isFullGroup}
              onClick={() => onInvitePeople?.(group)}
              type="button"
            >
              <Icon name="userAdd" size={16} />
              <span>Invitar personas</span>
            </button>
          </div>
          {isFullGroup ? (
            <div className="dm-sidebar-subsection">
              <p>Este grupo ya alcanzo el maximo de 10 personas.</p>
            </div>
          ) : null}
        </section>

        <section className="dm-sidebar-section">
          <h4>Detalles</h4>
          <div className="dm-sidebar-list">
            <p>{creator ? creatorLabel : "El creador original no esta visible ahora mismo."}</p>
            {createdAtLabel ? <p>Creado el {createdAtLabel}.</p> : null}
          </div>
        </section>

        <SharedListSection defaultOpen title={`Participantes - ${memberCount}`}>
          {(group.participants || []).map((participant) => (
            <button
              className="dm-sidebar-shared-row"
              key={participant.id}
              onClick={(event) =>
                onOpenProfileCard?.(
                  event,
                  participant,
                  participant.display_name || participant.username
                )
              }
              type="button"
            >
              <Avatar
                hue={participant.avatar_hue}
                label={participant.display_name || participant.username}
                size={28}
                src={participant.avatar_url}
                status={participant.status}
              />
              <div className="dm-sidebar-shared-copy">
                <span>{participant.display_name || participant.username}</span>
                <small>
                  {participant.id === currentUserId
                    ? "Tu"
                    : participant.id === group.created_by
                      ? "Creador del grupo"
                      : participant.custom_status || participant.status || `@${participant.username}`}
                </small>
              </div>
            </button>
          ))}
        </SharedListSection>
      </div>
    </aside>
  );
}

export function DirectMessageSidebar({
  onAcceptFriendRequest,
  onAddFriend,
  onBlockUser,
  onCancelFriendRequest,
  onCopyId,
  onOpenFullProfile,
  onOpenProfileCard,
  onRemoveFriend,
  onReportUser,
  onShowNotice,
  profile
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!profile) {
    return null;
  }

  const sharedGuildPreview = (profile.sharedGuilds || []).slice(0, 6);
  const commonFriends = profile.commonFriends || [];
  const friendAction = relationshipAction(profile, {
    onAcceptFriendRequest,
    onAddFriend,
    onCancelFriendRequest,
    onShowNotice
  });

  return (
    <aside className="dm-sidebar-card">
      <div className="dm-sidebar-banner" style={buildBannerStyle(profile)} />

      <div className="dm-sidebar-body">
        <div className="dm-sidebar-actions">
          {friendAction.visible ? (
            <button
              aria-label={friendAction.label}
              className="ghost-button icon-only dm-sidebar-round"
              disabled={friendAction.disabled}
              onClick={friendAction.action}
              type="button"
            >
              <Icon name="userAdd" />
            </button>
          ) : null}
          <button
            aria-label="Mas acciones"
            className="ghost-button icon-only dm-sidebar-round"
            onClick={() => setMenuOpen((previous) => !previous)}
            type="button"
          >
            <Icon name="more" />
          </button>
          {menuOpen ? (
            <MoreActionsMenu
              onBlockUser={onBlockUser}
              onClose={() => setMenuOpen(false)}
              onCopyId={onCopyId}
              onReportUser={onReportUser}
              onShowNotice={onShowNotice}
              profile={profile}
            />
          ) : null}
        </div>

        <button
          className="dm-sidebar-avatar"
          onClick={(event) => onOpenProfileCard?.(event, profile, profile.displayName)}
          type="button"
        >
          <Avatar
            hue={profile.avatarHue}
            label={profile.displayName || profile.username}
            size={94}
            src={profile.avatarUrl}
            status={profile.status}
          />
        </button>

        {profile.customStatus ? (
          <span className="dm-sidebar-status-bubble">{profile.customStatus}</span>
        ) : null}

        <div className="dm-sidebar-title">
          <h3>{profile.displayName}</h3>
          <p>
            @{profile.username}
            {profile.pronouns ? ` - ${profile.pronouns}` : ""}
          </p>
        </div>

        <div className="dm-sidebar-chips">
          {profile.primaryTag ? <span className="user-profile-chip muted">{profile.primaryTag}</span> : null}
          {profile.statusLabel ? <span className="user-profile-chip">{profile.statusLabel}</span> : null}
          {profile.authProvider ? (
            <span className="user-profile-chip muted">{String(profile.authProvider).toUpperCase()}</span>
          ) : null}
        </div>

        <section className="dm-sidebar-section">
          <h4>Informacion</h4>
          <div className="dm-sidebar-list">
            {profile.infoLines?.length ? (
              profile.infoLines.map((line, index) => (
                <p key={`${profile.id}-info-${index}`}>{line}</p>
              ))
            ) : (
              <p>{profile.bio || "Sin info visible por ahora."}</p>
            )}
          </div>
          <div className="dm-sidebar-subsection">
            <h4>Miembro desde</h4>
            <p>{profile.memberSinceLabel || "Sin fecha visible por ahora."}</p>
          </div>
        </section>

        {sharedGuildPreview.length ? (
          <SharedListSection
            defaultOpen
            title={`Servidores en comun - ${profile.sharedGuildCount}`}
          >
            {sharedGuildPreview.map((guild) => (
              <button
                className="dm-sidebar-shared-row"
                key={guild.id}
                onClick={() => onShowNotice?.(`Abrir ${guild.name} llega en una siguiente pasada.`)}
                type="button"
              >
                <GuildIconChip guild={guild} />
                <div className="dm-sidebar-shared-copy">
                  <span>{guild.name}</span>
                  <small>
                    {guild.memberCount ? `${guild.memberCount} miembros visibles` : "Servidor compartido"}
                  </small>
                </div>
              </button>
            ))}
          </SharedListSection>
        ) : null}

        {commonFriends.length ? (
          <SharedListSection
            defaultOpen={false}
            title={`Amigos en comun - ${commonFriends.length}`}
          >
            {commonFriends.map((friend) => (
              <button
                className="dm-sidebar-shared-row"
                key={friend.id}
                onClick={(event) =>
                  onOpenProfileCard?.(event, friend, friend.display_name || friend.username)
                }
                type="button"
              >
                <Avatar
                  hue={friend.avatar_hue}
                  label={friend.display_name || friend.username}
                  size={28}
                  src={friend.avatar_url}
                  status={friend.status}
                />
                <div className="dm-sidebar-shared-copy">
                  <span>{friend.display_name || friend.username}</span>
                  <small>{friend.custom_status || friend.status || "Offline"}</small>
                </div>
              </button>
            ))}
          </SharedListSection>
        ) : null}

        <button
          className="ghost-button dm-sidebar-profile-button"
          onClick={() => onOpenFullProfile?.(profile)}
          type="button"
        >
          <span>Ver perfil completo</span>
        </button>
        {profile.isFriend ? (
          <button
            className="ghost-button dm-sidebar-profile-button danger"
            onClick={() => onRemoveFriend?.(profile)}
            type="button"
          >
            <span>Eliminar amigo</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
