import React from "react";

import { Icon } from "../Icon.jsx";

export function ChatHeader({
  headerActionsRef,
  headerPanel,
  headerPanelNode,
  headerSearchPlaceholder,
  membersPanelVisible,
  onOpenDialog,
  onToggleHeaderPanel,
  onToggleMembersPanel,
  title
}) {
  return (
    <header className="chat-header">
      <div className="chat-title-block">
        <div className="chat-title-line">
          <h1>{title}</h1>
        </div>
      </div>

      <div className="chat-header-tools">
        <div className="chat-header-actions-shell">
          <div className="chat-header-tool-cluster" ref={headerActionsRef}>
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
