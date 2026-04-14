export function buildVoiceOccupantBadge({ activeGuild, user }) {
  if (!user) {
    return null;
  }

  if (activeGuild?.owner_id && activeGuild.owner_id === user.id) {
    return {
      label: "OWNER",
      tone: "gold"
    };
  }

  if (user.is_voice_self) {
    return {
      label: "TU",
      tone: "accent"
    };
  }

  const customStatus = String(user.custom_status || "").trim();
  if (customStatus && customStatus.length <= 12) {
    return {
      label: customStatus.toUpperCase(),
      tone: "soft"
    };
  }

  const normalizedStatus = String(user.status || "").trim().toLowerCase();
  if (normalizedStatus && normalizedStatus !== "offline" && normalizedStatus !== "invisible") {
    return {
      label: normalizedStatus.toUpperCase(),
      tone: normalizedStatus === "dnd" ? "danger" : "success"
    };
  }

  return null;
}

export function buildDirectMessageShortcuts({
  activeSelection,
  dmMenuPrefs,
  workspace
}) {
  const currentUserId = workspace?.current_user?.id || "";
  const blockedUserIds = new Set((workspace?.blocked_users || []).map((user) => user.id));

  return [...(workspace?.dms || [])]
    .map((dm) => {
      const isActiveDm =
        activeSelection.kind === "dm" &&
        activeSelection.channelId === dm?.id;
      const unreadCount = isActiveDm ? 0 : Number(dm?.unread_count || 0);

      if (
        dm?.type !== "dm" ||
        dmMenuPrefs?.[dm.id]?.muted ||
        !dm?.last_message_at ||
        unreadCount <= 0
      ) {
        return null;
      }

      const other =
        dm.participants?.find((participant) => participant.id !== currentUserId) || null;

      if (!other || blockedUserIds.has(other.id)) {
        return null;
      }

      return {
        avatarHue: other.avatar_hue || 210,
        avatarUrl: other.avatar_url || "",
        channelId: dm.id,
        displayName:
          other.display_name || other.username || dm.display_name || "Mensaje directo",
        status: other.status || null,
        unreadCount,
        updatedAt: dm.last_message_at
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftUnread = left.unreadCount > 0 ? 1 : 0;
      const rightUnread = right.unreadCount > 0 ? 1 : 0;
      if (leftUnread !== rightUnread) {
        return rightUnread - leftUnread;
      }

      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    });
}
