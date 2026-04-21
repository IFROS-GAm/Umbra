import { useEffect } from "react";

import { buildWorkspaceProfileCardData } from "../workspaceProfileCard.js";
import {
  normalizeVoiceParticipantAudioPref
} from "../voice/rtc/voiceRtcSessionConfig.js";

export function useWorkspaceProfileUi({
  activeChannel,
  activeGuild,
  appShellRef,
  currentUserId,
  effectiveMembersPanelVisible,
  fullProfile,
  isSingleDirectMessagePanel,
  membersResizeCleanupRef,
  membersResizeRef,
  profileCard,
  setFullProfile,
  setIsResizingMembersPanel,
  setMembersPanelWidth,
  setProfileCard,
  setVoiceParticipantMenu,
  setVoiceParticipantPrefs,
  showUiNotice,
  voiceParticipantPrefs,
  workspace
}) {
  function buildProfileCardData(targetUser, displayNameOverride = null) {
    return buildWorkspaceProfileCardData({
      activeChannel,
      activeGuild,
      displayNameOverride,
      targetUser,
      workspace
    });
  }

  useEffect(() => {
    if (!workspace) {
      return;
    }

    if (profileCard?.profile?.id) {
      const refreshedCardProfile = buildWorkspaceProfileCardData({
        activeChannel,
        activeGuild,
        displayNameOverride: profileCard.profile.displayName,
        targetUser: { id: profileCard.profile.id },
        workspace
      });

      if (refreshedCardProfile) {
        setProfileCard((previous) =>
          previous?.profile?.id === refreshedCardProfile.id
            ? {
                ...previous,
                profile: refreshedCardProfile
              }
            : previous
        );
      }
    }

    if (fullProfile?.id) {
      const refreshedFullProfile = buildWorkspaceProfileCardData({
        activeChannel,
        activeGuild,
        displayNameOverride: fullProfile.displayName,
        targetUser: { id: fullProfile.id },
        workspace
      });

      if (refreshedFullProfile) {
        setFullProfile((previous) =>
          previous?.id === refreshedFullProfile.id ? refreshedFullProfile : previous
        );
      }
    }
  }, [
    activeChannel,
    activeGuild,
    fullProfile?.displayName,
    fullProfile?.id,
    profileCard?.profile?.displayName,
    profileCard?.profile?.id,
    setFullProfile,
    setProfileCard,
    workspace
  ]);

  async function handleCopyProfileId(profile) {
    if (!profile?.id) {
      showUiNotice("No hay ID visible para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(profile.id));
      showUiNotice("ID del usuario copiado.");
    } catch {
      showUiNotice("No se pudo copiar el ID del usuario.");
    }
  }

  function getVoiceParticipantPref(userId) {
    return normalizeVoiceParticipantAudioPref(voiceParticipantPrefs?.[userId] || {});
  }

  function updateVoiceParticipantPref(userId, nextValues) {
    if (!userId) {
      return;
    }

    setVoiceParticipantPrefs((previous) => {
      const current = previous?.[userId] || {};
      const nextPref = {
        ...current,
        ...nextValues
      };

      return {
        ...previous,
        [userId]: normalizeVoiceParticipantAudioPref(nextPref)
      };
    });
  }

  function handleToggleVoiceParticipantMuted(userId) {
    const current = getVoiceParticipantPref(userId);
    updateVoiceParticipantPref(userId, {
      muted: !current.muted
    });
  }

  function handleToggleVoiceParticipantVideo(userId) {
    const current = getVoiceParticipantPref(userId);
    updateVoiceParticipantPref(userId, {
      videoHidden: !current.videoHidden
    });
  }

  function handleUpdateVoiceParticipantVolume(userId, value) {
    updateVoiceParticipantPref(userId, {
      volume: value
    });
  }

  function handleUpdateVoiceParticipantIntensity(userId, value) {
    updateVoiceParticipantPref(userId, {
      intensity: value
    });
  }

  function handleStartMembersResize(event) {
    if (!effectiveMembersPanelVisible || !isSingleDirectMessagePanel) {
      return;
    }

    if (membersResizeCleanupRef.current) {
      membersResizeCleanupRef.current();
      membersResizeCleanupRef.current = null;
    }

    const rightEdge = appShellRef.current?.getBoundingClientRect().right || window.innerWidth;
    membersResizeRef.current = { rightEdge };
    setIsResizingMembersPanel(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const handleMove = (moveEvent) => {
      if (!membersResizeRef.current) {
        return;
      }

      const edge = membersResizeRef.current.rightEdge || window.innerWidth;
      const nextWidth = Math.round(edge - moveEvent.clientX);
      setMembersPanelWidth(Math.max(320, Math.min(460, nextWidth)));
    };
    const handleStop = () => {
      membersResizeRef.current = null;
      setIsResizingMembersPanel(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove, true);
      window.removeEventListener("mouseup", handleStop, true);
      window.removeEventListener("blur", handleStop);
      window.removeEventListener("mouseleave", handleStop);
      membersResizeCleanupRef.current = null;
    };
    membersResizeCleanupRef.current = handleStop;
    window.addEventListener("mousemove", handleMove, true);
    window.addEventListener("mouseup", handleStop, true);
    window.addEventListener("blur", handleStop);
    window.addEventListener("mouseleave", handleStop);
    event.preventDefault();
  }

  function openProfileCard(event, targetUser, displayNameOverride = null) {
    const resolved = buildProfileCardData(targetUser, displayNameOverride);
    if (!resolved) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard({
      anchorRect: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      },
      profile: resolved
    });
  }

  function openVoiceParticipantMenu(event, targetUser) {
    const resolved = buildProfileCardData(
      targetUser,
      targetUser?.display_name || targetUser?.displayName || targetUser?.username
    );
    if (!targetUser?.id || !resolved) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard(null);
    setVoiceParticipantMenu({
      currentUserId,
      position: {
        anchorRect: {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top
        },
        x: event.clientX + 10,
        y: event.clientY + 6
      },
      profile: resolved,
      user: targetUser
    });
  }

  function openFullProfile(targetUser, displayNameOverride = null) {
    const resolved = buildProfileCardData(targetUser, displayNameOverride);
    if (!resolved) {
      return;
    }

    setFullProfile(resolved);
  }

  return {
    buildProfileCardData,
    getVoiceParticipantPref,
    handleCopyProfileId,
    handleStartMembersResize,
    handleToggleVoiceParticipantMuted,
    handleToggleVoiceParticipantVideo,
    handleUpdateVoiceParticipantIntensity,
    handleUpdateVoiceParticipantVolume,
    openFullProfile,
    openProfileCard,
    openVoiceParticipantMenu
  };
}
