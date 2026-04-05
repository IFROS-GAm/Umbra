import React from "react";

import { Icon } from "./Icon.jsx";

export function ConfirmActionModal({
  cancelLabel = "Cancelar",
  confirmLabel = "Aceptar",
  description,
  loading = false,
  onClose,
  onConfirm,
  title
}) {
  return (
    <div className="settings-backdrop" onClick={loading ? undefined : onClose}>
      <div
        className="confirm-action-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-action-header">
          <strong>{title}</strong>
          <button
            aria-label="Cerrar"
            className="ghost-button icon-only"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {description ? <p>{description}</p> : null}

        <div className="confirm-action-buttons">
          <button
            className="ghost-button"
            disabled={loading}
            onClick={onClose}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="confirm-action-confirm"
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            {loading ? "Saliendo..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
