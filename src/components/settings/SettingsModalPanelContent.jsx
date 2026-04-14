import React, { useMemo } from "react";

import { LANGUAGE_OPTIONS } from "../../i18n.js";
import { sanitizeUsername } from "../../utils.js";
import {
  SecuritySettingsPanel,
  StatusSettingsPanel
} from "../SettingsModalAccountPanels.jsx";
import {
  CreditsSettingsPanel,
  ConnectionsSettingsPanel,
  DevicesSettingsPanel,
  LanguageSettingsPanel,
  PrivacySettingsPanel,
  SocialSettingsPanel,
  TermsSettingsPanel
} from "../SettingsModalSections.jsx";
import {
  PROFILE_COLOR_PRESETS,
  RECOVERY_PROVIDER_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
  buildPanelStyle,
  findLocalizedStatusLabel,
  getLocalizedRecoveryPlaceholder,
  getLocalizedSocialPlaceholder,
  maskEmail
} from "../settingsModalHelpers.js";

export function SettingsModalPanelContent({
  dmCount,
  guildCount,
  language,
  legalSections,
  locale,
  onChangeLanguage,
  onSignOut,
  profile,
  connections,
  settingsTabLocale,
  tab,
  termsReviewDate,
  theme,
  user
}) {
  const activeLanguageOption = useMemo(
    () => LANGUAGE_OPTIONS.find((option) => option.value === language) || LANGUAGE_OPTIONS[0],
    [language]
  );

  if (tab === "security") {
    return (
      <SecuritySettingsPanel
        accountRows={profile.accountRows}
        avatarInputRef={profile.avatarInputRef}
        bannerInputRef={profile.bannerInputRef}
        buildPanelStyle={buildPanelStyle}
        displayName={profile.displayName}
        editorOpen={profile.editorOpen}
        form={profile.form}
        locale={settingsTabLocale}
        normalizedProfileColor={profile.normalizedProfileColor}
        onAvatarHueChange={(value) => profile.updateForm("avatarHue", value)}
        onAvatarSelection={profile.handleAvatarSelection}
        onBannerSelection={profile.handleBannerSelection}
        onCloseEditor={() => profile.setEditorOpen(false)}
        onOpenAvatarPicker={() => profile.avatarInputRef.current?.click()}
        onOpenBannerPicker={() => profile.bannerInputRef.current?.click()}
        onOpenEditor={() => profile.setEditorOpen(true)}
        onProfileSave={profile.handleProfileSave}
        onRemoveAvatar={profile.handleRemoveAvatar}
        onRemoveBanner={profile.handleRemoveBanner}
        onSignOut={onSignOut}
        onToggleEditor={() => {
          profile.setError("");
          profile.setSaved("");
          profile.setEditorOpen((previous) => !previous);
        }}
        onUpdateBio={(value) => profile.updateForm("bio", value)}
        onUpdateCustomStatus={(value) => profile.updateForm("customStatus", value)}
        onUpdateProfileColor={(value) => profile.updateForm("profileColor", value)}
        onUpdateUsername={(value) =>
          profile.updateForm("username", sanitizeUsername(value))
        }
        previewAvatarUrl={profile.previewAvatarUrl}
        previewBannerUrl={profile.previewBannerUrl}
        profileColorPresets={PROFILE_COLOR_PRESETS}
        saved={profile.saved}
        saving={profile.saving}
        user={user}
        visibleError={profile.visibleError}
      />
    );
  }

  if (tab === "status") {
    return (
      <StatusSettingsPanel
        currentStatusLabel={findLocalizedStatusLabel(user.status, locale)}
        dmCount={dmCount}
        guildCount={guildCount}
        locale={settingsTabLocale}
        onOpenSecurityTab={() => profile.setTab("security")}
        theme={theme}
        user={user}
      />
    );
  }

  if (tab === "social") {
    return (
      <SocialSettingsPanel
        getLocalizedSocialPlaceholder={getLocalizedSocialPlaceholder}
        language={language}
        locale={locale}
        onAddSocialLink={profile.addSocialLink}
        onRemoveSocialLink={profile.removeSocialLink}
        onSave={profile.handleProfileSave}
        onUpdateSocialLink={profile.updateSocialLink}
        saved={profile.saved}
        saving={profile.saving}
        socialPlatformOptions={SOCIAL_PLATFORM_OPTIONS}
        visibleError={profile.visibleError}
        visibleSocialLinks={profile.visibleSocialLinks}
      />
    );
  }

  if (tab === "privacy") {
    return (
      <PrivacySettingsPanel
        locale={locale}
        onSave={profile.handleProfileSave}
        onUpdatePrivacySetting={profile.updatePrivacySetting}
        privacySettings={profile.privacySettings}
        saved={profile.saved}
        saving={profile.saving}
        visibleError={profile.visibleError}
      />
    );
  }

  if (tab === "devices") {
    return (
      <DevicesSettingsPanel
        deviceGroups={profile.deviceGroups}
        deviceState={profile.deviceState}
        locale={locale}
        onRefreshDevices={() =>
          profile.setDeviceRefreshKey((previous) => previous + 1)
        }
      />
    );
  }

  if (tab === "language") {
    return (
      <LanguageSettingsPanel
        activeLanguageOption={activeLanguageOption}
        language={language}
        languageOptions={LANGUAGE_OPTIONS}
        locale={locale}
        onChangeLanguage={onChangeLanguage}
      />
    );
  }

  if (tab === "terms") {
    return (
      <TermsSettingsPanel
        legalSections={legalSections}
        locale={locale}
        termsReviewDate={termsReviewDate}
      />
    );
  }

  if (tab === "credits") {
    return <CreditsSettingsPanel locale={locale} />;
  }

  return (
    <ConnectionsSettingsPanel
      authEmailDraft={connections.authEmailDraft}
      confirmPasswordDraft={connections.confirmPasswordDraft}
      connectionSummaryItems={connections.connectionSummaryItems}
      connectionsBusy={connections.connectionsBusy}
      emailConfirmed={connections.emailConfirmed}
      form={profile.form}
      getLocalizedRecoveryPlaceholder={getLocalizedRecoveryPlaceholder}
      handleConnectionsSave={connections.handleConnectionsSave}
      handleInviteUmbraByEmail={connections.handleInviteUmbraByEmail}
      handlePasswordChange={connections.handlePasswordChange}
      handlePrimaryEmailChange={connections.handlePrimaryEmailChange}
      handleSendPrimaryEmailCheck={connections.handleSendPrimaryEmailCheck}
      handleSendReauthentication={connections.handleSendReauthentication}
      handleSendRecoveryEmailCheck={connections.handleSendRecoveryEmailCheck}
      inviteEmailDraft={connections.inviteEmailDraft}
      language={language}
      locale={locale}
      maskEmail={maskEmail}
      newPasswordDraft={connections.newPasswordDraft}
      onAuthEmailDraftChange={connections.setAuthEmailDraft}
      onConfirmPasswordDraftChange={connections.setConfirmPasswordDraft}
      onInviteEmailDraftChange={connections.setInviteEmailDraft}
      onNewPasswordDraftChange={connections.setNewPasswordDraft}
      onReauthNonceDraftChange={connections.setReauthNonceDraft}
      onRecoveryAccountChange={(value) => profile.updateForm("recoveryAccount", value)}
      onRecoveryProviderChange={(value) => profile.updateForm("recoveryProvider", value)}
      privacySettings={profile.privacySettings}
      publicSocialLinks={profile.publicSocialLinks}
      reauthNonceDraft={connections.reauthNonceDraft}
      recoveryAccount={connections.recoveryAccount}
      recoveryLooksLikeEmail={connections.recoveryLooksLikeEmail}
      recoveryProvider={connections.recoveryProvider}
      recoveryProviderMeta={connections.recoveryProviderMeta}
      recoveryProviderOptions={RECOVERY_PROVIDER_OPTIONS}
      saved={profile.saved}
      socialPlatformOptions={SOCIAL_PLATFORM_OPTIONS}
      user={user}
      visibleError={profile.visibleError}
    />
  );
}
