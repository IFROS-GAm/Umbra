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
  createGuild({ description, name, templateId }) {
    return request("/api/guilds", {
      method: "POST",
      body: JSON.stringify({
        description,
        name,
        templateId
      })
    });
  },
  createChannel({ guildId, kind = "text", name, parentId = null, topic }) {
    return request(`/api/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        kind,
        name,
        parentId,
        topic
      })
    });
  },
  createCategory({ guildId, name }) {
    return request(`/api/guilds/${guildId}/categories`, {
      method: "POST",
      body: JSON.stringify({
        name
      })
    });
  },
  moveChannel({
    channelId,
    guildId,
    parentId = null,
    placement = "after",
    relativeToChannelId = null
  }) {
    return request(`/api/guilds/${guildId}/channels/${channelId}/move`, {
      method: "PATCH",
      body: JSON.stringify({
        parentId,
        placement,
        relativeToChannelId
      })
    });
  },
  moveGuild({ guildId, placement = "after", relativeToGuildId = null }) {
    return request(`/api/guilds/${guildId}/move`, {
      method: "PATCH",
      body: JSON.stringify({
        placement,
        relativeToGuildId
      })
    });
  },
  createGuildInvite({ guildId }) {
    return request(`/api/guilds/${guildId}/invites`, {
      method: "POST"
    });
  },
  listGuildInvites({ guildId }) {
    return request(`/api/guilds/${guildId}/invites`);
  },
  listGuildRoles({ guildId }) {
    return request(`/api/guilds/${guildId}/roles`);
  },
  getInviteByCode(code) {
    return request(`/api/invites/${encodeURIComponent(code)}`);
  },
  acceptInvite(code) {
    return request(`/api/invites/${encodeURIComponent(code)}/accept`, {
      method: "POST"
    });
  },
  updateGuild({
    bannerColor,
    bannerImageUrl,
    description,
    guildId,
    iconUrl,
    name
  }) {
    return request(`/api/guilds/${guildId}`, {
      method: "PATCH",
      body: JSON.stringify({
        bannerColor,
        bannerImageUrl,
        description,
        iconUrl,
        name
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
  setDmVisibility({ channelId, hidden }) {
    return request(`/api/dms/${channelId}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({
        hidden
      })
    });
  },
  sendFriendRequest({ recipientId }) {
    return request("/api/friends/requests", {
      method: "POST",
      body: JSON.stringify({
        recipientId
      })
    });
  },
  acceptFriendRequest({ requestId }) {
    return request(`/api/friends/requests/${requestId}/accept`, {
      method: "POST"
    });
  },
  cancelFriendRequest({ requestId }) {
    return request(`/api/friends/requests/${requestId}`, {
      method: "DELETE"
    });
  },
  removeFriend({ friendId }) {
    return request(`/api/friends/${friendId}`, {
      method: "DELETE"
    });
  },
  blockUser({ userId }) {
    return request(`/api/users/${userId}/block`, {
      method: "POST"
    });
  },
  reportUser({ reason = "spam", userId }) {
    return request(`/api/users/${userId}/report`, {
      method: "POST",
      body: JSON.stringify({
        reason
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
    privacySettings,
    profileColor,
    recoveryAccount,
    recoveryProvider,
    socialLinks,
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
        privacySettings,
        profileColor,
        recoveryAccount,
        recoveryProvider,
        socialLinks,
        username
      })
    });
  },
  resendConfirmationEmail({ emailRedirectTo } = {}) {
    return request("/api/users/me/email/resend-confirmation", {
      method: "POST",
      body: JSON.stringify({
        emailRedirectTo
      })
    });
  },
  sendEmailCheck({ emailRedirectTo, target } = {}) {
    return request("/api/users/me/email/send-check", {
      method: "POST",
      body: JSON.stringify({
        emailRedirectTo,
        target
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
  },
  markGuildRead({ guildId }) {
    return request(`/api/guilds/${guildId}/read`, {
      method: "POST"
    });
  },
  leaveGuild({ guildId }) {
    return request(`/api/guilds/${guildId}/members/me`, {
      method: "DELETE"
    });
  }
};
