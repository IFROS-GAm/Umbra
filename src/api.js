const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function buildUrl(path) {
  if (!API_BASE) {
    return path;
  }

  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(payload?.error || "La solicitud falló.");
  }

  return payload;
}

export const api = {
  bootstrap(userId) {
    const search = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return request(`/api/bootstrap${search}`);
  },
  fetchMessages({ before, channelId, limit = 30, userId }) {
    const params = new URLSearchParams({
      limit: String(limit),
      userId
    });
    if (before) {
      params.set("before", before);
    }

    return request(`/api/channels/${channelId}/messages?${params.toString()}`);
  },
  createMessage({ authorId, channelId, content, replyTo }) {
    return request(`/api/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        authorId,
        content,
        replyTo
      })
    });
  },
  updateMessage({ content, messageId, userId }) {
    return request(`/api/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        content,
        userId
      })
    });
  },
  deleteMessage({ messageId, userId }) {
    return request(
      `/api/messages/${messageId}?userId=${encodeURIComponent(userId)}`,
      {
        method: "DELETE"
      }
    );
  },
  toggleReaction({ emoji, messageId, userId }) {
    return request(`/api/messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({
        emoji,
        userId
      })
    });
  },
  createGuild({ description, name, ownerId }) {
    return request("/api/guilds", {
      method: "POST",
      body: JSON.stringify({
        description,
        name,
        ownerId
      })
    });
  },
  createChannel({ createdBy, guildId, name, topic }) {
    return request(`/api/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        createdBy,
        name,
        topic
      })
    });
  },
  createDm({ ownerId, recipientId }) {
    return request("/api/dms", {
      method: "POST",
      body: JSON.stringify({
        ownerId,
        recipientId
      })
    });
  },
  updateStatus({ status, userId }) {
    return request(`/api/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status
      })
    });
  },
  markRead({ channelId, lastReadMessageId, userId }) {
    return request(`/api/channels/${channelId}/read`, {
      method: "POST",
      body: JSON.stringify({
        userId,
        lastReadMessageId
      })
    });
  }
};
