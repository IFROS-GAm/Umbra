import React, { useEffect, useRef } from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

function VoiceStageVideo({ stream, user }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      return undefined;
    }

    videoRef.current.srcObject = stream || null;

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      autoPlay
      className="voice-stage-video"
      muted
      playsInline
      ref={videoRef}
      title={user.display_name || user.username}
    />
  );
}

export function VoiceRoomStage({
  activeChannel,
  cameraStatus,
  cameraMenuNode,
  inputMenuNode,
  isDirectCall,
  joinedVoiceChannelId,
  onHandleVoiceLeave,
  onJoinVoiceChannel,
  onOpenProfileCard,
  onShowNotice,
  onToggleVoiceMenu,
  onToggleVoiceState,
  shareMenuNode,
  voiceMenu,
  voiceInputLevel,
  voiceStageParticipants,
  voiceState,
  workspace
}) {
  return (
    <section className="voice-room-stage">
      <div className="voice-room-hero">
        <div>
          <p className="eyebrow">
            {isDirectCall
              ? activeChannel?.type === "group_dm"
                ? "Llamada de grupo"
                : "Llamada directa"
              : "Canal de voz"}
          </p>
          <h2>{activeChannel?.display_name || activeChannel?.name || "Lounge"}</h2>
          <p>
            {activeChannel?.topic ||
              (isDirectCall
                ? "Comparte voz, camara y pantalla con la gente de este chat."
                : "Entra, mantente conectado y deja el chat de texto para el contexto.")}
          </p>
        </div>

        {joinedVoiceChannelId === activeChannel?.id ? (
          <button className="ghost-button danger" onClick={onHandleVoiceLeave} type="button">
            <Icon name="close" />
            <span>{isDirectCall ? "Salir de la llamada" : "Salir del canal"}</span>
          </button>
        ) : (
          <button className="primary-button" onClick={onJoinVoiceChannel} type="button">
            <Icon name="headphones" />
            <span>{isDirectCall ? "Unirte a la llamada" : "Entrar al canal"}</span>
          </button>
        )}
      </div>

      <div className={`voice-stage-grid tile-count-${Math.max(voiceStageParticipants.length, 1)}`}>
        {voiceStageParticipants.length ? (
          voiceStageParticipants.map((user) => (
            <button
              className={`voice-stage-tile ${user.isStreaming ? "streaming" : ""} ${user.isSpeaking ? "speaking" : ""}`.trim()}
              key={user.id}
              onClick={(event) => onOpenProfileCard(event, user, user.display_name)}
              style={user.stageStyle}
              type="button"
            >
              <div className="voice-stage-tile-top">
                {user.isStreaming ? (
                  <>
                    <span className="voice-stage-quality">720P 30 FPS</span>
                    <span className="voice-stage-live">EN VIVO</span>
                  </>
                ) : (
                  <span className="voice-stage-quality subtle">
                    {user.custom_status || "Umbra voice"}
                  </span>
                )}
              </div>

              <div className="voice-stage-center">
                {user.isCameraOn && user.localCameraStream ? (
                  <div className="voice-stage-video-shell">
                    <VoiceStageVideo stream={user.localCameraStream} user={user} />
                  </div>
                ) : (
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.display_name || user.username}
                    size={84}
                    src={user.avatar_url}
                    status={user.status}
                  />
                )}
              </div>

              <div className="voice-stage-nameplate">
                <strong>{user.display_name || user.username}</strong>
                {user.id === workspace.current_user.id && voiceState.micMuted ? (
                  <Icon name="micOff" size={14} />
                ) : null}
                {user.id === workspace.current_user.id && !voiceState.micMuted ? (
                  <span className="voice-stage-level-chip">{Math.round(voiceInputLevel)}%</span>
                ) : null}
              </div>
            </button>
          ))
        ) : (
          <div className="empty-state compact voice-empty-stage">
            <h3>Aun no hay participantes.</h3>
            <p>Cuando alguien entre al canal, aparecera aqui su tile de voz.</p>
          </div>
        )}
      </div>

      <div className="voice-stage-bottom-bar">
        <div className="voice-stage-control-group voice-stage-menu-shell">
          {inputMenuNode}
          <button
            className={`voice-stage-control tooltip-anchor ${voiceState.micMuted ? "danger active" : ""}`}
            data-tooltip={voiceState.micMuted ? "Activar microfono" : "Silenciar"}
            data-tooltip-position="top"
            onClick={() => onToggleVoiceState("micMuted")}
            type="button"
          >
            <Icon name={voiceState.micMuted ? "micOff" : "mic"} />
          </button>
          <button
            className={`voice-stage-control small tooltip-anchor ${voiceMenu === "input" ? "active" : ""}`}
            data-tooltip="Ajustes de voz"
            data-tooltip-position="top"
            onClick={() => onToggleVoiceMenu("input")}
            type="button"
          >
            <Icon name="chevronDown" size={14} />
          </button>
        </div>

        <div className="voice-stage-control-group voice-stage-menu-shell">
          {cameraMenuNode}
          <button
            className={`voice-stage-control tooltip-anchor ${voiceState.cameraEnabled ? "active" : ""}`}
            data-tooltip={
              voiceState.cameraEnabled
                ? "Apagar camara"
                : cameraStatus?.error
                  ? "Reintentar camara"
                  : "Encender la camara"
            }
            data-tooltip-position="top"
            onClick={() => onToggleVoiceState("cameraEnabled")}
            type="button"
          >
            <Icon name="camera" />
          </button>
          <button
            className={`voice-stage-control small tooltip-anchor ${voiceMenu === "camera" ? "active" : ""}`}
            data-tooltip="Ajustes de camara"
            data-tooltip-position="top"
            onClick={() => onToggleVoiceMenu("camera")}
            type="button"
          >
            <Icon name="chevronDown" size={14} />
          </button>
        </div>

        <div className="voice-stage-control-group voice-stage-menu-shell">
          {shareMenuNode}
          <button
            className={`voice-stage-control tooltip-anchor ${voiceState.screenShareEnabled ? "success active" : ""}`}
            data-tooltip={
              voiceState.screenShareEnabled ? "Detener transmision" : "Compartir pantalla"
            }
            data-tooltip-position="top"
            onClick={() => onToggleVoiceState("screenShareEnabled")}
            type="button"
          >
            <Icon name="screenShare" />
          </button>
          <button
            className={`voice-stage-control small tooltip-anchor ${voiceMenu === "share" ? "active" : ""}`}
            data-tooltip="Ajustes de transmision"
            data-tooltip-position="top"
            onClick={() => onToggleVoiceMenu("share")}
            type="button"
          >
            <Icon name="chevronDown" size={14} />
          </button>
        </div>

        <div className="voice-stage-control-group">
          <button
            className={`voice-stage-control tooltip-anchor ${voiceState.deafen ? "active" : ""}`}
            data-tooltip={voiceState.deafen ? "Activar audio" : "Ensordecer"}
            data-tooltip-position="top"
            onClick={() => onToggleVoiceState("deafen")}
            type="button"
          >
            <Icon name={voiceState.deafen ? "deafen" : "headphones"} />
          </button>
          <button
            className="voice-stage-control tooltip-anchor"
            data-tooltip="Soundboard"
            data-tooltip-position="top"
            onClick={() => onShowNotice("Soundboard y efectos listos para una siguiente pasada.")}
            type="button"
          >
            <Icon name="sparkles" />
          </button>
          <button
            className="voice-stage-control tooltip-anchor"
            data-tooltip="Pantalla completa"
            data-tooltip-position="top"
            onClick={() => onShowNotice("Vista expandida preparada para la shell desktop.")}
            type="button"
          >
            <Icon name="expand" />
          </button>
          <button
            className="voice-stage-control tooltip-anchor"
            data-tooltip="Mas acciones"
            data-tooltip-position="top"
            onClick={() => onShowNotice("Acciones extra de voz pendientes.")}
            type="button"
          >
            <span className="voice-stage-more">...</span>
          </button>
        </div>

        <button
          className="voice-stage-control hangup tooltip-anchor"
          data-tooltip="Desconectarse"
          data-tooltip-position="top"
          onClick={onHandleVoiceLeave}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>
    </section>
  );
}
