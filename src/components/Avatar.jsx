import React, { useEffect, useState } from "react";

import { resolveAssetUrl } from "../api.js";
import { avatarStyle } from "../utils.js";

export function Avatar({ label, size = 42, status, hue, priority = false, src }) {
  const safeLabel = String(label || "?");
  const [imageFailed, setImageFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const resolvedSrc = resolveAssetUrl(src);
  const showImage = Boolean(resolvedSrc) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
    setLoaded(false);
  }, [resolvedSrc]);

  return (
    <div
      className={`avatar-shell ${showImage && !loaded ? "has-pending-media" : ""}`}
      style={{ width: size, height: size }}
    >
      <div className="avatar" style={{ ...avatarStyle(hue), width: size, height: size }}>
        {showImage ? (
          <img
            alt={safeLabel}
            className={`avatar-media ${loaded ? "is-loaded" : ""}`}
            decoding="async"
            fetchPriority={priority ? "high" : "low"}
            loading={priority ? "eager" : "lazy"}
            onLoad={() => setLoaded(true)}
            onError={() => setImageFailed(true)}
            src={resolvedSrc}
          />
        ) : (
          <span>{safeLabel.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      {status ? <span className={`status-dot ${status}`} /> : null}
    </div>
  );
}
