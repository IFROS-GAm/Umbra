import React from "react";

import { AvatarCropModal } from "../AvatarCropModal.jsx";
import { Icon } from "../Icon.jsx";
import { SettingsSidebarPanel } from "../SettingsModalSections.jsx";

export function SettingsModalLayout({
  avatarCropState,
  children,
  onApplyAvatarCrop,
  onClose,
  onCloseAvatarCrop,
  onSearchChange,
  panelTitle,
  search,
  searchPlaceholder,
  user,
  userSubtitle,
  visibleNavGroups
}) {
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-shell discordish" onClick={(event) => event.stopPropagation()}>
        <SettingsSidebarPanel
          navGroups={visibleNavGroups}
          onSearchChange={onSearchChange}
          search={search}
          searchPlaceholder={searchPlaceholder}
          user={user}
          userSubtitle={userSubtitle}
        />

        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>{panelTitle}</h2>
            </div>
            <button className="ghost-button icon-only" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </div>

          {children}
        </section>
      </div>

      {avatarCropState.open ? (
        <AvatarCropModal
          file={avatarCropState.file}
          imageUrl={avatarCropState.imageUrl}
          onApply={onApplyAvatarCrop}
          onClose={onCloseAvatarCrop}
        />
      ) : null}
    </div>
  );
}
