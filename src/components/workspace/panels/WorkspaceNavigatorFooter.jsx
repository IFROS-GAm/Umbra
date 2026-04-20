import React, { useEffect, useRef, useState } from "react";

import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";

export function WorkspaceNavigatorFooter({
  currentUserLabel,
  inputMenuNode,
  joinedVoiceChannel,
  onHandleVoiceLeave,
  onOpenSelfMenu,
  onOpenSettings,
  onSelectGuildChannel,
  onToggleVoiceMenu,
  onToggleVoiceState,
  outputMenuNode,
  truncatedCurrentUserLabel,
  voiceMenu,
  voiceSessions,
  voiceUsersByChannel,
  voiceState,
  workspace
}) {
  const inputMenuAnchorRef = useRef(null);
  const outputMenuAnchorRef = useRef(null);
  const [voiceMenuPosition, setVoiceMenuPosition] = useState(null);
  const joinedVoiceCount = joinedVoiceChannel
    ? Math.max(
        (voiceSessions[joinedVoiceChannel.id] || []).length,
        (voiceUsersByChannel?.[joinedVoiceChannel.id] || []).length
      )
    : 0;

  useEffect(() => {
    if (voiceMenu !== "input" && voiceMenu !== "output") {
      setVoiceMenuPosition(null);
      return undefined;
    }

    const anchor =
      voiceMenu === "input" ? inputMenuAnchorRef.current : outputMenuAnchorRef.current;

    if (!anchor || typeof window === "undefined") {
      setVoiceMenuPosition(null);
      return undefined;
    }

    function updateVoiceMenuPosition() {
      const rect = anchor.getBoundingClientRect();
      const estimatedMenuWidth = voiceMenu === "output" ? 328 : 308;
      const nextLeft = Math.min(
        window.innerWidth - estimatedMenuWidth - 12,
        Math.max(12, rect.left + rect.width / 2 - estimatedMenuWidth / 2)
      );

      setVoiceMenuPosition({
        left: `${Math.round(nextLeft)}px`,
        top: `${Math.round(rect.top - 10)}px`
      });
    }

    updateVoiceMenuPosition();
    window.addEventListener("resize", updateVoiceMenuPosition);
    window.addEventListener("scroll", updateVoiceMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateVoiceMenuPosition);
      window.removeEventListener("scroll", updateVoiceMenuPosition, true);
    };
  }, [voiceMenu]);

  return (
    <div className="navigator-footer">
      {joinedVoiceChannel ? (
        <div className="joined-voice-chip">
          <button
            className="joined-voice-main"
            onClick={() => onSelectGuildChannel(joinedVoiceChannel)}
            type="button"
          >
            <Icon name="headphones" size={15} />
            <span>
              <strong title={joinedVoiceChannel.name}>{joinedVoiceChannel.name}</strong>
              <small>{joinedVoiceCount} conectado(s)</small>
            </span>
          </button>
          <button
            aria-label="Salir del canal de voz"
            className="ghost-button icon-only small"
            onClick={onHandleVoiceLeave}
            type="button"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}

      {voiceMenu === "input" && inputMenuNode && voiceMenuPosition ? (
        <div className="navigator-footer-voice-menu-shell" style={voiceMenuPosition}>
          {inputMenuNode}
        </div>
      ) : null}
      {voiceMenu === "output" && outputMenuNode && voiceMenuPosition ? (
        <div className="navigator-footer-voice-menu-shell" style={voiceMenuPosition}>
          {outputMenuNode}
        </div>
      ) : null}

      <div className="user-dock">
        <button className="profile-card profile-card-button user-dock-profile" onClick={onOpenSelfMenu} type="button">
          <Avatar
            hue={workspace.current_user.avatar_hue}
            label={workspace.current_user.username}
            size={36}
            src={workspace.current_user.avatar_url}
            status={workspace.current_user.status}
          />
          <div className="profile-meta">
            <strong title={currentUserLabel}>{truncatedCurrentUserLabel}</strong>
            <span>{workspace.current_user.status || "Offline"}</span>
          </div>
        </button>

        <div className="footer-actions footer-voice-actions">
          <div
            className={`dock-split-control ${
              voiceState.micMuted ? "danger active" : voiceMenu === "input" ? "active" : ""
            }`}
            ref={inputMenuAnchorRef}
          >
            <button
              aria-label={voiceState.micMuted ? "Activar microfono" : "Silenciar microfono"}
              className={`dock-split-main tooltip-anchor ${voiceState.micMuted ? "danger active" : ""}`}
              data-tooltip={voiceState.micMuted ? "Activar microfono" : "Silenciar"}
              data-tooltip-position="top"
              onClick={() => onToggleVoiceState("micMuted")}
              type="button"
            >
              <Icon name={voiceState.micMuted ? "micOff" : "mic"} />
            </button>
            <button
              aria-label="Opciones del microfono"
              className={`dock-split-caret tooltip-anchor ${voiceMenu === "input" ? "active" : ""}`}
              data-tooltip="Opciones de entrada"
              data-tooltip-position="top"
              onClick={() => onToggleVoiceMenu("input")}
              type="button"
            >
              <Icon name="chevronDown" size={14} />
            </button>
          </div>
          <div
            className={`dock-split-control ${
              voiceState.deafen ? "danger active" : voiceMenu === "output" ? "active" : ""
            }`}
            ref={outputMenuAnchorRef}
          >
            <button
              aria-label={voiceState.deafen ? "Activar audio" : "Ensordecer"}
              className={`dock-split-main tooltip-anchor ${voiceState.deafen ? "danger active" : ""}`}
              data-tooltip={voiceState.deafen ? "Activar audio" : "Ensordecer"}
              data-tooltip-position="top"
              onClick={() => onToggleVoiceState("deafen")}
              type="button"
            >
              <Icon name={voiceState.deafen ? "deafen" : "headphones"} />
            </button>
            <button
              aria-label="Opciones de audio"
              className={`dock-split-caret tooltip-anchor ${voiceMenu === "output" ? "active" : ""}`}
              data-tooltip="Opciones de salida"
              data-tooltip-position="top"
              onClick={() => onToggleVoiceMenu("output")}
              type="button"
            >
              <Icon name="chevronDown" size={14} />
            </button>
          </div>
          <button
            aria-label="Abrir ajustes"
            className="ghost-button icon-only tooltip-anchor"
            data-tooltip="Ajustes"
            data-tooltip-position="top"
            onClick={onOpenSettings}
            type="button"
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>
    </div>
  );
}
