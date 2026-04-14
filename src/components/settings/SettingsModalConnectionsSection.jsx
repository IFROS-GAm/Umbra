import React from "react";

import { Icon } from "../Icon.jsx";

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
              <span>
                {connectionsBusy === "change-email"
                  ? locale.connections.send
                  : locale.connections.changeEmail}
              </span>
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
                {connectionsBusy === "reauth"
                  ? locale.connections.send
                  : locale.connections.sendReauth}
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
                {connectionsBusy === "password"
                  ? locale.connections.saving
                  : locale.connections.updatePassword}
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
                ? `${locale.connections.backupNow}: ${
                    locale.recoveryProviders[recoveryProvider] || recoveryProviderMeta.label
                  }`
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
              <span>
                {connectionsBusy === "recovery-email"
                  ? locale.connections.send
                  : locale.connections.sendTest}
              </span>
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
                          socialPlatformOptions.find(
                            (item) => item.value === connection.platform
                          )?.label ||
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
                {connectionsBusy === "invite-user"
                  ? locale.connections.inviting
                  : locale.connections.sendInvite}
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
            <span>
              {connectionsBusy === "recovery"
                ? locale.connections.saving
                : locale.connections.saveBackup}
            </span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );
}
