import React from "react";

export function UmbraBootScreen({
  eyebrow = "UMBRA",
  subtitle = "Sincronizando tu espacio para entrar al chat.",
  title = "Preparando Umbra..."
}) {
  return (
    <div className="boot-screen">
      <div className="boot-shell" aria-live="polite" aria-busy="true">
        <div className="loader boot-loader" aria-hidden="true">
          <span className="inner one" />
          <span className="inner two" />
          <span className="inner three" />
        </div>

        <div className="boot-copy">
          <small>{eyebrow}</small>
          <strong>{title}</strong>
          <p>{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
