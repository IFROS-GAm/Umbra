import React from "react";
import { createPortal } from "react-dom";

import { translate } from "../../i18n.js";
import { Icon } from "../Icon.jsx";

function getNotificationLabel(level, t) {
  switch (level) {
    case "all":
      return t("server.context.notifications.all", "Todos los mensajes");
    case "none":
      return t("server.context.notifications.none", "Nada");
    case "mentions":
    default:
      return t("server.context.notifications.mentions", "Solo @mentions");
  }
}

export function ServerContextMenu({
  canManageGuild,
  guild,
  language = "es",
  onClose,
  onCopyId,
  onInvite,
  onLeaveGuild,
  onMarkRead,
  onOpenPrivacy,
  onOpenSettings,
  onTogglePref,
  onUpdateNotificationLevel,
  position,
  prefs
}) {
  const rootRef = React.useRef(null);
  const [submenu, setSubmenu] = React.useState(null);
  const [menuPosition, setMenuPosition] = React.useState(position);
  const t = (key, fallback) => translate(language, key, fallback);

  React.useEffect(() => {
    if (!guild) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) {
        return;
      }

      onClose();
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [guild, onClose]);

  React.useLayoutEffect(() => {
    if (!position || !rootRef.current) {
      return;
    }

    const safeArea = {
      bottom: 36,
      left: 12,
      right: 12,
      top: 12
    };
    const rect = rootRef.current.getBoundingClientRect();
    let nextX = position.x;
    let nextY = position.y;
    let nextBottom = null;
    let useBottom = false;

    if (position.anchorRect) {
      const topAlignedY = position.anchorRect.top - 6;
      const upwardAnchoredY = position.anchorRect.bottom - rect.height - 10;
      const fitsBelow = topAlignedY + rect.height <= window.innerHeight - safeArea.bottom;
      const shouldAnchorFromBottom = position.anchorRect.bottom > window.innerHeight * 0.68 || !fitsBelow;

      if (shouldAnchorFromBottom) {
        useBottom = true;
        nextBottom = Math.max(safeArea.bottom, window.innerHeight - position.anchorRect.bottom + 6);
        nextY = Math.max(safeArea.top, upwardAnchoredY);
      } else {
        nextY = topAlignedY;
      }
    }

    if (nextX + rect.width > window.innerWidth - safeArea.right) {
      nextX = Math.max(safeArea.left, window.innerWidth - rect.width - safeArea.right);
    }

    if (!useBottom && nextY + rect.height > window.innerHeight - safeArea.bottom) {
      nextY = Math.max(safeArea.top, window.innerHeight - rect.height - safeArea.bottom);
    }

    if (nextX < safeArea.left) {
      nextX = safeArea.left;
    }

    if (nextY < safeArea.top) {
      nextY = safeArea.top;
    }

    setMenuPosition((previous) => {
      if (
        previous?.x === nextX &&
        previous?.y === nextY &&
        previous?.bottom === nextBottom &&
        previous?.useBottom === useBottom
      ) {
        return previous;
      }

      return {
        bottom: nextBottom,
        useBottom,
        x: nextX,
        y: nextY
      };
    });
  }, [guild, position, submenu]);

  if (!guild || !position) {
    return null;
  }

  const notificationLevel = prefs?.notificationLevel || "mentions";

  const content = (
    <div
      className="floating-surface server-context-menu-shell"
      ref={rootRef}
      style={{
        bottom: menuPosition?.useBottom ? `${menuPosition?.bottom ?? 28}px` : "auto",
        left: `${menuPosition?.x ?? position.x}px`,
        top: menuPosition?.useBottom ? "auto" : `${menuPosition?.y ?? position.y}px`
      }}
    >
      <div className="floating-surface server-context-menu">
        <button
          className="server-context-row"
          onClick={() => {
            onMarkRead(guild);
            onClose();
          }}
          type="button"
        >
          <span>{t("server.context.markRead", "Marcar como leido")}</span>
        </button>

        <div className="server-context-divider" />

        {canManageGuild ? (
          <button
            className="server-context-row"
            onClick={() => {
              onInvite(guild);
              onClose();
            }}
            type="button"
          >
            <span>{t("server.context.invite", "Invitar al servidor")}</span>
          </button>
        ) : null}

        <div className="server-context-divider" />

        <button
          className="server-context-row"
          onClick={() => setSubmenu((previous) => (previous === "notifications" ? null : "notifications"))}
          type="button"
        >
          <span>{t("server.context.mute", "Silenciar el servidor")}</span>
          <Icon name="arrowRight" size={15} />
        </button>

        <button
          className="server-context-row server-context-row-detail"
          onClick={() => setSubmenu((previous) => (previous === "notifications" ? null : "notifications"))}
          type="button"
        >
          <span>
            <strong>{t("server.context.notificationSettings", "Ajustes de notificaciones")}</strong>
            <small>{getNotificationLabel(notificationLevel, t)}</small>
          </span>
          <Icon name="arrowRight" size={15} />
        </button>

        <button
          className="server-context-row server-context-row-check"
          onClick={() => onTogglePref(guild.id, "hideMutedChannels")}
          type="button"
        >
          <span>{t("server.context.hideMuted", "Ocultar los canales silenciados")}</span>
          <i className={`server-context-checkbox ${prefs?.hideMutedChannels ? "active" : ""}`.trim()} />
        </button>

        <button
          className="server-context-row server-context-row-check"
          onClick={() => onTogglePref(guild.id, "showAllChannels")}
          type="button"
        >
          <span>{t("server.context.showAll", "Mostrar todos los canales")}</span>
          <i className={`server-context-checkbox ${prefs?.showAllChannels ? "active" : ""}`.trim()} />
        </button>

        <div className="server-context-divider" />

        <button
          className="server-context-row"
          onClick={() => {
            onOpenPrivacy(guild);
            onClose();
          }}
          type="button"
        >
          <span>{t("server.context.privacy", "Ajustes de privacidad")}</span>
        </button>

        {canManageGuild ? (
          <button
            className="server-context-row"
            onClick={() => {
              onOpenSettings(guild);
              onClose();
            }}
            type="button"
          >
            <span>{t("server.context.editProfile", "Editar perfil de servidor")}</span>
          </button>
        ) : null}

        <div className="server-context-divider" />

        <button
          className="server-context-row destructive"
          onClick={() => {
            onLeaveGuild(guild);
            onClose();
          }}
          type="button"
        >
          <span>{t("server.context.leave", "Abandonar el servidor")}</span>
        </button>

        <div className="server-context-divider" />

        <button
          className="server-context-row"
          onClick={() => {
            onCopyId(guild);
            onClose();
          }}
          type="button"
        >
          <span>{t("server.context.copyId", "Copiar ID del servidor")}</span>
          <b className="server-context-id-chip">ID</b>
        </button>
      </div>

      {submenu === "notifications" ? (
        <div className="floating-surface server-context-submenu">
          {[
            { id: "mentions", label: t("server.context.notifications.mentions", "Solo @mentions") },
            { id: "all", label: t("server.context.notifications.all", "Todos los mensajes") },
            { id: "none", label: t("server.context.notifications.none", "Nada") }
          ].map((option) => (
            <button
              className="server-context-row server-context-row-check"
              key={option.id}
              onClick={() => {
                onUpdateNotificationLevel(guild.id, option.id);
                setSubmenu(null);
              }}
              type="button"
            >
              <span>{option.label}</span>
              <i
                className={`server-context-radio ${notificationLevel === option.id ? "active" : ""}`.trim()}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return createPortal(content, document.body);
}
