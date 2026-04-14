export const DIRECT_CALL_TYPES = new Set(["dm", "group_dm"]);

export function logVoiceClient(socket, event, details = {}) {
  console.info(`[voice/client] ${event}`, {
    socketId: socket?.id || null,
    ...details
  });
}

export function buildLocalMessagePreview(content = "", attachments = [], sticker = null) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (normalized) {
    return normalized.length > 84 ? `${normalized.slice(0, 81)}...` : normalized;
  }

  if (sticker?.name) {
    return `[sticker] ${sticker.name}`;
  }

  if (!attachments.length) {
    return "";
  }

  if (attachments.length === 1) {
    return attachments[0]?.content_type?.startsWith("image/")
      ? "[imagen]"
      : `[${attachments[0]?.name || "archivo"}]`;
  }

  return `[${attachments.length} adjuntos]`;
}

export function buildOptimisticMessage({
  activeGuild,
  attachments,
  channelId,
  clientNonce,
  content,
  createdAt,
  currentUser,
  currentUserDisplayName,
  replyTo,
  sticker = null
}) {
  return {
    id: `temp-${clientNonce}`,
    client_nonce: clientNonce,
    optimistic: true,
    channel_id: channelId,
    guild_id: activeGuild?.id || null,
    author_id: currentUser?.id || "",
    content: String(content || "").trim(),
    reply_to: replyTo?.id || null,
    sticker,
    attachments,
    mention_user_ids: [],
    edited_at: null,
    deleted_at: null,
    created_at: createdAt,
    author: currentUser
      ? {
          id: currentUser.id,
          username: currentUser.username,
          discriminator: currentUser.discriminator,
          avatar_hue: currentUser.avatar_hue,
          avatar_url: currentUser.avatar_url || "",
          profile_banner_url: currentUser.profile_banner_url || "",
          profile_color: currentUser.profile_color || "#5865F2",
          status: currentUser.status === "invisible" ? "offline" : currentUser.status
        }
      : null,
    display_name: currentUserDisplayName,
    can_edit: true,
    can_delete: true,
    is_mentioning_me: false,
    reply_preview: replyTo
      ? {
          id: replyTo.id,
          author_name:
            replyTo.display_name ||
            replyTo.author?.username ||
            replyTo.author?.display_name ||
            "Usuario",
          content: String(replyTo.content || "").replace(/\s+/g, " ").trim().slice(0, 120)
        }
      : null,
    reactions: []
  };
}
