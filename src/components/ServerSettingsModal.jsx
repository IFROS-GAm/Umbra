import React, { useEffect, useMemo, useRef, useState } from "react";

import { resolveAssetUrl } from "../api.js";
import { Icon } from "./Icon.jsx";

function normalizeColorInput(candidate, fallback = "#5865F2") {
  const normalized = String(candidate || "")
    .trim()
    .replace(/^([^#])/, "#$1")
    .toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return fallback;
}

function buildGuildBannerStyle(color, imageUrl) {
  const normalizedColor = normalizeColorInput(color);
  if (imageUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.58)), url("${resolveAssetUrl(
        imageUrl
      )}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  return {
    background: `linear-gradient(135deg, ${normalizedColor}, rgba(15, 18, 24, 0.96))`
  };
}

function buildGuildInitials(name) {
  const parts = String(name || "Umbra")
    .trim()
    .split(/\s+/)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "UM";
}

export function ServerSettingsModal({ guild, memberCount = 0, onClose, onSave }) {
  const iconInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [form, setForm] = useState({
    bannerColor: guild.banner_color || "#5865F2",
    description: guild.description || "",
    name: guild.name || ""
  });
  const [iconFile, setIconFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [iconPreview, setIconPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");
  const [clearIcon, setClearIcon] = useState(false);
  const [clearBanner, setClearBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setForm({
      bannerColor: guild.banner_color || "#5865F2",
      description: guild.description || "",
      name: guild.name || ""
    });
    setIconFile(null);
    setBannerFile(null);
    setIconPreview("");
    setBannerPreview("");
    setClearIcon(false);
    setClearBanner(false);
    setSaving(false);
    setError("");
    setSaved("");
  }, [guild]);

  useEffect(
    () => () => {
      if (iconPreview.startsWith("blob:")) {
        URL.revokeObjectURL(iconPreview);
      }
      if (bannerPreview.startsWith("blob:")) {
        URL.revokeObjectURL(bannerPreview);
      }
    },
    [bannerPreview, iconPreview]
  );

  const normalizedBannerColor = normalizeColorInput(form.bannerColor, guild.banner_color || "#5865F2");
  const previewIcon = iconPreview || (clearIcon ? "" : guild.icon_url || "");
  const previewBanner = bannerPreview || (clearBanner ? "" : guild.banner_image_url || "");
  const previewCardStyle = useMemo(
    () => buildGuildBannerStyle(normalizedBannerColor, previewBanner),
    [normalizedBannerColor, previewBanner]
  );

  function updateForm(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  function rememberPreview(file, setter, resetClear) {
    setter((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(file);
    });
    resetClear(false);
  }

  function handleIconSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida para el icono del servidor.");
      return;
    }

    setError("");
    setSaved("");
    setIconFile(file);
    rememberPreview(file, setIconPreview, setClearIcon);
  }

  function handleBannerSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida para el cartel del servidor.");
      return;
    }

    setError("");
    setSaved("");
    setBannerFile(file);
    rememberPreview(file, setBannerPreview, setClearBanner);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");

    try {
      await onSave({
        bannerColor: normalizedBannerColor,
        bannerFile,
        bannerImageUrl: clearBanner ? "" : undefined,
        clearBanner,
        clearIcon,
        description: form.description,
        iconFile,
        iconUrl: clearIcon ? "" : undefined,
        name: form.name
      });
      setSaved("Servidor actualizado.");
      setIconFile(null);
      setBannerFile(null);
      setIconPreview("");
      setBannerPreview("");
      setClearIcon(false);
      setClearBanner(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="server-settings-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="server-settings-sidebar">
          <div className="server-settings-sidebar-title">
            <small>{guild.name.toUpperCase()}</small>
            <strong>Perfil de servidor</strong>
          </div>

          <div className="server-settings-nav">
            <button className="server-settings-nav-item active" type="button">
              Perfil de servidor
            </button>
            <button className="server-settings-nav-item muted" type="button">
              Miembros
            </button>
            <button className="server-settings-nav-item muted" type="button">
              Roles
            </button>
            <button className="server-settings-nav-item muted" type="button">
              Invitaciones
            </button>
          </div>
        </aside>

        <section className="server-settings-panel">
          <div className="server-settings-header">
            <div>
              <h2>Perfil de servidor</h2>
              <p>Personaliza como aparece tu servidor dentro de Umbra.</p>
            </div>
            <button className="ghost-button icon-only" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </div>

          <div className="server-settings-body">
            <form className="server-settings-form" onSubmit={handleSubmit}>
              <input
                accept="image/*"
                className="hidden-file-input"
                onChange={handleIconSelection}
                ref={iconInputRef}
                type="file"
              />
              <input
                accept="image/*"
                className="hidden-file-input"
                onChange={handleBannerSelection}
                ref={bannerInputRef}
                type="file"
              />

              <label className="settings-field">
                <span>Nombre</span>
                <input
                  maxLength={40}
                  onChange={(event) => updateForm("name", event.target.value)}
                  required
                  value={form.name}
                />
              </label>

              <label className="settings-field">
                <span>Descripcion</span>
                <textarea
                  maxLength={180}
                  onChange={(event) => updateForm("description", event.target.value)}
                  rows={4}
                  value={form.description}
                />
              </label>

              <div className="settings-field">
                <span>Icono</span>
                <div className="server-asset-row">
                  <div className="server-icon-preview">
                    {previewIcon ? (
                      <img alt={form.name || guild.name} src={resolveAssetUrl(previewIcon)} />
                    ) : (
                      <span>{buildGuildInitials(form.name || guild.name)}</span>
                    )}
                  </div>
                  <div className="server-asset-actions">
                    <button
                      className="ghost-button"
                      onClick={() => iconInputRef.current?.click()}
                      type="button"
                    >
                      <Icon name="upload" />
                      <span>Cambiar icono del servidor</span>
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setIconFile(null);
                        setIconPreview((previous) => {
                          if (previous?.startsWith("blob:")) {
                            URL.revokeObjectURL(previous);
                          }
                          return "";
                        });
                        setClearIcon(true);
                      }}
                      type="button"
                    >
                      <Icon name="close" />
                      <span>Eliminar icono</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-field">
                <span>Cartel</span>
                <div className="server-banner-editor">
                  <div className="server-banner-preview" style={previewCardStyle}>
                    <button
                      className="server-banner-upload"
                      onClick={() => bannerInputRef.current?.click()}
                      type="button"
                    >
                      <Icon name="camera" />
                      <span>Subir cartel</span>
                    </button>
                  </div>
                  <div className="server-asset-actions">
                    <button
                      className="ghost-button"
                      onClick={() => bannerInputRef.current?.click()}
                      type="button"
                    >
                      <Icon name="upload" />
                      <span>Cambiar imagen del cartel</span>
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setBannerFile(null);
                        setBannerPreview((previous) => {
                          if (previous?.startsWith("blob:")) {
                            URL.revokeObjectURL(previous);
                          }
                          return "";
                        });
                        setClearBanner(true);
                      }}
                      type="button"
                    >
                      <Icon name="close" />
                      <span>Quitar imagen del cartel</span>
                    </button>
                    <label className="settings-color-input compact">
                      <input
                        onChange={(event) => updateForm("bannerColor", event.target.value)}
                        type="color"
                        value={normalizedBannerColor}
                      />
                      <span>{normalizedBannerColor}</span>
                    </label>
                  </div>
                </div>
              </div>

              {error ? <p className="form-error settings-form-error">{error}</p> : null}
              {saved ? <p className="settings-form-success">{saved}</p> : null}

              <div className="settings-form-actions">
                <button className="primary-button" disabled={saving} type="submit">
                  <Icon name="save" />
                  <span>{saving ? "Guardando..." : "Guardar cambios"}</span>
                </button>
                <button className="ghost-button" onClick={onClose} type="button">
                  <Icon name="close" />
                  <span>Cerrar</span>
                </button>
              </div>
            </form>

            <aside className="server-settings-preview">
              <div className="server-preview-card">
                <div className="server-preview-banner" style={previewCardStyle} />
                <div className="server-preview-body">
                  <div className="server-preview-icon">
                    {previewIcon ? (
                      <img alt={form.name || guild.name} src={resolveAssetUrl(previewIcon)} />
                    ) : (
                      <span>{buildGuildInitials(form.name || guild.name)}</span>
                    )}
                  </div>
                  <strong>{form.name || guild.name}</strong>
                  <span>{form.description || "Sin descripcion todavia."}</span>
                  <small>{memberCount} miembros visibles</small>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
