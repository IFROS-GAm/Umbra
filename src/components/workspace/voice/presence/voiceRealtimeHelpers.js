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

function getVoicePresenceTimestamp(entry = {}) {
  return (
    Date.parse(entry.updatedAt || entry.joinedAt || entry.trackedAt || "") ||
    0
  );
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

    if (updatedAt >= (existing.updatedAt || 0)) {
      users.set(entry.userId, {
        cameraEnabled: Boolean(entry.cameraEnabled),
        channelId: entry.channelId || existing.channelId || "",
        deafened: Boolean(entry.deafened),
        micMuted: Boolean(entry.micMuted),
        peerId: entry.peerId || existing.peerId || "",
        screenShareEnabled: Boolean(entry.screenShareEnabled),
        speaking: Boolean(entry.speaking),
        updatedAt,
        userId: entry.userId,
        videoMode: entry.videoMode || existing.videoMode || ""
      });
    }
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

    const updatedAt = getVoicePresenceTimestamp(entry);
    const existing = peers.get(entry.peerId) || null;

    if (!existing || updatedAt >= (existing.updatedAt || 0)) {
      peers.set(entry.peerId, {
        cameraEnabled: Boolean(entry.cameraEnabled),
        channelId: entry.channelId || existing?.channelId || "",
        deafened: Boolean(entry.deafened),
        micMuted: Boolean(entry.micMuted),
        peerId: entry.peerId,
        screenShareEnabled: Boolean(entry.screenShareEnabled),
        speaking: Boolean(entry.speaking),
        updatedAt,
        userId: entry.userId || existing?.userId || "",
        videoMode: entry.videoMode || existing?.videoMode || ""
      });
    }
  });

  return Object.fromEntries(
    [...peers.entries()].map(([peerId, entry]) => {
      const { updatedAt, ...safeEntry } = entry;
      return [peerId, safeEntry];
    })
  );
}

export function buildVoicePeersFromPresenceState(
  state = {},
  { channelId, localPeerId = "" } = {}
) {
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedLocalPeerId = String(localPeerId || "").trim();
  return Object.values(buildVoicePresencePeersFromState(state)).filter((entry) => {
    return (
      entry.channelId === normalizedChannelId &&
      entry.peerId &&
      entry.peerId !== normalizedLocalPeerId
    );
  });
}
