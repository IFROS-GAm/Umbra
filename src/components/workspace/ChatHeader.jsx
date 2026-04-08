import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

function getDirectFriendAction(profile) {
  if (!profile) {
    return {
      disabled: true,
      label: "Enviar solicitud de amigo",
      visible: true
    };
  }

  if (profile.isFriend) {
    return {
      disabled: true,
      label: "Ya son amigos",
      visible: false
    };
  }

  if (profile.friendRequestState === "received") {
    return {
      disabled: false,
      label: "Aceptar solicitud",
      visible: true
    };
  }

  if (profile.friendRequestState === "sent") {
    return {
      disabled: true,
      label: "Enviado",
      visible: true
    };
  }

  return {
    disabled: false,
    label: "Enviar solicitud de amigo",
    visible: true
  };
}

export function ChatHeader({
  directMessageProfile,
  headerActionsRef,
  headerPanel,
  headerPanelNode,
  headerSearchPlaceholder,
  membersPanelVisible,
  onAddFriend,
  onOpenDialog,
  onShowNotice,
  onToggleHeaderPanel,
  onToggleMembersPanel,
  subtitle,
  title
}) {
  const directFriendAction = getDirectFriendAction(directMessageProfile);

  return (
    <header className="chat-header">
      <div className="chat-title-block">
        {!directMessageProfile ? (
          <div className="chat-title-eyebrow">
            <span className="chat-title-sigil" />
            <small>{subtitle || "UMBRA CHANNEL"}</small>
          </div>
        ) : null}
        <div className="chat-title-line">
          {directMessageProfile ? (
            <Avatar
              hue={directMessageProfile.avatarHue}
              label={directMessageProfile.displayName || directMessageProfile.username}
              size={28}
              src={directMessageProfile.avatarUrl}
              status={directMessageProfile.status}
            />
          ) : null}
          <h1>{title}</h1>
        </div>
      </div>

      <div className="chat-header-tools">
        <div className="chat-header-actions-shell">
          <div className="chat-header-tool-cluster" ref={headerActionsRef}>
            {directMessageProfile ? (
              <>
                <button
                  aria-label="Llamada"
                  className="ghost-button icon-only tooltip-anchor"
                  data-tooltip="Llamar"
                  data-tooltip-position="bottom"
                  onClick={() => onShowNotice?.("Las llamadas directas llegan en una siguiente pasada.")}
                  type="button"
                >
                  <Icon name="phone" />
                </button>
                <button
                  aria-label="Videollamada"
                  className="ghost-button icon-only tooltip-anchor"
                  data-tooltip="Videollamada"
                  data-tooltip-position="bottom"
                  onClick={() =>
                    onShowNotice?.("Las videollamadas directas llegan en una siguiente pasada.")
                  }
                  type="button"
                >
                  <Icon name="camera" />
                </button>
                <button
                  aria-label="Fijados"
                  className={`ghost-button icon-only tooltip-anchor ${headerPanel === "pins" ? "active" : ""}`}
                  data-tooltip="Mensajes fijados"
                  data-tooltip-position="bottom"
                  onClick={() => onToggleHeaderPanel("pins")}
                  type="button"
                >
                  <Icon name="pin" />
                </button>
                {directFriendAction.visible ? (
                  <button
                    aria-label={directFriendAction.label}
                    className="ghost-button icon-only tooltip-anchor"
                    data-tooltip={directFriendAction.label}
                    data-tooltip-position="bottom"
                    disabled={directFriendAction.disabled}
                    onClick={() => onAddFriend?.(directMessageProfile)}
                    type="button"
                  >
                    <Icon name="userAdd" />
                  </button>
                ) : null}
                <button
                  aria-label={
                    membersPanelVisible
                      ? "Ocultar perfil"
                      : "Mostrar perfil"
                  }
                  className={`ghost-button icon-only tooltip-anchor ${membersPanelVisible ? "active" : ""}`}
                  data-tooltip={
                    membersPanelVisible
                      ? "Ocultar perfil"
                      : "Mostrar perfil"
                  }
                  data-tooltip-position="bottom"
                  onClick={onToggleMembersPanel}
                  type="button"
                >
                  <Icon name="profile" />
                </button>
              </>
            ) : (
              <>
                <button
                  aria-label="Hilos"
                  className={`ghost-button icon-only tooltip-anchor ${headerPanel === "threads" ? "active" : ""}`}
                  data-tooltip="Hilos"
                  data-tooltip-position="bottom"
                  onClick={() => onToggleHeaderPanel("threads")}
                  type="button"
                >
                  <Icon name="threads" />
                </button>
                <button
                  aria-label="Notificaciones"
                  className={`ghost-button icon-only tooltip-anchor ${headerPanel === "notifications" ? "active" : ""}`}
                  data-tooltip="Notificaciones"
                  data-tooltip-position="bottom"
                  onClick={() => onToggleHeaderPanel("notifications")}
                  type="button"
                >
                  <Icon name="bell" />
                </button>
                <button
                  aria-label="Fijados"
                  className={`ghost-button icon-only tooltip-anchor ${headerPanel === "pins" ? "active" : ""}`}
                  data-tooltip="Fijados"
                  data-tooltip-position="bottom"
                  onClick={() => onToggleHeaderPanel("pins")}
                  type="button"
                >
                  <Icon name="pin" />
                </button>
                <button
                  aria-label="Invitar"
                  className="ghost-button icon-only tooltip-anchor"
                  data-tooltip="Invitar personas"
                  data-tooltip-position="bottom"
                  onClick={() => onOpenDialog("dm")}
                  type="button"
                >
                  <Icon name="userAdd" />
                </button>
                <button
                  aria-label={
                    membersPanelVisible
                      ? "Ocultar la lista de miembros"
                      : "Mostrar la lista de miembros"
                  }
                  className={`ghost-button icon-only tooltip-anchor ${membersPanelVisible ? "active" : ""}`}
                  data-tooltip={
                    membersPanelVisible
                      ? "Ocultar la lista de miembros"
                      : "Mostrar la lista de miembros"
                  }
                  data-tooltip-position="bottom"
                  onClick={onToggleMembersPanel}
                  type="button"
                >
                  <Icon name="community" />
                </button>
              </>
            )}
          </div>

          <label className="chat-search">
            <Icon name="search" />
            <input placeholder={headerSearchPlaceholder} type="text" />
          </label>

          {headerPanelNode}
        </div>
      </div>
    </header>
  );
}
