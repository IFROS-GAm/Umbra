import React, { useEffect, useMemo, useRef, useState } from "react";

import { api, resolveAssetUrl } from "../api.js";
import { LANGUAGE_OPTIONS, translate } from "../i18n.js";
import { hasSupabaseBrowserConfig, supabase } from "../supabase-browser.js";
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
      { id: "language", icon: "globe", label: "Idiomas", active: false },
      { id: "theme", icon: "sparkles", label: "Tema", toggleTheme: true }
    ]
  },
  {
    title: "Legal",
    className: "settings-nav-group-legal",
    items: [{ id: "terms", icon: "help", label: "Terminos y condiciones", active: false }]
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
    case "language":
      return "Idiomas";
    case "terms":
      return "Terminos y condiciones";
    case "status":
      return "Estado";
    default:
      return "Mi cuenta";
  }
}

export function SettingsModal({
  dmCount,
  guildCount,
  language = "es",
  onClose,
  onChangeLanguage,
  onSignOut,
  onToggleTheme,
  onUpdateProfile,
  theme,
  user
}) {
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const t = (key, fallback = "") => translate(language, key, fallback);

  const [tab, setTab] = useState("security");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [search, setSearch] = useState("");
  const [connectionsBusy, setConnectionsBusy] = useState("");
  const [authEmailDraft, setAuthEmailDraft] = useState(user.email || "");
  const [inviteEmailDraft, setInviteEmailDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [reauthNonceDraft, setReauthNonceDraft] = useState("");

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
    setAuthEmailDraft(user.email || "");
    setInviteEmailDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setReauthNonceDraft("");
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

  const translatedNavGroups = useMemo(
    () =>
      SETTINGS_NAV_GROUPS.map((group) => ({
        ...group,
        title:
          group.title === "Ajustes de usuario"
            ? t("settings.group.user", group.title)
            : group.title === "Ajustes de la aplicacion"
              ? t("settings.group.app", group.title)
              : t("settings.group.legal", group.title),
        items: group.items.map((item) => ({
          ...item,
          label:
            item.id === "security"
              ? t("settings.nav.security", item.label)
              : item.id === "social"
                ? t("settings.nav.social", item.label)
                : item.id === "privacy"
                  ? t("settings.nav.privacy", item.label)
                  : item.id === "devices"
                    ? t("settings.nav.devices", item.label)
                    : item.id === "connections"
                      ? t("settings.nav.connections", item.label)
                      : item.id === "status"
                        ? t("settings.nav.status", item.label)
                        : item.id === "theme"
                          ? t("settings.nav.theme", item.label)
                          : item.id === "language"
                            ? t("settings.nav.language", item.label)
                            : t("settings.nav.terms", item.label)
        }))
      })),
    [t]
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
  const panelTitle =
    tab === "security"
      ? t("settings.panel.security", settingsPanelTitle(tab))
      : tab === "social"
        ? t("settings.panel.social", settingsPanelTitle(tab))
        : tab === "privacy"
          ? t("settings.panel.privacy", settingsPanelTitle(tab))
          : tab === "devices"
            ? t("settings.panel.devices", settingsPanelTitle(tab))
            : tab === "connections"
              ? t("settings.panel.connections", settingsPanelTitle(tab))
              : tab === "status"
                ? t("settings.panel.status", settingsPanelTitle(tab))
                : tab === "language"
                  ? t("settings.panel.language", settingsPanelTitle(tab))
                  : t("settings.panel.terms", settingsPanelTitle(tab));
  const recoveryProvider = normalizeRecoveryProvider(form.recoveryProvider);
  const recoveryProviderMeta =
    RECOVERY_PROVIDER_OPTIONS.find((option) => option.value === recoveryProvider) ||
    RECOVERY_PROVIDER_OPTIONS[0];
  const emailConfirmed = Boolean(user.email_confirmed_at);
  const recoveryAccount = normalizeRecoveryAccount(form.recoveryAccount);
  const recoveryLooksLikeEmail = isEmailAddress(recoveryAccount);
  const authProviderLabel = String(user.auth_provider || "email").toUpperCase();
  const connectionSummaryItems = useMemo(
    () => [
      {
        id: "primary-email",
        helper: emailConfirmed ? "Listo para recibir avisos" : "Pendiente de verificar",
        icon: "mail",
        label: "Correo principal",
        value: user.email ? maskEmail(user.email) : "Sin correo"
      },
      {
        id: "provider",
        helper: emailConfirmed ? "Sesion validada" : "Requiere confirmacion",
        icon: "settings",
        label: "Acceso activo",
        value: authProviderLabel
      },
      {
        id: "recovery",
        helper: recoveryLooksLikeEmail ? "Puede recibir prueba" : "Agrega una via de apoyo",
        icon: "link",
        label: "Respaldo",
        value: recoveryProvider ? recoveryProviderMeta.label : "No configurado"
      },
      {
        id: "links",
        helper: privacySettings.showSocialLinks ? "Visible en tu perfil" : "Redes ocultas",
        icon: "sparkles",
        label: "Perfil publico",
        value: privacySettings.showSocialLinks
          ? `${publicSocialLinks.length} enlace${publicSocialLinks.length === 1 ? "" : "s"}`
          : "Oculto"
      }
    ],
    [
      authProviderLabel,
      emailConfirmed,
      privacySettings.showSocialLinks,
      publicSocialLinks.length,
      recoveryLooksLikeEmail,
      recoveryProvider,
      recoveryProviderMeta.label,
      user.email
    ]
  );

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

  async function handlePrimaryEmailChange() {
    const nextEmail = String(authEmailDraft || "").trim().toLowerCase();
    if (!nextEmail) {
      setError("Ingresa el nuevo correo principal.");
      return;
    }

    if (!isEmailAddress(nextEmail)) {
      setError("Ingresa un correo principal valido.");
      return;
    }

    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    setConnectionsBusy("change-email");
    setError("");
    setSaved("");

    try {
      const { error: updateError } = await supabase.auth.updateUser(
        {
          email: nextEmail
        },
        {
          emailRedirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined
        }
      );

      if (updateError) {
        throw updateError;
      }

      setSaved(
        "Solicitud de cambio de correo enviada. Revisa tu correo actual y el nuevo para confirmar."
      );
    } catch (updateError) {
      setError(updateError.message || "No se pudo iniciar el cambio de correo.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleSendReauthentication() {
    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    setConnectionsBusy("reauth");
    setError("");
    setSaved("");

    try {
      const { error: reauthError } = await supabase.auth.reauthenticate();
      if (reauthError) {
        throw reauthError;
      }

      setSaved("Codigo de reautenticacion enviado al correo principal.");
    } catch (reauthError) {
      setError(reauthError.message || "No se pudo enviar el codigo de reautenticacion.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handlePasswordChange() {
    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    if (String(newPasswordDraft || "").length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }

    if (newPasswordDraft !== confirmPasswordDraft) {
      setError("Las contrasenas nuevas no coinciden.");
      return;
    }

    setConnectionsBusy("password");
    setError("");
    setSaved("");

    try {
      const payload = {
        password: newPasswordDraft
      };

      if (String(reauthNonceDraft || "").trim()) {
        payload.nonce = String(reauthNonceDraft).trim();
      }

      const { error: passwordError } = await supabase.auth.updateUser(payload);
      if (passwordError) {
        throw passwordError;
      }

      setNewPasswordDraft("");
      setConfirmPasswordDraft("");
      setReauthNonceDraft("");
      setSaved("Contrasena actualizada correctamente.");
    } catch (passwordError) {
      setError(passwordError.message || "No se pudo actualizar la contrasena.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleInviteUmbraByEmail() {
    const email = String(inviteEmailDraft || "").trim().toLowerCase();
    if (!email) {
      setError("Ingresa un correo para enviar la invitacion.");
      return;
    }

    if (!isEmailAddress(email)) {
      setError("Ingresa un correo valido para invitar a Umbra.");
      return;
    }

    setConnectionsBusy("invite-user");
    setError("");
    setSaved("");

    try {
      await api.inviteUmbraUser({
        email,
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
      });
      setInviteEmailDraft("");
      setSaved("Invitacion enviada. La otra persona recibira un acceso para crear su cuenta.");
    } catch (inviteError) {
      setError(inviteError.message || "No se pudo enviar la invitacion a Umbra.");
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
          <span>
            Controla como recuperas tu cuenta, que correo recibe avisos y que enlaces quedan
            visibles dentro de Umbra.
          </span>
        </div>

        <div className="settings-summary-grid settings-connections-summary">
          {connectionSummaryItems.map((item) => (
            <div className="summary-tile settings-connection-summary-tile" key={item.id}>
              <span className="settings-row-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <span>{item.helper}</span>
            </div>
          ))}
        </div>

        <div className="settings-grid settings-connections-overview">
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

        <div className="settings-connection-stack settings-connection-card settings-connection-card-primary">
          <div className="settings-card-title">
            <h3>Cambiar correo principal</h3>
            <span>Usa un nuevo correo y Umbra disparara el flujo de validacion correspondiente.</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>Nuevo correo</span>
              <input
                onChange={(event) => setAuthEmailDraft(event.target.value)}
                placeholder="nuevo@email.com"
                type="email"
                value={authEmailDraft}
              />
            </label>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="ghost-button"
              disabled={connectionsBusy === "change-email"}
              onClick={handlePrimaryEmailChange}
              type="button"
            >
              <Icon name="mail" />
              <span>{connectionsBusy === "change-email" ? "Enviando..." : "Cambiar correo"}</span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>Reautenticacion y clave</h3>
            <span>
              Envia un codigo de reautenticacion y luego actualiza tu contrasena desde Umbra.
            </span>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="ghost-button"
              disabled={connectionsBusy === "reauth"}
              onClick={handleSendReauthentication}
              type="button"
            >
              <Icon name="mail" />
              <span>
                {connectionsBusy === "reauth" ? "Enviando..." : "Enviar codigo de reautenticacion"}
              </span>
            </button>
          </div>

          <div className="settings-social-row settings-connection-security-grid">
            <label className="settings-field">
              <span>Codigo de reautenticacion</span>
              <input
                onChange={(event) => setReauthNonceDraft(event.target.value)}
                placeholder="Pegalo aqui si se solicita por correo"
                value={reauthNonceDraft}
              />
            </label>
            <label className="settings-field">
              <span>Nueva contrasena</span>
              <input
                minLength={8}
                onChange={(event) => setNewPasswordDraft(event.target.value)}
                placeholder="Minimo 8 caracteres"
                type="password"
                value={newPasswordDraft}
              />
            </label>
            <label className="settings-field">
              <span>Confirmar contrasena</span>
              <input
                minLength={8}
                onChange={(event) => setConfirmPasswordDraft(event.target.value)}
                placeholder="Repite la nueva contrasena"
                type="password"
                value={confirmPasswordDraft}
              />
            </label>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="primary-button"
              disabled={connectionsBusy === "password"}
              onClick={handlePasswordChange}
              type="button"
            >
              <Icon name="save" />
              <span>
                {connectionsBusy === "password" ? "Guardando..." : "Actualizar contrasena"}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
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

          <div className="settings-empty-state compact settings-empty-state-solid">
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

          <div className="settings-row settings-connection-row">
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

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>Redes visibles ahora</h3>
            <span>
              {privacySettings.showSocialLinks
                ? "Esto es lo que la gente vera en tu perfil completo si tiene acceso a tus conexiones."
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
            <div className="settings-empty-state settings-empty-state-solid">
              <strong>No hay conexiones publicas configuradas.</strong>
              <span>Usa Contenido y redes para agregar tus enlaces visibles.</span>
            </div>
          )}
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>Invitar a Umbra</h3>
            <span>Envia una invitacion por correo para crear una cuenta nueva en Umbra.</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>Correo a invitar</span>
              <input
                onChange={(event) => setInviteEmailDraft(event.target.value)}
                placeholder="alguien@email.com"
                type="email"
                value={inviteEmailDraft}
              />
            </label>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="ghost-button"
              disabled={connectionsBusy === "invite-user"}
              onClick={handleInviteUmbraByEmail}
              type="button"
            >
              <Icon name="userAdd" />
              <span>
                {connectionsBusy === "invite-user" ? "Invitando..." : "Enviar invitacion"}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-form-actions inline">
          <button
            className="primary-button"
            disabled={connectionsBusy === "recovery"}
            onClick={handleConnectionsSave}
            type="button"
          >
            <Icon name="save" />
            <span>{connectionsBusy === "recovery" ? "Guardando..." : "Guardar respaldo"}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );

  const legalSections = [
    {
      id: "uso",
      title: "Uso aceptable",
      body:
        "Umbra esta pensada para conversaciones, servidores, mensajes directos, voz, video y comunidades privadas. No puedes usar la plataforma para spam, fraude, acoso, suplantacion, distribucion de malware o automatizacion abusiva."
    },
    {
      id: "cuenta",
      title: "Cuenta, acceso y seguridad",
      body:
        "Eres responsable de la seguridad de tu cuenta, de tus credenciales y de los dispositivos desde los que entras. Debes mantener tu correo principal actualizado y usar los canales de recuperacion disponibles para proteger el acceso."
    },
    {
      id: "contenido",
      title: "Contenido y convivencia",
      body:
        "Cada persona mantiene la responsabilidad sobre lo que publica, comparte, sube o transmite en Umbra. Tambien debe respetar la privacidad, autoria y normas internas de cada servidor, categoria, canal o grupo."
    },
    {
      id: "moderacion",
      title: "Servidores, moderacion y permisos",
      body:
        "Los duenos y administradores de servidores pueden definir estructura, roles, categorias, stickers, invitaciones y reglas de moderacion. Umbra puede limitar funciones o retirar acceso si detecta abuso, evasion de bloqueos o uso peligroso del servicio."
    },
    {
      id: "voz",
      title: "Llamadas, voz, camara y actividad",
      body:
        "Las funciones de microfono, camara, compartir pantalla y presencia solo deben usarse con consentimiento de las personas presentes. No debes grabar, retransmitir o capturar contenido privado sin autorizacion."
    },
    {
      id: "privacidad",
      title: "Privacidad y datos",
      body:
        "Umbra utiliza la informacion minima necesaria para darte acceso, mantener perfiles, conexiones, invitaciones, mensajes, presencia y configuraciones. Tus ajustes de privacidad controlan que partes de tu perfil y actividad se muestran a otros."
    },
    {
      id: "cambios",
      title: "Cambios, disponibilidad y soporte",
      body:
        "Podemos actualizar funciones, plantillas, limites, flujos de autenticacion, estructura del servicio y politicas para mejorar seguridad, rendimiento o experiencia. El uso continuado de Umbra implica aceptacion de estos cambios cuando entren en vigor."
    }
  ];

  const termsSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>Terminos y condiciones de uso</h3>
          <span>
            Este panel resume las reglas base para usar Umbra con seguridad, respeto y
            responsabilidad.
          </span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>Resumen Umbra</strong>
            <p>
              Al usar Umbra aceptas una plataforma centrada en comunidad, identidad,
              privacidad, mensajeria, voz y servidores administrados por sus propias reglas.
            </p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>Ultima revision</strong>
            <span>08 abril 2026</span>
          </div>
        </div>

        <div className="settings-legal-pill-row">
          <span className="user-profile-chip">Respeto y convivencia</span>
          <span className="user-profile-chip">Privacidad</span>
          <span className="user-profile-chip">Moderacion</span>
          <span className="user-profile-chip">Uso responsable</span>
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>Condiciones generales</h3>
          <span>
            Estos puntos aplican al uso del cliente, la web, los servidores, los mensajes
            directos y cualquier integracion futura de Umbra.
          </span>
        </div>

        <div className="settings-legal-section-list">
          {legalSections.map((section) => (
            <article className="settings-legal-section" key={section.id}>
              <div className="settings-legal-section-header">
                <span className="settings-row-icon">
                  <Icon name="help" size={16} />
                </span>
                <strong>{section.title}</strong>
              </div>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>Lo que aceptas al usar Umbra</h3>
          <span>Una version corta y clara de las reglas practicas del servicio.</span>
        </div>

        <ul className="settings-legal-checklist">
          <li>No usar Umbra para suplantar identidades ni engañar a otras personas.</li>
          <li>No automatizar invitaciones, DMs, menciones o llamadas de forma abusiva.</li>
          <li>No compartir contenido privado de terceros sin permiso.</li>
          <li>Respetar bloqueos, silencios, baneos y limites de moderacion.</li>
          <li>Cuidar tus accesos, dispositivos y metodos de recuperacion.</li>
          <li>Usar de forma responsable stickers, perfiles, servidores y conexiones visibles.</li>
        </ul>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>Soporte y contacto</h3>
          <span>
            Si una norma de un servidor entra en conflicto con el uso seguro de Umbra,
            prevalece la seguridad del servicio y de las personas usuarias.
          </span>
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>Recomendacion</strong>
          <span>
            Usa Conexiones para mantener tu correo principal y tu respaldo actualizados.
            Eso facilita confirmaciones, recuperacion de acceso y avisos de seguridad.
          </span>
        </div>
      </section>
    </div>
  );

  const activeLanguageOption =
    LANGUAGE_OPTIONS.find((option) => option.value === language) || LANGUAGE_OPTIONS[0];

  const languageSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>{t("settings.language.title", "Idiomas")}</h3>
          <span>
            {t(
              "settings.language.subtitle",
              "Cambia el idioma visible de Umbra para esta app y este dispositivo."
            )}
          </span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{t("settings.language.current", "Idioma actual")}</strong>
            <p>
              {t(
                "settings.language.currentHelper",
                "El cambio se aplica al instante y Umbra lo recuerda para la proxima vez."
              )}
            </p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{activeLanguageOption.nativeLabel}</strong>
            <span>{t("settings.language.applyNow", "Aplicado al instante")}</span>
          </div>
        </div>
      </section>

      <section className="settings-card settings-language-grid-card">
        <div className="settings-card-title">
          <h3>{t("settings.language.preview", "Vista rapida")}</h3>
          <span>
            {t(
              "settings.language.previewBody",
              "Esta seleccion afecta primero a acceso, ajustes y rotulos principales de la interfaz."
            )}
          </span>
        </div>

        <div className="settings-language-grid">
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.value === language;
            return (
              <button
                className={`settings-language-option ${selected ? "active" : ""}`.trim()}
                key={option.value}
                onClick={() => onChangeLanguage?.(option.value)}
                type="button"
              >
                <div className="settings-language-option-copy">
                  <strong>{option.nativeLabel}</strong>
                  <span>{option.helper}</span>
                </div>
                <span className={`user-profile-chip ${selected ? "" : "muted"}`}>
                  {selected
                    ? t("settings.language.selected", "Seleccionado")
                    : option.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{t("settings.language.title", "Idiomas")}</strong>
          <span>
            {t(
              "settings.language.note",
              "Mas zonas de Umbra seguiran heredando este idioma a medida que se actualicen."
            )}
          </span>
        </div>
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
              <span>{t("settings.editProfiles", "Editar perfiles")}</span>
            </div>
          </div>

          <label className="settings-search">
            <Icon name="search" />
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("settings.search", "Buscar")}
              type="text"
              value={search}
            />
          </label>

          <div className="settings-nav stacked">
            {translatedNavGroups.map((group) => (
              <div
                className={`settings-nav-group ${group.className || ""}`.trim()}
                key={group.title}
              >
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
                  {t("settings.panel.security", "Mi cuenta")}
                </button>
                <button
                  className="settings-top-tab"
                  onClick={() => setTab("status")}
                  type="button"
                >
                  {t("settings.panel.status", "Estado")}
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
                  {t("settings.panel.security", "Mi cuenta")}
                </button>
                <button className="settings-top-tab active" type="button">
                  {t("settings.panel.status", "Estado")}
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
          ) : tab === "language" ? (
            languageSettingsContent
          ) : tab === "terms" ? (
            termsSettingsContent
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
