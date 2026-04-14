import React from "react";

import { Icon } from "../Icon.jsx";

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
