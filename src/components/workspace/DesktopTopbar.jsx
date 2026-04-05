import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";
import { resolveGuildIcon } from "./workspaceHelpers.js";

function truncateDesktopTitle(label) {
  if (!label) {
    return "Umbra";
  }

  return label.length > 30 ? `${label.slice(0, 27)}...` : label;
}

export function DesktopTopbar({
  activeGuild,
  desktopTitle,
  headerPanel,
  headerPanelRef,
  inboxCount,
  inboxTab,
  currentInboxItems,
  onHandleInboxItemAction,
  onInboxTabChange,
  onShowNotice,
  onToggleHeaderPanel,
  topbarActionsRef
}) {
  const guildIcon = resolveGuildIcon(activeGuild);

  return (
    <div className="desktop-topbar">
      <div className="desktop-topbar-nav">
        <button
          className="desktop-topbar-button tooltip-anchor"
          data-tooltip="Atras"
          data-tooltip-position="bottom"
          onClick={() => onShowNotice("Historial local de navegacion listo para la siguiente pasada.")}
          type="button"
        >
          <Icon name="chevronLeft" size={16} />
        </button>
        <button
          className="desktop-topbar-button tooltip-anchor"
          data-tooltip="Adelante"
          data-tooltip-position="bottom"
          onClick={() => onShowNotice("Historial local de navegacion listo para la siguiente pasada.")}
          type="button"
        >
          <Icon name="arrowRight" size={16} />
        </button>
      </div>

      <div className="desktop-topbar-title">
        <div className="desktop-topbar-brand">
          <UmbraLogo alt="Umbra" className="desktop-topbar-logo" size={18} />
          <div className="desktop-topbar-copy">
            <small>{activeGuild ? "UMBRA VEIL" : "UMBRA CLOUD"}</small>
            <strong title={desktopTitle}>{truncateDesktopTitle(desktopTitle)}</strong>
          </div>
        </div>
        {activeGuild ? (
          <span className={`desktop-topbar-badge ${guildIcon ? "has-image" : ""}`.trim()}>
            {guildIcon ? (
              <img alt={activeGuild.name} draggable="false" src={guildIcon} />
            ) : (
              activeGuild?.icon_text || desktopTitle.slice(0, 1).toUpperCase()
            )}
          </span>
        ) : null}
      </div>

      <div className="desktop-topbar-actions" ref={topbarActionsRef}>
        <button
          className={`desktop-topbar-button tooltip-anchor ${headerPanel === "inbox" ? "active" : ""}`}
          data-tooltip="Bandeja de entrada"
          data-tooltip-position="bottom"
          onClick={() => onToggleHeaderPanel("inbox")}
          type="button"
        >
          <Icon name="inbox" size={16} />
        </button>
        <button
          className="desktop-topbar-button tooltip-anchor"
          data-tooltip="Ayuda"
          data-tooltip-position="bottom"
          onClick={() => onShowNotice("Centro de ayuda preparado para luego.")}
          type="button"
        >
          <Icon name="help" size={16} />
        </button>

        {headerPanel === "inbox" ? (
          <div className="floating-surface inbox-panel chat-header-panel topbar-inbox-panel" ref={headerPanelRef}>
            <div className="inbox-panel-header">
              <div className="inbox-panel-title">
                <Icon name="inbox" size={18} />
                <strong>Bandeja de entrada</strong>
              </div>
              <button className="ghost-button small inbox-badge-button" type="button">
                <Icon name="friends" size={15} />
                <span>{inboxCount}</span>
              </button>
            </div>

            <div className="inbox-tabs">
              <button
                className={`inbox-tab ${inboxTab === "for_you" ? "active" : ""}`}
                onClick={() => onInboxTabChange("for_you")}
                type="button"
              >
                Para ti
              </button>
              <button
                className={`inbox-tab ${inboxTab === "unread" ? "active" : ""}`}
                onClick={() => onInboxTabChange("unread")}
                type="button"
              >
                No leidos
              </button>
              <button
                className={`inbox-tab ${inboxTab === "mentions" ? "active" : ""}`}
                onClick={() => onInboxTabChange("mentions")}
                type="button"
              >
                Menciones
              </button>
            </div>

            <div className="inbox-list">
              {currentInboxItems.length ? (
                currentInboxItems.map((item) => (
                  <div className="inbox-item" key={item.id}>
                    <div className="inbox-item-main">
                      <Avatar
                        hue={item.user?.avatar_hue || 220}
                        label={item.user?.display_name || item.user?.username || "Inbox"}
                        size={42}
                        src={item.user?.avatar_url}
                        status={item.user?.status}
                      />
                      <div className="inbox-item-copy">
                        <p>{item.text}</p>
                        <small>{item.meta}</small>
                        <button
                          className="ghost-button small"
                          onClick={() => onHandleInboxItemAction(item)}
                          type="button"
                        >
                          {item.actionLabel}
                        </button>
                      </div>
                    </div>
                    <button
                      className="ghost-button icon-only small"
                      onClick={() => onShowNotice("Acciones secundarias del inbox pendientes.")}
                      type="button"
                    >
                      <span className="voice-stage-more">...</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="inbox-empty-state">
                  <strong>No hay novedades aqui.</strong>
                  <span>
                    Cuando lleguen menciones o actividad relevante, Umbra las mostrara en este
                    panel.
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
