function getApiBase() {
  if (typeof window !== "undefined" && window.umbraDesktop?.apiBaseUrl) {
    return String(window.umbraDesktop.apiBaseUrl).replace(/\/$/, "");
  }

  return (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
}

function getPublicAppBase() {
  if (typeof window !== "undefined" && window.umbraDesktop?.publicAppUrl) {
    return String(window.umbraDesktop.publicAppUrl).replace(/\/$/, "");
  }

  const configuredPublicUrl = (import.meta.env.VITE_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (configuredPublicUrl) {
    return configuredPublicUrl;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, "");
  }

  return "";
}

let getAccessToken = () => null;

function buildUrl(path) {
  const apiBase = getApiBase();

  if (!apiBase) {
    return path;
  }

  return `${apiBase}${path}`;
}

export function buildPublicAppUrl(path = "") {
  const publicBase = getPublicAppBase();
  if (!publicBase) {
    return path || "";
  }

  if (!path) {
    return publicBase;
  }

  const normalizedPath = String(path).startsWith("/") ? path : `/${path}`;
  return `${publicBase}${normalizedPath}`;
}

export function buildInviteUrl(inviteCode) {
  if (!inviteCode) {
    return "";
  }

  return buildPublicAppUrl(`/invite/${encodeURIComponent(inviteCode)}`);
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

  const url = buildUrl(path);
  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (error) {
    const fallbackMessage = url
      ? `No se pudo conectar con el backend (${url}).`
      : "No se pudo conectar con el backend.";
    const networkError = new Error(fallbackMessage);
    networkError.cause = error;
    throw networkError;
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const requestError = new Error(payload?.error || "La solicitud fallo.");
    requestError.payload = payload;
    requestError.status = response.status;
    requestError.url = url;
    throw requestError;
  }

  return payload;
}

export const api = {
  bootstrap() {
    return request("/api/bootstrap");
  },
  fetchVoiceState() {
    return request("/api/voice/state");
  },
  fetchLiveKitToken({ peerId, room }) {
    const params = new URLSearchParams();

    if (room) {
      params.set("room", room);
    }

    if (peerId) {
      params.set("peerId", peerId);
    }

    return request(`/api/livekit/token?${params.toString()}`);
  },
  fetchLiveKitOccupancy({ channelIds = [] } = {}) {
    const params = new URLSearchParams();

    (Array.isArray(channelIds) ? channelIds : [])
      .map((channelId) => String(channelId || "").trim())
      .filter(Boolean)
      .forEach((channelId) => {
        params.append("channelId", channelId);
      });

    return request(`/api/livekit/occupancy?${params.toString()}`);
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
  listPinnedMessages({ channelId }) {
    return request(`/api/channels/${channelId}/pins`);
  },
  createMessage({
    attachments = [],
    channelId,
    clientNonce = null,
    content,
    stickerId = null,
    replyMentionUserId = null,
    replyTo
  }) {
    return request(`/api/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        attachments,
        clientNonce,
        content,
        stickerId,
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
  togglePinnedMessage({ messageId }) {
    return request(`/api/messages/${messageId}/pin`, {
      method: "POST"
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
  createGuildRole({ color, guildId, icon, iconUrl, name, permissions }) {
    return request(`/api/guilds/${guildId}/roles`, {
      method: "POST",
      body: JSON.stringify({
        color,
        icon,
        iconUrl,
        name,
        permissions
      })
    });
  },
  updateGuildRole({ color, guildId, icon, iconUrl, name, permissions, roleId }) {
    return request(`/api/guilds/${guildId}/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        color,
        icon,
        iconUrl,
        name,
        permissions
      })
    });
  },
  updateGuildMemberRole({ guildId, roleId = null, userId }) {
    return request(`/api/guilds/${guildId}/members/${userId}/roles`, {
      method: "PATCH",
      body: JSON.stringify({
        roleId
      })
    });
  },
  transferGuildOwnership({ guildId, userId }) {
    return request(`/api/guilds/${guildId}/owner`, {
      method: "PATCH",
      body: JSON.stringify({
        userId
      })
    });
  },
  listGuildStickers({ guildId }) {
    return request(`/api/guilds/${guildId}/stickers`);
  },
  createGuildSticker({ guildId, imageUrl = "", emoji = "", name }) {
    return request(`/api/guilds/${guildId}/stickers`, {
      method: "POST",
      body: JSON.stringify({
        emoji,
        imageUrl,
        name
      })
    });
  },
  deleteGuildSticker({ guildId, stickerId }) {
    return request(`/api/guilds/${guildId}/stickers/${stickerId}`, {
      method: "DELETE"
    });
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
    allowMemberInvites,
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
        allowMemberInvites,
        bannerColor,
        bannerImageUrl,
        description,
        iconUrl,
        name
      })
    });
  },
  kickGuildMember({ guildId, userId }) {
    return request(`/api/guilds/${guildId}/members/${userId}`, {
      method: "DELETE"
    });
  },
  banGuildMember({ expiresAt = null, guildId, userId }) {
    return request(`/api/guilds/${guildId}/bans`, {
      method: "POST",
      body: JSON.stringify({
        expiresAt,
        userId
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
  createGroupDm({ iconUrl = "", manageMode = "owner", name = "", recipientIds = [] }) {
    return request("/api/dms", {
      method: "POST",
      body: JSON.stringify({
        iconUrl,
        manageMode,
        name,
        recipientIds
      })
    });
  },
  updateGroupDm({ channelId, clearIcon = false, iconUrl, manageMode, name = "" }) {
    return request(`/api/dms/${channelId}`, {
      method: "PATCH",
      body: JSON.stringify({
        clearIcon,
        iconUrl,
        manageMode,
        name
      })
    });
  },
  inviteGroupDmMembers({ channelId, recipientIds = [] }) {
    return request(`/api/dms/${channelId}/members`, {
      method: "POST",
      body: JSON.stringify({
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
  inviteUmbraUser({ email, redirectTo } = {}) {
    return request("/api/users/invite-email", {
      method: "POST",
      body: JSON.stringify({
        email,
        redirectTo
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
  deleteGuild({ guildId }) {
    return request(`/api/guilds/${guildId}`, {
      method: "DELETE"
    });
  },
  leaveGuild({ guildId }) {
    return request(`/api/guilds/${guildId}/members/me`, {
      method: "DELETE"
    });
  }
};
