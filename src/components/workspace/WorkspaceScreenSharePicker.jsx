import React from "react";

import { translate } from "../../i18n.js";
import { Icon } from "../Icon.jsx";

function SourceCard({ language = "es", layout = "list", onClick, selected, source }) {
  const t = (key, fallback = "") => translate(language, key, fallback);
  const isApplicationsLayout = layout === "grid";

  return (
    <button
      className={`screen-share-source-card ${isApplicationsLayout ? "applications-card" : "list-layout"} ${selected ? "selected" : ""}`.trim()}
      onClick={() => onClick(source.id)}
      type="button"
    >
      <div className="screen-share-source-preview">
        {source.thumbnailDataUrl ? (
          <img alt={source.name} src={source.thumbnailDataUrl} />
        ) : (
          <div className="screen-share-source-placeholder">
            <Icon name={source.kind === "screen" ? "screenShare" : "appGrid"} size={28} />
          </div>
        )}
      </div>

      <div className="screen-share-source-copy">
        <div className="screen-share-source-title-row">
          <span className="screen-share-source-app-icon">
            {source.appIconDataUrl ? (
              <img alt="" src={source.appIconDataUrl} />
            ) : (
              <Icon name={source.kind === "screen" ? "screenShare" : "appGrid"} size={14} />
            )}
          </span>
          <strong>{source.name}</strong>
        </div>
        <small>
          {source.kind === "screen"
            ? t("voice.share.source.screen", "Pantalla completa")
            : t("voice.share.source.app", "Aplicacion")}
        </small>
      </div>

      <i
        aria-hidden="true"
        className={`voice-control-radio ${selected ? "selected" : ""}`.trim()}
      />
    </button>
  );
}

export function WorkspaceScreenSharePicker({
  language = "es",
  loading = false,
  onClose,
  onConfirm,
  onSelectQuality,
  onSelectSource,
  onSelectTab,
  onToggleShareAudio,
  picker,
  qualityOptions = []
}) {
  const t = (key, fallback = "") => translate(language, key, fallback);
  const currentTab = picker.tab || "applications";
  const currentQuality = picker.quality || "720p30";
  const selectedQualityLabel =
    qualityOptions.find((option) => option.id === currentQuality)?.label || "720P 30 FPS";

  const availableSources =
    currentTab === "screen"
      ? picker.sources.filter((source) => source.kind === "screen")
      : picker.sources.filter((source) => source.kind === "window");

  const selectedSource =
    picker.sources.find((source) => source.id === picker.selectedSourceId) || null;
  const sourceLayout = currentTab === "applications" ? "grid" : "list";

  const footerMeta = [
    selectedQualityLabel,
    picker.shareAudio
      ? t("voice.share.audioOn", "Audio compartido")
      : t("voice.share.audioOff", "Sin audio")
  ].join(" • ");

  return (
    <div
      className="modal-backdrop screen-share-picker-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="modal-card screen-share-picker"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="screen-share-picker-tabs">
          <button
            className={currentTab === "applications" ? "active" : ""}
            onClick={() => onSelectTab("applications")}
            type="button"
          >
            <Icon name="appGrid" size={14} />
            <span>{t("voice.share.tabApps", "Aplicaciones")}</span>
          </button>
          <button
            className={currentTab === "screen" ? "active" : ""}
            onClick={() => onSelectTab("screen")}
            type="button"
          >
            <Icon name="screenShare" size={14} />
            <span>{t("voice.share.tabScreen", "Pantalla completa")}</span>
          </button>
          <button
            className={currentTab === "devices" ? "active" : ""}
            onClick={() => onSelectTab("devices")}
            type="button"
          >
            <Icon name="camera" size={14} />
            <span>{t("voice.share.tabDevices", "Dispositivos")}</span>
          </button>
        </div>

        {currentTab === "devices" ? (
          <div className="screen-share-devices-panel">
            <div className="screen-share-device-summary">
              <strong>{t("voice.share.audio", "Compartir audio de la transmision")}</strong>
              <label className="voice-control-check">
                <span>{picker.shareAudio ? t("common.on", "Activo") : t("common.off", "Inactivo")}</span>
                <input checked={picker.shareAudio} onChange={onToggleShareAudio} type="checkbox" />
              </label>
            </div>

            <div className="screen-share-quality-selector">
              <strong>{t("voice.share.quality", "Calidad de la transmision")}</strong>
              <div className="screen-share-quality-options">
                {qualityOptions.map((option) => (
                  <button
                    className={currentQuality === option.id ? "active" : ""}
                    key={option.id}
                    onClick={() => onSelectQuality(option.id)}
                    type="button"
                  >
                    {option.shortLabel || option.label}
                  </button>
                ))}
              </div>
              <small>{selectedQualityLabel}</small>
            </div>

            <div className="screen-share-device-summary">
              <strong>{t("voice.share.change", "Cambiar transmision")}</strong>
              <small>
                {selectedSource?.name ||
                  t("voice.share.sourceHint", "Elige una ventana o pantalla para comenzar.")}
              </small>
            </div>
          </div>
        ) : (
          <div
            className={`screen-share-source-grid ${
              sourceLayout === "grid" ? "applications-layout" : "screens-layout"
            }`.trim()}
          >
            {loading ? (
              <div className="screen-share-picker-empty">
                {t("voice.share.loadingSources", "Cargando fuentes para compartir...")}
              </div>
            ) : availableSources.length ? (
              availableSources.map((source) => (
                <SourceCard
                  key={source.id}
                  language={language}
                  layout={sourceLayout}
                  onClick={onSelectSource}
                  selected={picker.selectedSourceId === source.id}
                  source={source}
                />
              ))
            ) : (
              <div className="screen-share-picker-empty">
                {t("voice.share.noSources", "No se encontraron pantallas o aplicaciones disponibles.")}
              </div>
            )}
          </div>
        )}

        <div className="screen-share-picker-options-bar">
          <label className="screen-share-audio-check">
            <input checked={picker.shareAudio} onChange={onToggleShareAudio} type="checkbox" />
            <span>{t("voice.share.audio", "Compartir audio de la transmision")}</span>
          </label>

          <div className="screen-share-quality-inline">
            {qualityOptions.map((option) => (
              <button
                className={currentQuality === option.id ? "active" : ""}
                key={option.id}
                onClick={() => onSelectQuality(option.id)}
                type="button"
              >
                {option.shortLabel || option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="screen-share-picker-footer">
          <div className="screen-share-picker-footer-copy">
            <strong>
              {selectedSource?.name || t("voice.share.changeCopy", "Ventana o pantalla local")}
            </strong>
            <small>{footerMeta}</small>
          </div>

          <div className="screen-share-picker-footer-actions">
            <button className="ghost-button" onClick={onClose} type="button">
              {t("common.close", "Cerrar")}
            </button>
            <button
              className="primary-button"
              disabled={!picker.selectedSourceId}
              onClick={onConfirm}
              type="button"
            >
              <Icon name="screenShare" size={16} />
              <span>{t("voice.share.confirm", "Compartir pantalla")}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
