import { useEffect, useRef, useState } from "react";

import { sanitizeServerFolders } from "./serverFolders.js";

export function useWorkspaceShellState({
  currentUserId,
  guilds
}) {
  const [voiceInputPanel, setVoiceInputPanel] = useState(null);
  const [voiceOutputPanel, setVoiceOutputPanel] = useState(null);
  const [fullProfile, setFullProfile] = useState(null);
  const [isResizingMembersPanel, setIsResizingMembersPanel] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.visualViewport?.width || window.innerWidth : 1440
  );
  const [membersPanelWidth, setMembersPanelWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("umbra-members-panel-width"));
      return Number.isFinite(saved) && saved >= 340 && saved <= 520 ? saved : 356;
    } catch {
      return 356;
    }
  });
  const [serverSettingsGuildId, setServerSettingsGuildId] = useState(null);
  const [leaveGuildTarget, setLeaveGuildTarget] = useState(null);
  const [leavingGuild, setLeavingGuild] = useState(false);
  const [inviteModalState, setInviteModalState] = useState({
    error: "",
    guildId: null,
    invite: null,
    loading: false,
    open: false
  });
  const [guildMenuPrefs, setGuildMenuPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem("umbra-guild-menu-prefs");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [dmMenuPrefs, setDmMenuPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem("umbra-dm-menu-prefs");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [serverFolders, setServerFolders] = useState([]);
  const desktopShellRef = useRef(null);
  const appShellRef = useRef(null);
  const membersResizeRef = useRef(null);
  const membersResizeCleanupRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("umbra-guild-menu-prefs", JSON.stringify(guildMenuPrefs));
  }, [guildMenuPrefs]);

  useEffect(() => {
    localStorage.setItem("umbra-dm-menu-prefs", JSON.stringify(dmMenuPrefs));
  }, [dmMenuPrefs]);

  useEffect(() => {
    if (!currentUserId) {
      setServerFolders([]);
      return;
    }

    try {
      const saved = localStorage.getItem(`umbra-server-folders-${currentUserId}`);
      const parsed = saved ? JSON.parse(saved) : [];
      setServerFolders(sanitizeServerFolders(parsed, guilds || []));
    } catch {
      setServerFolders([]);
    }
  }, [currentUserId, guilds]);

  useEffect(() => {
    if (!guilds) {
      return;
    }

    setServerFolders((previous) => sanitizeServerFolders(previous, guilds));
  }, [guilds]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    try {
      localStorage.setItem(
        `umbra-server-folders-${currentUserId}`,
        JSON.stringify(serverFolders)
      );
    } catch {
      // Ignore local preference persistence issues.
    }
  }, [currentUserId, serverFolders]);

  useEffect(() => {
    try {
      localStorage.setItem("umbra-members-panel-width", String(membersPanelWidth));
    } catch {
      // Ignore local-only persistence issues.
    }
  }, [membersPanelWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function updateViewportWidth() {
      const measuredWidth =
        appShellRef.current?.getBoundingClientRect?.().width ||
        desktopShellRef.current?.getBoundingClientRect?.().width ||
        window.visualViewport?.width ||
        window.innerWidth;
      setViewportWidth((previous) =>
        Math.abs(previous - measuredWidth) > 1 ? measuredWidth : previous
      );
    }

    updateViewportWidth();

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateViewportWidth());
      if (desktopShellRef.current) {
        resizeObserver.observe(desktopShellRef.current);
      }
      if (appShellRef.current) {
        resizeObserver.observe(appShellRef.current);
      }
    }

    window.addEventListener("resize", updateViewportWidth);
    window.visualViewport?.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
      window.visualViewport?.removeEventListener("resize", updateViewportWidth);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(
    () => () => {
      if (membersResizeCleanupRef.current) {
        membersResizeCleanupRef.current();
        membersResizeCleanupRef.current = null;
      }
    },
    []
  );

  return {
    appShellRef,
    desktopShellRef,
    dmMenuPrefs,
    fullProfile,
    guildMenuPrefs,
    inviteModalState,
    isResizingMembersPanel,
    leaveGuildTarget,
    leavingGuild,
    membersPanelWidth,
    membersResizeCleanupRef,
    membersResizeRef,
    serverFolders,
    serverSettingsGuildId,
    setDmMenuPrefs,
    setFullProfile,
    setGuildMenuPrefs,
    setInviteModalState,
    setIsResizingMembersPanel,
    setLeaveGuildTarget,
    setLeavingGuild,
    setMembersPanelWidth,
    setServerFolders,
    setServerSettingsGuildId,
    setVoiceInputPanel,
    setVoiceOutputPanel,
    viewportWidth,
    voiceInputPanel,
    voiceOutputPanel
  };
}
