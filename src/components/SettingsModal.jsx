import React, { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api.js";
import { LANGUAGE_OPTIONS, translate } from "../i18n.js";
import { hasSupabaseBrowserConfig, supabase } from "../supabase-browser.js";
import { sanitizeUsername } from "../utils.js";
import {
  SecuritySettingsPanel,
  StatusSettingsPanel
} from "./SettingsModalAccountPanels.jsx";
import { SettingsModalLayout } from "./SettingsModalLayout.jsx";
import {
  CreditsSettingsPanel,
  ConnectionsSettingsPanel,
  DevicesSettingsPanel,
  LanguageSettingsPanel,
  PrivacySettingsPanel,
  SocialSettingsPanel,
  TermsSettingsPanel
} from "./SettingsModalSections.jsx";
import {
  PROFILE_COLOR_PRESETS,
  RECOVERY_PROVIDER_OPTIONS,
  SETTINGS_NAV_GROUPS,
  SOCIAL_PLATFORM_OPTIONS,
  buildPanelStyle,
  buildSocialLinkDrafts,
  findLocalizedStatusLabel,
  getLegalSections,
  getLocalizedRecoveryPlaceholder,
  getLocalizedSocialPlaceholder,
  getSettingsLocale,
  isEmailAddress,
  maskEmail,
  normalizeColorInput,
  normalizePrivacySettings,
  normalizeRecoveryAccount,
  normalizeRecoveryProvider,
  normalizeSocialLinks,
  settingsPanelTitle
} from "./settingsModalHelpers.js";
import {
  applyAvatarCropPreview,
  buildSettingsTabLocale,
  buildTranslatedPanelTitle,
  buildVisibleNavGroups,
  clearFilePreview,
  closeAvatarCropPreview
} from "./settingsModalViewHelpers.js";

export function SettingsModal({
  dmCount,
  guildCount,
  initialEditorOpen = false,
  initialTab = "security",
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
  const locale = getSettingsLocale(language);
  const termsReviewDate = useMemo(
    () =>
      new Intl.DateTimeFormat(language || "es", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date("2026-04-08T00:00:00Z")),
    [language]
  );

  const [tab, setTab] = useState(initialTab);
  const [editorOpen, setEditorOpen] = useState(Boolean(initialEditorOpen));
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
    setEditorOpen(Boolean(initialEditorOpen));
    setTab(initialTab || "security");
    setError("");
    setSaved("");
    setSaving(false);
    setConnectionsBusy("");
    setAuthEmailDraft(user.email || "");
    setInviteEmailDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setReauthNonceDraft("");
  }, [initialEditorOpen, initialTab, user]);

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
          error: deviceError.message || locale.devices.readError,
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
  const displayName = form.username || user.username || locale.security.accountRows.defaultName;
  const visibleError = error === "sanitizeUsername is not defined" ? "" : error;

  const accountRows = useMemo(
    () => [
      {
        label: locale.security.accountRows.displayName,
        value: displayName,
      },
      {
        label: locale.security.accountRows.username,
        value: user.username || locale.security.accountRows.noUsername,
      },
      {
        label: locale.security.accountRows.email,
        value: maskEmail(user.email),
        accent: user.email ? locale.security.accountRows.emailAccent : null
      },
      {
        label: locale.security.accountRows.panel,
        value: previewBannerUrl
          ? locale.security.accountRows.bannerConfigured
          : normalizedProfileColor,
      }
    ],
    [
      displayName,
      locale.security.accountRows.bannerConfigured,
      locale.security.accountRows.displayName,
      locale.security.accountRows.email,
      locale.security.accountRows.emailAccent,
      locale.security.accountRows.noUsername,
      locale.security.accountRows.panel,
      locale.security.accountRows.username,
      normalizedProfileColor,
      previewBannerUrl,
      user.email,
      user.username
    ]
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
                            : item.id === "credits"
                              ? t("settings.nav.credits", item.label)
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
  const panelTitle = buildTranslatedPanelTitle(tab, t, settingsPanelTitle(tab));
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
        helper: emailConfirmed
          ? locale.connections.summary.primaryHelperReady
          : locale.connections.summary.primaryHelperPending,
        icon: "mail",
        label: locale.connections.summary.primary,
        value: user.email ? maskEmail(user.email) : locale.connections.noEmail
      },
      {
        id: "provider",
        helper: emailConfirmed
          ? locale.connections.summary.providerReady
          : locale.connections.summary.providerPending,
        icon: "settings",
        label: locale.connections.summary.provider,
        value: authProviderLabel
      },
      {
        id: "recovery",
        helper: recoveryLooksLikeEmail
          ? locale.connections.summary.recoveryReady
          : locale.connections.summary.recoveryPending,
        icon: "link",
        label: locale.connections.summary.recovery,
        value: recoveryProvider
          ? locale.recoveryProviders[recoveryProvider] || recoveryProviderMeta.label
          : locale.connections.summary.noConfig
      },
      {
        id: "links",
        helper: privacySettings.showSocialLinks
          ? locale.connections.summary.publicVisible
          : locale.connections.summary.publicHidden,
        icon: "sparkles",
        label: locale.connections.summary.public,
        value: privacySettings.showSocialLinks
          ? `${publicSocialLinks.length} ${
              publicSocialLinks.length === 1
                ? locale.connections.summary.linkSingular
                : locale.connections.summary.linkPlural
            }`
          : locale.connections.summary.hidden
      }
    ],
    [
      emailConfirmed,
      locale.connections.noEmail,
      locale.connections.summary.hidden,
      locale.connections.summary.linkPlural,
      locale.connections.summary.linkSingular,
      locale.connections.summary.noConfig,
      locale.connections.summary.primary,
      locale.connections.summary.primaryHelperPending,
      locale.connections.summary.primaryHelperReady,
      locale.connections.summary.provider,
      locale.connections.summary.providerPending,
      locale.connections.summary.providerReady,
      locale.connections.summary.public,
      locale.connections.summary.publicHidden,
      locale.connections.summary.publicVisible,
      locale.connections.summary.recovery,
      locale.connections.summary.recoveryPending,
      locale.connections.summary.recoveryReady,
      locale.recoveryProviders,
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
    <SocialSettingsPanel
      getLocalizedSocialPlaceholder={getLocalizedSocialPlaceholder}
      language={language}
      locale={locale}
      onAddSocialLink={addSocialLink}
      onRemoveSocialLink={removeSocialLink}
      onSave={handleProfileSave}
      onUpdateSocialLink={updateSocialLink}
      saved={saved}
      saving={saving}
      socialPlatformOptions={SOCIAL_PLATFORM_OPTIONS}
      visibleError={visibleError}
      visibleSocialLinks={visibleSocialLinks}
    />
  );

  const privacySettingsContent = (
    <PrivacySettingsPanel
      locale={locale}
      onSave={handleProfileSave}
      onUpdatePrivacySetting={updatePrivacySetting}
      privacySettings={privacySettings}
      saved={saved}
      saving={saving}
      visibleError={visibleError}
    />
  );

  const deviceGroups = [
    {
      items: deviceState.audioinput,
      key: "audioinput",
      label: locale.devices.microphones
    },
    {
      items: deviceState.audiooutput,
      key: "audiooutput",
      label: locale.devices.outputs
    },
    {
      items: deviceState.videoinput,
      key: "videoinput",
      label: locale.devices.cameras
    }
  ];

  const devicesSettingsContent = (
    <DevicesSettingsPanel
      deviceGroups={deviceGroups}
      deviceState={deviceState}
      locale={locale}
      onRefreshDevices={() => setDeviceRefreshKey((previous) => previous + 1)}
    />
  );

  const connectionsSettingsContent = (
    <ConnectionsSettingsPanel
      authEmailDraft={authEmailDraft}
      confirmPasswordDraft={confirmPasswordDraft}
      connectionSummaryItems={connectionSummaryItems}
      connectionsBusy={connectionsBusy}
      emailConfirmed={emailConfirmed}
      form={form}
      getLocalizedRecoveryPlaceholder={getLocalizedRecoveryPlaceholder}
      handleConnectionsSave={handleConnectionsSave}
      handleInviteUmbraByEmail={handleInviteUmbraByEmail}
      handlePasswordChange={handlePasswordChange}
      handlePrimaryEmailChange={handlePrimaryEmailChange}
      handleSendPrimaryEmailCheck={handleSendPrimaryEmailCheck}
      handleSendReauthentication={handleSendReauthentication}
      handleSendRecoveryEmailCheck={handleSendRecoveryEmailCheck}
      inviteEmailDraft={inviteEmailDraft}
      language={language}
      locale={locale}
      maskEmail={maskEmail}
      newPasswordDraft={newPasswordDraft}
      onAuthEmailDraftChange={setAuthEmailDraft}
      onConfirmPasswordDraftChange={setConfirmPasswordDraft}
      onInviteEmailDraftChange={setInviteEmailDraft}
      onNewPasswordDraftChange={setNewPasswordDraft}
      onReauthNonceDraftChange={setReauthNonceDraft}
      onRecoveryAccountChange={(value) => updateForm("recoveryAccount", value)}
      onRecoveryProviderChange={(value) => updateForm("recoveryProvider", value)}
      privacySettings={privacySettings}
      publicSocialLinks={publicSocialLinks}
      reauthNonceDraft={reauthNonceDraft}
      recoveryAccount={recoveryAccount}
      recoveryLooksLikeEmail={recoveryLooksLikeEmail}
      recoveryProvider={recoveryProvider}
      recoveryProviderMeta={recoveryProviderMeta}
      recoveryProviderOptions={RECOVERY_PROVIDER_OPTIONS}
      saved={saved}
      socialPlatformOptions={SOCIAL_PLATFORM_OPTIONS}
      user={user}
      visibleError={visibleError}
    />
  );

  const legalSections = useMemo(() => getLegalSections(language), [language]);

  const termsSettingsContent = (
    <TermsSettingsPanel legalSections={legalSections} locale={locale} termsReviewDate={termsReviewDate} />
  );

  const creditsSettingsContent = <CreditsSettingsPanel locale={locale} />;

  const activeLanguageOption = LANGUAGE_OPTIONS.find((option) => option.value === language) || LANGUAGE_OPTIONS[0];

  const languageSettingsContent = (
    <LanguageSettingsPanel
      activeLanguageOption={activeLanguageOption}
      language={language}
      languageOptions={LANGUAGE_OPTIONS}
      locale={locale}
      onChangeLanguage={onChangeLanguage}
    />
  );

  const settingsTabLocale = buildSettingsTabLocale(
    locale,
    t("settings.panel.security", "Mi cuenta"),
    t("settings.panel.status", "Estado")
  );

  const visibleNavGroups = buildVisibleNavGroups(
    translatedNavGroups,
    search,
    tab,
    onToggleTheme,
    setTab
  );

  const handleRemoveAvatar = () => clearFilePreview(setAvatarFile, setAvatarPreview, setClearAvatar);

  const handleRemoveBanner = () => clearFilePreview(setBannerFile, setBannerPreview, setClearBanner);

  const handleAvatarCropApply = (croppedFile) =>
    applyAvatarCropPreview(
      croppedFile,
      avatarPreview,
      rememberPreview,
      setAvatarFile,
      setAvatarPreview,
      setClearAvatar,
      setAvatarCropState
    );

  const handleAvatarCropClose = () => closeAvatarCropPreview(setAvatarCropState);

  const mainContent =
    tab === "security" ? (
      <SecuritySettingsPanel
        accountRows={accountRows}
        avatarInputRef={avatarInputRef}
        bannerInputRef={bannerInputRef}
        buildPanelStyle={buildPanelStyle}
        displayName={displayName}
        editorOpen={editorOpen}
        form={form}
        locale={settingsTabLocale}
        normalizedProfileColor={normalizedProfileColor}
        onAvatarHueChange={(value) => updateForm("avatarHue", value)}
        onAvatarSelection={handleAvatarSelection}
        onBannerSelection={handleBannerSelection}
        onCloseEditor={() => setEditorOpen(false)}
        onOpenAvatarPicker={() => avatarInputRef.current?.click()}
        onOpenBannerPicker={() => bannerInputRef.current?.click()}
        onOpenEditor={() => setEditorOpen(true)}
        onProfileSave={handleProfileSave}
        onRemoveAvatar={handleRemoveAvatar}
        onRemoveBanner={handleRemoveBanner}
        onSignOut={onSignOut}
        onToggleEditor={() => {
          setError("");
          setSaved("");
          setEditorOpen((previous) => !previous);
        }}
        onUpdateBio={(value) => updateForm("bio", value)}
        onUpdateCustomStatus={(value) => updateForm("customStatus", value)}
        onUpdateProfileColor={(value) => updateForm("profileColor", value)}
        onUpdateUsername={(value) => updateForm("username", sanitizeUsername(value))}
        previewAvatarUrl={previewAvatarUrl}
        previewBannerUrl={previewBannerUrl}
        profileColorPresets={PROFILE_COLOR_PRESETS}
        saved={saved}
        saving={saving}
        user={user}
        visibleError={visibleError}
      />
    ) : tab === "status" ? (
      <StatusSettingsPanel
        currentStatusLabel={findLocalizedStatusLabel(user.status, locale)}
        dmCount={dmCount}
        guildCount={guildCount}
        locale={settingsTabLocale}
        onOpenSecurityTab={() => setTab("security")}
        theme={theme}
        user={user}
      />
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
    ) : tab === "credits" ? (
      creditsSettingsContent
    ) : (
      connectionsSettingsContent
    );

  return (
    <SettingsModalLayout
      avatarCropState={avatarCropState}
      onApplyAvatarCrop={handleAvatarCropApply}
      onClose={onClose}
      onCloseAvatarCrop={handleAvatarCropClose}
      onSearchChange={setSearch}
      panelTitle={panelTitle}
      search={search}
      searchPlaceholder={t("settings.search", "Buscar")}
      user={user}
      userSubtitle={t("settings.editProfiles", "Editar perfiles")}
      visibleNavGroups={visibleNavGroups}
    >
      {mainContent}
    </SettingsModalLayout>
  );
}
