import React from "react";

import { ServerSettingsModalContent } from "../ServerSettingsModalContent.jsx";
import { useServerSettingsCopy, useServerSettingsModalState } from "../useServerSettingsModalState.js";

export function ServerSettingsModal({
  currentUserId = null,
  guild,
  language = "es",
  memberCount = 0,
  onBanMember,
  onClose,
  onKickMember,
  onSave
}) {
  const copy = useServerSettingsCopy(language);
  const state = useServerSettingsModalState({
    copy,
    currentUserId,
    guild,
    language,
    onBanMember,
    onKickMember,
    onSave
  });

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="server-settings-shell" onClick={(event) => event.stopPropagation()}>
        <ServerSettingsModalContent
          activeTab={state.activeTab}
          copy={copy}
          currentUserId={currentUserId}
          guild={guild}
          language={language}
          memberCount={memberCount}
          onClose={onClose}
          state={state}
        />
      </div>
    </div>
  );
}
