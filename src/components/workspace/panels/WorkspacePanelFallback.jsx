import React from "react";

export function WorkspacePanelFallback({ compact = false }) {
  return (
    <div className={`workspace-panel-fallback ${compact ? "compact" : ""}`.trim()}>
      <div className="workspace-panel-pulse" />
      <div className="workspace-panel-pulse short" />
    </div>
  );
}
