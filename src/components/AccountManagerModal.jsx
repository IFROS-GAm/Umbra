import React, { useEffect, useMemo, useRef, useState } from "react";

import { translate } from "../i18n.js";
import { Avatar } from "./Avatar.jsx";
import { Icon } from "./Icon.jsx";

function buildAccountManagerLocale(language) {
  const t = (key, fallback) => translate(language, key, fallback);

  return {
    active: t("accountManager.active", "Cuenta activa"),
    addAccount: t("accountManager.addAccount", "Agregar una cuenta"),
    close: t("common.close", "Cerrar"),
    description: t(
      "accountManager.description",
      "Cambia de cuentas, inicia sesion, cierra sesion, desata la locura."
    ),
    more: t("accountManager.more", "Mas opciones"),
    signOutCurrent: t("accountManager.signOutCurrent", "Cerrar sesion"),
    signOut: t("accountManager.signOut", "Cerrar sesion actual"),
    title: t("accountManager.title", "Gestionar cuentas")
  };
}

export function AccountManagerModal({
  language = "es",
  onAddAccount,
  onClose,
  onSignOut,
  user
}) {
  const locale = useMemo(() => buildAccountManagerLocale(language), [language]);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event) {
      if (
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  if (!user) {
    return null;
  }

  return (
    <div className="profile-popover-layer" onClick={onClose}>
      <section
        className="account-manager-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="account-manager-header">
          <div>
            <h3>{locale.title}</h3>
            <p>{locale.description}</p>
          </div>
          <button
            aria-label={locale.close}
            className="ghost-button icon-only account-manager-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="account-manager-list">
          <div className="account-manager-entry selected">
            <Avatar
              hue={user.avatar_hue}
              label={user.username}
              size={42}
              src={user.avatar_url}
              status={user.status}
            />
            <div className="account-manager-entry-copy">
              <strong>{user.username}</strong>
              <span>{locale.active}</span>
            </div>
            <button
              aria-label={locale.more}
              className="ghost-button icon-only"
              onClick={() => setMenuOpen((current) => !current)}
              ref={triggerRef}
              type="button"
            >
              <Icon name="more" size={16} />
            </button>
            {menuOpen ? (
              <div className="account-manager-entry-menu" ref={menuRef}>
                <button
                  className="account-manager-entry-menu-button danger"
                  onClick={onSignOut}
                  type="button"
                >
                  {locale.signOutCurrent}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="account-manager-actions">
          <button className="primary-button" onClick={onAddAccount} type="button">
            {locale.addAccount}
          </button>
          <button className="ghost-button" onClick={onSignOut} type="button">
            {locale.signOut}
          </button>
        </div>
      </section>
    </div>
  );
}
