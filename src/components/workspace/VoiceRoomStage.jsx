import React, { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

function VoiceStageVideo({ muted = true, stream, user, volume = 1 }) {
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
  onOpenParticipantMenu,
  onJoinVoiceChannel,
  onOpenProfileCard,
  onToggleScreenShare,
  onShowNotice,
  onToggleVoiceMenu,
  onToggleVoiceState,
  shareMenuNode,
  screenShareQualityLabel = "720P 30 FPS",
  voiceMenu,
  voiceInputLevel,
  voiceStageParticipants,
  voiceState,
  workspace
}) {
  const [expandedStreamOpen, setExpandedStreamOpen] = useState(false);
  const featuredStreamUser =
    voiceStageParticipants.find((user) => user.localScreenShareStream) || null;
  const secondaryParticipants = featuredStreamUser
    ? voiceStageParticipants.filter((user) => user.id !== featuredStreamUser.id)
    : voiceStageParticipants;

  useEffect(() => {
    if (!featuredStreamUser?.localScreenShareStream && expandedStreamOpen) {
      setExpandedStreamOpen(false);
    }
  }, [expandedStreamOpen, featuredStreamUser]);

  const currentUserId = workspace?.current_user?.id || null;
  function renderParticipantMediaBadges(user, { compact = false } = {}) {
    const badgeClass = compact
      ? "direct-call-stage-mini-chip"
      : "direct-call-stage-state-chip";

    return (
      <>
        {user?.isStreaming ? (
          <span className={badgeClass}>
            <Icon name="screenShare" size={12} />
          </span>
        ) : null}
        {user?.isCameraOn && !user?.localCameraStream ? (
          <span className={badgeClass}>
            <Icon name="camera" size={12} />
          </span>
        ) : null}
      </>
    );
  }

  function renderParticipantAudioIndicator(user, { allowInputLevel = false } = {}) {
    if (user?.isDeafened) {
      return <Icon name="deafen" size={14} />;
    }

    if (user?.isMuted) {
      return <Icon name="micOff" size={14} />;
    }

    if (allowInputLevel && user?.isCurrentUser) {
      return <span className="voice-stage-level-chip">{Math.round(voiceInputLevel)}%</span>;
    }

    return null;
  }

  const directCallMembers = useMemo(() => {
    if (!isDirectCall) {
      return [];
    }

    const memberMap = new Map();

    if (workspace?.current_user?.id) {
      memberMap.set(workspace.current_user.id, workspace.current_user);
    }

    (activeChannel?.participants || []).forEach((participant) => {
      if (participant?.id) {
        memberMap.set(participant.id, {
          ...memberMap.get(participant.id),
          ...participant
        });
      }
    });

    voiceStageParticipants.forEach((participant) => {
      if (participant?.id) {
        memberMap.set(participant.id, {
          ...memberMap.get(participant.id),
          ...participant,
          inCall: true
        });
      }
    });

    return Array.from(memberMap.values())
      .map((participant) => {
        const stageParticipant =
          voiceStageParticipants.find((voiceUser) => voiceUser.id === participant.id) || null;

        return {
          ...participant,
          ...(stageParticipant || {}),
          inCall: Boolean(stageParticipant),
          isCurrentUser: participant.id === currentUserId
        };
      })
      .sort((left, right) => {
        if (left.inCall !== right.inCall) {
          return left.inCall ? -1 : 1;
        }

        if (left.isSpeaking !== right.isSpeaking) {
          return left.isSpeaking ? -1 : 1;
        }

        if (left.isCurrentUser !== right.isCurrentUser) {
          return left.isCurrentUser ? -1 : 1;
        }

        return String(left.display_name || left.username || "").localeCompare(
          String(right.display_name || right.username || "")
        );
      });
  }, [
    activeChannel?.participants,
    currentUserId,
    isDirectCall,
    voiceStageParticipants,
    workspace?.current_user
  ]);
  const directCallHeroMembers = directCallMembers.slice(0, 4);
  const directCallOverflowCount = Math.max(directCallMembers.length - directCallHeroMembers.length, 0);
  const connectedDirectCallCount = directCallMembers.filter((participant) => participant.inCall).length;
  const directCallSummary =
    activeChannel?.type === "group_dm"
      ? `${connectedDirectCallCount || 0} en llamada • ${directCallMembers.length || 0} miembros`
      : connectedDirectCallCount > 1
        ? "Ambos estan conectados en esta llamada."
        : "Llamada privada en curso.";

  const voiceControlDock = (
    <div className={`voice-stage-bottom-bar ${isDirectCall ? "direct-call-dock" : ""}`.trim()}>
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
          data-tooltip={voiceState.screenShareEnabled ? "Detener transmision" : "Compartir pantalla"}
          data-tooltip-position="top"
          onClick={onToggleScreenShare}
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
          onClick={() => {
            if (featuredStreamUser?.localScreenShareStream) {
              setExpandedStreamOpen(true);
              return;
            }

            onShowNotice("Primero inicia una transmision para ampliarla.");
          }}
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
        <Icon name={isDirectCall ? "phone" : "close"} />
      </button>
    </div>
  );

  if (isDirectCall) {
    return (
      <section className="voice-room-stage direct-call-stage">
        <div className="direct-call-stage-layout">
          <div className="direct-call-stage-main voice-room-card">
            <div className="direct-call-stage-hero">
              <div>
                <p className="eyebrow">
                  {activeChannel?.type === "group_dm" ? "Llamada de grupo" : "Llamada privada"}
                </p>
                <h2>{activeChannel?.display_name || activeChannel?.name || "Llamada"}</h2>
                <p>{activeChannel?.topic || directCallSummary}</p>
              </div>

              <div className="direct-call-stage-badges">
                <span className="inline-pill active">En llamada</span>
                {featuredStreamUser ? <span className="inline-pill">Pantalla compartida</span> : null}
                <span className="inline-pill">{connectedDirectCallCount || 0} conectados</span>
              </div>
            </div>

            <div className="direct-call-stage-center">
              <div className="direct-call-stage-avatar-row">
                {directCallHeroMembers.map((user) => (
                  <button
                    className={`direct-call-stage-avatar-card ${user.isSpeaking ? "speaking" : ""}`.trim()}
                    key={user.id}
                    onClick={(event) => onOpenProfileCard(event, user, user.display_name)}
                    onContextMenu={(event) => onOpenParticipantMenu?.(event, user)}
                    style={user.stageStyle}
                    type="button"
                  >
                    <div className="direct-call-stage-avatar-visual">
                      {user.isCameraOn && user.localCameraStream ? (
                        <div className="direct-call-stage-avatar-video">
                          <VoiceStageVideo
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
                          size={112}
                          src={user.avatar_url}
                          status={user.status}
                        />
                      )}

                      <div className="direct-call-stage-avatar-icons">
                        {renderParticipantMediaBadges(user, { compact: true })}
                        {user.isMuted || user.isDeafened ? (
                          <span className="direct-call-stage-mini-chip danger">
                            <Icon name={user.isDeafened ? "deafen" : "micOff"} size={12} />
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="direct-call-stage-avatar-copy">
                      <strong>{user.display_name || user.username}</strong>
                      <span>
                        {user.inCall
                          ? user.isCurrentUser
                            ? "Tu voz esta conectada"
                            : "En llamada"
                          : user.custom_status || user.status || "Disponible"}
                      </span>
                    </div>
                  </button>
                ))}

                {directCallOverflowCount > 0 ? (
                  <div className="direct-call-stage-avatar-overflow">
                    +{directCallOverflowCount}
                  </div>
                ) : null}
              </div>

              {featuredStreamUser ? (
                <button
                  className="direct-call-stage-stream-preview"
                  onClick={() => setExpandedStreamOpen(true)}
                  type="button"
                >
                  <div className="direct-call-stage-stream-copy">
                    <strong>{featuredStreamUser.display_name || featuredStreamUser.username}</strong>
                    <span>esta compartiendo pantalla</span>
                  </div>
                  <span className="inline-pill active">{screenShareQualityLabel}</span>
                </button>
              ) : null}

              {joinedVoiceChannelId === activeChannel?.id ? (
                voiceControlDock
              ) : (
                <button className="primary-button direct-call-stage-join" onClick={onJoinVoiceChannel} type="button">
                  <Icon name="phone" />
                  <span>Unirte a la llamada</span>
                </button>
              )}
            </div>
          </div>

          <aside className="voice-room-card direct-call-stage-sidebar">
            <div className="voice-room-card-header">
              <strong>Miembros</strong>
              <span>{directCallMembers.length}</span>
            </div>

            <div className="voice-user-list direct-call-stage-member-list">
              {directCallMembers.map((user) => (
                <button
                  className={`voice-user-row direct-call-stage-member-row ${user.inCall ? "active" : ""}`.trim()}
                  key={user.id}
                  onClick={(event) => onOpenProfileCard(event, user, user.display_name)}
                  onContextMenu={(event) => onOpenParticipantMenu?.(event, user)}
                  type="button"
                >
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.display_name || user.username}
                    size={44}
                    src={user.avatar_url}
                    status={user.status}
                  />

                  <div className="voice-user-copy">
                    <strong>{user.display_name || user.username}</strong>
                    <span>
                      {user.inCall
                        ? user.isCurrentUser
                          ? "Tu voz esta activa"
                          : "Conectado a la llamada"
                        : user.custom_status || user.status || "Sin conectar"}
                    </span>
                  </div>

                  <div className="direct-call-stage-member-flags">
                    {renderParticipantMediaBadges(user)}
                    {user.isMuted || user.isDeafened ? (
                      <span className="direct-call-stage-state-chip danger">
                        <Icon name={user.isDeafened ? "deafen" : "micOff"} size={12} />
                      </span>
                    ) : null}
                    <span className={`direct-call-stage-state-chip ${user.inCall ? "active" : ""}`.trim()}>
                      {user.inCall ? "En llamada" : "Chat"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>

        {expandedStreamOpen && featuredStreamUser?.localScreenShareStream ? (
          <div
            className="voice-stage-stream-overlay"
            onClick={() => setExpandedStreamOpen(false)}
            role="presentation"
          >
            <div
              className="voice-stage-stream-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="voice-stage-stream-modal-top">
                <div className="voice-stage-stream-modal-badges">
                  <span className="voice-stage-quality">{screenShareQualityLabel}</span>
                  <span className="voice-stage-live">EN VIVO</span>
                </div>
                <button
                  className="voice-stage-stream-close"
                  onClick={() => setExpandedStreamOpen(false)}
                  type="button"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>

              <div className="voice-stage-stream-frame">
                <div className="voice-stage-video-shell stream-modal">
                  <VoiceStageVideo
                    stream={featuredStreamUser.localScreenShareStream}
                    user={featuredStreamUser}
                  />
                </div>

                <div className="voice-stage-stream-chip">
                  <strong>{featuredStreamUser.display_name || featuredStreamUser.username}</strong>
                  <small>{featuredStreamUser.custom_status || "Transmision activa"}</small>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

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

      {featuredStreamUser ? (
        <div className="voice-stage-featured-layout">
          <button
            className={`voice-stage-featured ${featuredStreamUser.isSpeaking ? "speaking" : ""}`.trim()}
            onClick={() => setExpandedStreamOpen(true)}
            onContextMenu={(event) => onOpenParticipantMenu?.(event, featuredStreamUser)}
            style={featuredStreamUser.stageStyle}
            type="button"
          >
            <div className="voice-stage-featured-top">
              <span className="voice-stage-quality">{screenShareQualityLabel}</span>
              <span className="voice-stage-live">EN VIVO</span>
            </div>

            <div className="voice-stage-video-shell featured">
              <VoiceStageVideo
                muted={featuredStreamUser.mediaMuted}
                stream={featuredStreamUser.localScreenShareStream}
                user={featuredStreamUser}
                volume={featuredStreamUser.mediaVolume}
              />
            </div>

            <div className="voice-stage-featured-pip">
              {featuredStreamUser.isCameraOn && featuredStreamUser.localCameraStream ? (
                <div className="voice-stage-video-shell pip">
                  <VoiceStageVideo
                    muted={featuredStreamUser.mediaMuted}
                    stream={featuredStreamUser.localCameraStream}
                    user={featuredStreamUser}
                    volume={featuredStreamUser.mediaVolume}
                  />
                </div>
              ) : (
                <Avatar
                  hue={featuredStreamUser.avatar_hue}
                  label={featuredStreamUser.display_name || featuredStreamUser.username}
                  size={84}
                  src={featuredStreamUser.avatar_url}
                  status={featuredStreamUser.status}
                />
              )}
            </div>

            <div className="voice-stage-nameplate featured">
              <strong>{featuredStreamUser.display_name || featuredStreamUser.username}</strong>
              {renderParticipantAudioIndicator(featuredStreamUser, {
                allowInputLevel: true
              })}
            </div>
          </button>

          <div className="voice-stage-thumbnail-strip">
            {secondaryParticipants.length ? (
              secondaryParticipants.map((user) => (
                <button
                  className={`voice-stage-thumbnail ${user.isSpeaking ? "speaking" : ""}`.trim()}
                  key={user.voicePeerId || user.id}
                  onClick={(event) => {
                    if (user.isStreaming && user.localScreenShareStream) {
                      setExpandedStreamOpen(true);
                      return;
                    }

                    onOpenProfileCard(event, user, user.display_name);
                  }}
                  onContextMenu={(event) => onOpenParticipantMenu?.(event, user)}
                  style={user.stageStyle}
                  type="button"
                >
                  {user.isCameraOn && user.localCameraStream ? (
                    <div className="voice-stage-video-shell thumbnail">
                      <VoiceStageVideo
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
                        size={72}
                        src={user.avatar_url}
                        status={user.status}
                      />
                      <span>{user.hiddenVideoLabel || "Video oculto"}</span>
                    </div>
                  ) : (
                    <Avatar
                      hue={user.avatar_hue}
                      label={user.display_name || user.username}
                      size={72}
                      src={user.avatar_url}
                      status={user.status}
                    />
                  )}

                  <div className="voice-stage-nameplate thumbnail">
                    <strong>{user.display_name || user.username}</strong>
                    {renderParticipantAudioIndicator(user, {
                      allowInputLevel: true
                    })}
                  </div>
                </button>
              ))
            ) : (
              <div className="voice-stage-thumbnail-empty">
                Comparte la pantalla mientras mantienes la llamada viva con tu camara o avatar.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`voice-stage-grid tile-count-${Math.max(voiceStageParticipants.length, 1)}`}>
          {voiceStageParticipants.length ? (
            voiceStageParticipants.map((user) => (
              <button
                className={`voice-stage-tile ${user.isStreaming ? "streaming" : ""} ${user.isSpeaking ? "speaking" : ""}`.trim()}
                key={user.voicePeerId || user.id}
                onClick={(event) => {
                  if (user.isStreaming && user.localScreenShareStream) {
                    setExpandedStreamOpen(true);
                    return;
                  }

                  onOpenProfileCard(event, user, user.display_name);
                }}
                onContextMenu={(event) => onOpenParticipantMenu?.(event, user)}
                style={user.stageStyle}
                type="button"
              >
                <div className="voice-stage-tile-top">
                  {user.isStreaming ? (
                    <>
                      <span className="voice-stage-quality">{user.screenShareQualityLabel || screenShareQualityLabel}</span>
                      <span className="voice-stage-live">EN VIVO</span>
                    </>
                  ) : (
                    <span className="voice-stage-quality subtle">
                      {user.custom_status || "Umbra voice"}
                    </span>
                  )}
                  <div className="direct-call-stage-member-flags">
                    {renderParticipantMediaBadges(user)}
                  </div>
                </div>

                <div className="voice-stage-center">
                  {user.isStreaming && user.localScreenShareStream ? (
                    <div className="voice-stage-video-shell">
                      <VoiceStageVideo
                        muted={user.mediaMuted}
                        stream={user.localScreenShareStream}
                        user={user}
                        volume={user.mediaVolume}
                      />
                    </div>
                  ) : user.isCameraOn && user.localCameraStream ? (
                    <div className="voice-stage-video-shell">
                      <VoiceStageVideo
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
                      size={84}
                      src={user.avatar_url}
                      status={user.status}
                    />
                  )}
                </div>

                <div className="voice-stage-nameplate">
                  <strong>{user.display_name || user.username}</strong>
                  {renderParticipantAudioIndicator(user, {
                    allowInputLevel: true
                  })}
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
      )}

      {voiceControlDock}

      {expandedStreamOpen && featuredStreamUser?.localScreenShareStream ? (
        <div
          className="voice-stage-stream-overlay"
          onClick={() => setExpandedStreamOpen(false)}
          role="presentation"
        >
          <div
            className="voice-stage-stream-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="voice-stage-stream-modal-top">
              <div className="voice-stage-stream-modal-badges">
                <span className="voice-stage-quality">{screenShareQualityLabel}</span>
                <span className="voice-stage-live">EN VIVO</span>
              </div>
              <button
                className="voice-stage-stream-close"
                onClick={() => setExpandedStreamOpen(false)}
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="voice-stage-stream-frame">
              <div className="voice-stage-video-shell stream-modal">
                <VoiceStageVideo
                  stream={featuredStreamUser.localScreenShareStream}
                  user={featuredStreamUser}
                />
              </div>

              <div className="voice-stage-stream-chip">
                <strong>{featuredStreamUser.display_name || featuredStreamUser.username}</strong>
                <small>{featuredStreamUser.custom_status || "Transmision activa"}</small>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
