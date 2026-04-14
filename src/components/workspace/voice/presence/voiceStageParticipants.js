import { buildVoiceStageTone } from "../../shared/workspaceHelpers.js";

function resolveRemoteBoolean(remoteMedia, key, fallbackValue) {
  if (remoteMedia && typeof remoteMedia[key] === "boolean") {
    return remoteMedia[key];
  }

  return Boolean(fallbackValue);
}

export function buildVoiceStageParticipants({
  activeChannel,
  activeGuild,
  availableUsersById,
  cameraStream,
  currentUser,
  currentUserId,
  currentUserLabel,
  getVoiceParticipantPref,
  isDirectConversation,
  joinedVoiceChannelId,
  screenShareQualityLabel,
  screenShareStream,
  t,
  voiceInputSpeaking,
  voiceLocalPeerIdRef,
  voicePeerMedia,
  voicePresencePeers,
  voiceState
}) {
  const activeChannelId = activeChannel?.id || "";
  const channelParticipantsById = new Map(
    (activeChannel?.participants || []).map((participant) => [participant.id, participant])
  );
  const guildMembersById = new Map((activeGuild?.members || []).map((member) => [member.id, member]));
  const localPeerId = voiceLocalPeerIdRef.current;
  const sessionEntries = activeChannelId
    ? Object.values(voicePresencePeers || {}).filter((entry) => entry.channelId === activeChannelId)
    : [];

  if (
    activeChannelId &&
    joinedVoiceChannelId === activeChannelId &&
    currentUserId &&
    !sessionEntries.some((entry) => entry.peerId === localPeerId)
  ) {
    sessionEntries.push({
      cameraEnabled: Boolean(voiceState.cameraEnabled),
      channelId: activeChannelId,
      deafened: Boolean(voiceState.deafen),
      micMuted: Boolean(voiceState.micMuted),
      peerId: localPeerId,
      screenShareEnabled: Boolean(voiceState.screenShareEnabled),
      speaking: !voiceState.micMuted && !voiceState.deafen && voiceInputSpeaking,
      userId: currentUserId,
      videoMode: voiceState.screenShareEnabled
        ? "screen"
        : voiceState.cameraEnabled
          ? "camera"
          : ""
    });
  }

  return sessionEntries.map((peerEntry) => {
    const userId = peerEntry.userId || "";
    const resolvedUser =
      userId === currentUserId
        ? currentUser
        : isDirectConversation
          ? channelParticipantsById.get(userId) || availableUsersById[userId] || null
          : guildMembersById.get(userId) || availableUsersById[userId] || null;

    const user = resolvedUser || {
      avatar_hue: 215,
      avatar_url: "",
      custom_status: "",
      display_name:
        userId === currentUserId
          ? currentUserLabel
          : `Sesion ${String(peerEntry.peerId || "").slice(0, 6)}`,
      id: userId || peerEntry.peerId,
      role_color: null,
      status: "online",
      username: userId === currentUserId ? currentUserLabel : "Usuario conectado"
    };
    const userPrefs = getVoiceParticipantPref(user.id);
    const isCurrentVoicePeer = peerEntry.peerId === localPeerId;
    const remoteMedia = !isCurrentVoicePeer ? voicePeerMedia?.[peerEntry.peerId] || null : null;
    const remoteCameraStream =
      remoteMedia?.cameraStream && !userPrefs.videoHidden ? remoteMedia.cameraStream : null;
    const remoteScreenShareStream =
      remoteMedia?.screenShareStream && !userPrefs.videoHidden
        ? remoteMedia.screenShareStream
        : null;
    const remoteVideoMode = String(remoteMedia?.videoMode || peerEntry.videoMode || "").trim();
    const remoteCameraEnabled = resolveRemoteBoolean(
      remoteMedia,
      "cameraEnabled",
      peerEntry.cameraEnabled
    );
    const remoteStreamingEnabled = resolveRemoteBoolean(
      remoteMedia,
      "screenShareEnabled",
      peerEntry.screenShareEnabled
    );

    return {
      ...user,
      hiddenVideoLabel: t("voice.participant.hiddenVideo", "Video oculto"),
      isCurrentUser: isCurrentVoicePeer,
      isCameraOn: isCurrentVoicePeer
        ? voiceState.cameraEnabled
        : Boolean(remoteCameraStream || remoteVideoMode === "camera" || remoteCameraEnabled),
      isDeafened: isCurrentVoicePeer
        ? Boolean(voiceState.deafen)
        : resolveRemoteBoolean(remoteMedia, "deafened", peerEntry.deafened),
      isLocallyMuted: userPrefs.muted,
      isMuted: isCurrentVoicePeer
        ? Boolean(voiceState.micMuted)
        : resolveRemoteBoolean(remoteMedia, "micMuted", peerEntry.micMuted),
      isSpeaking: isCurrentVoicePeer
        ? !voiceState.micMuted && !voiceState.deafen && voiceInputSpeaking
        : resolveRemoteBoolean(remoteMedia, "speaking", peerEntry.speaking),
      isStreaming: isCurrentVoicePeer
        ? voiceState.screenShareEnabled
        : Boolean(
            remoteScreenShareStream || remoteVideoMode === "screen" || remoteStreamingEnabled
          ),
      isVideoHiddenForMe: userPrefs.videoHidden,
      localCameraStream: isCurrentVoicePeer
        ? userPrefs.videoHidden
          ? null
          : cameraStream
        : remoteCameraStream,
      localScreenShareStream: isCurrentVoicePeer
        ? userPrefs.videoHidden
          ? null
          : screenShareStream
        : remoteScreenShareStream,
      mediaMuted: isCurrentVoicePeer ? true : userPrefs.muted,
      mediaVolume: Math.max(0, Math.min(1, userPrefs.volume / 100)),
      screenShareQualityLabel: isCurrentVoicePeer ? screenShareQualityLabel : "720P 30 FPS",
      stageStyle: buildVoiceStageTone(user.avatar_hue || 220),
      voicePeerId: peerEntry.peerId,
      volumeForMe: userPrefs.volume
    };
  });
}
