import { buildVoiceStageTone } from "../../shared/workspaceHelpers.js";

function resolveRemoteBoolean(remoteMedia, key, fallbackValue) {
  if (remoteMedia && typeof remoteMedia[key] === "boolean") {
    return remoteMedia[key];
  }

  return Boolean(fallbackValue);
}

function buildStageIdentity(entry = {}) {
  return String(entry.userId || entry.peerId || "").trim();
}

function buildFallbackPeerEntry({
  activeChannelId,
  currentUserId,
  localPeerId,
  userId,
  userPresence
}) {
  return {
    cameraEnabled: Boolean(userPresence?.cameraEnabled),
    channelId: activeChannelId,
    deafened: Boolean(userPresence?.deafened),
    micMuted: Boolean(userPresence?.micMuted),
    peerId: String(
      userPresence?.peerId || (userId && userId === currentUserId ? localPeerId : "")
    ).trim(),
    screenShareEnabled: Boolean(userPresence?.screenShareEnabled),
    speaking: Boolean(userPresence?.speaking),
    userId,
    videoMode: String(userPresence?.videoMode || "").trim()
  };
}

function resolveRemoteMediaForEntry({
  isCurrentVoicePeer,
  peerEntry,
  voicePeerMedia
}) {
  if (isCurrentVoicePeer) {
    return null;
  }

  const peerId = String(peerEntry?.peerId || "").trim();
  const userId = String(peerEntry?.userId || "").trim();

  if (peerId && voicePeerMedia?.[peerId]) {
    return voicePeerMedia[peerId];
  }

  if (!userId) {
    return null;
  }

  return (
    Object.values(voicePeerMedia || {}).find((entry) => String(entry?.userId || "").trim() === userId) ||
    null
  );
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
  voicePresenceUsers,
  voicePresencePeers,
  voiceUserIds,
  voiceState
}) {
  const activeChannelId = activeChannel?.id || "";
  const channelParticipantsById = new Map(
    (activeChannel?.participants || []).map((participant) => [participant.id, participant])
  );
  const guildMembersById = new Map((activeGuild?.members || []).map((member) => [member.id, member]));
  const localPeerId = voiceLocalPeerIdRef.current;
  const peerEntries = activeChannelId
    ? Object.values(voicePresencePeers || {}).filter((entry) => entry.channelId === activeChannelId)
    : [];
  const userPresenceEntries = activeChannelId
    ? Object.values(voicePresenceUsers || {}).filter((entry) => entry.channelId === activeChannelId)
    : [];
  const stageEntriesByIdentity = new Map();

  peerEntries.forEach((entry) => {
    const identity = buildStageIdentity(entry);
    if (!identity) {
      return;
    }

    stageEntriesByIdentity.set(identity, entry);
  });

  if (
    activeChannelId &&
    joinedVoiceChannelId === activeChannelId &&
    currentUserId &&
    ![...stageEntriesByIdentity.values()].some((entry) => entry.peerId === localPeerId)
  ) {
    stageEntriesByIdentity.set(currentUserId, {
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

  const fallbackUserIds = new Set([
    ...(Array.isArray(voiceUserIds) ? voiceUserIds : []),
    ...userPresenceEntries.map((entry) => entry.userId).filter(Boolean)
  ]);

  if (joinedVoiceChannelId === activeChannelId && currentUserId) {
    fallbackUserIds.add(currentUserId);
  }

  fallbackUserIds.forEach((userId) => {
    const identity = String(userId || "").trim();
    if (!identity || stageEntriesByIdentity.has(identity)) {
      return;
    }

    const userPresence =
      userPresenceEntries.find((entry) => String(entry.userId || "").trim() === identity) || null;

    stageEntriesByIdentity.set(
      identity,
      buildFallbackPeerEntry({
        activeChannelId,
        currentUserId,
        localPeerId,
        userId: identity,
        userPresence
      })
    );
  });

  const stageEntries = [...stageEntriesByIdentity.values()];

  return stageEntries.map((peerEntry) => {
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
    const peerId = String(peerEntry.peerId || "").trim();
    const isCurrentVoicePeer =
      (peerId && peerId === localPeerId) || (!peerId && userId && userId === currentUserId);
    const remoteMedia = resolveRemoteMediaForEntry({
      isCurrentVoicePeer,
      peerEntry,
      voicePeerMedia
    });
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
      voicePeerId: peerId || userId,
      volumeForMe: userPrefs.volume
    };
  });
}
