import React from "react";

import { Icon } from "../Icon.jsx";
import { MESSAGE_TOOLBAR_REACTIONS } from "./workspaceHelpers.js";

export function MessageActionMenu({ message, onAction, onQuickReact }) {
  const sections = [
    [
      { id: "react", label: "Agregar reaccion", icon: "emoji" },
      { id: "reply", label: "Responder", icon: "replyArrow" },
      { id: "forward", label: "Reenviar", icon: "forward" },
      { id: "thread", label: "Crear hilo", icon: "threads" }
    ],
    [
      { id: "copy-text", label: "Copiar texto", icon: "copy", disabled: !message.content },
      { id: "pin", label: "Fijar mensaje", icon: "pin" },
      { id: "unread", label: "Marcar como no leido", icon: "mail" },
      { id: "copy-link", label: "Copiar enlace del mensaje", icon: "link" }
    ],
    [
      ...(message.can_edit ? [{ id: "edit", label: "Editar mensaje", icon: "edit" }] : []),
      ...(message.can_delete
        ? [{ id: "delete", label: "Eliminar mensaje", icon: "trash", danger: true }]
        : [])
    ],
    [{ id: "copy-id", label: "Copiar ID del mensaje", icon: "copy" }]
  ].filter((section) => section.length > 0);

  return (
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
  );
}
