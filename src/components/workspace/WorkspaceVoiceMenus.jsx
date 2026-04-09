import React from "react";

import { Icon } from "../Icon.jsx";
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

export function WorkspaceInputMenu({
  activeInputBars,
  activeInputProfile,
  activeInputProfileLabel,
  getSelectedDeviceLabel,
  handleApplyVoiceProfile,
  handleVoiceDeviceChange,
  inputMeterBars,
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
  voiceState,
  voiceSuppressionCopy,
  voiceSuppressionLabel
}) {
  const inputDevices = voiceDevices.audioinput || [];

  function renderInputSubmenu() {
    if (voiceInputPanel === "device") {
      return (
        <div className="floating-surface voice-control-menu voice-control-submenu">
          <div className="voice-control-submenu-header">
            <div className="voice-control-heading">
              <strong>Dispositivo de entrada</strong>
              <small>{getSelectedDeviceLabel("audioinput")}</small>
            </div>
          </div>

          <div className="voice-control-option-list">
            {inputDevices.length ? (
              inputDevices.map((device, index) => {
                const label = device.label || `Microfono ${index + 1}`;
                const selected = selectedVoiceDevices.audioinput === device.deviceId;

                return (
                  <button
                    className={`voice-control-option ${selected ? "selected" : ""}`.trim()}
                    key={device.deviceId || `${label}-${index}`}
                    onClick={() => {
                      handleVoiceDeviceChange("audioinput", device.deviceId);
                      setVoiceInputPanel(null);
                      showUiNotice(`Ahora usando ${label}.`);
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
              <div className="voice-control-empty">No hay microfonos disponibles.</div>
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
              <strong>Perfil de entrada</strong>
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
          <strong>Supresion de ruido</strong>
          <small>{voiceSuppressionLabel}</small>
        </div>
        <div className="voice-control-menu-actions">
          <button
            aria-label={
              voiceState.noiseSuppression
                ? "Desactivar supresion de ruido"
                : "Activar supresion de ruido"
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
          <strong>Dispositivo de entrada</strong>
          <small>{getSelectedDeviceLabel("audioinput")}</small>
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
          <strong>Perfil de entrada</strong>
          <small>{activeInputProfileLabel}</small>
        </span>
        <Icon name="arrowRight" size={15} />
      </button>

      <div className="voice-control-slider-block">
        <div className="voice-control-title-row">
          <strong>Volumen de entrada</strong>
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
            ? "El microfono esta silenciado."
            : voiceInputStatus.ready
              ? "Nivel en vivo del microfono."
              : "Abre este panel o entra a una sala para activar el analizador."}
        </small>
      </div>

      <div className="voice-control-divider" />

      <div className="voice-control-footer">
        <button className="ghost-button small" onClick={() => setSettingsOpen(true)} type="button">
          Ajustes de voz
        </button>
        <button
          className="ghost-button small"
          onClick={() =>
            showUiNotice(
              voiceInputStatus.engine === "speex"
                ? "Speex DSP esta activo sobre tu microfono."
                : voiceInputStatus.engine === "native"
                  ? "Umbra esta usando la supresion nativa del navegador."
                  : "La supresion esta desactivada."
            )
          }
          type="button"
        >
          Ver estado
        </button>
      </div>

      {renderInputSubmenu()}
    </div>
  );
}

export function WorkspaceCameraMenu({
  cameraStatus,
  getSelectedDeviceLabel,
  setSettingsOpen,
  toggleVoiceState,
  voiceState
}) {
  return (
    <div className="floating-surface voice-control-menu camera-menu">
      <button className="voice-control-link" type="button">
        <span>
          <strong>Camara</strong>
          <small>{getSelectedDeviceLabel("videoinput")}</small>
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
          <strong>Vista previa de la camara</strong>
          <small>
            {cameraStatus.error
              ? cameraStatus.error
              : voiceState.cameraEnabled && cameraStatus.ready
                ? cameraStatus.label || "Camara activa"
                : "Inactiva"}
          </small>
        </span>
        <Icon name="camera" size={16} />
      </button>

      <button className="voice-control-link" onClick={() => setSettingsOpen(true)} type="button">
        <span>
          <strong>Ajustes de video</strong>
          <small>Configuracion local de Umbra</small>
        </span>
        <Icon name="settings" size={16} />
      </button>
    </div>
  );
}

export function WorkspaceOutputMenu({
  getSelectedDeviceLabel,
  handleVoiceDeviceChange,
  selectedVoiceDevices,
  setSettingsOpen,
  setVoiceOutputPanel,
  showUiNotice,
  updateVoiceSetting,
  voiceDevices,
  voiceOutputPanel,
  voiceState
}) {
  const outputDevices = buildUniqueDevices(voiceDevices.audiooutput || [], "audiooutput");
  const currentOutputLabel = getSelectedDeviceLabel("audiooutput");
  const isDefaultOutputSelected =
    selectedVoiceDevices.audiooutput === "default" ||
    !outputDevices.some((device) => device.deviceId === selectedVoiceDevices.audiooutput);

  function describeOutputRoute(label, { isDefault = false } = {}) {
    const normalized = String(label || "").toLowerCase();

    if (isDefault) {
      return {
        badge: "Windows",
        description: "Umbra sigue la salida predeterminada del sistema en tiempo real.",
        tone: "system"
      };
    }

    if (/vb-audio|voicemeeter|virtual|cable/.test(normalized)) {
      return {
        badge: "Virtual",
        description: "Ideal para mezclar escenas, streams y rutas sonoras alternativas.",
        tone: "virtual"
      };
    }

    if (/bluetooth|airpods|buds|wireless/.test(normalized)) {
      return {
        badge: "Inalambrico",
        description: "Salida ligera para moverte por Umbra sin cables de por medio.",
        tone: "wireless"
      };
    }

    if (/usb|headset|audif|auric|webcam/.test(normalized)) {
      return {
        badge: "USB",
        description: "Ruta estable para monitoreo directo, llamadas y sesiones largas.",
        tone: "usb"
      };
    }

    if (/speaker|altavoc|realtek|high definition|hd audio/.test(normalized)) {
      return {
        badge: "Sistema",
        description: "Salida principal del equipo, limpia y lista para escuchar el canal.",
        tone: "system"
      };
    }

    return {
      badge: "Ruta",
      description: "Una salida disponible para dejar pasar la voz y el ambiente de Umbra.",
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
            <strong>Ruta de salida</strong>
            <small>Escoge por donde Umbra deja caer la voz del canal.</small>
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
              showUiNotice("Salida en configuracion predeterminada de Windows.");
            }}
            type="button"
          >
            <span className="voice-output-choice-copy">
              <strong>Configuracion predeterminada de Windows</strong>
              <small>{describeOutputRoute(currentOutputLabel, { isDefault: true }).description}</small>
            </span>
            <span className="voice-output-choice-meta">
              <em className="voice-route-badge system">Windows</em>
              <i className={`voice-control-radio ${isDefaultOutputSelected ? "selected" : ""}`.trim()} />
            </span>
          </button>

          {outputDevices.map((device, index) => {
            const label = device.label || fallbackDeviceLabel("audiooutput", index);
            const selected = selectedVoiceDevices.audiooutput === device.deviceId;
            const route = describeOutputRoute(label);

            return (
              <button
                className={`voice-control-option voice-output-choice ${selected ? "selected" : ""}`.trim()}
                key={device.deviceId || `${label}-${index}`}
                onClick={() => {
                  handleVoiceDeviceChange("audiooutput", device.deviceId);
                  setVoiceOutputPanel(null);
                  showUiNotice(`Salida: ${label}.`);
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
          <small className="voice-route-eyebrow">Ruta sonora</small>
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
          <strong>Volumen de salida</strong>
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
          Ajustes de voz
        </button>
      </div>

      {renderOutputSubmenu()}
    </div>
  );
}

export function WorkspaceShareMenu({ showUiNotice, toggleVoiceState, voiceState }) {
  return (
    <div className="floating-surface voice-control-menu share-menu">
      <button
        className={`voice-control-link danger ${voiceState.screenShareEnabled ? "active" : ""}`}
        onClick={() => toggleVoiceState("screenShareEnabled")}
        type="button"
      >
        <span>
          <strong>{voiceState.screenShareEnabled ? "Dejar de transmitir" : "Iniciar transmision"}</strong>
        </span>
        <Icon name="screenShare" size={16} />
      </button>

      <button className="voice-control-link" type="button">
        <span>
          <strong>Cambiar transmision</strong>
          <small>Ventana o pantalla local</small>
        </span>
        <Icon name="screenShare" size={16} />
      </button>

      <button className="voice-control-link" type="button">
        <span>
          <strong>Calidad de la transmision</strong>
          <small>720P 30 FPS</small>
        </span>
        <Icon name="arrowRight" size={15} />
      </button>

      <label className="voice-control-check">
        <span>Compartir audio de la transmision</span>
        <input
          checked={voiceState.shareAudio}
          onChange={() => toggleVoiceState("shareAudio")}
          type="checkbox"
        />
      </label>

      <div className="voice-control-divider" />

      <button
        className="voice-control-link danger"
        onClick={() => showUiNotice("Registro de incidencias de transmision pendiente.")}
        type="button"
      >
        <span>
          <strong>Informar problema</strong>
        </span>
        <Icon name="help" size={16} />
      </button>
    </div>
  );
}
