function getApiBase() {
  if (typeof window !== "undefined" && window.umbraDesktop?.apiBaseUrl) {
    return String(window.umbraDesktop.apiBaseUrl).replace(/\/$/, "");
  }

  return (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
}

let getAccessToken = () => null;

function buildUrl(path) {
  const apiBase = getApiBase();

  if (!apiBase) {
    return path;
  }

  return `${apiBase}${path}`;
}

export function resolveAssetUrl(path) {
  if (!path) {
    return "";
  }

  if (/^(https?:|data:|blob:)/i.test(path)) {
    return path;
  }

  const normalizedPath = String(path).startsWith("/") ? path : `/${path}`;
  return buildUrl(normalizedPath);
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
  fetchMessages({ before, channelId, limit = 30, signal } = {}) {
    const params = new URLSearchParams({
      limit: String(limit)
    });

    if (before) {
      params.set("before", before);
    }

    return request(`/api/channels/${channelId}/messages?${params.toString()}`, {
      signal
    });
  },
  createMessage({
    attachments = [],
    channelId,
    clientNonce = null,
    content,
    replyMentionUserId = null,
    replyTo
  }) {
    return request(`/api/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        attachments,
        clientNonce,
        content,
        replyMentionUserId,
        replyTo
      })
    });
  },
  uploadAttachments(files) {
    const formData = new FormData();
    [...files].forEach((file) => {
      formData.append("files", file);
    });

    return request("/api/attachments", {
      method: "POST",
      body: formData
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
  createChannel({ guildId, kind = "text", name, topic }) {
    return request(`/api/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        kind,
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
  createGroupDm({ name = "", recipientIds = [] }) {
    return request("/api/dms", {
      method: "POST",
      body: JSON.stringify({
        name,
        recipientIds
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
  updateProfile({
    avatarHue,
    avatarUrl,
    bannerImageUrl,
    bio,
    customStatus,
    profileColor,
    username
  }) {
    return request("/api/users/me/profile", {
      method: "PATCH",
      body: JSON.stringify({
        avatarHue,
        avatarUrl,
        bannerImageUrl,
        bio,
        customStatus,
        profileColor,
        username
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
