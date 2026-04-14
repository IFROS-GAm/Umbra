import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

export function SecuritySettingsPanel({
  accountRows,
  avatarInputRef,
  bannerInputRef,
  buildPanelStyle,
  displayName,
  editorOpen,
  form,
  locale,
  normalizedProfileColor,
  onAvatarHueChange,
  onAvatarSelection,
  onBannerSelection,
  onCloseEditor,
  onOpenAvatarPicker,
  onOpenBannerPicker,
  onOpenEditor,
  onProfileSave,
  onRemoveAvatar,
  onRemoveBanner,
  onSignOut,
  onToggleEditor,
  onUpdateBio,
  onUpdateCustomStatus,
  onUpdateProfileColor,
  onUpdateUsername,
  previewAvatarUrl,
  previewBannerUrl,
  profileColorPresets,
  saved,
  saving,
  user,
  visibleError
}) {
  return (
    <div className="settings-stack">
      <div className="settings-top-tabs">
        <button className="settings-top-tab active" type="button">
          {locale.security.tabLabel}
        </button>
        <button className="settings-top-tab" onClick={onCloseEditor} type="button">
          {locale.statusPanel.tabLabel}
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
          <button className="primary-button" onClick={onToggleEditor} type="button">
            <span>
              {editorOpen ? locale.security.closeEditorButton : locale.security.editProfileButton}
            </span>
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
                <button className="ghost-button small" onClick={onOpenEditor} type="button">
                  {locale.security.editButton}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="settings-card profile-editor-card">
          <div className="settings-card-title">
            <h3>{locale.security.editProfileTitle}</h3>
            <span>{locale.security.editProfileSubtitle}</span>
          </div>

          <input
            accept="image/*"
            className="hidden-file-input"
            onChange={onAvatarSelection}
            ref={avatarInputRef}
            type="file"
          />
          <input
            accept="image/*"
            className="hidden-file-input"
            onChange={onBannerSelection}
            ref={bannerInputRef}
            type="file"
          />

          <form className="settings-form-grid" onSubmit={onProfileSave}>
            <div className="settings-field full">
              <span>{locale.security.profilePanel}</span>
              <div className="settings-banner-editor">
                <div
                  className="settings-banner-preview"
                  style={buildPanelStyle(normalizedProfileColor, previewBannerUrl)}
                >
                  <button className="settings-banner-upload" onClick={onOpenBannerPicker} type="button">
                    <Icon name="camera" />
                    <span>{locale.security.uploadPanel}</span>
                  </button>
                </div>
                <div className="settings-avatar-actions">
                  <button className="ghost-button" onClick={onOpenBannerPicker} type="button">
                    <Icon name="upload" />
                    <span>{locale.security.changePanelImage}</span>
                  </button>
                  <button className="ghost-button" onClick={onRemoveBanner} type="button">
                    <Icon name="close" />
                    <span>{locale.security.removePanelImage}</span>
                  </button>
                  <small>{locale.security.panelHelper}</small>
                </div>
              </div>
            </div>

            <div className="settings-field full">
              <span>{locale.security.avatar}</span>
              <div className="settings-avatar-editor">
                <Avatar
                  hue={form.avatarHue}
                  label={displayName}
                  size={72}
                  src={previewAvatarUrl}
                  status={user.status}
                />
                <div className="settings-avatar-actions">
                  <button className="ghost-button" onClick={onOpenAvatarPicker} type="button">
                    <Icon name="upload" />
                    <span>{locale.security.uploadPhoto}</span>
                  </button>
                  <button className="ghost-button" onClick={onRemoveAvatar} type="button">
                    <Icon name="close" />
                    <span>{locale.security.removePhoto}</span>
                  </button>
                  <small>{locale.security.avatarHelper}</small>
                </div>
              </div>
            </div>

            <label className="settings-field">
              <span>{locale.security.username}</span>
              <input maxLength={24} onChange={(event) => onUpdateUsername(event.target.value)} required value={form.username} />
            </label>

            <label className="settings-field">
              <span>{locale.security.customStatus}</span>
              <input
                maxLength={80}
                onChange={(event) => onUpdateCustomStatus(event.target.value)}
                placeholder={locale.security.customStatusPlaceholder}
                value={form.customStatus}
              />
            </label>

            <label className="settings-field full">
              <span>{locale.security.bio}</span>
              <textarea maxLength={240} onChange={(event) => onUpdateBio(event.target.value)} rows={4} value={form.bio} />
            </label>

            <div className="settings-field full">
              <span>{locale.security.profileAccent}</span>
              <div className="settings-color-editor">
                <label className="settings-color-input">
                  <input onChange={(event) => onUpdateProfileColor(event.target.value)} type="color" value={normalizedProfileColor} />
                  <span>{normalizedProfileColor}</span>
                </label>

                <input
                  maxLength={7}
                  onChange={(event) => onUpdateProfileColor(event.target.value)}
                  placeholder="#5865F2"
                  value={form.profileColor}
                />
              </div>

              <div className="settings-color-swatches">
                {profileColorPresets.map((color) => (
                  <button
                    aria-label={`Usar color ${color}`}
                    className={`settings-color-swatch ${normalizedProfileColor === color ? "active" : ""}`.trim()}
                    key={color}
                    onClick={() => onUpdateProfileColor(color)}
                    style={{ background: color }}
                    type="button"
                  />
                ))}
              </div>
            </div>

            <label className="settings-field full">
              <span>{locale.security.avatarTone}</span>
              <div className="settings-range-row">
                <input
                  max="360"
                  min="0"
                  onChange={(event) => onAvatarHueChange(Number(event.target.value))}
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

            {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
            {saved ? <p className="settings-form-success">{saved}</p> : null}

            <div className="settings-form-actions">
              <button className="primary-button" disabled={saving} type="submit">
                <Icon name="save" />
                <span>{saving ? locale.security.saving : locale.security.saveChanges}</span>
              </button>
              <button className="ghost-button" onClick={onCloseEditor} type="button">
                <Icon name="arrowRight" />
                <span>{locale.security.back}</span>
              </button>
              <button className="ghost-button" onClick={onSignOut} type="button">
                <Icon name="close" />
                <span>{locale.security.signOut}</span>
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

export function StatusSettingsPanel({
  currentStatusLabel,
  dmCount,
  guildCount,
  locale,
  onOpenSecurityTab,
  theme,
  user
}) {
  return (
    <div className="settings-stack">
      <div className="settings-top-tabs">
        <button className="settings-top-tab" onClick={onOpenSecurityTab} type="button">
          {locale.security.tabLabel}
        </button>
        <button className="settings-top-tab active" type="button">
          {locale.statusPanel.tabLabel}
        </button>
      </div>

      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.statusPanel.currentTitle}</h3>
          <span>{locale.statusPanel.currentSubtitle}</span>
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
            <strong>{currentStatusLabel}</strong>
            <p>{user.custom_status || locale.statusPanel.noCustomStatus}</p>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.statusPanel.workspaceTitle}</h3>
          <span>{locale.statusPanel.workspaceSubtitle}</span>
        </div>

        <div className="settings-summary-grid">
          <div className="summary-tile">
            <Icon name="community" />
            <strong>{guildCount}</strong>
            <span>{locale.statusPanel.guilds}</span>
          </div>
          <div className="summary-tile">
            <Icon name="mail" />
            <strong>{dmCount}</strong>
            <span>{locale.statusPanel.dms}</span>
          </div>
          <div className="summary-tile">
            <Icon name="sparkles" />
            <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
            <span>{locale.statusPanel.theme}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
