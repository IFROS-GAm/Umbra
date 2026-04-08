import React, { useEffect, useRef, useState } from "react";

import { resolveAssetUrl } from "../api.js";
import { avatarStyle } from "../utils.js";

export function Avatar({ label, size = 42, status, hue, priority = false, src }) {
  const safeLabel = String(label || "?");
  const [imageFailed, setImageFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef(null);
  const resolvedSrc = resolveAssetUrl(src);
  const showImage = Boolean(resolvedSrc) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
    setLoaded(false);
  }, [resolvedSrc]);

  useEffect(() => {
    const image = imageRef.current;

    if (image?.complete && image.naturalWidth > 0) {
      setLoaded(true);
    }
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
            draggable={false}
            fetchPriority={priority ? "high" : "low"}
            ref={imageRef}
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
