function normalizeVoicePresenceEntry(entry = {}) {
  const channelId = String(entry.channelId || "").trim();
  const peerId = String(entry.peerId || entry.presence_ref || "").trim();
  const userId = String(entry.userId || "").trim();
  const videoMode = String(entry.videoMode || "").trim().toLowerCase();

  return {
    ...entry,
    cameraEnabled: Boolean(entry.cameraEnabled),
    channelId,
    deafened: Boolean(entry.deafened),
    micMuted: Boolean(entry.micMuted),
    peerId,
    screenShareEnabled: Boolean(entry.screenShareEnabled),
    speaking: Boolean(entry.speaking),
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

export function buildVoicePresenceUsersFromState(state = {}) {
  const users = new Map();

  flattenRealtimePresenceState(state).forEach((entry) => {
    if (!entry.userId) {
      return;
    }

    const updatedAt = Date.parse(entry.updatedAt || entry.joinedAt || "") || 0;
    const existing = users.get(entry.userId) || null;

    if (!existing) {
      users.set(entry.userId, {
        cameraEnabled: Boolean(entry.cameraEnabled),
        channelId: entry.channelId || "",
        deafened: Boolean(entry.deafened),
        micMuted: Boolean(entry.micMuted),
        peerId: entry.peerId || "",
        screenShareEnabled: Boolean(entry.screenShareEnabled),
        speaking: Boolean(entry.speaking),
        updatedAt,
        userId: entry.userId,
        videoMode: entry.videoMode || ""
      });
      return;
    }

    users.set(entry.userId, {
      cameraEnabled: existing.cameraEnabled || Boolean(entry.cameraEnabled),
      channelId:
        updatedAt >= existing.updatedAt ? entry.channelId || existing.channelId : existing.channelId,
      deafened: existing.deafened || Boolean(entry.deafened),
      micMuted: existing.micMuted || Boolean(entry.micMuted),
      peerId: updatedAt >= existing.updatedAt ? entry.peerId || existing.peerId : existing.peerId,
      screenShareEnabled: existing.screenShareEnabled || Boolean(entry.screenShareEnabled),
      speaking: existing.speaking || Boolean(entry.speaking),
      updatedAt: Math.max(existing.updatedAt || 0, updatedAt),
      userId: entry.userId,
      videoMode:
        updatedAt >= existing.updatedAt ? entry.videoMode || existing.videoMode : existing.videoMode
    });
  });

  return Object.fromEntries(
    [...users.entries()].map(([userId, entry]) => {
      const { updatedAt, ...safeEntry } = entry;
      return [userId, safeEntry];
    })
  );
}

export function buildVoicePresencePeersFromState(state = {}) {
  const peers = new Map();

  flattenRealtimePresenceState(state).forEach((entry) => {
    if (!entry.peerId) {
      return;
    }

    peers.set(entry.peerId, {
      cameraEnabled: Boolean(entry.cameraEnabled),
      channelId: entry.channelId || "",
      deafened: Boolean(entry.deafened),
      micMuted: Boolean(entry.micMuted),
      peerId: entry.peerId,
      screenShareEnabled: Boolean(entry.screenShareEnabled),
      speaking: Boolean(entry.speaking),
      userId: entry.userId || "",
      videoMode: entry.videoMode || ""
    });
  });

  return Object.fromEntries(peers);
}

export function buildVoicePeersFromPresenceState(
  state = {},
  { channelId, localPeerId = "" } = {}
) {
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedLocalPeerId = String(localPeerId || "").trim();
  const peers = [];
  const seenPeerIds = new Set();

  flattenRealtimePresenceState(state).forEach((entry) => {
    if (entry.channelId !== normalizedChannelId || !entry.peerId) {
      return;
    }

    if (
      entry.peerId === normalizedLocalPeerId ||
      seenPeerIds.has(entry.peerId)
    ) {
      return;
    }

    seenPeerIds.add(entry.peerId);
    peers.push({
      cameraEnabled: Boolean(entry.cameraEnabled),
      deafened: Boolean(entry.deafened),
      micMuted: Boolean(entry.micMuted),
      peerId: entry.peerId,
      screenShareEnabled: Boolean(entry.screenShareEnabled),
      speaking: Boolean(entry.speaking),
      videoMode: entry.videoMode || "",
      userId: entry.userId || null
    });
  });

  return peers;
}
