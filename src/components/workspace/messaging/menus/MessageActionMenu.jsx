import React from "react";
import { createPortal } from "react-dom";

import { translate } from "../../../../i18n.js";
import { Icon } from "../../../Icon.jsx";
import { MESSAGE_TOOLBAR_REACTIONS } from "../../shared/workspaceHelpers.js";

export function MessageActionMenu({
  anchorRef,
  language = "es",
  message,
  onAction,
  onClose,
  onQuickReact
}) {
  const rootRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState(null);
  const t = (key, fallback) => translate(language, key, fallback);

  React.useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) {
        return;
      }

      onClose?.();
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  React.useLayoutEffect(() => {
    const anchorRect = anchorRef?.current?.getBoundingClientRect?.();
    if (!anchorRect || !rootRef.current) {
      return;
    }

    const safe = { left: 12, right: 12, top: 12, bottom: 20 };
    const rect = rootRef.current.getBoundingClientRect();
    let left = anchorRect.right - rect.width;
    let top = anchorRect.bottom + 8;

    if (left + rect.width > window.innerWidth - safe.right) {
      left = window.innerWidth - rect.width - safe.right;
    }
    if (left < safe.left) {
      left = safe.left;
    }

    if (top + rect.height > window.innerHeight - safe.bottom) {
      top = anchorRect.top - rect.height - 8;
    }
    if (top < safe.top) {
      top = safe.top;
    }

    setMenuPosition((previous) => {
      if (previous?.left === left && previous?.top === top) {
        return previous;
      }
      return { left, top };
    });
  }, [anchorRef]);

  const sections = [
    [
      { id: "react", label: t("message.menu.react", "Agregar reaccion"), icon: "emoji" },
      { id: "reply", label: t("message.menu.reply", "Responder"), icon: "replyArrow" },
      { id: "forward", label: t("message.menu.forward", "Reenviar"), icon: "forward" },
      { id: "thread", label: t("message.menu.thread", "Crear hilo"), icon: "threads" }
    ],
    [
      { id: "copy-text", label: t("message.menu.copyText", "Copiar texto"), icon: "copy", disabled: !message.content },
      { id: "pin", label: t("message.menu.pin", "Fijar mensaje"), icon: "pin" },
      { id: "unread", label: t("message.menu.unread", "Marcar como no leido"), icon: "mail" },
      { id: "copy-link", label: t("message.menu.copyLink", "Copiar enlace del mensaje"), icon: "link" }
    ],
    [
      ...(message.can_edit ? [{ id: "edit", label: t("message.menu.edit", "Editar mensaje"), icon: "edit" }] : []),
      ...(message.can_delete
        ? [{ id: "delete", label: t("message.menu.delete", "Eliminar mensaje"), icon: "trash", danger: true }]
        : [])
    ],
    [{ id: "copy-id", label: t("message.menu.copyId", "Copiar ID del mensaje"), icon: "copy" }]
  ].filter((section) => section.length > 0);

  if (!anchorRef?.current) {
    return null;
  }

  const content = (
    <div
      className="message-context-portal-shell message-menu-anchor"
      ref={rootRef}
      style={{
        left: `${menuPosition?.left ?? 0}px`,
        position: "fixed",
        top: `${menuPosition?.top ?? 0}px`,
        zIndex: 120
      }}
    >
      <div className="message-context-menu floating-surface">
      <div className="message-context-reactions">
        {MESSAGE_TOOLBAR_REACTIONS.map((emoji) => (
          <button
            className="message-context-reaction"
            key={`${message.id}-menu-${emoji}`}
            onClick={() => onQuickReact(emoji)}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>

      {sections.map((section, sectionIndex) => (
        <React.Fragment key={`${message.id}-section-${sectionIndex}`}>
          {sectionIndex > 0 ? <div className="message-context-divider" /> : null}
          <div className="message-context-list">
            {section.map((item) => (
              <button
                className={`message-context-item ${item.danger ? "danger" : ""}`}
                disabled={item.disabled}
                key={`${message.id}-${item.id}`}
                onClick={() => onAction(item.id, message)}
                type="button"
              >
                <span>{item.label}</span>
                <Icon name={item.icon} size={16} />
              </button>
            ))}
          </div>
        </React.Fragment>
      ))}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
