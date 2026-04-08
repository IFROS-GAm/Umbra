import React, { useEffect, useMemo, useRef, useState } from "react";

import { api, resolveAssetUrl } from "../api.js";
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

const SOCIAL_PLATFORM_OPTIONS = [
  { value: "website", label: "Sitio web", placeholder: "https://tu-sitio.com" },
  { value: "instagram", label: "Instagram", placeholder: "https://instagram.com/tu_usuario" },
  { value: "youtube", label: "YouTube", placeholder: "https://youtube.com/@tu_canal" },
  { value: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/user/..." },
  { value: "twitch", label: "Twitch", placeholder: "https://twitch.tv/tu_canal" },
  { value: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@tu_usuario" },
  { value: "x", label: "X / Twitter", placeholder: "https://x.com/tu_usuario" },
  { value: "discord", label: "Discord", placeholder: "https://discord.gg/tu_invite" }
];

const DEFAULT_PRIVACY_SETTINGS = {
  allowDirectMessages: true,
  showActivityStatus: true,
  showMemberSince: true,
  showSocialLinks: true
};

const RECOVERY_PROVIDER_OPTIONS = [
  { value: "", label: "Sin cuenta de recuperacion", placeholder: "No configurada" },
  { value: "google", label: "Google", placeholder: "tu-cuenta@gmail.com" },
  { value: "outlook", label: "Microsoft / Outlook", placeholder: "tu-cuenta@outlook.com" },
  { value: "apple", label: "Apple", placeholder: "Apple ID o correo asociado" },
  { value: "discord", label: "Discord", placeholder: "usuario, enlace o handle" },
  { value: "other", label: "Otra", placeholder: "Correo, usuario o enlace de respaldo" }
];

const SETTINGS_NAV_GROUPS = [
  {
    title: "Ajustes de usuario",
    items: [
      { id: "security", icon: "profile", label: "Mi cuenta", active: true },
      { id: "social", icon: "sparkles", label: "Contenido y redes", active: false },
      { id: "privacy", icon: "help", label: "Datos y privacidad", active: false },
      { id: "devices", icon: "screenShare", label: "Dispositivos", active: false },
      { id: "connections", icon: "mail", label: "Conexiones", active: false },
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

function isEmailAddress(candidate = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(candidate || "").trim());
}

function ensureUrlProtocol(candidate = "") {
  const trimmed = String(candidate || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function normalizeSocialLinks(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .map((entry, index) => ({
      id: String(entry?.id || `social-${index}`),
      label: String(entry?.label || "").trim().slice(0, 48),
      platform: SOCIAL_PLATFORM_OPTIONS.some((option) => option.value === entry?.platform)
        ? entry.platform
        : "website",
      url: ensureUrlProtocol(entry?.url || "")
    }))
    .filter((entry) => entry.label || entry.url)
    .slice(0, 8);
}

function buildSocialLinkDrafts(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return source.slice(0, 8).map((entry, index) => ({
    id: String(entry?.id || `social-${index}`),
    label: String(entry?.label || "").trim().slice(0, 48),
    platform: SOCIAL_PLATFORM_OPTIONS.some((option) => option.value === entry?.platform)
      ? entry.platform
      : "website",
    url: String(entry?.url || "").trim().slice(0, 240)
  }));
}

function normalizePrivacySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    ...DEFAULT_PRIVACY_SETTINGS,
    allowDirectMessages: source.allowDirectMessages !== false,
    showActivityStatus: source.showActivityStatus !== false,
    showMemberSince: source.showMemberSince !== false,
    showSocialLinks: source.showSocialLinks !== false
  };
}

function normalizeRecoveryProvider(provider = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  return RECOVERY_PROVIDER_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : "";
}

function normalizeRecoveryAccount(value = "") {
  return String(value || "").trim().slice(0, 160);
}

function settingsPanelTitle(tab) {
  switch (tab) {
    case "social":
      return "Contenido y redes";
    case "privacy":
      return "Datos y privacidad";
    case "devices":
      return "Dispositivos";
    case "connections":
      return "Conexiones";
    case "status":
      return "Estado";
    default:
      return "Mi cuenta";
  }
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
  const [connectionsBusy, setConnectionsBusy] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [clearAvatar, setClearAvatar] = useState(false);

  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [clearBanner, setClearBanner] = useState(false);
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
  const [deviceState, setDeviceState] = useState({
    audioinput: [],
    audiooutput: [],
    error: "",
    loading: false,
    videoinput: []
  });
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
    privacySettings: normalizePrivacySettings(user.privacy_settings),
    recoveryAccount: normalizeRecoveryAccount(user.recovery_account),
    recoveryProvider: normalizeRecoveryProvider(user.recovery_provider),
    socialLinks: buildSocialLinkDrafts(user.social_links),
    username: user.username || ""
  });

  useEffect(() => {
    setForm({
      avatarHue: user.avatar_hue || 220,
      bio: user.bio || "",
      customStatus: user.custom_status || "",
      profileColor: user.profile_color || "#5865F2",
      privacySettings: normalizePrivacySettings(user.privacy_settings),
      recoveryAccount: normalizeRecoveryAccount(user.recovery_account),
      recoveryProvider: normalizeRecoveryProvider(user.recovery_provider),
      socialLinks: buildSocialLinkDrafts(user.social_links),
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
    setConnectionsBusy("");
  }, [user]);

  useEffect(() => {
    if (error === "sanitizeUsername is not defined") {
      setError("");
    }
  }, [error]);

  useEffect(() => {
    if (tab !== "devices" || typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return undefined;
    }

    let cancelled = false;

    async function loadDevices() {
      setDeviceState((previous) => ({
        ...previous,
        error: "",
        loading: true
      }));

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) {
          return;
        }

        setDeviceState({
          audioinput: devices.filter((device) => device.kind === "audioinput"),
          audiooutput: devices.filter((device) => device.kind === "audiooutput"),
          error: "",
          loading: false,
          videoinput: devices.filter((device) => device.kind === "videoinput")
        });
      } catch (deviceError) {
        if (cancelled) {
          return;
        }

        setDeviceState({
          audioinput: [],
          audiooutput: [],
          error: deviceError.message || "No se pudieron leer los dispositivos.",
          loading: false,
          videoinput: []
        });
      }
    }

    loadDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", loadDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", loadDevices);
    };
  }, [deviceRefreshKey, tab]);

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
        privacySettings: normalizePrivacySettings(form.privacySettings),
        recoveryAccount: normalizeRecoveryAccount(form.recoveryAccount),
        recoveryProvider: normalizeRecoveryProvider(form.recoveryProvider),
        socialLinks: normalizeSocialLinks(form.socialLinks),
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

  function updatePrivacySetting(key, checked) {
    updateForm("privacySettings", {
      ...normalizePrivacySettings(form.privacySettings),
      [key]: checked
    });
  }

  function updateSocialLink(index, key, value) {
    const nextLinks = [...buildSocialLinkDrafts(form.socialLinks)];
    nextLinks[index] = {
      ...nextLinks[index],
      [key]: value
    };
    updateForm("socialLinks", nextLinks);
  }

  function addSocialLink() {
    updateForm("socialLinks", [
      ...buildSocialLinkDrafts(form.socialLinks),
      {
        id: `social-${Date.now()}`,
        label: "",
        platform: "website",
        url: ""
      }
    ]);
  }

  function removeSocialLink(index) {
    updateForm(
      "socialLinks",
      buildSocialLinkDrafts(form.socialLinks).filter((_, itemIndex) => itemIndex !== index)
    );
  }

  const visibleSocialLinks = buildSocialLinkDrafts(form.socialLinks);
  const publicSocialLinks = normalizeSocialLinks(form.socialLinks);
  const privacySettings = normalizePrivacySettings(form.privacySettings);
  const panelTitle = settingsPanelTitle(tab);
  const recoveryProvider = normalizeRecoveryProvider(form.recoveryProvider);
  const recoveryProviderMeta =
    RECOVERY_PROVIDER_OPTIONS.find((option) => option.value === recoveryProvider) ||
    RECOVERY_PROVIDER_OPTIONS[0];
  const emailConfirmed = Boolean(user.email_confirmed_at);
  const recoveryAccount = normalizeRecoveryAccount(form.recoveryAccount);
  const recoveryLooksLikeEmail = isEmailAddress(recoveryAccount);

  async function handleSendPrimaryEmailCheck() {
    if (!user.email) {
      setError("No hay un correo principal asociado a esta cuenta.");
      return;
    }

    setConnectionsBusy("primary-email");
    setError("");
    setSaved("");

    try {
      const payload = await api.sendEmailCheck({
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        target: "primary"
      });

      setSaved(
        payload?.kind === "confirmation"
          ? "Correo de confirmacion enviado al principal."
          : "Correo de prueba enviado al principal."
      );
    } catch (sendError) {
      setError(sendError.message || "No se pudo enviar la comprobacion al correo principal.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleSendRecoveryEmailCheck() {
    if (!recoveryAccount) {
      setError("Configura primero una cuenta de respaldo.");
      return;
    }

    if (!recoveryLooksLikeEmail) {
      setError("El respaldo debe ser un correo valido para poder recibir una comprobacion.");
      return;
    }

    setConnectionsBusy("recovery-email");
    setError("");
    setSaved("");

    try {
      await api.sendEmailCheck({
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        target: "recovery"
      });

      setSaved("Correo de prueba enviado al respaldo.");
    } catch (sendError) {
      setError(sendError.message || "No se pudo enviar la comprobacion al correo de respaldo.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleConnectionsSave() {
    setConnectionsBusy("recovery");
    setError("");
    setSaved("");

    try {
      await onUpdateProfile({
        avatarHue: form.avatarHue,
        bio: form.bio,
        customStatus: form.customStatus,
        privacySettings,
        profileColor: normalizedProfileColor,
        recoveryAccount: normalizeRecoveryAccount(form.recoveryAccount),
        recoveryProvider,
        socialLinks: publicSocialLinks,
        username: sanitizeUsername(form.username)
      });

      setSaved("Conexiones actualizadas.");
    } catch (saveError) {
      setError(saveError.message || "No se pudieron guardar las conexiones.");
    } finally {
      setConnectionsBusy("");
    }
  }

  const socialSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>Contenido y redes</h3>
          <span>Lo que publiques aqui aparecera en Ver perfil completo.</span>
        </div>

        <div className="settings-social-list">
          {visibleSocialLinks.map((link, index) => {
            const platformMeta =
              SOCIAL_PLATFORM_OPTIONS.find((option) => option.value === link.platform) ||
              SOCIAL_PLATFORM_OPTIONS[0];

            return (
              <div className="settings-social-row" key={link.id}>
                <label className="settings-field">
                  <span>Plataforma</span>
                  <select
                    className="settings-inline-select"
                    onChange={(event) => updateSocialLink(index, "platform", event.target.value)}
                    value={link.platform}
                  >
                    {SOCIAL_PLATFORM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-field">
                  <span>Etiqueta visible</span>
                  <input
                    maxLength={48}
                    onChange={(event) => updateSocialLink(index, "label", event.target.value)}
                    placeholder="Tu nombre o handle"
                    value={link.label}
                  />
                </label>

                <label className="settings-field">
                  <span>Enlace</span>
                  <input
                    onChange={(event) => updateSocialLink(index, "url", event.target.value)}
                    placeholder={platformMeta.placeholder}
                    value={link.url}
                  />
                </label>

                <button
                  aria-label="Eliminar red"
                  className="ghost-button icon-only"
                  onClick={() => removeSocialLink(index)}
                  type="button"
                >
                  <Icon name="trash" />
                </button>
              </div>
            );
          })}
        </div>

        {!visibleSocialLinks.length ? (
          <div className="settings-empty-state">
            <strong>Todavia no hay redes visibles.</strong>
            <span>Agrega las conexiones que quieres que aparezcan en tu perfil completo.</span>
          </div>
        ) : null}

        <div className="settings-form-actions inline">
          <button
            className="ghost-button"
            disabled={visibleSocialLinks.length >= 8}
            onClick={addSocialLink}
            type="button"
          >
            <Icon name="add" />
            <span>Anadir red</span>
          </button>
          <button className="primary-button" disabled={saving} onClick={handleProfileSave} type="button">
            <Icon name="save" />
            <span>{saving ? "Guardando..." : "Guardar redes"}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );

  const privacySettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>Datos y privacidad</h3>
          <span>Controla que partes de tu perfil completo se muestran al resto.</span>
        </div>

        <div className="settings-toggle-list">
          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>Mostrar redes y conexiones</strong>
                <p>Permite que Contenido y redes se vea dentro de tu perfil completo.</p>
              </div>
            </div>
            <input
              checked={privacySettings.showSocialLinks}
              onChange={(event) => updatePrivacySetting("showSocialLinks", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>Mostrar fecha de miembro desde</strong>
                <p>Usa la fecha de creacion de tu cuenta dentro del perfil completo.</p>
              </div>
            </div>
            <input
              checked={privacySettings.showMemberSince}
              onChange={(event) => updatePrivacySetting("showMemberSince", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>Mostrar estado de actividad</strong>
                <p>Deja visible tu estado personalizado y actividad en el perfil.</p>
              </div>
            </div>
            <input
              checked={privacySettings.showActivityStatus}
              onChange={(event) => updatePrivacySetting("showActivityStatus", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>Permitir mensajes directos desde perfil</strong>
                <p>Guarda tu preferencia para futuros accesos directos a DM.</p>
              </div>
            </div>
            <input
              checked={privacySettings.allowDirectMessages}
              onChange={(event) => updatePrivacySetting("allowDirectMessages", event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>

        <div className="settings-form-actions inline">
          <button className="primary-button" disabled={saving} onClick={handleProfileSave} type="button">
            <Icon name="save" />
            <span>{saving ? "Guardando..." : "Guardar privacidad"}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );

  const deviceGroups = [
    {
      items: deviceState.audioinput,
      key: "audioinput",
      label: "Microfonos"
    },
    {
      items: deviceState.audiooutput,
      key: "audiooutput",
      label: "Salidas de audio"
    },
    {
      items: deviceState.videoinput,
      key: "videoinput",
      label: "Camaras"
    }
  ];

  const devicesSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>Dispositivos</h3>
          <span>Lectura local de microfonos, salidas y camaras disponibles en este equipo.</span>
        </div>

        <div className="settings-form-actions inline">
          <button
            className="ghost-button"
            onClick={() => setDeviceRefreshKey((previous) => previous + 1)}
            type="button"
          >
            <Icon name="refresh" />
            <span>{deviceState.loading ? "Actualizando..." : "Actualizar lista"}</span>
          </button>
        </div>

        {deviceState.error ? (
          <p className="form-error settings-form-error">{deviceState.error}</p>
        ) : null}

        <div className="settings-device-grid">
          {deviceGroups.map((group) => (
            <section className="settings-device-card" key={group.key}>
              <strong>{group.label}</strong>
              <span>{group.items.length} detectados</span>
              <div className="settings-device-list">
                {group.items.length ? (
                  group.items.map((device, index) => (
                    <div
                      className="settings-device-item"
                      key={device.deviceId || `${group.key}-${index}`}
                    >
                      <Icon
                        name={
                          group.key === "videoinput"
                            ? "camera"
                            : group.key === "audiooutput"
                              ? "headphones"
                              : "mic"
                        }
                      />
                      <div>
                        <strong>{device.label || `${group.label} ${index + 1}`}</strong>
                        <small>
                          {device.deviceId === "default"
                            ? "Predeterminado del sistema"
                            : "Detectado localmente"}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="settings-empty-state compact">
                    <strong>Sin dispositivos visibles.</strong>
                    <span>Permite acceso a microfono o camara para ver etiquetas completas.</span>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );

  const connectionsSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>Conexiones</h3>
          <span>Administra la verificacion del correo y una cuenta de recuperacion de Umbra.</span>
        </div>

        <div className="settings-grid">
          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>Proveedor de acceso</strong>
                <p>{String(user.auth_provider || "email").toUpperCase()}</p>
              </div>
            </div>
            <span className="user-profile-chip muted">{user.email ? "Conectado" : "Sin correo"}</span>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>Correo actual</strong>
                <p>{maskEmail(user.email)}</p>
              </div>
            </div>
            <span className={`user-profile-chip ${emailConfirmed ? "" : "muted"}`}>
              {emailConfirmed ? "Confirmado" : "Sin confirmar"}
            </span>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>Confirmacion de correo</strong>
                <p>
                  {emailConfirmed
                    ? "Tu correo principal ya esta confirmado. Puedes mandar un correo de prueba si quieres revisar la entrega."
                    : "Puedes reenviar el correo de verificacion al principal para comprobar que el flujo funciona."}
                </p>
              </div>
            </div>
            <button
              className="ghost-button"
              disabled={connectionsBusy === "primary-email" || !user.email}
              onClick={handleSendPrimaryEmailCheck}
              type="button"
            >
              <Icon name="mail" />
              <span>
                {connectionsBusy === "primary-email"
                  ? "Enviando..."
                  : emailConfirmed
                    ? "Enviar prueba"
                    : "Enviar confirmacion"}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack">
          <div className="settings-card-title">
            <h3>Cuenta de recuperacion</h3>
            <span>
              Guarda una via de respaldo como Google u otro servicio para futuros flujos de recuperacion.
            </span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>Proveedor</span>
              <select
                className="settings-inline-select"
                onChange={(event) => updateForm("recoveryProvider", event.target.value)}
                value={recoveryProvider}
              >
                {RECOVERY_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Cuenta o correo</span>
              <input
                onChange={(event) => updateForm("recoveryAccount", event.target.value)}
                placeholder={recoveryProviderMeta.placeholder}
                value={form.recoveryAccount}
              />
            </label>
          </div>

          <div className="settings-empty-state compact">
            <strong>
              {recoveryProvider
                ? `Respaldo actual: ${recoveryProviderMeta.label}`
                : "Todavia no hay una cuenta de recuperacion guardada."}
            </strong>
            <span>
              {recoveryProvider && recoveryAccount
                ? recoveryAccount
                : "Puedes dejar un correo, usuario o enlace de una cuenta externa como referencia segura."}
            </span>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>Comprobacion del respaldo</strong>
                <p>
                  {recoveryLooksLikeEmail
                    ? "Envía un correo de prueba al respaldo para validar que siga disponible."
                    : "Si quieres probar el respaldo por correo, guardalo como un email valido."}
                </p>
              </div>
            </div>
            <button
              className="ghost-button"
              disabled={connectionsBusy === "recovery-email" || !recoveryLooksLikeEmail}
              onClick={handleSendRecoveryEmailCheck}
              type="button"
            >
              <Icon name="mail" />
              <span>{connectionsBusy === "recovery-email" ? "Enviando..." : "Enviar prueba"}</span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack">
          <div className="settings-card-title">
            <h3>Redes visibles ahora</h3>
            <span>
              {privacySettings.showSocialLinks
                ? "Esto es lo que la gente vera en tu perfil completo."
                : "Las redes estan ocultas por tu configuracion de privacidad."}
            </span>
          </div>
          {privacySettings.showSocialLinks && publicSocialLinks.length ? (
            <div className="profile-detail-connections">
              {publicSocialLinks.map((connection) => (
                <div className="profile-detail-connection" key={connection.id}>
                  <div className="profile-detail-connection-main">
                    <span className="profile-detail-connection-icon">
                      <Icon name="link" size={16} />
                    </span>
                    <div className="profile-detail-connection-copy">
                      <strong>{connection.label || connection.url}</strong>
                      <small>
                        {SOCIAL_PLATFORM_OPTIONS.find((item) => item.value === connection.platform)?.label || "Enlace"}
                      </small>
                    </div>
                  </div>
                  <Icon name="arrowRight" size={14} />
                </div>
              ))}
            </div>
          ) : (
            <div className="settings-empty-state">
              <strong>No hay conexiones publicas configuradas.</strong>
              <span>Usa Contenido y redes para agregar tus enlaces visibles.</span>
            </div>
          )}
        </div>

        <div className="settings-form-actions inline">
          <button
            className="primary-button"
            disabled={connectionsBusy === "recovery"}
            onClick={handleConnectionsSave}
            type="button"
          >
            <Icon name="save" />
            <span>{connectionsBusy === "recovery" ? "Guardando..." : "Guardar conexiones"}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );

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
              <h2>{panelTitle}</h2>
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
          ) : tab === "status" ? (
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
          ) : tab === "social" ? (
            socialSettingsContent
          ) : tab === "privacy" ? (
            privacySettingsContent
          ) : tab === "devices" ? (
            devicesSettingsContent
          ) : (
            connectionsSettingsContent
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
