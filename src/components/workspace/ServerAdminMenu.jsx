import React, { useEffect, useRef, useState } from "react";

import { translate } from "../../i18n.js";
import { Icon } from "../Icon.jsx";
import { resolveGuildIcon } from "./workspaceHelpers.js";

function truncateServerName(name) {
  if (!name) {
    return "Servidor";
  }

  return name.length > 24 ? `${name.slice(0, 21)}...` : name;
}

export function ServerAdminMenu({
  canManageGuild,
  guild,
  language = "es",
  onCopyId,
  onCreateCategory,
  onCreateChannel,
  onInvite,
  onOpenSettings
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const guildIcon = resolveGuildIcon(guild);
  const t = (key, fallback) => translate(language, key, fallback);
  const menuItems = [
    { id: "invite", icon: "userAdd", label: t("server.admin.invite", "Invitar al servidor") },
    { id: "settings", icon: "settings", label: t("server.admin.settings", "Ajustes del servidor") },
    { id: "channel", icon: "add", label: t("server.admin.channel", "Crear un canal") },
    { id: "category", icon: "threads", label: t("server.admin.category", "Crear categoria") },
    { id: "profile", icon: "edit", label: t("server.admin.profile", "Editar perfil de servidor") },
    { id: "copy-id", icon: "copy", label: t("server.admin.copyId", "Copiar ID del servidor") }
  ];

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
        <span className={`navigator-server-glyph ${guildIcon ? "has-image" : ""}`.trim()}>
          {guildIcon ? (
            <img alt={guild.name} draggable="false" src={guildIcon} />
          ) : (
            <span>{guild.icon_text || guild.name.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <strong title={guild.name}>{truncateServerName(guild.name)}</strong>
        {canManageGuild ? <Icon name="chevronDown" size={15} /> : null}
      </button>

      {open ? (
        <div className="floating-surface server-admin-menu">
          {menuItems.map((item, index) => (
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
