import React from "react";
import { createPortal } from "react-dom";

import { translate } from "../../../i18n.js";
import { Icon } from "../../Icon.jsx";
import {
  clampParticipantIntensity,
  clampParticipantVolume,
  MAX_VOICE_PARTICIPANT_INTENSITY,
  MAX_VOICE_PARTICIPANT_VOLUME
} from "./rtc/voiceRtcSessionConfig.js";

export function VoiceParticipantContextMenu({
  language = "es",
  menu,
  onClose,
  onCopyId,
  onOpenProfile,
  onOpenSelfProfile,
  onSendMessage,
  onUpdateIntensity,
  onToggleMuted,
  onToggleVideoHidden,
  onUpdateVolume,
  prefs
}) {
  const rootRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState(menu?.position || null);
  const t = (key, fallback = "") => translate(language, key, fallback);

  React.useEffect(() => {
    if (!menu?.user) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) {
        return;
      }

      onClose();
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menu, onClose]);

  React.useLayoutEffect(() => {
    if (!menu?.position || !rootRef.current) {
      return;
    }

    const safeArea = {
      bottom: 22,
      left: 12,
      right: 12,
      top: 12
    };
    const rect = rootRef.current.getBoundingClientRect();
    let nextX = menu.position.x;
    let nextY = menu.position.y;

    if (menu.position.anchorRect) {
      const topAlignedY = menu.position.anchorRect.top + 8;
      const upwardAnchoredY = menu.position.anchorRect.bottom - rect.height - 8;
      const fitsBelow = topAlignedY + rect.height <= window.innerHeight - safeArea.bottom;
      nextY =
        menu.position.anchorRect.bottom > window.innerHeight * 0.62 || !fitsBelow
          ? upwardAnchoredY
          : topAlignedY;
    }

    if (nextX + rect.width > window.innerWidth - safeArea.right) {
      nextX = window.innerWidth - rect.width - safeArea.right;
    }
    if (nextY + rect.height > window.innerHeight - safeArea.bottom) {
      nextY = window.innerHeight - rect.height - safeArea.bottom;
    }
    if (nextX < safeArea.left) {
      nextX = safeArea.left;
    }
    if (nextY < safeArea.top) {
      nextY = safeArea.top;
    }

    setMenuPosition((previous) => {
      if (previous?.x === nextX && previous?.y === nextY) {
        return previous;
      }

      return {
        ...previous,
        x: nextX,
        y: nextY
      };
    });
  }, [menu]);

  if (!menu?.user || !menuPosition) {
    return null;
  }

  const profile = menu.profile || null;
  const isCurrentUser = Boolean(profile?.isCurrentUser || menu.user.id === menu.currentUserId);
  const safePrefs = {
    intensity: clampParticipantIntensity(prefs?.intensity, 100),
    muted: Boolean(prefs?.muted),
    videoHidden: Boolean(prefs?.videoHidden),
    volume: clampParticipantVolume(prefs?.volume, 100)
  };

  const content = (
    <div
      className="floating-surface voice-participant-menu-shell"
      ref={rootRef}
      style={{
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`
      }}
    >
      <div className="voice-participant-menu">
        <button
          className="voice-participant-menu-row"
          onClick={() => {
            if (isCurrentUser) {
              onOpenSelfProfile?.();
            } else {
              onOpenProfile?.(profile || menu.user);
            }
            onClose();
          }}
          type="button"
        >
          <span>{t("voice.participant.profile", "Perfil")}</span>
          <Icon name="profile" size={15} />
        </button>

        {!isCurrentUser ? (
          <button
            className="voice-participant-menu-row"
            onClick={() => {
              onSendMessage?.(profile || menu.user);
              onClose();
            }}
            type="button"
          >
            <span>{t("voice.participant.message", "Enviar mensaje")}</span>
            <Icon name="mail" size={15} />
          </button>
        ) : null}

        <div className="voice-participant-menu-divider" />

        <div className="voice-participant-menu-slider-block">
          <div className="voice-participant-menu-slider-top">
            <strong>{t("voice.participant.volume", "Volumen de usuario")}</strong>
            <span>{safePrefs.volume}%</span>
          </div>

          <input
            aria-label={t("voice.participant.volume", "Volumen de usuario")}
            className="voice-participant-menu-slider"
            max={String(MAX_VOICE_PARTICIPANT_VOLUME)}
            min="0"
            onChange={(event) => onUpdateVolume?.(menu.user.id, event.target.value)}
            type="range"
            value={safePrefs.volume}
          />
        </div>

        <div className="voice-participant-menu-slider-block">
          <div className="voice-participant-menu-slider-top">
            <strong>{t("voice.participant.intensity", "Intensidad local")}</strong>
            <span>{safePrefs.intensity}%</span>
          </div>

          <input
            aria-label={t("voice.participant.intensity", "Intensidad local")}
            className="voice-participant-menu-slider"
            max={String(MAX_VOICE_PARTICIPANT_INTENSITY)}
            min="0"
            onChange={(event) => onUpdateIntensity?.(menu.user.id, event.target.value)}
            type="range"
            value={safePrefs.intensity}
          />
        </div>

        <div className="voice-participant-menu-divider" />

        <button
          className="voice-participant-menu-row voice-participant-menu-row-check"
          onClick={() => onToggleMuted?.(menu.user.id)}
          type="button"
        >
          <span>{t("voice.participant.mute", "Silenciar")}</span>
          <i className={`voice-participant-menu-checkbox ${safePrefs.muted ? "active" : ""}`.trim()} />
        </button>

        <button
          className="voice-participant-menu-row voice-participant-menu-row-check"
          onClick={() => onToggleVideoHidden?.(menu.user.id)}
          type="button"
        >
          <span>
            <strong>{t("voice.participant.hideVideo", "Desactivar video")}</strong>
            <small>
              {t(
                "voice.participant.hideVideoCopy",
                "Oculta su camara y lo que comparta solo para ti."
              )}
            </small>
          </span>
          <i
            className={`voice-participant-menu-checkbox ${safePrefs.videoHidden ? "active" : ""}`.trim()}
          />
        </button>

        <div className="voice-participant-menu-divider" />

        <button
          className="voice-participant-menu-row"
          onClick={() => {
            onCopyId?.(menu.user);
            onClose();
          }}
          type="button"
        >
          <span>{t("voice.participant.copyId", "Copiar ID del usuario")}</span>
          <span className="voice-participant-id-chip">ID</span>
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
