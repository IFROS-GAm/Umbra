import React, { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";
import { normalizeConversationCopy } from "../shared/workspaceHelpers.js";

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
        <span>Ensordecido</span>
      </span>
    );
  }

  if (user?.isMuted) {
    return (
      <span className="direct-call-panel-state-chip danger">
        <Icon name="micOff" size={12} />
        <span>Silenciado</span>
      </span>
    );
  }

  return null;
}

function getParticipantPresenceLabel(user) {
  if (user?.inCall) {
    return user?.isCurrentUser ? "Tu voz esta conectada" : "En llamada contigo";
  }

  return user?.custom_status || user?.status || "Disponible";
}

function getParticipantTileStatus(user) {
  if (user?.isStreaming) {
    return "Compartiendo pantalla";
  }

  if (user?.isCameraOn) {
    return "Camara activa";
  }

  return getParticipantPresenceLabel(user);
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
  screenShareQualityLabel = "720P 30 FPS",
  voiceStageParticipants,
  voiceState
}) {
  const [expandedMedia, setExpandedMedia] = useState(null);
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
  const panelTopic = normalizeConversationCopy(activeChannel?.topic || callSummary);
  const expandedMediaEntry = useMemo(() => {
    if (!expandedMedia?.userId || !expandedMedia?.kind) {
      return null;
    }

    const targetUser =
      connectedParticipants.find((participant) => participant.id === expandedMedia.userId) || null;

    if (!targetUser) {
      return null;
    }

    if (expandedMedia.kind === "screen" && targetUser.localScreenShareStream) {
      return {
        kind: "screen",
        label: targetUser.screenShareQualityLabel || screenShareQualityLabel,
        stream: targetUser.localScreenShareStream,
        sublabel: targetUser.custom_status || "Transmision activa",
        user: targetUser
      };
    }

    if (expandedMedia.kind === "camera" && targetUser.localCameraStream) {
      return {
        kind: "camera",
        label: "Camara",
        stream: targetUser.localCameraStream,
        sublabel: getParticipantPresenceLabel(targetUser),
        user: targetUser
      };
    }

    return null;
  }, [connectedParticipants, expandedMedia, screenShareQualityLabel]);

  function openExpandedMedia(user, kind) {
    if (kind === "screen" && user?.localScreenShareStream) {
      setExpandedMedia({
        kind,
        userId: user.id
      });
      return true;
    }

    if (kind === "camera" && user?.localCameraStream) {
      setExpandedMedia({
        kind,
        userId: user.id
      });
      return true;
    }

    return false;
  }

  function handlePrimaryMediaClick(event, user) {
    if (openExpandedMedia(user, "screen")) {
      return;
    }

    if (openExpandedMedia(user, "camera")) {
      return;
    }

    onOpenProfileCard?.(event, user, user.display_name);
  }

  return (
    <section className={`direct-call-panel direct-call-panel-${displayMode}`.trim()}>
      <div className="direct-call-panel-header">
        <div>
          <p className="eyebrow">Llamada privada</p>
          <h2>{activeChannel?.display_name || activeChannel?.name || "Llamada"}</h2>
          <p>{panelTopic}</p>
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
          <div
            className={`direct-call-panel-participant ${user.isStreaming ? "streaming" : ""} ${user.isSpeaking ? "speaking" : ""}`.trim()}
            key={user.id}
            onContextMenu={(event) => onOpenParticipantMenu?.(event, user)}
            style={user.stageStyle}
          >
            <div className="direct-call-panel-tile-top">
              <span className="direct-call-panel-tile-status">{getParticipantTileStatus(user)}</span>

              <div className="direct-call-panel-flags">
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

            <button
              className={`direct-call-panel-media-button ${
                user.isStreaming || user.isCameraOn ? "has-media" : ""
              }`.trim()}
              onClick={(event) => handlePrimaryMediaClick(event, user)}
              type="button"
            >
              <div className="direct-call-panel-participant-media">
                {user.isStreaming && user.localScreenShareStream ? (
                  <div className="direct-call-panel-video-shell">
                    <DirectCallVideo
                      muted={user.mediaMuted}
                      stream={user.localScreenShareStream}
                      user={user}
                      volume={user.mediaVolume}
                    />
                  </div>
                ) : user.isCameraOn && user.localCameraStream ? (
                  <div className="direct-call-panel-video-shell">
                    <DirectCallVideo
                      muted={user.mediaMuted}
                      stream={user.localCameraStream}
                      user={user}
                      volume={user.mediaVolume}
                    />
                  </div>
                ) : user.isVideoHiddenForMe && (user.isStreaming || user.isCameraOn) ? (
                  <div className="voice-stage-hidden-media">
                    <Avatar
                      hue={user.avatar_hue}
                      label={user.display_name || user.username}
                      size={84}
                      src={user.avatar_url}
                      status={user.status}
                    />
                    <span>{user.hiddenVideoLabel || "Video oculto"}</span>
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
              </div>

              {user.isStreaming || user.isCameraOn ? (
                <span className="direct-call-panel-expand-chip">
                  <Icon name="expand" size={14} />
                </span>
              ) : null}
            </button>

            {user.isStreaming && user.localScreenShareStream && user.isCameraOn && user.localCameraStream ? (
              <button
                className="direct-call-panel-camera-pip"
                onClick={() => openExpandedMedia(user, "camera")}
                type="button"
              >
                <div className="voice-stage-video-shell pip direct-call-panel-pip-shell">
                  <DirectCallVideo
                    muted={user.mediaMuted}
                    stream={user.localCameraStream}
                    user={user}
                    volume={user.mediaVolume}
                  />
                </div>
                <span className="direct-call-panel-pip-label">Camara</span>
              </button>
            ) : null}

            <button
              className="direct-call-panel-nameplate direct-call-panel-nameplate-button"
              onClick={(event) => onOpenProfileCard?.(event, user, user.display_name)}
              type="button"
            >
              <div className="direct-call-panel-copy">
                <strong>{user.display_name || user.username}</strong>
                <span>{getParticipantPresenceLabel(user)}</span>
              </div>
            </button>
          </div>
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

      {expandedMediaEntry ? (
        <div
          className="voice-stage-stream-overlay"
          onClick={() => setExpandedMedia(null)}
          role="presentation"
        >
          <div
            className="voice-stage-stream-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="voice-stage-stream-modal-top">
              <div className="voice-stage-stream-modal-badges">
                <span className="voice-stage-quality">{expandedMediaEntry.label}</span>
                {expandedMediaEntry.kind === "screen" ? (
                  <span className="voice-stage-live">EN VIVO</span>
                ) : null}
              </div>
              <button
                className="voice-stage-stream-close"
                onClick={() => setExpandedMedia(null)}
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="voice-stage-stream-frame">
              <div className="voice-stage-video-shell stream-modal">
                <DirectCallVideo
                  muted={expandedMediaEntry.user.mediaMuted}
                  stream={expandedMediaEntry.stream}
                  user={expandedMediaEntry.user}
                  volume={expandedMediaEntry.user.mediaVolume}
                />
              </div>

              <div className="voice-stage-stream-chip">
                <strong>
                  {expandedMediaEntry.user.display_name || expandedMediaEntry.user.username}
                </strong>
                <small>{expandedMediaEntry.sublabel}</small>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
