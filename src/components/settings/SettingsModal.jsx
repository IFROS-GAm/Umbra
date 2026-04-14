import React, { useMemo } from "react";

import { translate } from "../../i18n.js";
import { SettingsModalLayout } from "../SettingsModalLayout.jsx";
import { SETTINGS_NAV_GROUPS, getLegalSections, getSettingsLocale, settingsPanelTitle } from "../settingsModalHelpers.js";
import {
  buildSettingsTabLocale,
  buildTranslatedPanelTitle,
  buildVisibleNavGroups
} from "../settingsModalViewHelpers.js";
import { SettingsModalPanelContent } from "../SettingsModalPanelContent.jsx";
import { useSettingsModalConnections } from "../useSettingsModalConnections.js";
import { useSettingsModalProfileState } from "../useSettingsModalProfileState.js";

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

  const profile = useSettingsModalProfileState({
    initialEditorOpen,
    initialTab,
    locale,
    onUpdateProfile,
    user
  });

  const connections = useSettingsModalConnections({
    form: profile.form,
    locale,
    normalizedProfileColor: profile.normalizedProfileColor,
    onUpdateProfile,
    privacySettings: profile.privacySettings,
    publicSocialLinks: profile.publicSocialLinks,
    setError: profile.setError,
    setSaved: profile.setSaved,
    user
  });

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

  const panelTitle = buildTranslatedPanelTitle(profile.tab, t, settingsPanelTitle(profile.tab));
  const settingsTabLocale = buildSettingsTabLocale(
    locale,
    t("settings.panel.security", "Mi cuenta"),
    t("settings.panel.status", "Estado")
  );
  const visibleNavGroups = buildVisibleNavGroups(
    translatedNavGroups,
    profile.search,
    profile.tab,
    onToggleTheme,
    profile.setTab
  );
  const legalSections = useMemo(() => getLegalSections(language), [language]);

  return (
    <SettingsModalLayout
      avatarCropState={profile.avatarCropState}
      onApplyAvatarCrop={profile.handleAvatarCropApply}
      onClose={onClose}
      onCloseAvatarCrop={profile.handleAvatarCropClose}
      onSearchChange={profile.setSearch}
      panelTitle={panelTitle}
      search={profile.search}
      searchPlaceholder={t("settings.search", "Buscar")}
      user={user}
      userSubtitle={t("settings.editProfiles", "Editar perfiles")}
      visibleNavGroups={visibleNavGroups}
    >
      <SettingsModalPanelContent
        connections={connections}
        dmCount={dmCount}
        guildCount={guildCount}
        language={language}
        legalSections={legalSections}
        locale={locale}
        onChangeLanguage={onChangeLanguage}
        onSignOut={onSignOut}
        profile={profile}
        settingsTabLocale={settingsTabLocale}
        tab={profile.tab}
        termsReviewDate={termsReviewDate}
        theme={theme}
        user={user}
      />
    </SettingsModalLayout>
  );
}
