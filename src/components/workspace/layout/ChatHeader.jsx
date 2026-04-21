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
  directConversationVisual,
  directCallLayoutMode,
  directMessageProfile,
  headerActionsRef,
  headerPanel,
  headerPanelNode,
  headerSearchPlaceholder,
  isDirectCallActive,
  isDirectConversation,
  isDirectGroupConversation,
  membersPanelVisible,
  onAddFriend,
  onEditDirectGroup,
  onInviteDirectGroupMembers,
  onOpenDialog,
  onOpenInviteModal,
  onLeaveDirectCall,
  onSetDirectCallLayoutMode,
  onStartDirectCall,
  onStartDirectVideoCall,
  onShowNotice,
  onToggleDirectCallCamera,
  onToggleDirectCallMute,
  onToggleHeaderPanel,
  onToggleMembersPanel,
  subtitle,
  title,
  voiceState
}) {
  const directFriendAction = getDirectFriendAction(directMessageProfile);
  const groupDirectAvatar =
    !directMessageProfile && isDirectGroupConversation
      ? {
          avatarHue: directConversationVisual?.avatarHue || 248,
          avatarUrl: directConversationVisual?.avatarUrl || "",
          label: activeChannel?.display_name || title
        }
      : null;

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
          ) : groupDirectAvatar ? (
            <Avatar
              hue={groupDirectAvatar.avatarHue}
              label={groupDirectAvatar.label}
              size={28}
              src={groupDirectAvatar.avatarUrl}
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
                {isDirectCallActive && !isDirectGroupConversation ? (
                  <>
                    <span className="chat-header-call-pill">
                      <Icon name="phone" size={14} />
                      <strong>En llamada</strong>
                    </span>
                    <div className="chat-header-call-layout-switch">
                      <button
                        aria-label="Vista mixta"
                        className={`ghost-button icon-only tooltip-anchor ${
                          directCallLayoutMode === "split" ? "active" : ""
                        }`.trim()}
                        data-tooltip="Vista mixta"
                        data-tooltip-position="bottom"
                        onClick={() => onSetDirectCallLayoutMode?.("split")}
                        type="button"
                      >
                        <Icon name="appGrid" size={16} />
                      </button>
                      <button
                        aria-label="Solo llamada"
                        className={`ghost-button icon-only tooltip-anchor ${
                          directCallLayoutMode === "call" ? "active" : ""
                        }`.trim()}
                        data-tooltip="Solo llamada"
                        data-tooltip-position="bottom"
                        onClick={() => onSetDirectCallLayoutMode?.("call")}
                        type="button"
                      >
                        <Icon name="phone" size={16} />
                      </button>
                      <button
                        aria-label="Solo chat"
                        className={`ghost-button icon-only tooltip-anchor ${
                          directCallLayoutMode === "chat" ? "active" : ""
                        }`.trim()}
                        data-tooltip="Solo chat"
                        data-tooltip-position="bottom"
                        onClick={() => onSetDirectCallLayoutMode?.("chat")}
                        type="button"
                      >
                        <Icon name="mail" size={16} />
                      </button>
                    </div>
                    <button
                      aria-label={voiceState?.micMuted ? "Activar microfono" : "Silenciar"}
                      className={`ghost-button icon-only tooltip-anchor ${
                        voiceState?.micMuted ? "danger active" : ""
                      }`.trim()}
                      data-tooltip={voiceState?.micMuted ? "Activar microfono" : "Silenciar"}
                      data-tooltip-position="bottom"
                      onClick={() => onToggleDirectCallMute?.()}
                      type="button"
                    >
                      <Icon name={voiceState?.micMuted ? "micOff" : "mic"} />
                    </button>
                    <button
                      aria-label={voiceState?.cameraEnabled ? "Apagar camara" : "Encender camara"}
                      className={`ghost-button icon-only tooltip-anchor ${
                        voiceState?.cameraEnabled ? "active" : ""
                      }`.trim()}
                      data-tooltip={
                        voiceState?.cameraEnabled ? "Apagar camara" : "Encender camara"
                      }
                      data-tooltip-position="bottom"
                      onClick={() => onToggleDirectCallCamera?.()}
                      type="button"
                    >
                      <Icon name="camera" />
                    </button>
                    <button
                      aria-label="Salir de la llamada"
                      className="ghost-button icon-only danger tooltip-anchor"
                      data-tooltip="Salir de la llamada"
                      data-tooltip-position="bottom"
                      onClick={() => onLeaveDirectCall?.()}
                      type="button"
                    >
                      <Icon name="close" />
                    </button>
                  </>
                ) : (
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
                  </>
                )}
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
                {isDirectGroupConversation ? (
                  <>
                    <button
                      aria-label="Invitar personas"
                      className="ghost-button icon-only tooltip-anchor"
                      data-tooltip="Invitar personas"
                      data-tooltip-position="bottom"
                      onClick={() => onInviteDirectGroupMembers?.()}
                      type="button"
                    >
                      <Icon name="userAdd" />
                    </button>
                    <button
                      aria-label="Editar grupo"
                      className="ghost-button icon-only tooltip-anchor"
                      data-tooltip="Editar grupo"
                      data-tooltip-position="bottom"
                      onClick={() => onEditDirectGroup?.()}
                      type="button"
                    >
                      <Icon name="edit" />
                    </button>
                  </>
                ) : null}
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
