import React, { useEffect, useState } from "react";

import { Icon } from "../Icon.jsx";
import { translate } from "../../i18n.js";
import { fallbackDeviceLabel } from "./workspaceHelpers.js";

function buildUniqueDevices(devices, kind) {
  const seen = new Set();

  return devices.filter((device, index) => {
    const label = String(device.label || fallbackDeviceLabel(kind, index)).trim().toLowerCase();
    if (seen.has(label)) {
      return false;
    }
    seen.add(label);
    return true;
  });
}

function localizeGeneratedDeviceLabel(label, kind, language, t) {
  const normalized = String(label || "").trim();

  if (!normalized) {
    return normalized;
  }

  if (normalized === "Configuracion predeterminada") {
    return t("voice.device.default", "Configuracion predeterminada");
  }

  const patterns = {
    audioinput: /^Microfono\s+(\d+)$/i,
    audiooutput: /^Altavoces\s+(\d+)$/i,
    videoinput: /^Camara\s+(\d+)$/i
  };

  const match = patterns[kind]?.exec(normalized);
  if (!match) {
    return normalized;
  }

  return fallbackDeviceLabel(kind, Number(match[1]) - 1, language);
}

export function WorkspaceInputMenu({
  activeInputBars,
  activeInputProfile,
  activeInputProfileLabel,
  getSelectedDeviceLabel,
  handleApplyVoiceProfile,
  handleVoiceDeviceChange,
  inputMeterBars,
  language = "es",
  selectedVoiceDevices,
  setSettingsOpen,
  setVoiceInputPanel,
  setVoiceMenu,
  showUiNotice,
  toggleVoiceState,
  updateVoiceSetting,
  voiceDevices,
  voiceInputPanel,
  voiceInputStatus,
  voiceProfileOptions,
  voiceSuppressionAmountLabel,
  voiceState,
  voiceSuppressionCopy,
  voiceSuppressionLabel
}) {
  const t = (key, fallback = "") => translate(language, key, fallback);
  const inputDevices = voiceDevices.audioinput || [];
  const selectedInputLabel = localizeGeneratedDeviceLabel(
    getSelectedDeviceLabel("audioinput"),
    "audioinput",
    language,
    t
  );

  function renderInputSubmenu() {
    if (voiceInputPanel === "device") {
      return (
        <div className="floating-surface voice-control-menu voice-control-submenu">
          <div className="voice-control-submenu-header">
            <div className="voice-control-heading">
              <strong>{t("voice.input.device", "Dispositivo de entrada")}</strong>
              <small>{selectedInputLabel}</small>
            </div>
          </div>

          <div className="voice-control-option-list">
            {inputDevices.length ? (
              inputDevices.map((device, index) => {
                const label =
                  device.label ||
                  fallbackDeviceLabel("audioinput", index, language);
                const selected = selectedVoiceDevices.audioinput === device.deviceId;

                return (
                  <button
                    className={`voice-control-option ${selected ? "selected" : ""}`.trim()}
                    key={device.deviceId || `${label}-${index}`}
                    onClick={() => {
                      handleVoiceDeviceChange("audioinput", device.deviceId);
                      setVoiceInputPanel(null);
                      showUiNotice(`${t("voice.input.nowUsing", "Ahora usando")} ${label}.`);
                    }}
                    type="button"
                  >
                    <span>
                      <strong>{label}</strong>
                    </span>
                    <i className={`voice-control-radio ${selected ? "selected" : ""}`.trim()} />
                  </button>
                );
              })
            ) : (
              <div className="voice-control-empty">
                {t("voice.input.noDevices", "No hay microfonos disponibles.")}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (voiceInputPanel === "profile") {
      return (
        <div className="floating-surface voice-control-menu voice-control-submenu">
          <div className="voice-control-submenu-header">
            <div className="voice-control-heading">
              <strong>{t("voice.input.profile", "Perfil de entrada")}</strong>
              <small>{activeInputProfileLabel}</small>
            </div>
          </div>

          <div className="voice-control-option-list">
            {voiceProfileOptions.map((profile) => {
              const selected = activeInputProfile === profile.id;

              return (
                <button
                  className={`voice-control-option ${selected ? "selected" : ""}`.trim()}
                  key={profile.id}
                  onClick={() => handleApplyVoiceProfile(profile)}
                  type="button"
                >
                  <span>
                    <strong>{profile.label}</strong>
                    <small>{profile.description}</small>
                  </span>
                  <i className={`voice-control-radio ${selected ? "selected" : ""}`.trim()} />
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="floating-surface voice-control-menu input-menu">
      <div className="voice-control-menu-header">
        <div className="voice-control-heading">
          <strong>{t("voice.input.noiseTitle", "Supresion de ruido")}</strong>
          <small>{voiceSuppressionLabel}</small>
        </div>
        <div className="voice-control-menu-actions">
          <button
            aria-label={
              voiceState.noiseSuppression
                ? t("voice.input.noiseDisable", "Desactivar supresion de ruido")
                : t("voice.input.noiseEnable", "Activar supresion de ruido")
            }
            className={`voice-noise-toggle ${voiceState.noiseSuppression ? "active" : ""}`}
            onClick={() => toggleVoiceState("noiseSuppression")}
            type="button"
          >
            <span />
          </button>
          <button
            className="ghost-button icon-only small"
            onClick={() => setVoiceMenu(null)}
            type="button"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      <p className={`voice-noise-copy ${voiceInputStatus.error ? "error" : ""}`.trim()}>
        {voiceSuppressionCopy}
      </p>

      <div className="voice-control-divider" />

      <button
        className={`voice-control-link ${voiceInputPanel === "device" ? "panel-open" : ""}`.trim()}
        onClick={() =>
          setVoiceInputPanel((previous) => (previous === "device" ? null : "device"))
        }
        type="button"
      >
        <span>
          <strong>{t("voice.input.device", "Dispositivo de entrada")}</strong>
          <small>{selectedInputLabel}</small>
        </span>
        <Icon name="arrowRight" size={15} />
      </button>

      <button
        className={`voice-control-link ${voiceInputPanel === "profile" ? "panel-open" : ""}`.trim()}
        onClick={() =>
          setVoiceInputPanel((previous) => (previous === "profile" ? null : "profile"))
        }
        type="button"
      >
        <span>
          <strong>{t("voice.input.profile", "Perfil de entrada")}</strong>
          <small>{activeInputProfileLabel}</small>
        </span>
        <Icon name="arrowRight" size={15} />
      </button>

      <div className="voice-control-slider-block">
        <div className="voice-control-title-row">
          <strong>{t("voice.input.intensity", "Intensidad de supresion")}</strong>
          <small>{voiceSuppressionAmountLabel}</small>
        </div>
        <input
          max="100"
          min="0"
          onChange={(event) => {
            updateVoiceSetting("inputProfile", "custom");
            updateVoiceSetting("noiseSuppressionAmount", Number(event.target.value));
          }}
          type="range"
          value={voiceState.noiseSuppressionAmount}
        />
        <small className="voice-control-slider-caption">
          {t(
            "voice.input.intensityCopy",
            "Ajusta cuanto filtra Umbra el ruido de fondo antes de dejar pasar tu voz."
          )}
        </small>
      </div>

      <div className="voice-control-slider-block">
        <div className="voice-control-title-row">
          <strong>{t("voice.input.volume", "Volumen de entrada")}</strong>
          <small>{voiceState.inputVolume}%</small>
        </div>
        <input
          max="100"
          min="0"
          onChange={(event) => {
            updateVoiceSetting("inputProfile", "custom");
            updateVoiceSetting("inputVolume", Number(event.target.value));
          }}
          type="range"
          value={voiceState.inputVolume}
        />
        <div className="voice-input-meter">
          {inputMeterBars.map((bar) => (
            <i className={bar < activeInputBars ? "active" : ""} key={`input-${bar}`} />
          ))}
        </div>
        <small className="voice-control-slider-caption">
          {voiceState.micMuted
            ? t("voice.input.muted", "El microfono esta silenciado.")
            : voiceInputStatus.ready
              ? t("voice.input.liveLevel", "Nivel en vivo del microfono.")
              : t(
                  "voice.input.openAnalyzer",
                  "Abre este panel o entra a una sala para activar el analizador."
                )}
        </small>
      </div>

      <div className="voice-control-slider-block">
        <div className="voice-control-title-row">
          <strong>{t("voice.input.micTest", "Prueba de microfono")}</strong>
        </div>
        <div className="voice-mic-test-row">
          <button
            className="ghost-button small voice-mic-test-button"
            onClick={() => updateVoiceSetting("inputMonitoring", !voiceState.inputMonitoring)}
            type="button"
          >
            {voiceState.inputMonitoring
              ? t("voice.input.stopTest", "Detener")
              : t("voice.input.startTest", "Probar")}
          </button>
          <div className="voice-input-meter compact">
            {inputMeterBars.map((bar) => (
              <i className={bar < activeInputBars ? "active" : ""} key={`test-input-${bar}`} />
            ))}
          </div>
        </div>
        <small className="voice-control-slider-caption">
          {voiceState.inputMonitoring
            ? t(
                "voice.input.testActive",
                "Umbra esta reproduciendo tu microfono localmente para que ajustes el filtro."
              )
            : t(
                "voice.input.testIdle",
                "Escucha tu propia voz para calibrar la supresion y el volumen."
              )}
        </small>
      </div>

      <div className="voice-control-divider" />

      <div className="voice-control-footer">
        <button className="ghost-button small" onClick={() => setSettingsOpen(true)} type="button">
          {t("voice.common.settings", "Ajustes de voz")}
        </button>
        <button
          className="ghost-button small"
          onClick={() =>
            showUiNotice(
              voiceInputStatus.engine === "speex"
                ? t("voice.input.status.speex", "Speex DSP esta activo sobre tu microfono.")
                : voiceInputStatus.engine === "native"
                  ? t(
                      "voice.input.status.native",
                      "Umbra esta usando la supresion nativa del navegador."
                    )
                  : t("voice.input.status.off", "La supresion esta desactivada.")
            )
          }
          type="button"
        >
          {t("voice.input.viewStatus", "Ver estado")}
        </button>
      </div>

      {renderInputSubmenu()}
    </div>
  );
}

export function WorkspaceCameraMenu({
  cameraStatus,
  getSelectedDeviceLabel,
  language = "es",
  setSettingsOpen,
  toggleVoiceState,
  voiceState
}) {
  const t = (key, fallback = "") => translate(language, key, fallback);
  const selectedCameraLabel = localizeGeneratedDeviceLabel(
    getSelectedDeviceLabel("videoinput"),
    "videoinput",
    language,
    t
  );
  return (
    <div className="floating-surface voice-control-menu camera-menu">
      <button className="voice-control-link" type="button">
        <span>
          <strong>{t("voice.camera.title", "Camara")}</strong>
          <small>{selectedCameraLabel}</small>
        </span>
        <Icon name="arrowRight" size={15} />
      </button>

      <div className="voice-control-divider" />

      <button
        className="voice-control-link"
        onClick={() => toggleVoiceState("cameraEnabled")}
        type="button"
      >
        <span>
          <strong>{t("voice.camera.preview", "Vista previa de la camara")}</strong>
          <small>
            {cameraStatus.error
              ? cameraStatus.error
              : voiceState.cameraEnabled && cameraStatus.ready
                ? cameraStatus.label || t("voice.camera.active", "Camara activa")
                : t("voice.camera.inactive", "Inactiva")}
          </small>
        </span>
        <Icon name="camera" size={16} />
      </button>

      <button className="voice-control-link" onClick={() => setSettingsOpen(true)} type="button">
        <span>
          <strong>{t("voice.camera.settings", "Ajustes de video")}</strong>
          <small>{t("voice.camera.settingsCopy", "Configuracion local de Umbra")}</small>
        </span>
        <Icon name="settings" size={16} />
      </button>
    </div>
  );
}

export function WorkspaceOutputMenu({
  getSelectedDeviceLabel,
  handleVoiceDeviceChange,
  language = "es",
  selectedVoiceDevices,
  setSettingsOpen,
  setVoiceOutputPanel,
  showUiNotice,
  updateVoiceSetting,
  voiceDevices,
  voiceOutputPanel,
  voiceState
}) {
  const t = (key, fallback = "") => translate(language, key, fallback);
  const outputDevices = buildUniqueDevices(voiceDevices.audiooutput || [], "audiooutput");
  const currentOutputLabel = localizeGeneratedDeviceLabel(
    getSelectedDeviceLabel("audiooutput"),
    "audiooutput",
    language,
    t
  );
  const isDefaultOutputSelected =
    selectedVoiceDevices.audiooutput === "default" ||
    !outputDevices.some((device) => device.deviceId === selectedVoiceDevices.audiooutput);

  function describeOutputRoute(label, { isDefault = false } = {}) {
    const normalized = String(label || "").toLowerCase();

    if (isDefault) {
      return {
        badge: t("voice.output.badge.windows", "Windows"),
        description: t(
          "voice.output.desc.default",
          "Umbra sigue la salida predeterminada del sistema en tiempo real."
        ),
        tone: "system"
      };
    }

    if (/vb-audio|voicemeeter|virtual|cable/.test(normalized)) {
      return {
        badge: t("voice.output.badge.virtual", "Virtual"),
        description: t(
          "voice.output.desc.virtual",
          "Ideal para mezclar escenas, streams y rutas sonoras alternativas."
        ),
        tone: "virtual"
      };
    }

    if (/bluetooth|airpods|buds|wireless/.test(normalized)) {
      return {
        badge: t("voice.output.badge.wireless", "Inalambrico"),
        description: t(
          "voice.output.desc.wireless",
          "Salida ligera para moverte por Umbra sin cables de por medio."
        ),
        tone: "wireless"
      };
    }

    if (/usb|headset|audif|auric|webcam/.test(normalized)) {
      return {
        badge: t("voice.output.badge.usb", "USB"),
        description: t(
          "voice.output.desc.usb",
          "Ruta estable para monitoreo directo, llamadas y sesiones largas."
        ),
        tone: "usb"
      };
    }

    if (/speaker|altavoc|realtek|high definition|hd audio/.test(normalized)) {
      return {
        badge: t("voice.output.badge.system", "Sistema"),
        description: t(
          "voice.output.desc.system",
          "Salida principal del equipo, limpia y lista para escuchar el canal."
        ),
        tone: "system"
      };
    }

    return {
      badge: t("voice.output.badge.route", "Ruta"),
      description: t(
        "voice.output.desc.generic",
        "Una salida disponible para dejar pasar la voz y el ambiente de Umbra."
      ),
      tone: "umbra"
    };
  }

  const currentOutputRoute = describeOutputRoute(currentOutputLabel, {
    isDefault: isDefaultOutputSelected
  });

  function renderOutputSubmenu() {
    if (voiceOutputPanel !== "device") {
      return null;
    }

    return (
      <div className="floating-surface voice-control-menu voice-control-submenu">
        <div className="voice-control-submenu-header">
          <div className="voice-control-heading">
            <strong>{t("voice.output.routeTitle", "Ruta de salida")}</strong>
            <small>
              {t("voice.output.routeSubtitle", "Escoge por donde Umbra deja caer la voz del canal.")}
            </small>
          </div>
        </div>

        <div className="voice-control-option-list voice-output-choice-list">
          <button
            className={`voice-control-option voice-output-choice ${
              isDefaultOutputSelected ? "selected" : ""
            }`.trim()}
            onClick={() => {
              handleVoiceDeviceChange("audiooutput", "default");
              setVoiceOutputPanel(null);
              showUiNotice(
                t(
                  "voice.output.noticeDefault",
                  "Salida en configuracion predeterminada de Windows."
                )
              );
            }}
            type="button"
          >
            <span className="voice-output-choice-copy">
              <strong>{t("voice.output.windowsDefault", "Configuracion predeterminada de Windows")}</strong>
              <small>{describeOutputRoute(currentOutputLabel, { isDefault: true }).description}</small>
            </span>
            <span className="voice-output-choice-meta">
              <em className="voice-route-badge system">
                {t("voice.output.badge.windows", "Windows")}
              </em>
              <i className={`voice-control-radio ${isDefaultOutputSelected ? "selected" : ""}`.trim()} />
            </span>
          </button>

          {outputDevices.map((device, index) => {
            const label =
              device.label ||
              fallbackDeviceLabel("audiooutput", index, language);
            const selected = selectedVoiceDevices.audiooutput === device.deviceId;
            const route = describeOutputRoute(label);

            return (
              <button
                className={`voice-control-option voice-output-choice ${selected ? "selected" : ""}`.trim()}
                key={device.deviceId || `${label}-${index}`}
                onClick={() => {
                  handleVoiceDeviceChange("audiooutput", device.deviceId);
                  setVoiceOutputPanel(null);
                  showUiNotice(`${t("voice.output.noticeRoute", "Salida")}: ${label}.`);
                }}
                type="button"
              >
                <span className="voice-output-choice-copy">
                  <strong>{label}</strong>
                  <small>{route.description}</small>
                </span>
                <span className="voice-output-choice-meta">
                  <em className={`voice-route-badge ${route.tone}`.trim()}>{route.badge}</em>
                  <i className={`voice-control-radio ${selected ? "selected" : ""}`.trim()} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="floating-surface voice-control-menu output-menu">
      <button
        className={`voice-control-link voice-route-card ${
          voiceOutputPanel === "device" ? "panel-open" : ""
        }`.trim()}
        onClick={() =>
          setVoiceOutputPanel((previous) => (previous === "device" ? null : "device"))
        }
        type="button"
      >
        <span className="voice-route-card-copy">
          <small className="voice-route-eyebrow">
            {t("voice.output.routeEyebrow", "Ruta sonora")}
          </small>
          <strong>{currentOutputLabel}</strong>
          <small>{currentOutputRoute.description}</small>
        </span>
        <span className="voice-route-card-meta">
          <em className={`voice-route-badge ${currentOutputRoute.tone}`.trim()}>
            {currentOutputRoute.badge}
          </em>
          <Icon name="arrowRight" size={15} />
        </span>
      </button>

      <div className="voice-control-divider" />

      <div className="voice-control-slider-block">
        <div className="voice-control-title-row">
          <strong>{t("voice.output.volume", "Volumen de salida")}</strong>
          <small>{voiceState.outputVolume}%</small>
        </div>
        <input
          max="100"
          min="0"
          onChange={(event) => updateVoiceSetting("outputVolume", Number(event.target.value))}
          type="range"
          value={voiceState.outputVolume}
        />
      </div>

      <div className="voice-control-divider" />

      <div className="voice-control-footer">
        <button className="ghost-button small" onClick={() => setSettingsOpen(true)} type="button">
          {t("voice.common.settings", "Ajustes de voz")}
        </button>
      </div>

      {renderOutputSubmenu()}
    </div>
  );
}

export function WorkspaceShareMenu({
  onChangeScreenShareQuality,
  onChangeShareSource,
  onToggleScreenShare,
  onToggleShareAudio,
  language = "es",
  screenSharePickerOpen = false,
  screenShareQualityLabel = "720P 30 FPS",
  shareQualityOptions = [],
  showUiNotice,
  voiceShareStatus,
  voiceState
}) {
  const t = (key, fallback = "") => translate(language, key, fallback);
  const [shareSubmenu, setShareSubmenu] = useState(null);

  useEffect(() => {
    if (!voiceState.screenShareEnabled && !screenSharePickerOpen) {
      setShareSubmenu(null);
    }
  }, [screenSharePickerOpen, voiceState.screenShareEnabled]);

  function renderQualitySubmenu() {
    if (shareSubmenu !== "quality") {
      return null;
    }

    return (
      <div className="floating-surface voice-control-menu voice-control-submenu">
        <div className="voice-control-submenu-header">
          <div className="voice-control-heading">
            <strong>{t("voice.share.quality", "Calidad de la transmision")}</strong>
            <small>{screenShareQualityLabel}</small>
          </div>
        </div>

        <div className="voice-control-option-list">
          {shareQualityOptions.map((option) => {
            const selected = voiceState.screenShareQuality === option.id;
            return (
              <button
                className={`voice-control-option ${selected ? "selected" : ""}`.trim()}
                key={option.id}
                onClick={() => {
                  onChangeScreenShareQuality?.(option.id);
                  setShareSubmenu(null);
                }}
                type="button"
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                <i className={`voice-control-radio ${selected ? "selected" : ""}`.trim()} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="floating-surface voice-control-menu share-menu">
      <button
        className={`voice-control-link danger ${voiceState.screenShareEnabled ? "active" : ""}`}
        onClick={() => {
          onToggleScreenShare?.();
          setShareSubmenu(null);
        }}
        type="button"
      >
        <span>
          <strong>
            {voiceState.screenShareEnabled
              ? t("voice.share.stop", "Dejar de transmitir")
              : t("voice.share.start", "Iniciar transmision")}
          </strong>
        </span>
        <Icon name="screenShare" size={16} />
      </button>

      <button
        className="voice-control-link"
        onClick={() => {
          onChangeShareSource?.();
          setShareSubmenu(null);
        }}
        type="button"
      >
        <span>
          <strong>{t("voice.share.change", "Cambiar transmision")}</strong>
          <small>
            {voiceShareStatus?.label ||
              t("voice.share.changeCopy", "Ventana o pantalla local")}
          </small>
        </span>
        <Icon name="screenShare" size={16} />
      </button>

      <button
        className={`voice-control-link ${shareSubmenu === "quality" ? "panel-open" : ""}`.trim()}
        onClick={() =>
          setShareSubmenu((previous) => (previous === "quality" ? null : "quality"))
        }
        type="button"
      >
        <span>
          <strong>{t("voice.share.quality", "Calidad de la transmision")}</strong>
          <small>{screenShareQualityLabel}</small>
        </span>
        <Icon name="arrowRight" size={15} />
      </button>

      <label className="voice-control-check">
        <span>{t("voice.share.audio", "Compartir audio de la transmision")}</span>
        <input
          checked={voiceState.shareAudio}
          onChange={() => onToggleShareAudio?.()}
          type="checkbox"
        />
      </label>

      <div className="voice-control-divider" />

      <button
        className="voice-control-link danger"
        onClick={() =>
          showUiNotice(
            t("voice.share.reportNotice", "Registro de incidencias de transmision pendiente.")
          )
        }
        type="button"
      >
        <span>
          <strong>{t("voice.share.report", "Informar problema")}</strong>
        </span>
        <Icon name="help" size={16} />
      </button>

      {renderQualitySubmenu()}
    </div>
  );
}
