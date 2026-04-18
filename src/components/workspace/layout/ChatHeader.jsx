import React from "react";

import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";

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
  activeChannel,
  canInvitePeople,
  directMessageProfile,
  headerActionsRef,
  headerPanel,
  headerPanelNode,
  headerSearchPlaceholder,
  isDirectConversation,
  isDirectGroupConversation,
  membersPanelVisible,
  onAddFriend,
  onOpenDialog,
  onOpenInviteModal,
  onStartDirectCall,
  onStartDirectVideoCall,
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
            {isDirectConversation ? (
              <>
                <button
                  aria-label="Llamada"
                  className="ghost-button icon-only tooltip-anchor"
                  data-tooltip="Llamar"
                  data-tooltip-position="bottom"
                  onClick={() => onStartDirectCall?.()}
                  type="button"
                >
                  <Icon name="phone" />
                </button>
                <button
                  aria-label="Videollamada"
                  className="ghost-button icon-only tooltip-anchor"
                  data-tooltip="Videollamada"
                  data-tooltip-position="bottom"
                  onClick={() => onStartDirectVideoCall?.()}
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
                {!isDirectGroupConversation && directFriendAction.visible ? (
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
                      ? isDirectGroupConversation
                        ? "Ocultar participantes"
                        : "Ocultar perfil"
                      : isDirectGroupConversation
                        ? "Mostrar participantes"
                        : "Mostrar perfil"
                  }
                  className={`ghost-button icon-only tooltip-anchor ${membersPanelVisible ? "active" : ""}`}
                  data-tooltip={
                    membersPanelVisible
                      ? isDirectGroupConversation
                        ? "Ocultar participantes"
                        : "Ocultar perfil"
                      : isDirectGroupConversation
                        ? "Mostrar participantes"
                        : "Mostrar perfil"
                  }
                  data-tooltip-position="bottom"
                  onClick={onToggleMembersPanel}
                  type="button"
                >
                  <Icon name={isDirectGroupConversation ? "community" : "profile"} />
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
                {canInvitePeople ? (
                  <button
                    aria-label="Invitar"
                    className="ghost-button icon-only tooltip-anchor"
                    data-tooltip="Invitar personas"
                    data-tooltip-position="bottom"
                    onClick={() => onOpenInviteModal?.()}
                    type="button"
                  >
                    <Icon name="userAdd" />
                  </button>
                ) : null}
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
