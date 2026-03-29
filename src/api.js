const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

let getAccessToken = () => null;

function buildUrl(path) {
  if (!API_BASE) {
    return path;
  }

  return `${API_BASE}${path}`;
}

export function configureApiAuth(tokenGetter) {
  getAccessToken = tokenGetter || (() => null);
}

async function request(path, options = {}) {
  const token = getAccessToken();
  const headers = {
    ...(options.headers || {})
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(payload?.error || "La solicitud fallo.");
  }

  return payload;
}

export const api = {
  bootstrap() {
    return request("/api/bootstrap");
  },
  fetchMessages({ before, channelId, limit = 30 }) {
    const params = new URLSearchParams({
      limit: String(limit)
    });

    if (before) {
      params.set("before", before);
    }

    return request(`/api/channels/${channelId}/messages?${params.toString()}`);
  },
  createMessage({ channelId, content, replyTo }) {
    return request(`/api/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        replyTo
      })
    });
  },
  updateMessage({ content, messageId }) {
    return request(`/api/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        content
      })
    });
  },
  deleteMessage({ messageId }) {
    return request(`/api/messages/${messageId}`, {
      method: "DELETE"
    });
  },
  toggleReaction({ emoji, messageId }) {
    return request(`/api/messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({
        emoji
      })
    });
  },
  createGuild({ description, name }) {
    return request("/api/guilds", {
      method: "POST",
      body: JSON.stringify({
        description,
        name
      })
    });
  },
  createChannel({ guildId, name, topic }) {
    return request(`/api/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name,
        topic
      })
    });
  },
  createDm({ recipientId }) {
    return request("/api/dms", {
      method: "POST",
      body: JSON.stringify({
        recipientId
      })
    });
  },
  updateStatus({ status }) {
    return request("/api/users/me/status", {
      method: "PATCH",
      body: JSON.stringify({
        status
      })
    });
  },
  markRead({ channelId, lastReadMessageId }) {
    return request(`/api/channels/${channelId}/read`, {
      method: "POST",
      body: JSON.stringify({
        lastReadMessageId
      })
    });
  }
};
