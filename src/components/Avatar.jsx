import React from "react";

import { avatarStyle } from "../utils.js";

export function Avatar({ label, size = 42, status, hue }) {
  const safeLabel = String(label || "?");

  return (
    <div className="avatar-shell" style={{ width: size, height: size }}>
      <div className="avatar" style={{ ...avatarStyle(hue), width: size, height: size }}>
        <span>{safeLabel.slice(0, 2).toUpperCase()}</span>
      </div>
      {status ? <span className={`status-dot ${status}`} /> : null}
    </div>
  );
}
