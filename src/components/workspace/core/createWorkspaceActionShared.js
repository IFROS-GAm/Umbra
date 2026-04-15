import { getSocket } from "../../../socket.js";
import {
  playUmbraSound,
  startUmbraLoopingSound,
  stopUmbraSound
} from "../../../audio/umbraSoundEffects.js";
import { applyChannelPreviewToWorkspace } from "../workspaceHelpers.js";

export function createWorkspaceActionShared(context) {
  const {
    accessToken,
    activeSelectionRef,
    historyScrollStateRef,
    listRef,
    localReadStateRef,
    selectedVoiceDevices,
    setSelectedVoiceDevices,
    setUiNotice,
    setVoiceSessions,
    setWorkspace,
    workspace
  } = context;

  const currentUserId = workspace?.current_user?.id || "";

  function sanitizeAttachmentForMessage(attachment) {
    if (!attachment) {
      return attachment;
    }

    const {
      alt_text,
      display_name,
      is_spoiler,
      local_id: _localId,
      preview_url: _previewUrl,
      upload_error: _uploadError,
      upload_status: _uploadStatus,
      ...sanitized
    } = attachment;

    const nextName = String(display_name || sanitized.name || "").trim();
    const nextAltText = String(alt_text || "").trim();

    return {
      ...sanitized,
      alt_text: nextAltText,
      is_spoiler: Boolean(is_spoiler),
      name: nextName || sanitized.name || "Adjunto"
    };
  }

  function applyLocalVoicePresence(nextChannelId = null) {
    if (!currentUserId) {
      return;
    }

    setVoiceSessions((previous) => {
      const nextState = {};

      Object.entries(previous || {}).forEach(([channelId, userIds]) => {
        const filteredIds = (Array.isArray(userIds) ? userIds : []).filter(
          (userId) => userId !== currentUserId
        );
        if (filteredIds.length) {
          nextState[channelId] = filteredIds;
        }
      });

      if (nextChannelId) {
        const existing = nextState[nextChannelId] || [];
        nextState[nextChannelId] = existing.includes(currentUserId)
          ? existing
          : [...existing, currentUserId];
      }

      return nextState;
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const element = listRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }

  function applyPreview(preview) {
    if (!preview) {
      return;
    }

    setWorkspace((previous) =>
      applyChannelPreviewToWorkspace(previous, preview, {
        localReadStateByChannel: localReadStateRef.current,
        openChannelId: activeSelectionRef.current.channelId
      })
    );
  }

  function showUiNotice(message) {
    setUiNotice(message);
  }

  function getLiveSocket() {
    const socket = getSocket(accessToken);
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  return {
    applyLocalVoicePresence,
    applyPreview,
    currentUserId,
    getLiveSocket,
    playSound: playUmbraSound,
    sanitizeAttachmentForMessage,
    scrollToBottom,
    selectedVoiceDevices,
    setSelectedVoiceDevices,
    showUiNotice,
    startLoopingSound: startUmbraLoopingSound,
    stopSound: stopUmbraSound
  };
}
