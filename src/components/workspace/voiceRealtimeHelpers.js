function normalizeVoicePresenceEntry(entry = {}) {
  const channelId = String(entry.channelId || "").trim();
  const peerId = String(entry.peerId || entry.presence_ref || "").trim();
  const userId = String(entry.userId || "").trim();
  const videoMode = String(entry.videoMode || "").trim().toLowerCase();

  return {
    ...entry,
    cameraEnabled: Boolean(entry.cameraEnabled),
    channelId,
    peerId,
    screenShareEnabled: Boolean(entry.screenShareEnabled),
    userId,
    videoMode: ["camera", "screen"].includes(videoMode) ? videoMode : ""
  };
}

export function flattenRealtimePresenceState(state = {}) {
  return Object.values(state || {})
    .flatMap((entries) => (Array.isArray(entries) ? entries : []))
    .map((entry) => normalizeVoicePresenceEntry(entry))
    .filter((entry) => entry.channelId || entry.peerId || entry.userId);
}

export function buildVoiceSessionsFromPresenceState(state = {}) {
  const sessions = new Map();

  flattenRealtimePresenceState(state).forEach((entry) => {
    if (!entry.channelId || !entry.userId) {
      return;
    }

    const channelUsers = sessions.get(entry.channelId) || new Set();
    channelUsers.add(entry.userId);
    sessions.set(entry.channelId, channelUsers);
  });

  return Object.fromEntries(
    [...sessions.entries()].map(([channelId, userIds]) => [channelId, [...userIds]])
  );
}

export function buildVoicePeersFromPresenceState(
  state = {},
  { channelId, currentUserId = "", localPeerId = "" } = {}
) {
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedCurrentUserId = String(currentUserId || "").trim();
  const normalizedLocalPeerId = String(localPeerId || "").trim();
  const peers = [];
  const seenPeerIds = new Set();

  flattenRealtimePresenceState(state).forEach((entry) => {
    if (entry.channelId !== normalizedChannelId || !entry.peerId) {
      return;
    }

    if (
      entry.peerId === normalizedLocalPeerId ||
      (normalizedCurrentUserId && entry.userId === normalizedCurrentUserId) ||
      seenPeerIds.has(entry.peerId)
    ) {
      return;
    }

    seenPeerIds.add(entry.peerId);
    peers.push({
      cameraEnabled: Boolean(entry.cameraEnabled),
      peerId: entry.peerId,
      screenShareEnabled: Boolean(entry.screenShareEnabled),
      videoMode: entry.videoMode || "",
      userId: entry.userId || null
    });
  });

  return peers;
}
