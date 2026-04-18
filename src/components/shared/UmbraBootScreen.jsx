import React from "react";

export function UmbraBootScreen({
  eyebrow = "UMBRA",
  subtitle = "Sincronizando tu espacio para entrar al chat.",
  title = "Preparando Umbra..."
}) {
  return (
    <div className="boot-screen">
      <div className="boot-shell" aria-live="polite" aria-busy="true">
        <div className="boot-loader" aria-hidden="true">
          <span className="boot-loader-ring" />
          <span className="boot-loader-dot boot-loader-dot-a" />
          <span className="boot-loader-dot boot-loader-dot-b" />
          <span className="boot-loader-core" />
        </div>

        <div className="boot-copy">
          <small>{eyebrow}</small>
          <strong>{title}</strong>
          <p>{subtitle}</p>
        </div>

        <div className="boot-progress" aria-hidden="true">
          <span className="boot-progress-bar" />
        </div>
      </div>
    </div>
  );
}
