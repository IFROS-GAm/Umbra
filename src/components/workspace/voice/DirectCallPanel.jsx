import React, { useEffect, useMemo, useRef } from "react";

import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";

function DirectCallVideo({ muted = true, stream, user, volume = 1 }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      return undefined;
    }

    videoRef.current.srcObject = stream || null;
    videoRef.current.muted = Boolean(muted);
    videoRef.current.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    videoRef.current.play?.().catch(() => {});

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [muted, stream, volume]);

  return (
    <video
      autoPlay
      className="direct-call-panel-video"
      muted={Boolean(muted)}
      playsInline
      ref={videoRef}
      title={user.display_name || user.username}
    />
  );
}

function buildDirectCallParticipants({ activeChannel, currentUser, currentUserId, voiceStageParticipants }) {
  const participantMap = new Map();

  if (currentUser?.id) {
    participantMap.set(currentUser.id, currentUser);
  }

  (activeChannel?.participants || []).forEach((participant) => {
    if (!participant?.id) {
      return;
    }

    participantMap.set(participant.id, {
      ...participantMap.get(participant.id),
      ...participant
    });
  });

  voiceStageParticipants.forEach((participant) => {
    if (!participant?.id) {
      return;
    }

    participantMap.set(participant.id, {
      ...participantMap.get(participant.id),
      ...participant,
      inCall: true
    });
  });

  return Array.from(participantMap.values())
    .map((participant) => {
      const stageParticipant =
        voiceStageParticipants.find((voiceUser) => voiceUser.id === participant.id) || null;

      return {
        ...participant,
        ...(stageParticipant || {}),
        avatar_hue: stageParticipant?.avatar_hue || participant.avatar_hue || participant.avatarHue,
        avatar_url: stageParticipant?.avatar_url || participant.avatar_url || participant.avatarUrl,
        display_name:
          stageParticipant?.display_name || participant.display_name || participant.displayName,
        inCall: Boolean(stageParticipant),
        isCurrentUser: participant.id === currentUserId
      };
    })
    .sort((left, right) => {
      if (left.isCurrentUser !== right.isCurrentUser) {
        return left.isCurrentUser ? 1 : -1;
      }

      if (left.inCall !== right.inCall) {
        return left.inCall ? -1 : 1;
      }

      if (left.isSpeaking !== right.isSpeaking) {
        return left.isSpeaking ? -1 : 1;
      }

      return String(left.display_name || left.username || "").localeCompare(
        String(right.display_name || right.username || "")
      );
    });
}

function renderAudioStateChip(user) {
  if (user?.isDeafened) {
    return (
      <span className="direct-call-panel-state-chip danger">
        <Icon name="deafen" size={12} />
      </span>
    );
  }

  if (user?.isMuted) {
    return (
      <span className="direct-call-panel-state-chip danger">
        <Icon name="micOff" size={12} />
      </span>
    );
  }

  return null;
}

export function DirectCallPanel({
  activeChannel,
  currentUser,
  displayMode = "split",
  joinedVoiceChannelId,
  onJoinVoiceChannel,
  onLeaveVoice,
  onOpenParticipantMenu,
  onOpenProfileCard,
  onShowNotice,
  onToggleCamera,
  onToggleMute,
  onToggleScreenShare,
  voiceStageParticipants,
  voiceState
}) {
  const currentUserId = currentUser?.id || null;
  const participants = useMemo(
    () =>
      buildDirectCallParticipants({
        activeChannel,
        currentUser,
        currentUserId,
        voiceStageParticipants
      }),
    [activeChannel, currentUser, currentUserId, voiceStageParticipants]
  );
  const connectedParticipants = useMemo(
    () => participants.filter((participant) => participant.inCall),
    [participants]
  );
  const connectedCount = connectedParticipants.length;
  const callSummary =
    connectedCount > 1
      ? "Ambos estan conectados en esta llamada."
      : "Llamada privada activa. Esperando a la otra persona o sigue chateando mientras hablas.";

  return (
    <section className={`direct-call-panel direct-call-panel-${displayMode}`.trim()}>
      <div className="direct-call-panel-header">
        <div>
          <p className="eyebrow">Llamada privada</p>
          <h2>{activeChannel?.display_name || activeChannel?.name || "Llamada"}</h2>
          <p>{activeChannel?.topic || callSummary}</p>
        </div>

        <div className="direct-call-panel-badges">
          <span className="inline-pill active">En llamada</span>
          <span className="inline-pill">{connectedCount || 0} conectados</span>
        </div>
      </div>

      <div
        className={`direct-call-panel-grid direct-call-panel-grid-${Math.max(
          connectedParticipants.length,
          1
        )}`.trim()}
      >
        {connectedParticipants.map((user) => (
          <button
            className={`direct-call-panel-participant ${user.isSpeaking ? "speaking" : ""}`.trim()}
            key={user.id}
            onClick={(event) => onOpenProfileCard?.(event, user, user.display_name)}
            onContextMenu={(event) => onOpenParticipantMenu?.(event, user)}
            style={user.stageStyle}
            type="button"
          >
            <div className="direct-call-panel-participant-media">
              {user.isCameraOn && user.localCameraStream ? (
                <div className="direct-call-panel-video-shell">
                  <DirectCallVideo
                    muted={user.mediaMuted}
                    stream={user.localCameraStream}
                    user={user}
                    volume={user.mediaVolume}
                  />
                </div>
              ) : (
                <Avatar
                  hue={user.avatar_hue}
                  label={user.display_name || user.username}
                  size={displayMode === "call" ? 132 : 108}
                  src={user.avatar_url}
                  status={user.status}
                />
              )}

              <div className="direct-call-panel-icons">
                {user.isStreaming ? (
                  <span className="direct-call-panel-state-chip">
                    <Icon name="screenShare" size={12} />
                  </span>
                ) : null}
                {user.isCameraOn && !user.localCameraStream ? (
                  <span className="direct-call-panel-state-chip">
                    <Icon name="camera" size={12} />
                  </span>
                ) : null}
                {renderAudioStateChip(user)}
              </div>
            </div>

            <div className="direct-call-panel-copy">
              <strong>{user.display_name || user.username}</strong>
              <span>
                {user.inCall
                  ? user.isCurrentUser
                    ? "Tu voz esta conectada"
                    : "En llamada contigo"
                  : user.custom_status || user.status || "Disponible"}
              </span>
            </div>
          </button>
        ))}
      </div>

      {joinedVoiceChannelId === activeChannel?.id ? (
        <div className="direct-call-panel-controls">
          <button
            className={`voice-stage-control tooltip-anchor ${voiceState?.micMuted ? "danger active" : ""}`.trim()}
            data-tooltip={voiceState?.micMuted ? "Activar microfono" : "Silenciar"}
            data-tooltip-position="top"
            onClick={() => onToggleMute?.()}
            type="button"
          >
            <Icon name={voiceState?.micMuted ? "micOff" : "mic"} />
          </button>

          <button
            className={`voice-stage-control tooltip-anchor ${voiceState?.cameraEnabled ? "active" : ""}`.trim()}
            data-tooltip={voiceState?.cameraEnabled ? "Apagar camara" : "Encender camara"}
            data-tooltip-position="top"
            onClick={() => onToggleCamera?.()}
            type="button"
          >
            <Icon name="camera" />
          </button>

          <button
            className={`voice-stage-control tooltip-anchor ${voiceState?.screenShareEnabled ? "success active" : ""}`.trim()}
            data-tooltip={voiceState?.screenShareEnabled ? "Detener transmision" : "Compartir pantalla"}
            data-tooltip-position="top"
            onClick={() => onToggleScreenShare?.()}
            type="button"
          >
            <Icon name="screenShare" />
          </button>

          <button
            className="voice-stage-control hangup tooltip-anchor"
            data-tooltip="Salir de la llamada"
            data-tooltip-position="top"
            onClick={() => onLeaveVoice?.()}
            type="button"
          >
            <Icon name="phone" />
          </button>
        </div>
      ) : (
        <button className="primary-button direct-call-panel-join" onClick={() => onJoinVoiceChannel?.()} type="button">
          <Icon name="phone" />
          <span>Unirte a la llamada</span>
        </button>
      )}

      {voiceState?.screenShareEnabled && displayMode === "split" ? (
        <button
          className="direct-call-panel-share-hint"
          onClick={() => onShowNotice?.("Usa el modo solo llamada para enfocarte en la transmision.")}
          type="button"
        >
          <Icon name="screenShare" size={14} />
          <span>La llamada esta compartiendo pantalla. Cambia a solo llamada para verla mejor.</span>
        </button>
      ) : null}
    </section>
  );
}
