import React from "react";

import { Icon } from "../../Icon.jsx";

export function ChatHeaderPanel({ headerPanel, headerPanelRef }) {
  if (headerPanel === "threads") {
    return (
      <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
        <div className="header-panel-title">
          <Icon name="threads" size={18} />
          <strong>Hilos</strong>
        </div>
        <div className="header-empty-state">
          <Icon name="threads" size={34} />
          <strong>No hay hilos activos.</strong>
          <span>Cuando abras o sigas hilos en este canal apareceran aqui.</span>
        </div>
      </div>
    );
  }

  if (headerPanel === "notifications") {
    return (
      <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
        <div className="header-notification-menu">
          <button className="header-menu-row" type="button">
            <span>
              <strong>Silenciar canal</strong>
            </span>
            <Icon name="arrowRight" size={16} />
          </button>
          <div className="header-menu-divider" />
          <div className="header-menu-choice active">
            <span>
              <strong>Usar la categoria predeterminada</strong>
              <small>Todos los mensajes</small>
            </span>
            <i />
          </div>
          <div className="header-menu-choice">
            <span>
              <strong>Todos los mensajes</strong>
            </span>
            <i />
          </div>
          <div className="header-menu-choice">
            <span>
              <strong>Solo @mentions</strong>
            </span>
            <i />
          </div>
          <div className="header-menu-choice">
            <span>
              <strong>Nada</strong>
            </span>
            <i />
          </div>
        </div>
      </div>
    );
  }

  if (headerPanel === "pins") {
    return (
      <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
        <div className="header-panel-title">
          <Icon name="pin" size={18} />
          <strong>Mensajes fijados</strong>
        </div>
        <div className="header-empty-state pins-empty-state">
          <Icon name="pin" size={38} />
          <strong>Este canal no tiene ningun mensaje fijado.</strong>
          <span>Cuando fijes mensajes desde el chat, Umbra los mostrara aqui.</span>
        </div>
      </div>
    );
  }

  return null;
}
