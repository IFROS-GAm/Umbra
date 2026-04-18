import React from "react";

export function UmbraBootScreen({
  eyebrow = "UMBRA",
  subtitle = "Sincronizando tu espacio para entrar al chat.",
  title = "Preparando Umbra..."
}) {
  return (
    <div className="boot-screen">
      <div className="boot-shell" aria-live="polite" aria-busy="true">
        <svg
          className="boot-loader boot-loader-orbit"
          viewBox="0 0 160 160"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="boot-core-gradient" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#f7d7ff" />
              <stop offset="68%" stopColor="#bc78ff" />
              <stop offset="100%" stopColor="#8f53f7" />
            </radialGradient>
            <radialGradient id="boot-planet-outer-gradient" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#faf6ff" />
              <stop offset="62%" stopColor="#a482ff" />
              <stop offset="100%" stopColor="#7a4dff" />
            </radialGradient>
            <radialGradient id="boot-planet-middle-gradient" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#f8ecff" />
              <stop offset="60%" stopColor="#d991ff" />
              <stop offset="100%" stopColor="#a94dff" />
            </radialGradient>
            <radialGradient id="boot-planet-inner-gradient" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#f1dbff" />
              <stop offset="60%" stopColor="#7d66ff" />
              <stop offset="100%" stopColor="#5a3cff" />
            </radialGradient>
            <filter id="boot-planet-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feDropShadow dx="0" dy="0" stdDeviation="5.2" floodColor="#a07aff" floodOpacity="0.42" />
            </filter>
            <filter id="boot-core-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="#a264ff" floodOpacity="0.35" />
            </filter>
          </defs>

          <circle className="boot-orbit-ring boot-orbit-ring-outer" cx="80" cy="80" r="56" />
          <circle className="boot-orbit-ring boot-orbit-ring-middle" cx="80" cy="80" r="41" />
          <circle className="boot-orbit-ring boot-orbit-ring-inner" cx="80" cy="80" r="26" />

          <circle className="boot-orbit-core" cx="80" cy="80" r="14" />

          <g className="boot-orbiter boot-orbiter-outer">
            <circle className="boot-planet boot-planet-outer" cx="80" cy="24" r="5.5" />
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              dur="1.1s"
              from="0 80 80"
              repeatCount="indefinite"
              to="360 80 80"
              type="rotate"
            />
          </g>

          <g className="boot-orbiter boot-orbiter-middle">
            <circle className="boot-planet boot-planet-middle" cx="80" cy="39" r="5" />
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              dur="0.84s"
              from="360 80 80"
              repeatCount="indefinite"
              to="0 80 80"
              type="rotate"
            />
          </g>

          <g className="boot-orbiter boot-orbiter-inner">
            <circle className="boot-planet boot-planet-inner" cx="80" cy="54" r="4.5" />
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              dur="0.62s"
              from="0 80 80"
              repeatCount="indefinite"
              to="360 80 80"
              type="rotate"
            />
          </g>
        </svg>

        <div className="boot-copy">
          <small>{eyebrow}</small>
          <strong>{title}</strong>
          <p>{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
