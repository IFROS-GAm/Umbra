export function buildSettingsTabLocale(locale, securityLabel, statusLabel) {
  return {
    ...locale,
    security: {
      ...locale.security,
      tabLabel: securityLabel
    },
    statusPanel: {
      ...locale.statusPanel,
      tabLabel: statusLabel
    }
  };
}

export function buildTranslatedPanelTitle(tab, translate, fallbackTitle) {
  const keyMap = {
    security: "settings.panel.security",
    social: "settings.panel.social",
    privacy: "settings.panel.privacy",
    devices: "settings.panel.devices",
    connections: "settings.panel.connections",
    status: "settings.panel.status",
    language: "settings.panel.language",
    terms: "settings.panel.terms"
  };

  return translate(keyMap[tab] || keyMap.terms, fallbackTitle);
}

export function buildVisibleNavGroups(translatedNavGroups, search, activeTab, onToggleTheme, onSetTab) {
  return translatedNavGroups.map((group) => ({
    ...group,
    items: group.items
      .filter((item) =>
        !search.trim() ? true : item.label.toLowerCase().includes(search.trim().toLowerCase())
      )
      .map((item) => ({
        ...item,
        isActive: item.id === activeTab && !item.disabled,
        onSelect: () => {
          if (item.toggleTheme) {
            onToggleTheme();
            return;
          }
          if (!item.disabled) {
            onSetTab(item.id);
          }
        }
      }))
  }));
}

export function clearFilePreview(setFile, setPreview, setClear) {
  setFile(null);
  setPreview((previous) => {
    if (previous?.startsWith("blob:")) {
      URL.revokeObjectURL(previous);
    }
    return "";
  });
  setClear(true);
}

export function applyAvatarCropPreview(
  croppedFile,
  avatarPreview,
  rememberPreview,
  setAvatarFile,
  setAvatarPreview,
  setClearAvatar,
  setAvatarCropState
) {
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
}

export function closeAvatarCropPreview(setAvatarCropState) {
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
}
