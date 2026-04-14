import { useEffect, useRef, useState } from "react";

export function useWorkspaceCurrentUserUi({
  currentUser,
  currentUserId,
  handleStatusChange,
  onSignOut,
  setProfileCard,
  setSettingsOpen,
  setVoiceParticipantMenu,
  showUiNotice
}) {
  const statusResetTimeoutRef = useRef(null);
  const [currentUserMenuAnchorRect, setCurrentUserMenuAnchorRect] = useState(null);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [settingsView, setSettingsView] = useState({
    initialEditorOpen: false,
    initialTab: "security"
  });

  useEffect(
    () => () => {
      if (statusResetTimeoutRef.current) {
        window.clearTimeout(statusResetTimeoutRef.current);
        statusResetTimeoutRef.current = null;
      }
    },
    []
  );

  function openSettingsDialog(preset = {}) {
    setCurrentUserMenuAnchorRect(null);
    setProfileCard(null);
    setVoiceParticipantMenu(null);
    setSettingsView({
      initialEditorOpen: Boolean(preset.initialEditorOpen),
      initialTab: preset.initialTab || "security"
    });
    setSettingsOpen(true);
  }

  function openCurrentUserMenu(event) {
    if (!currentUser?.id) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard(null);
    setVoiceParticipantMenu(null);
    setCurrentUserMenuAnchorRect({
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top
    });
  }

  function openAccountManager() {
    setCurrentUserMenuAnchorRect(null);
    setAccountManagerOpen(true);
  }

  async function handleCurrentUserStatusChange(status, durationMs = null) {
    if (statusResetTimeoutRef.current) {
      window.clearTimeout(statusResetTimeoutRef.current);
      statusResetTimeoutRef.current = null;
    }

    await handleStatusChange(status);

    if (durationMs) {
      statusResetTimeoutRef.current = window.setTimeout(() => {
        handleStatusChange("online").catch(() => {});
        statusResetTimeoutRef.current = null;
      }, durationMs);
    }
  }

  async function handleCurrentUserExit() {
    setCurrentUserMenuAnchorRect(null);
    setAccountManagerOpen(false);
    await onSignOut?.();
  }

  async function handleCopyCurrentUserId() {
    if (!currentUserId) {
      showUiNotice("No hay ID visible para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(currentUserId));
      showUiNotice("ID del usuario copiado.");
    } catch {
      showUiNotice("No se pudo copiar el ID del usuario.");
    }
  }

  return {
    accountManagerOpen,
    currentUserMenuAnchorRect,
    settingsView,
    setAccountManagerOpen,
    setCurrentUserMenuAnchorRect,
    openAccountManager,
    openCurrentUserMenu,
    openSettingsDialog,
    handleCopyCurrentUserId,
    handleCurrentUserExit,
    handleCurrentUserStatusChange
  };
}
