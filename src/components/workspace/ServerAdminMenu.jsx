import React, { useEffect, useRef, useState } from "react";

import { Icon } from "../Icon.jsx";

const MENU_ITEMS = [
  { id: "invite", icon: "userAdd", label: "Invitar al servidor" },
  { id: "settings", icon: "settings", label: "Ajustes del servidor" },
  { id: "channel", icon: "add", label: "Crear un canal" },
  { id: "category", icon: "threads", label: "Crear categoria" },
  { id: "profile", icon: "edit", label: "Editar perfil de servidor" },
  { id: "copy-id", icon: "copy", label: "Copiar ID del servidor" }
];

export function ServerAdminMenu({
  canManageGuild,
  guild,
  onCopyId,
  onCreateCategory,
  onCreateChannel,
  onInvite,
  onOpenSettings
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleAction(actionId) {
    setOpen(false);

    switch (actionId) {
      case "invite":
        onInvite();
        return;
      case "settings":
      case "profile":
        onOpenSettings();
        return;
      case "channel":
        onCreateChannel();
        return;
      case "category":
        onCreateCategory();
        return;
      case "copy-id":
        onCopyId();
        return;
      default:
    }
  }

  return (
    <div className="server-admin-shell" ref={rootRef}>
      <button
        className="navigator-server-trigger"
        onClick={() => {
          if (canManageGuild) {
            setOpen((previous) => !previous);
          }
        }}
        type="button"
      >
        <strong>{guild.name}</strong>
        {canManageGuild ? <Icon name="chevronDown" size={15} /> : null}
      </button>

      {open ? (
        <div className="floating-surface server-admin-menu">
          {MENU_ITEMS.map((item, index) => (
            <React.Fragment key={item.id}>
              {index === 1 || index === 5 ? <div className="server-admin-divider" /> : null}
              <button
                className="server-admin-row"
                onClick={() => handleAction(item.id)}
                type="button"
              >
                <span>{item.label}</span>
                <Icon name={item.icon} size={17} />
              </button>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
