import React, { useState } from "react";

import { Icon } from "./Icon.jsx";

export function InviteServerModal({ guildName, invite, loading, error, onClose, onRefresh }) {
  const [copied, setCopied] = useState(false);
  const inviteCode = invite?.code || "";

  async function handleCopy() {
    if (!inviteCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="invite-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="invite-modal-header">
          <div>
            <h3>Invitar al servidor</h3>
            <p>Comparte un codigo para traer mas sombras a {guildName}.</p>
          </div>
          <button className="ghost-button icon-only" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>

        <div className="invite-modal-body">
          {loading ? (
            <div className="invite-empty-state">
              <strong>Generando invitacion...</strong>
              <span>Umbra esta abriendo un nuevo acceso para este servidor.</span>
            </div>
          ) : error ? (
            <div className="invite-empty-state error">
              <strong>No se pudo crear la invitacion.</strong>
              <span>{error}</span>
            </div>
          ) : inviteCode ? (
            <>
              <div className="invite-code-block">
                <small>Codigo de invitacion</small>
                <strong>{inviteCode}</strong>
                <span>Comparte este codigo dentro de Umbra para invitar personas.</span>
              </div>

              <div className="invite-actions">
                <button className="primary-button" onClick={handleCopy} type="button">
                  <Icon name="copy" />
                  <span>{copied ? "Copiado" : "Copiar codigo"}</span>
                </button>
                <button className="ghost-button" onClick={onRefresh} type="button">
                  <Icon name="refresh" />
                  <span>Generar otro</span>
                </button>
              </div>
            </>
          ) : (
            <div className="invite-empty-state">
              <strong>No hay codigo listo todavia.</strong>
              <span>Genera una invitacion nueva para este servidor.</span>
              <button className="primary-button" onClick={onRefresh} type="button">
                <Icon name="userAdd" />
                <span>Crear invitacion</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
