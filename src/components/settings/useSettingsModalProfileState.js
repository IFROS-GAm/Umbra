import { useEffect, useMemo, useRef, useState } from "react";

import { sanitizeUsername } from "../../utils.js";
import {
  buildSocialLinkDrafts,
  maskEmail,
  normalizeColorInput,
  normalizePrivacySettings,
  normalizeRecoveryAccount,
  normalizeRecoveryProvider,
  normalizeSocialLinks
} from "../settingsModalHelpers.js";
import {
  applyAvatarCropPreview,
  clearFilePreview,
  closeAvatarCropPreview
} from "../settingsModalViewHelpers.js";

function buildInitialSettingsForm(user) {
  return {
    avatarHue: user.avatar_hue || 220,
    bio: user.bio || "",
    customStatus: user.custom_status || "",
    profileColor: user.profile_color || "#5865F2",
    privacySettings: normalizePrivacySettings(user.privacy_settings),
    recoveryAccount: normalizeRecoveryAccount(user.recovery_account),
    recoveryProvider: normalizeRecoveryProvider(user.recovery_provider),
    socialLinks: buildSocialLinkDrafts(user.social_links),
    username: user.username || ""
  };
}

export function useSettingsModalProfileState({
  initialEditorOpen,
  initialTab,
  locale,
  onUpdateProfile,
  user
}) {
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [tab, setTab] = useState(initialTab);
  const [editorOpen, setEditorOpen] = useState(Boolean(initialEditorOpen));
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

  const [form, setForm] = useState(() => buildInitialSettingsForm(user));

  useEffect(() => {
    setForm(buildInitialSettingsForm(user));
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
    setSearch("");
  }, [initialEditorOpen, initialTab, user]);

  useEffect(() => {
    if (error === "sanitizeUsername is not defined") {
      setError("");
    }
  }, [error]);

  useEffect(() => {
    if (
      tab !== "devices" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
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
  }, [deviceRefreshKey, locale.devices.readError, tab]);

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
  const previewBannerUrl = bannerPreview || (clearBanner ? "" : user.profile_banner_url || "");
  const normalizedProfileColor = normalizeColorInput(
    form.profileColor,
    user.profile_color || "#5865F2"
  );
  const displayName = form.username || user.username || locale.security.accountRows.defaultName;
  const visibleError = error === "sanitizeUsername is not defined" ? "" : error;
  const visibleSocialLinks = buildSocialLinkDrafts(form.socialLinks);
  const publicSocialLinks = normalizeSocialLinks(form.socialLinks);
  const privacySettings = normalizePrivacySettings(form.privacySettings);

  const accountRows = useMemo(
    () => [
      {
        label: locale.security.accountRows.displayName,
        value: displayName
      },
      {
        label: locale.security.accountRows.username,
        value: user.username || locale.security.accountRows.noUsername
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
          : normalizedProfileColor
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

  const handleRemoveAvatar = () =>
    clearFilePreview(setAvatarFile, setAvatarPreview, setClearAvatar);
  const handleRemoveBanner = () =>
    clearFilePreview(setBannerFile, setBannerPreview, setClearBanner);

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

  return {
    accountRows,
    addSocialLink,
    avatarCropState,
    avatarInputRef,
    bannerInputRef,
    deviceGroups,
    deviceState,
    displayName,
    editorOpen,
    error,
    form,
    handleAvatarCropApply,
    handleAvatarCropClose,
    handleAvatarSelection,
    handleBannerSelection,
    handleProfileSave,
    handleRemoveAvatar,
    handleRemoveBanner,
    normalizedProfileColor,
    previewAvatarUrl,
    previewBannerUrl,
    privacySettings,
    publicSocialLinks,
    removeSocialLink,
    saved,
    saving,
    search,
    setDeviceRefreshKey,
    setEditorOpen,
    setError,
    setSaved,
    setSearch,
    setTab,
    tab,
    updateForm,
    updatePrivacySetting,
    updateSocialLink,
    visibleError,
    visibleSocialLinks
  };
}
