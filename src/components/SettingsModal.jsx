import React, { useMemo, useState } from "react";

import { STATUS_OPTIONS } from "../utils.js";
import { Avatar } from "./Avatar.jsx";

function findStatusLabel(status) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || "Offline";
}

export function SettingsModal({
  dmCount,
  guildCount,
  onClose,
  onShowNotice,
  onSignOut,
  onToggleTheme,
  theme,
  user
}) {
  const [tab, setTab] = useState("security");

  const profileRows = useMemo(
    () => [
      {
        label: "Nombre para mostrar",
        value: user.display_name || user.username || "Umbra user"
      },
      {
        label: "Nombre de usuario",
        value: user.username || "Sin usuario"
      },
      {
        label: "Correo electronico",
        value: user.email || "Sin correo visible"
      },
      {
        label: "Proveedor",
        value: user.auth_provider || (user.email ? "email" : "seed")
      }
    ],
    [user]
  );

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="settings-sidebar">
          <div className="settings-user-lockup">
            <Avatar
              hue={user.avatar_hue}
              label={user.username}
              size={54}
              status={user.status}
            />
            <div className="settings-user-copy">
              <strong>{user.display_name || user.username}</strong>
              <span>{user.email || "Cuenta Umbra"}</span>
            </div>
          </div>

          <div className="settings-nav">
            <button
              className={`settings-nav-item ${tab === "security" ? "active" : ""}`}
              onClick={() => setTab("security")}
              type="button"
            >
              Mi cuenta
            </button>
            <button
              className={`settings-nav-item ${tab === "status" ? "active" : ""}`}
              onClick={() => setTab("status")}
              type="button"
            >
              Estado
            </button>
            <button
              className="settings-nav-item"
              onClick={() => onShowNotice("Editor de perfil y avatar llegan en la siguiente iteracion.")}
              type="button"
            >
              Editar perfil
            </button>
          </div>
        </aside>

        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <p className="eyebrow">Configuracion</p>
              <h2>{tab === "security" ? "Mi cuenta" : "Presencia y espacio"}</h2>
            </div>
            <button className="ghost-button icon-only" onClick={onClose} type="button">
              x
            </button>
          </div>

          {tab === "security" ? (
            <div className="settings-stack">
              <section className="settings-hero-card">
                <div className="settings-hero-banner" />
                <div className="settings-hero-body">
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.username}
                    size={78}
                    status={user.status}
                  />
                  <div className="settings-hero-copy">
                    <h3>{user.display_name || user.username}</h3>
                    <p>{findStatusLabel(user.status)}</p>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => onShowNotice("Editor de perfil visual aun no esta conectado al backend.")}
                    type="button"
                  >
                    Editar perfil de usuario
                  </button>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>Identidad</h3>
                  <span>Datos principales de la cuenta en Umbra.</span>
                </div>

                <div className="settings-grid">
                  {profileRows.map((row) => (
                    <div className="settings-row" key={row.label}>
                      <div>
                        <strong>{row.label}</strong>
                        <p>{row.value}</p>
                      </div>
                      <button
                        className="ghost-button"
                        onClick={() =>
                          onShowNotice(`${row.label} aun no tiene editor conectado.`)
                        }
                        type="button"
                      >
                        Editar
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>Contrasena y autenticacion</h3>
                  <span>Google, email, OTP y ajustes rapidos de la sesion actual.</span>
                </div>

                <div className="settings-action-row">
                  <div>
                    <strong>Autenticacion activa</strong>
                    <p>
                      La sesion esta abierta con{" "}
                      <span className="inline-pill">
                        {(user.auth_provider || "email").toUpperCase()}
                      </span>
                    </p>
                  </div>
                  <button className="ghost-button" onClick={onSignOut} type="button">
                    Cerrar sesion
                  </button>
                </div>

                <div className="settings-action-row">
                  <div>
                    <strong>Apariencia</strong>
                    <p>
                      Tema actual:{" "}
                      <span className="inline-pill">
                        {theme === "dark" ? "Oscuro" : "Claro"}
                      </span>
                    </p>
                  </div>
                  <button className="ghost-button" onClick={onToggleTheme} type="button">
                    Cambiar tema
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <div className="settings-stack">
              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>Estado actual</h3>
                  <span>Presencia visible para el resto del workspace.</span>
                </div>

                <div className="settings-status-showcase">
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.username}
                    size={72}
                    status={user.status}
                  />
                  <div>
                    <strong>{findStatusLabel(user.status)}</strong>
                    <p>{user.custom_status || "Sin estado personalizado por ahora."}</p>
                  </div>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>Resumen del espacio</h3>
                  <span>Actividad actual dentro de Umbra.</span>
                </div>

                <div className="settings-summary-grid">
                  <div className="summary-tile">
                    <strong>{guildCount}</strong>
                    <span>Servidores activos</span>
                  </div>
                  <div className="summary-tile">
                    <strong>{dmCount}</strong>
                    <span>DMs visibles</span>
                  </div>
                  <div className="summary-tile">
                    <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
                    <span>Modo visual</span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
