import React from "react";

export function UmbraBootScreen({
  eyebrow = "UMBRA",
  subtitle = "Sincronizando tu espacio para entrar al chat.",
  title = "Preparando Umbra..."
}) {
  return (
    <div className="boot-screen">
      <div className="boot-shell" aria-live="polite" aria-busy="true">
        <div className="boot-loader boot-loader-orbit" aria-hidden="true">
          <span className="boot-orbit-ring boot-orbit-ring-outer" />
          <span className="boot-orbit-ring boot-orbit-ring-middle" />
          <span className="boot-orbit-ring boot-orbit-ring-inner" />
          <span className="boot-orbit-core" />

          <span className="boot-orbit-path boot-orbit-path-outer">
            <span className="boot-orbit-dot" />
          </span>
          <span className="boot-orbit-path boot-orbit-path-middle">
            <span className="boot-orbit-dot" />
          </span>
          <span className="boot-orbit-path boot-orbit-path-inner">
            <span className="boot-orbit-dot" />
          </span>
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
