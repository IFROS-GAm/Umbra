import React from "react";

import { Avatar } from "./Avatar.jsx";
import { Icon } from "./Icon.jsx";

export function SettingsSidebarPanel({
  navGroups,
  onSearchChange,
  search,
  searchPlaceholder,
  user,
  userSubtitle
}) {
  return (
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
          <span>{userSubtitle}</span>
        </div>
      </div>

      <label className="settings-search">
        <Icon name="search" />
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          type="text"
          value={search}
        />
      </label>

      <div className="settings-nav stacked">
        {navGroups.map((group) => (
          <div
            className={`settings-nav-group ${group.className || ""}`.trim()}
            key={group.title}
          >
            <p className="settings-nav-title">{group.title}</p>
            {group.items.map((item) => (
              <button
                className={`settings-nav-item ${item.isActive ? "active" : ""} ${
                  item.disabled ? "muted" : ""
                }`.trim()}
                disabled={item.disabled}
                key={item.id}
                onClick={item.onSelect}
                type="button"
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

export function SocialSettingsPanel({
  getLocalizedSocialPlaceholder,
  language,
  locale,
  onAddSocialLink,
  onRemoveSocialLink,
  onSave,
  onUpdateSocialLink,
  saved,
  saving,
  socialPlatformOptions,
  visibleError,
  visibleSocialLinks
}) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.social.title}</h3>
          <span>{locale.social.subtitle}</span>
        </div>

        <div className="settings-social-list">
          {visibleSocialLinks.map((link, index) => {
            return (
              <div className="settings-social-row" key={link.id}>
                <label className="settings-field">
                  <span>{locale.social.platform}</span>
                  <select
                    className="settings-inline-select"
                    onChange={(event) => onUpdateSocialLink(index, "platform", event.target.value)}
                    value={link.platform}
                  >
                    {socialPlatformOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {locale.socialPlatforms[option.value] || option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-field">
                  <span>{locale.social.visibleLabel}</span>
                  <input
                    maxLength={48}
                    onChange={(event) => onUpdateSocialLink(index, "label", event.target.value)}
                    placeholder={locale.social.visiblePlaceholder}
                    value={link.label}
                  />
                </label>

                <label className="settings-field">
                  <span>{locale.social.link}</span>
                  <input
                    onChange={(event) => onUpdateSocialLink(index, "url", event.target.value)}
                    placeholder={getLocalizedSocialPlaceholder(language, link.platform)}
                    value={link.url}
                  />
                </label>

                <button
                  aria-label={locale.social.delete}
                  className="ghost-button icon-only"
                  onClick={() => onRemoveSocialLink(index)}
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
            <strong>{locale.social.emptyTitle}</strong>
            <span>{locale.social.emptyBody}</span>
          </div>
        ) : null}

        <div className="settings-form-actions inline">
          <button
            className="ghost-button"
            disabled={visibleSocialLinks.length >= 8}
            onClick={onAddSocialLink}
            type="button"
          >
            <Icon name="add" />
            <span>{locale.social.add}</span>
          </button>
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            <Icon name="save" />
            <span>{saving ? locale.social.saving : locale.social.save}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );
}

export function PrivacySettingsPanel({
  locale,
  onSave,
  onUpdatePrivacySetting,
  privacySettings,
  saved,
  saving,
  visibleError
}) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.privacy.title}</h3>
          <span>{locale.privacy.subtitle}</span>
        </div>

        <div className="settings-toggle-list">
          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>Mostrar redes y conexiones</strong>
                <p>{locale.privacy.socialBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.showSocialLinks}
              onChange={(event) => onUpdatePrivacySetting("showSocialLinks", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.privacy.memberSinceTitle}</strong>
                <p>{locale.privacy.memberSinceBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.showMemberSince}
              onChange={(event) => onUpdatePrivacySetting("showMemberSince", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.privacy.activityTitle}</strong>
                <p>{locale.privacy.activityBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.showActivityStatus}
              onChange={(event) => onUpdatePrivacySetting("showActivityStatus", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.privacy.dmTitle}</strong>
                <p>{locale.privacy.dmBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.allowDirectMessages}
              onChange={(event) => onUpdatePrivacySetting("allowDirectMessages", event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>

        <div className="settings-form-actions inline">
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            <Icon name="save" />
            <span>{saving ? locale.privacy.saving : locale.privacy.save}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );
}

export function DevicesSettingsPanel({ deviceGroups, deviceState, locale, onRefreshDevices }) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.devices.title}</h3>
          <span>{locale.devices.subtitle}</span>
        </div>

        <div className="settings-form-actions inline">
          <button className="ghost-button" onClick={onRefreshDevices} type="button">
            <Icon name="refresh" />
            <span>{deviceState.loading ? locale.devices.refreshing : locale.devices.refresh}</span>
          </button>
        </div>

        {deviceState.error ? (
          <p className="form-error settings-form-error">{deviceState.error}</p>
        ) : null}

        <div className="settings-device-grid">
          {deviceGroups.map((group) => (
            <section className="settings-device-card" key={group.key}>
              <strong>{group.label}</strong>
              <span>{group.items.length} {locale.devices.detected}</span>
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
                            ? locale.devices.systemDefault
                            : locale.devices.detectedLocal}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="settings-empty-state compact">
                    <strong>{locale.devices.emptyTitle}</strong>
                    <span>{locale.devices.emptyBody}</span>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ConnectionsSettingsPanel({
  authEmailDraft,
  connectionSummaryItems,
  connectionsBusy,
  emailConfirmed,
  form,
  getLocalizedRecoveryPlaceholder,
  handleConnectionsSave,
  handleInviteUmbraByEmail,
  handlePasswordChange,
  handlePrimaryEmailChange,
  handleSendPrimaryEmailCheck,
  handleSendRecoveryEmailCheck,
  handleSendReauthentication,
  inviteEmailDraft,
  language,
  locale,
  maskEmail,
  onAuthEmailDraftChange,
  onConfirmPasswordDraftChange,
  onInviteEmailDraftChange,
  onNewPasswordDraftChange,
  onReauthNonceDraftChange,
  onRecoveryAccountChange,
  onRecoveryProviderChange,
  privacySettings,
  publicSocialLinks,
  recoveryAccount,
  recoveryLooksLikeEmail,
  recoveryProvider,
  recoveryProviderMeta,
  saved,
  socialPlatformOptions,
  visibleError,
  newPasswordDraft,
  confirmPasswordDraft,
  reauthNonceDraft,
  recoveryProviderOptions,
  user
}) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.connections.title}</h3>
          <span>{locale.connections.subtitle}</span>
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
                <strong>{locale.connections.provider}</strong>
                <p>{String(user.auth_provider || "email").toUpperCase()}</p>
              </div>
            </div>
            <span className="user-profile-chip muted">
              {user.email ? locale.connections.connected : locale.connections.noEmail}
            </span>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.connections.currentEmail}</strong>
                <p>{maskEmail(user.email)}</p>
              </div>
            </div>
            <span className={`user-profile-chip ${emailConfirmed ? "" : "muted"}`}>
              {emailConfirmed ? locale.connections.confirmed : locale.connections.unconfirmed}
            </span>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.connections.emailConfirmation}</strong>
                <p>
                  {emailConfirmed
                    ? locale.connections.emailConfirmedBody
                    : locale.connections.emailPendingBody}
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
                  ? locale.connections.send
                  : emailConfirmed
                    ? locale.connections.sendTest
                    : locale.connections.sendConfirmation}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card settings-connection-card-primary">
          <div className="settings-card-title">
            <h3>{locale.connections.changePrimaryTitle}</h3>
            <span>{locale.connections.changePrimarySubtitle}</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>{locale.connections.newEmail}</span>
              <input
                onChange={(event) => onAuthEmailDraftChange(event.target.value)}
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
              <span>{connectionsBusy === "change-email" ? locale.connections.send : locale.connections.changeEmail}</span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.reauthTitle}</h3>
            <span>{locale.connections.reauthSubtitle}</span>
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
                {connectionsBusy === "reauth" ? locale.connections.send : locale.connections.sendReauth}
              </span>
            </button>
          </div>

          <div className="settings-social-row settings-connection-security-grid">
            <label className="settings-field">
              <span>{locale.connections.reauthCode}</span>
              <input
                onChange={(event) => onReauthNonceDraftChange(event.target.value)}
                placeholder={locale.connections.reauthPlaceholder}
                value={reauthNonceDraft}
              />
            </label>
            <label className="settings-field">
              <span>{locale.connections.newPassword}</span>
              <input
                minLength={8}
                onChange={(event) => onNewPasswordDraftChange(event.target.value)}
                placeholder={locale.connections.newPasswordPlaceholder}
                type="password"
                value={newPasswordDraft}
              />
            </label>
            <label className="settings-field">
              <span>{locale.connections.confirmPassword}</span>
              <input
                minLength={8}
                onChange={(event) => onConfirmPasswordDraftChange(event.target.value)}
                placeholder={locale.connections.confirmPasswordPlaceholder}
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
                {connectionsBusy === "password" ? locale.connections.saving : locale.connections.updatePassword}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.recoveryTitle}</h3>
            <span>{locale.connections.recoverySubtitle}</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>{locale.connections.providerField}</span>
              <select
                className="settings-inline-select"
                onChange={(event) => onRecoveryProviderChange(event.target.value)}
                value={recoveryProvider}
              >
                {recoveryProviderOptions.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {locale.recoveryProviders[option.value] || option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>{locale.connections.accountField}</span>
              <input
                onChange={(event) => onRecoveryAccountChange(event.target.value)}
                placeholder={getLocalizedRecoveryPlaceholder(language, recoveryProvider)}
                value={form.recoveryAccount}
              />
            </label>
          </div>

          <div className="settings-empty-state compact settings-empty-state-solid">
            <strong>
              {recoveryProvider
                ? `${locale.connections.backupNow}: ${locale.recoveryProviders[recoveryProvider] || recoveryProviderMeta.label}`
                : locale.connections.backupNone}
            </strong>
            <span>
              {recoveryProvider && recoveryAccount
                ? recoveryAccount
                : locale.connections.backupBody}
            </span>
          </div>

          <div className="settings-row settings-connection-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.connections.recoveryCheckTitle}</strong>
                <p>
                  {recoveryLooksLikeEmail
                    ? locale.connections.recoveryCheckBody
                    : locale.connections.recoveryNeedsEmail}
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
              <span>{connectionsBusy === "recovery-email" ? locale.connections.send : locale.connections.sendTest}</span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.visibleNetworksTitle}</h3>
            <span>
              {privacySettings.showSocialLinks
                ? locale.connections.visibleNetworksBody
                : locale.connections.hiddenNetworksBody}
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
                        {locale.socialPlatforms[connection.platform] ||
                          socialPlatformOptions.find((item) => item.value === connection.platform)?.label ||
                          locale.social.link}
                      </small>
                    </div>
                  </div>
                  <Icon name="arrowRight" size={14} />
                </div>
              ))}
            </div>
          ) : (
            <div className="settings-empty-state settings-empty-state-solid">
              <strong>{locale.connections.noPublicConnections}</strong>
              <span>{locale.connections.noPublicConnectionsBody}</span>
            </div>
          )}
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.inviteUmbraTitle}</h3>
            <span>{locale.connections.inviteUmbraSubtitle}</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>{locale.connections.inviteEmail}</span>
              <input
                onChange={(event) => onInviteEmailDraftChange(event.target.value)}
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
                {connectionsBusy === "invite-user" ? locale.connections.inviting : locale.connections.sendInvite}
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
            <span>{connectionsBusy === "recovery" ? locale.connections.saving : locale.connections.saveBackup}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );
}

export function TermsSettingsPanel({ legalSections, locale, termsReviewDate }) {
  return (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>{locale.terms.title}</h3>
          <span>{locale.terms.subtitle}</span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{locale.terms.summaryTitle}</strong>
            <p>{locale.terms.summaryBody}</p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{locale.terms.lastReview}</strong>
            <span>{termsReviewDate}</span>
          </div>
        </div>

        <div className="settings-legal-pill-row">
          {locale.terms.pills.map((pill) => (
            <span className="user-profile-chip" key={pill}>{pill}</span>
          ))}
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.conditionsTitle}</h3>
          <span>{locale.terms.conditionsSubtitle}</span>
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
          <h3>{locale.terms.acceptTitle}</h3>
          <span>{locale.terms.acceptSubtitle}</span>
        </div>

        <ul className="settings-legal-checklist">
          {locale.terms.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.supportTitle}</h3>
          <span>{locale.terms.supportSubtitle}</span>
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{locale.terms.recommendation}</strong>
          <span>{locale.terms.recommendationBody}</span>
        </div>
      </section>
    </div>
  );
}

export function CreditsSettingsPanel({ locale }) {
  const credits = locale.credits;

  return (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero settings-credits-hero">
        <div className="settings-card-title">
          <h3>{credits.title}</h3>
          <span>{credits.subtitle}</span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{credits.companyTitle}</strong>
            <p>{credits.companyBody}</p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{credits.companyTag}</strong>
            <span>mia S.S</span>
          </div>
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{credits.executiveTitle}</h3>
          <span>{credits.noteTitle}</span>
        </div>

        <div className="settings-credits-grid">
          <article className="settings-credits-person-card">
            <span className="settings-row-icon">
              <Icon name="profile" size={16} />
            </span>
            <strong>{credits.people.ceoName}</strong>
            <span>{credits.people.ceoRole}</span>
          </article>

          <article className="settings-credits-person-card">
            <span className="settings-row-icon">
              <Icon name="sparkles" size={16} />
            </span>
            <strong>{credits.people.engineerNames}</strong>
            <span>{credits.people.engineerRole}</span>
          </article>

          <article className="settings-credits-person-card">
            <span className="settings-row-icon">
              <Icon name="community" size={16} />
            </span>
            <strong>{credits.people.adminName}</strong>
            <span>{credits.people.adminRole}</span>
          </article>
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{credits.noteTitle}</strong>
          <span>{credits.noteBody}</span>
        </div>
      </section>
    </div>
  );
}

export function LanguageSettingsPanel({
  activeLanguageOption,
  language,
  languageOptions,
  locale,
  onChangeLanguage
}) {
  const languageLocale = locale?.language || {
    applyNow: "Aplicado al instante",
    current: "Idioma actual",
    currentHelper: "Elige el idioma visible de Umbra en este dispositivo.",
    note: "Mas areas de Umbra heredaran este idioma gradualmente.",
    preview: "Vista rapida",
    previewBody: "Cambia entre idiomas disponibles sin salir de ajustes.",
    selected: "Seleccionado",
    subtitle: "Ajusta el idioma visible de Umbra para esta app y este dispositivo.",
    title: "Idiomas"
  };
  const resolvedLanguageOptions = Array.isArray(languageOptions) && languageOptions.length
    ? languageOptions
    : [
        {
          helper: "Idioma base de Umbra.",
          label: "Español",
          nativeLabel: "Español",
          value: "es"
        }
      ];
  const resolvedActiveLanguageOption =
    activeLanguageOption ||
    resolvedLanguageOptions.find((option) => option.value === language) ||
    resolvedLanguageOptions[0] || {
      helper: "",
      label: language || "es",
      nativeLabel: language || "es",
      value: language || "es"
    };

  return (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>{languageLocale.title}</h3>
          <span>{languageLocale.subtitle}</span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{languageLocale.current}</strong>
            <p>{languageLocale.currentHelper}</p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{resolvedActiveLanguageOption.nativeLabel}</strong>
            <span>{languageLocale.applyNow}</span>
          </div>
        </div>
      </section>

      <section className="settings-card settings-language-grid-card">
        <div className="settings-card-title">
          <h3>{languageLocale.preview}</h3>
          <span>{languageLocale.previewBody}</span>
        </div>

        <div className="settings-language-grid">
          {resolvedLanguageOptions.map((option) => {
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
                  {selected ? languageLocale.selected : option.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{languageLocale.title}</strong>
          <span>{languageLocale.note}</span>
        </div>
      </section>
    </div>
  );
}
