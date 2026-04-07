import React, { useEffect, useMemo, useRef, useState } from "react";

import { resolveAssetUrl } from "../api.js";
import { STATUS_OPTIONS, sanitizeUsername } from "../utils.js";
import { Avatar } from "./Avatar.jsx";
import { AvatarCropModal } from "./AvatarCropModal.jsx";
import { Icon } from "./Icon.jsx";

const PROFILE_COLOR_PRESETS = [
  "#5865F2",
  "#7C3AED",
  "#EC4899",
  "#F97316",
  "#EAB308",
  "#10B981",
  "#06B6D4",
  "#64748B",
];

const SETTINGS_NAV_GROUPS = [
  {
    title: "Ajustes de usuario",
    items: [
      { id: "security", icon: "profile", label: "Mi cuenta", active: true },
      { id: "social", icon: "sparkles", label: "Contenido y redes", disabled: true },
      { id: "privacy", icon: "help", label: "Datos y privacidad", disabled: true },
      { id: "devices", icon: "screenShare", label: "Dispositivos", disabled: true },
      { id: "connections", icon: "mail", label: "Conexiones", disabled: true },
    ]
  },
  {
    title: "Ajustes de la aplicacion",
    items: [
      { id: "status", icon: "mission", label: "Estado", active: false },
      { id: "theme", icon: "sparkles", label: "Tema", toggleTheme: true }
    ]
  }
];

function findStatusLabel(status) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || "Offline";
}

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

function buildPanelStyle(color, imageUrl) {
  const base = normalizeColorInput(color);

  if (imageUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.62)), url("${resolveAssetUrl(imageUrl)}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  return {
    background: `linear-gradient(135deg, ${base}, rgba(15, 18, 24, 0.94))`
  };
}

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "Sin correo visible";
  }

  const [name, domain] = email.split("@");
  if (name.length <= 2) {
    return `${name[0] || "*"}***@${domain}`;
  }

  return `${name.slice(0, 2)}${"*".repeat(Math.max(4, name.length - 2))}@${domain}`;
}

export function SettingsModal({
  dmCount,
  guildCount,
  onClose,
  onSignOut,
  onToggleTheme,
  onUpdateProfile,
  theme,
  user
}) {
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [tab, setTab] = useState("security");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [search, setSearch] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [clearAvatar, setClearAvatar] = useState(false);

  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [clearBanner, setClearBanner] = useState(false);
  const [avatarCropState, setAvatarCropState] = useState({
    file: null,
    imageUrl: "",
    open: false
  });

  const [form, setForm] = useState({
    avatarHue: user.avatar_hue || 220,
    bio: user.bio || "",
    customStatus: user.custom_status || "",
    profileColor: user.profile_color || "#5865F2",
    username: user.username || ""
  });

  useEffect(() => {
    setForm({
      avatarHue: user.avatar_hue || 220,
      bio: user.bio || "",
      customStatus: user.custom_status || "",
      profileColor: user.profile_color || "#5865F2",
      username: user.username || ""
    });
    setAvatarFile(null);
    setAvatarPreview("");
    setClearAvatar(false);
    setBannerFile(null);
    setBannerPreview("");
    setClearBanner(false);
    setAvatarCropState({
      file: null,
      imageUrl: "",
      open: false
    });
    setEditorOpen(false);
    setError("");
    setSaved("");
    setSaving(false);
  }, [user]);

  useEffect(() => {
    if (error === "sanitizeUsername is not defined") {
      setError("");
    }
  }, [error]);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (bannerPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(bannerPreview);
      }
      if (avatarCropState.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarCropState.imageUrl);
      }
    };
  }, [avatarCropState.imageUrl, avatarPreview, bannerPreview]);

  const previewAvatarUrl = avatarPreview || (clearAvatar ? "" : user.avatar_url || "");
  const previewBannerUrl =
    bannerPreview || (clearBanner ? "" : user.profile_banner_url || "");
  const normalizedProfileColor = normalizeColorInput(
    form.profileColor,
    user.profile_color || "#5865F2"
  );
  const displayName = form.username || user.username || "Umbra user";
  const visibleError = error === "sanitizeUsername is not defined" ? "" : error;

  const accountRows = useMemo(
    () => [
      {
        label: "Nombre para mostrar",
        value: displayName,
      },
      {
        label: "Nombre de usuario",
        value: user.username || "Sin usuario",
      },
      {
        label: "Correo electronico",
        value: maskEmail(user.email),
        accent: user.email ? "Mostrar" : null
      },
      {
        label: "Panel del perfil",
        value: previewBannerUrl
          ? "Imagen de panel configurada"
          : normalizedProfileColor,
      }
    ],
    [displayName, normalizedProfileColor, previewBannerUrl, user.email, user.username]
  );

  function updateForm(key, value) {
    if (error) {
      setError("");
    }
    if (saved) {
      setSaved("");
    }
    setForm((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  function rememberPreview(previousUrl, nextFile, setter, clearSetter) {
    setter((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(nextFile);
    });
    clearSetter(false);
  }

  function handleAvatarSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida para el avatar.");
      return;
    }

    setError("");
    setSaved("");
    setAvatarCropState((previous) => {
      if (previous.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previous.imageUrl);
      }
      return {
        file,
        imageUrl: URL.createObjectURL(file),
        open: true
      };
    });
  }

  function handleBannerSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida para el panel.");
      return;
    }

    setError("");
    setSaved("");
    setBannerFile(file);
    rememberPreview(bannerPreview, file, setBannerPreview, setClearBanner);
  }

  async function handleProfileSave(event) {
    event?.preventDefault?.();
    setSaving(true);
    setError("");
    setSaved("");

    try {
      const nextUsername = sanitizeUsername(form.username).trim();
      if (!nextUsername) {
        throw new Error("Ingresa un nombre de usuario valido.");
      }

      await onUpdateProfile({
        ...form,
        username: nextUsername,
        avatarFile,
        avatarUrl: clearAvatar ? "" : undefined,
        bannerFile,
        bannerImageUrl: clearBanner ? "" : undefined,
        clearAvatar,
        clearBanner
      });

      setAvatarFile(null);
      setAvatarPreview("");
      setClearAvatar(false);
      setBannerFile(null);
      setBannerPreview("");
      setClearBanner(false);
      setEditorOpen(false);
      setSaved("Perfil actualizado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-shell discordish" onClick={(event) => event.stopPropagation()}>
        <aside className="settings-sidebar">
          <div className="settings-user-lockup large">
            <Avatar
              hue={user.avatar_hue}
              label={user.username}
              size={54}
              src={user.avatar_url}
              status={user.status}
            />
            <div className="settings-user-copy">
              <strong>{user.username}</strong>
              <span>Editar perfiles</span>
            </div>
          </div>

          <label className="settings-search">
            <Icon name="search" />
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar"
              type="text"
              value={search}
            />
          </label>

          <div className="settings-nav stacked">
            {SETTINGS_NAV_GROUPS.map((group) => (
              <div className="settings-nav-group" key={group.title}>
                <p className="settings-nav-title">{group.title}</p>
                {group.items
                  .filter((item) =>
                    !search.trim()
                      ? true
                      : item.label.toLowerCase().includes(search.trim().toLowerCase())
                  )
                  .map((item) => (
                    <button
                      className={`settings-nav-item ${
                        (item.id === tab || (item.id === "theme" && false)) && !item.disabled
                          ? "active"
                          : ""
                      } ${item.disabled ? "muted" : ""}`}
                      disabled={item.disabled}
                      key={item.id}
                      onClick={() => {
                        if (item.toggleTheme) {
                          onToggleTheme();
                          return;
                        }
                        if (!item.disabled) {
                          setTab(item.id);
                        }
                      }}
                      type="button"
                    >
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </aside>

        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>{tab === "security" ? "Mi cuenta" : "Estado"}</h2>
            </div>
            <button className="ghost-button icon-only" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </div>

          {tab === "security" ? (
            <div className="settings-stack">
              <div className="settings-top-tabs">
                <button className="settings-top-tab active" type="button">
                  Seguridad
                </button>
                <button
                  className="settings-top-tab"
                  onClick={() => setTab("status")}
                  type="button"
                >
                  Estado
                </button>
              </div>

              <section className="settings-hero-card discordish">
                <div
                  className="settings-hero-banner"
                  style={buildPanelStyle(normalizedProfileColor, previewBannerUrl)}
                />
                <div className="settings-hero-body">
                  <Avatar
                    hue={form.avatarHue}
                    label={displayName}
                    size={84}
                    src={previewAvatarUrl}
                    status={user.status}
                  />
                  <div className="settings-hero-copy">
                    <h3>{displayName}</h3>
                    <p>{user.username}</p>
                  </div>
                          <button
                            className="primary-button"
                    onClick={() => {
                      setError("");
                      setSaved("");
                      setEditorOpen((previous) => !previous);
                    }}
                            type="button"
                          >
                    <span>{editorOpen ? "Cerrar editor" : "Editar perfil de usuario"}</span>
                  </button>
                </div>
              </section>

              {!editorOpen ? (
                <section className="settings-card account-overview-card">
                  <div className="settings-grid">
                    {accountRows.map((row) => (
                      <div className="settings-row account-row" key={row.label}>
                        <div className="settings-row-copy">
                          <div>
                            <strong>{row.label}</strong>
                            <p>
                              {row.value}
                              {row.accent ? <em>{row.accent}</em> : null}
                            </p>
                          </div>
                        </div>
                        <button
                          className="ghost-button small"
                          onClick={() => setEditorOpen(true)}
                          type="button"
                        >
                          Editar
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="settings-card profile-editor-card">
                  <div className="settings-card-title">
                    <h3>Editar perfil</h3>
                    <span>Elige avatar, panel, color y datos visibles de tu cuenta.</span>
                  </div>

                  <input
                    accept="image/*"
                    className="hidden-file-input"
                    onChange={handleAvatarSelection}
                    ref={avatarInputRef}
                    type="file"
                  />
                  <input
                    accept="image/*"
                    className="hidden-file-input"
                    onChange={handleBannerSelection}
                    ref={bannerInputRef}
                    type="file"
                  />

                  <form className="settings-form-grid" onSubmit={handleProfileSave}>
                    <div className="settings-field full">
                      <span>Panel del perfil</span>
                      <div className="settings-banner-editor">
                        <div
                          className="settings-banner-preview"
                          style={buildPanelStyle(normalizedProfileColor, previewBannerUrl)}
                        >
                          <button
                            className="settings-banner-upload"
                            onClick={() => bannerInputRef.current?.click()}
                            type="button"
                          >
                            <Icon name="camera" />
                            <span>Subir panel</span>
                          </button>
                        </div>
                        <div className="settings-avatar-actions">
                          <button
                            className="ghost-button"
                            onClick={() => bannerInputRef.current?.click()}
                            type="button"
                          >
                            <Icon name="upload" />
                            <span>Cambiar imagen del panel</span>
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
                            <span>Quitar imagen del panel</span>
                          </button>
                          <small>Usa una imagen horizontal para que el header se vea mejor.</small>
                        </div>
                      </div>
                    </div>

                    <div className="settings-field full">
                      <span>Avatar</span>
                      <div className="settings-avatar-editor">
                        <Avatar
                          hue={form.avatarHue}
                          label={displayName}
                          size={72}
                          src={previewAvatarUrl}
                          status={user.status}
                        />
                        <div className="settings-avatar-actions">
                          <button
                            className="ghost-button"
                            onClick={() => avatarInputRef.current?.click()}
                            type="button"
                          >
                            <Icon name="upload" />
                            <span>Subir foto</span>
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => {
                              setAvatarFile(null);
                              setAvatarPreview((previous) => {
                                if (previous?.startsWith("blob:")) {
                                  URL.revokeObjectURL(previous);
                                }
                                return "";
                              });
                              setClearAvatar(true);
                            }}
                            type="button"
                          >
                            <Icon name="close" />
                            <span>Quitar foto</span>
                          </button>
                          <small>PNG, JPG o WEBP. Aparece en mensajes, miembros y perfiles.</small>
                        </div>
                      </div>
                    </div>

                    <label className="settings-field">
                      <span>Nombre de usuario</span>
                      <input
                        maxLength={24}
                        onChange={(event) => updateForm("username", sanitizeUsername(event.target.value))}
                        required
                        value={form.username}
                      />
                    </label>

                    <label className="settings-field">
                      <span>Estado personalizado</span>
                      <input
                        maxLength={80}
                        onChange={(event) => updateForm("customStatus", event.target.value)}
                        placeholder="Que estas haciendo ahora"
                        value={form.customStatus}
                      />
                    </label>

                    <label className="settings-field full">
                      <span>Bio</span>
                      <textarea
                        maxLength={240}
                        onChange={(event) => updateForm("bio", event.target.value)}
                        rows={4}
                        value={form.bio}
                      />
                    </label>

                    <div className="settings-field full">
                      <span>Color de respaldo del panel</span>
                      <div className="settings-color-editor">
                        <label className="settings-color-input">
                          <input
                            onChange={(event) => updateForm("profileColor", event.target.value)}
                            type="color"
                            value={normalizedProfileColor}
                          />
                          <span>{normalizedProfileColor}</span>
                        </label>

                        <input
                          maxLength={7}
                          onChange={(event) => updateForm("profileColor", event.target.value)}
                          placeholder="#5865F2"
                          value={form.profileColor}
                        />
                      </div>

                      <div className="settings-color-swatches">
                        {PROFILE_COLOR_PRESETS.map((color) => (
                          <button
                            aria-label={`Usar color ${color}`}
                            className={`settings-color-swatch ${
                              normalizedProfileColor === color ? "active" : ""
                            }`}
                            key={color}
                            onClick={() => updateForm("profileColor", color)}
                            style={{ background: color }}
                            type="button"
                          />
                        ))}
                      </div>
                    </div>

                    <label className="settings-field full">
                      <span>Tono de respaldo del avatar</span>
                      <div className="settings-range-row">
                        <input
                          max="360"
                          min="0"
                          onChange={(event) => updateForm("avatarHue", Number(event.target.value))}
                          type="range"
                          value={form.avatarHue}
                        />
                        <Avatar
                          hue={form.avatarHue}
                          label={displayName}
                          size={44}
                          src={previewAvatarUrl}
                          status={user.status}
                        />
                      </div>
                    </label>

                    {visibleError ? (
                      <p className="form-error settings-form-error">{visibleError}</p>
                    ) : null}
                    {saved ? <p className="settings-form-success">{saved}</p> : null}

                    <div className="settings-form-actions">
                      <button className="primary-button" disabled={saving} type="submit">
                        <Icon name="save" />
                        <span>{saving ? "Guardando..." : "Guardar cambios"}</span>
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => setEditorOpen(false)}
                        type="button"
                      >
                        <Icon name="arrowRight" />
                        <span>Volver</span>
                      </button>
                      <button className="ghost-button" onClick={onSignOut} type="button">
                        <Icon name="close" />
                        <span>Cerrar sesion</span>
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          ) : (
            <div className="settings-stack">
              <div className="settings-top-tabs">
                <button
                  className="settings-top-tab"
                  onClick={() => setTab("security")}
                  type="button"
                >
                  Seguridad
                </button>
                <button className="settings-top-tab active" type="button">
                  Estado
                </button>
              </div>

              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>Estado actual</h3>
                  <span>Presencia visible para el resto del workspace.</span>
                </div>

                <div className="settings-status-showcase">
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.username}
                    size={72}
                    src={user.avatar_url}
                    status={user.status}
                  />
                  <div>
                    <strong>{findStatusLabel(user.status)}</strong>
                    <p>{user.custom_status || "Sin estado personalizado por ahora."}</p>
                  </div>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>Resumen del espacio</h3>
                  <span>Actividad actual dentro de Umbra.</span>
                </div>

                <div className="settings-summary-grid">
                  <div className="summary-tile">
                    <Icon name="community" />
                    <strong>{guildCount}</strong>
                    <span>Servidores activos</span>
                  </div>
                  <div className="summary-tile">
                    <Icon name="mail" />
                    <strong>{dmCount}</strong>
                    <span>DMs visibles</span>
                  </div>
                  <div className="summary-tile">
                    <Icon name="sparkles" />
                    <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
                    <span>Modo visual</span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </section>
      </div>

      {avatarCropState.open ? (
        <AvatarCropModal
          file={avatarCropState.file}
          imageUrl={avatarCropState.imageUrl}
          onApply={(croppedFile) => {
            setAvatarFile(croppedFile);
            rememberPreview(avatarPreview, croppedFile, setAvatarPreview, setClearAvatar);
            setAvatarCropState((previous) => {
              if (previous.imageUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(previous.imageUrl);
              }
              return {
                file: null,
                imageUrl: "",
                open: false
              };
            });
          }}
          onClose={() =>
            setAvatarCropState((previous) => {
              if (previous.imageUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(previous.imageUrl);
              }
              return {
                file: null,
                imageUrl: "",
                open: false
              };
            })
          }
        />
      ) : null}
    </div>
  );
}
