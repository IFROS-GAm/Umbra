import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { translate } from "../../i18n.js";
import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { buildPanelStyle, findLocalizedStatusLabel } from "../settingsModalHelpers.js";

const CARD_WIDTH = 312;
const CARD_MARGIN = 16;
const CARD_GAP = 14;

const STATUS_DURATIONS = [
  { key: "15m", ms: 15 * 60 * 1000 },
  { key: "1h", ms: 60 * 60 * 1000 },
  { key: "8h", ms: 8 * 60 * 60 * 1000 },
  { key: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "3d", ms: 3 * 24 * 60 * 60 * 1000 },
  { key: "forever", ms: null }
];

function getMenuPosition(anchorRect, menuHeight = 420) {
  if (!anchorRect || typeof window === "undefined") {
    return {
      left: CARD_MARGIN,
      top: CARD_MARGIN
    };
  }

  let left = Math.max(CARD_MARGIN, anchorRect.left - 8);
  if (left + CARD_WIDTH > window.innerWidth - CARD_MARGIN) {
    left = window.innerWidth - CARD_WIDTH - CARD_MARGIN;
  }

  const preferredTop = anchorRect.top - menuHeight + 18;
  const maxTop = Math.max(CARD_MARGIN, window.innerHeight - menuHeight - CARD_MARGIN);
  const top =
    preferredTop < CARD_MARGIN
      ? Math.min(maxTop, anchorRect.bottom + 10)
      : Math.min(Math.max(CARD_MARGIN, preferredTop), maxTop);

  return { left, top };
}

function getFloatingMenuPosition(anchorRect, width = 268, height = 260) {
  if (!anchorRect || typeof window === "undefined") {
    return {
      left: CARD_MARGIN,
      top: CARD_MARGIN
    };
  }

  let left = anchorRect.right + 12;
  if (left + width > window.innerWidth - CARD_MARGIN) {
    left = Math.max(CARD_MARGIN, anchorRect.left - width - 12);
  }

  const top = Math.min(
    Math.max(CARD_MARGIN, anchorRect.top - 6),
    Math.max(CARD_MARGIN, window.innerHeight - height - CARD_MARGIN)
  );

  return { left, top };
}

function buildSelfMenuLocale(language) {
  const t = (key, fallback) => translate(language, key, fallback);

  return {
    accountAction: t("selfMenu.accountAction", "Cambiar cuentas"),
    activeAccount: t("selfMenu.activeAccount", "Cuenta activa"),
    always: t("selfMenu.always", "Para siempre"),
    days3: t("selfMenu.days3", "Durante 3 dias"),
    editProfile: t("selfMenu.editProfile", "Editar perfil"),
    hours1: t("selfMenu.hours1", "Durante 1 hora"),
    hours24: t("selfMenu.hours24", "Durante 24 horas"),
    hours8: t("selfMenu.hours8", "Durante 8 horas"),
    idle: t("selfMenu.idle", "Inactivo"),
    invisible: t("selfMenu.invisible", "Invisible"),
    manageAccounts: t("selfMenu.manageAccounts", "Gestionar cuentas"),
    minutes15: t("selfMenu.minutes15", "Durante 15 minutos"),
    noStatus: t("selfMenu.noStatus", "Sin estado personalizado."),
    dnd: t("selfMenu.dnd", "No molestar"),
    online: t("selfMenu.online", "En linea"),
    copyId: t("selfMenu.copyId", "Copiar ID del usuario"),
    profileTitle: t("selfMenu.profileTitle", "Perfil"),
    signOut: t("selfMenu.signOut", "Cerrar sesion"),
    switchAccount: t("selfMenu.switchAccount", "Usar otra cuenta"),
    switchHint: t(
      "selfMenu.switchHint",
      "Vuelve a la pantalla de acceso para entrar con otra cuenta."
    )
  };
}

export function CurrentUserMenu({
  anchorRect,
  language = "es",
  onChangeStatus,
  onClose,
  onCopyId,
  onEditProfile,
  onManageAccounts,
  onSignOut,
  onSwitchAccount,
  profile
}) {
  const locale = useMemo(() => buildSelfMenuLocale(language), [language]);
  const cardRef = useRef(null);
  const statusTriggerRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const statusMenuRef = useRef(null);
  const durationMenuRef = useRef(null);
  const [mainPosition, setMainPosition] = useState(() => getMenuPosition(anchorRect));
  const [submenu, setSubmenu] = useState(null);

  useLayoutEffect(() => {
    if (!anchorRect || !cardRef.current) {
      return;
    }

    function updatePosition() {
      const rect = cardRef.current?.getBoundingClientRect();
      setMainPosition(getMenuPosition(anchorRect, rect?.height || 420));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [anchorRect, profile?.id]);

  useEffect(() => {
    setSubmenu(null);
  }, [profile?.id]);

  if (!profile || !anchorRect) {
    return null;
  }

  const statusRows = [
    {
      description: "Visible para tus sombras y tus servidores.",
      iconClass: "online",
      key: "online",
      label: locale.online,
      submenu: false,
      value: "online"
    },
    {
      description: "Reduce presencia y mantente en pausa por un tiempo.",
      iconClass: "idle",
      key: "idle",
      label: locale.idle,
      submenu: true,
      value: "idle"
    },
    {
      description: "Silencia interrupciones sin salir de Umbra.",
      iconClass: "dnd",
      key: "dnd",
      label: locale.dnd,
      submenu: true,
      value: "dnd"
    },
    {
      description: "Apareceras sin conexion aunque sigas dentro.",
      iconClass: "invisible",
      key: "invisible",
      label: locale.invisible,
      submenu: true,
      value: "invisible"
    }
  ];

  const durationOptions = [
    { label: locale.minutes15, ms: STATUS_DURATIONS[0].ms },
    { label: locale.hours1, ms: STATUS_DURATIONS[1].ms },
    { label: locale.hours8, ms: STATUS_DURATIONS[2].ms },
    { label: locale.hours24, ms: STATUS_DURATIONS[3].ms },
    { label: locale.days3, ms: STATUS_DURATIONS[4].ms },
    { label: locale.always, ms: STATUS_DURATIONS[5].ms }
  ];

  async function handleStatusClick(status, durationMs = null) {
    await onChangeStatus?.(status, durationMs);
    onClose?.();
  }

  function toggleStatusMenu() {
    setSubmenu((previous) => {
      if (previous?.kind === "status") {
        return null;
      }

      return {
        anchorRect: statusTriggerRef.current?.getBoundingClientRect() || null,
        kind: "status"
      };
    });
  }

  function toggleStatusDurationMenu(status, anchorRect = null) {
    setSubmenu((previous) => {
      if (previous?.kind === "duration" && previous?.status === status) {
        return {
          anchorRect: statusTriggerRef.current?.getBoundingClientRect() || null,
          kind: "status"
        };
      }

      return {
        anchorRect: anchorRect || statusTriggerRef.current?.getBoundingClientRect() || null,
        kind: "duration",
        status
      };
    });
  }

  function closeDurationMenu(nextTarget = null) {
    if (
      nextTarget &&
      (statusMenuRef.current?.contains(nextTarget) || durationMenuRef.current?.contains(nextTarget))
    ) {
      return;
    }

    setSubmenu((previous) => {
      if (previous?.kind !== "duration") {
        return previous;
      }

      return {
        anchorRect: statusTriggerRef.current?.getBoundingClientRect() || null,
        kind: "status"
      };
    });
  }

  function toggleAccountMenu() {
    setSubmenu((previous) => {
      if (previous?.kind === "accounts") {
        return null;
      }

      return {
        anchorRect: accountTriggerRef.current?.getBoundingClientRect() || null,
        kind: "accounts"
      };
    });
  }

  const bannerStyle = buildPanelStyle(profile.profileColor, profile.profileBannerUrl);
  const resolvedStatus = findLocalizedStatusLabel(profile.status, {
    statuses: {
      dnd: locale.dnd,
      idle: locale.idle,
      invisible: locale.invisible,
      offline: "Offline",
      online: locale.online
    }
  });
  const statusMenuPosition = getFloatingMenuPosition(
    statusTriggerRef.current?.getBoundingClientRect() || submenu?.anchorRect,
    294,
    320
  );
  const durationMenuPosition = getFloatingMenuPosition(
    submenu?.anchorRect,
    236,
    340
  );

  return (
    <div className="profile-popover-layer" onClick={onClose}>
      <aside
        className="user-profile-card current-user-menu"
        onClick={(event) => event.stopPropagation()}
        ref={cardRef}
        style={mainPosition}
      >
        <div className="user-profile-banner" style={bannerStyle} />

        <div className="user-profile-body current-user-menu-body">
          <div className="user-profile-avatar-wrap current-user-avatar-wrap">
            <Avatar
              hue={profile.avatarHue}
              label={profile.displayName || profile.username}
              size={84}
              src={profile.avatarUrl}
              status={profile.status}
            />
            {profile.customStatus ? (
              <span className="user-profile-status-bubble">{profile.customStatus}</span>
            ) : null}
          </div>

          <div className="current-user-identity">
            <h3>{profile.displayName}</h3>
            <p>{profile.username}</p>
            <div className="user-profile-chip-row">
              {profile.primaryTag ? (
                <span className="user-profile-chip accent">{profile.primaryTag}</span>
              ) : null}
              {profile.authProvider ? (
                <span className="user-profile-chip muted">
                  {String(profile.authProvider).toUpperCase()}
                </span>
              ) : null}
            </div>
            {profile.bio ? <em className="current-user-bio">{profile.bio}</em> : null}
          </div>

          <div className="current-user-action-stack">
            <button className="user-profile-utility-row current-user-main-action" onClick={onEditProfile} type="button">
              <span className="user-profile-utility-copy">
                <Icon name="edit" />
                <span>{locale.editProfile}</span>
              </span>
            </button>

            <button
              className="user-profile-utility-row current-user-status-row"
              onClick={toggleStatusMenu}
              ref={statusTriggerRef}
              type="button"
            >
              <span className="user-profile-utility-copy">
                <span className={`user-profile-status-dot ${profile.status}`} />
                <span>{resolvedStatus}</span>
              </span>
              <Icon name="arrowRight" size={14} />
            </button>
          </div>

          <div className="user-profile-utility-list current-user-utility-box">
            <button
              className="user-profile-utility-row"
              onClick={toggleAccountMenu}
              ref={accountTriggerRef}
              type="button"
            >
              <span className="user-profile-utility-copy">
                <Icon name="profile" />
                <span>{locale.accountAction}</span>
              </span>
              <Icon name="arrowRight" size={14} />
            </button>

            <button className="user-profile-utility-row" onClick={onCopyId} type="button">
              <span className="user-profile-utility-copy">
                <Icon name="copy" />
                <span>{locale.copyId}</span>
              </span>
            </button>

            <button className="user-profile-utility-row danger" onClick={onSignOut} type="button">
              <span className="user-profile-utility-copy">
                <Icon name="close" />
                <span>{locale.signOut}</span>
              </span>
            </button>
          </div>
        </div>
      </aside>

      {submenu?.kind === "status" || submenu?.kind === "duration" ? (
        <aside
          className="current-user-floating-menu"
          onClick={(event) => event.stopPropagation()}
          onMouseLeave={(event) => closeDurationMenu(event.relatedTarget)}
          ref={statusMenuRef}
          style={statusMenuPosition}
        >
          {statusRows.map((item) => (
            <button
              className="current-user-floating-row"
              key={item.key}
              onClick={() => {
                if (item.submenu) {
                  return;
                }

                closeDurationMenu();
                handleStatusClick(item.value);
              }}
              onMouseEnter={(event) => {
                if (!item.submenu) {
                  setSubmenu((previous) =>
                    previous?.kind === "duration"
                      ? {
                          anchorRect: statusTriggerRef.current?.getBoundingClientRect() || null,
                          kind: "status"
                        }
                      : previous
                  );
                  return;
                }

                toggleStatusDurationMenu(
                  item.value,
                  event.currentTarget.getBoundingClientRect()
                );
              }}
              type="button"
            >
              <span className="current-user-floating-copy">
                <span className={`user-profile-status-dot ${item.iconClass}`} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </span>
              {item.submenu ? <Icon name="arrowRight" size={14} /> : null}
            </button>
          ))}
        </aside>
      ) : null}

      {submenu?.kind === "duration" ? (
        <aside
          className="current-user-floating-menu current-user-floating-menu-narrow"
          onClick={(event) => event.stopPropagation()}
          onMouseLeave={(event) => closeDurationMenu(event.relatedTarget)}
          ref={durationMenuRef}
          style={durationMenuPosition}
        >
          {durationOptions.map((option) => (
            <button
              className="current-user-floating-row current-user-duration-row"
              key={option.label}
              onClick={() => handleStatusClick(submenu.status, option.ms)}
              type="button"
            >
              <span>{option.label}</span>
            </button>
          ))}
        </aside>
      ) : null}

      {submenu?.kind === "accounts" ? (
        <aside
          className="current-user-floating-menu current-user-accounts-menu"
          onClick={(event) => event.stopPropagation()}
          style={statusMenuPosition}
        >
          <div className="current-user-account-entry selected">
            <Avatar
              hue={profile.avatarHue}
              label={profile.displayName || profile.username}
              size={34}
              src={profile.avatarUrl}
              status={profile.status}
            />
            <div>
              <strong>{profile.username}</strong>
              <small>{locale.activeAccount}</small>
            </div>
            <Icon name="check" size={16} />
          </div>

          <button className="current-user-floating-row" onClick={onManageAccounts} type="button">
            <span className="current-user-floating-copy">
              <Icon name="settings" />
              <span>
                <strong>{locale.manageAccounts}</strong>
                <small>{locale.switchHint}</small>
              </span>
            </span>
          </button>

          <button className="current-user-floating-row" onClick={onSwitchAccount} type="button">
            <span className="current-user-floating-copy">
              <Icon name="profile" />
              <span>
                <strong>{locale.switchAccount}</strong>
                <small>{locale.switchHint}</small>
              </span>
            </span>
          </button>
        </aside>
      ) : null}
    </div>
  );
}
