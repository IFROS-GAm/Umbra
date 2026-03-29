import React from "react";

export function UmbraLogo({ alt = "Umbra", className = "", size = 40 }) {
  const classes = ["umbra-logo", className].filter(Boolean).join(" ");

  return (
    <img
      alt={alt}
      className={classes}
      draggable="false"
      height={size}
      src="/Umbra.png"
      width={size}
    />
  );
}
