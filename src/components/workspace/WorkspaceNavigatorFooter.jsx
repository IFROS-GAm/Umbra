import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

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
  voiceState,
  workspace
}) {
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
              <small>{(voiceSessions[joinedVoiceChannel.id] || []).length} conectado(s)</small>
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

      {inputMenuNode}
      {outputMenuNode}

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
