import { resolveGuildIcon } from "../workspaceHelpers.js";

export function formatMemberSinceLabel(isoDate) {
  if (!isoDate) {
    return "";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(isoDate));
}

function extractProfileLinks(text = "") {
  return [...String(text).matchAll(/https?:\/\/[^\s]+/gi)].map((match, index) => ({
    href: match[0],
    id: `link-${index}`,
    label: match[0].replace(/^https?:\/\//i, "")
  }));
}

function normalizeProfileSocialLinks(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .map((entry, index) => ({
      href: String(entry?.url || "").trim(),
      id: String(entry?.id || `profile-link-${index}`),
      label: String(entry?.label || "").trim(),
      platform: String(entry?.platform || "website").trim() || "website"
    }))
    .filter((entry) => entry.href || entry.label);
}

function normalizeProfilePrivacy(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    allowDirectMessages: source.allowDirectMessages !== false,
    showActivityStatus: source.showActivityStatus !== false,
    showMemberSince: source.showMemberSince !== false,
    showSocialLinks: source.showSocialLinks !== false
  };
}

export function buildWorkspaceProfileCardData({
  activeChannel,
  activeGuild,
  displayNameOverride = null,
  targetUser,
  workspace
}) {
  if (!workspace || !targetUser?.id) {
    return null;
  }

  const fallbackProfile =
    workspace.available_users.find((item) => item.id === targetUser.id) ||
    (workspace.current_user.id === targetUser.id ? workspace.current_user : null);

  const activeGuildMember =
    activeGuild?.members.find((member) => member.id === targetUser.id) || null;
  const activeParticipant =
    activeChannel?.participants?.find((participant) => participant.id === targetUser.id) || null;
  const sharedGuilds = workspace.guilds.filter((guild) =>
    (guild.members || []).some((member) => member.id === targetUser.id)
  );
  const sharedDms = workspace.dms.filter((dm) =>
    dm.participants.some((participant) => participant.id === targetUser.id)
  );
  const sharedGuildEntries = sharedGuilds.map((guild) => {
    const member = (guild.members || []).find((item) => item.id === targetUser.id) || null;

    return {
      id: guild.id,
      iconUrl: resolveGuildIcon(guild),
      joinedAt: member?.joined_at || null,
      memberCount: guild.member_count || guild.members?.length || 0,
      name: guild.name
    };
  });
  const commonFriends = (workspace.friends || [])
    .filter((friend) => {
      if (!friend?.id || friend.id === targetUser.id || friend.id === workspace.current_user.id) {
        return false;
      }

      return sharedGuilds.some((guild) =>
        (guild.members || []).some((member) => member.id === friend.id)
      );
    })
    .slice(0, 8);
  const friendRequestSent =
    (workspace.friend_requests_sent || []).find(
      (request) => (request.user?.id || request.recipient_id) === targetUser.id
    ) || null;
  const friendRequestReceived =
    (workspace.friend_requests_received || []).find(
      (request) => (request.user?.id || request.requester_id) === targetUser.id
    ) || null;
  const accountCreatedAt =
    targetUser.created_at ||
    fallbackProfile?.created_at ||
    activeGuildMember?.created_at ||
    activeParticipant?.created_at ||
    null;
  const memberSinceLabel = formatMemberSinceLabel(accountCreatedAt);
  const bio =
    targetUser.bio ||
    activeGuildMember?.bio ||
    activeParticipant?.bio ||
    fallbackProfile?.bio ||
    "";
  const privacySettings = normalizeProfilePrivacy(
    targetUser.privacy_settings || fallbackProfile?.privacy_settings
  );
  const infoLines = bio
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const extractedLinks = extractProfileLinks(bio);
  const socialLinks = normalizeProfileSocialLinks(
    targetUser.social_links || fallbackProfile?.social_links
  );
  const visibleConnections = privacySettings.showSocialLinks
    ? socialLinks.length
      ? socialLinks.map((link) => ({
          href: link.href,
          id: link.id,
          kind: "link",
          label: link.label || link.href.replace(/^https?:\/\//i, ""),
          meta: link.platform
        }))
      : extractedLinks.map((link) => ({
          ...link,
          kind: "link",
          meta: "Enlace compartido en su perfil"
        }))
    : [];

  const resolvedStatus =
    targetUser.status ||
    activeGuildMember?.status ||
    activeParticipant?.status ||
    fallbackProfile?.status ||
    "offline";

  return {
    id: targetUser.id,
    authProvider:
      targetUser.auth_provider || fallbackProfile?.auth_provider || null,
    avatarHue:
      targetUser.avatar_hue || activeGuildMember?.avatar_hue || fallbackProfile?.avatar_hue || 210,
    avatarUrl:
      targetUser.avatar_url ||
      activeGuildMember?.avatar_url ||
      activeParticipant?.avatar_url ||
      fallbackProfile?.avatar_url ||
      "",
    profileBannerUrl:
      targetUser.profile_banner_url ||
      activeGuildMember?.profile_banner_url ||
      activeParticipant?.profile_banner_url ||
      fallbackProfile?.profile_banner_url ||
      "",
    bio,
    commonFriends,
    connections: [
      ...sharedGuildEntries.slice(0, 6).map((guild) => ({
        iconUrl: guild.iconUrl,
        id: `guild-${guild.id}`,
        kind: "guild",
        label: guild.name,
        meta: guild.joinedAt
          ? `Miembro desde ${formatMemberSinceLabel(guild.joinedAt)}`
          : `${guild.memberCount} miembros visibles`
      })),
      ...visibleConnections
    ],
    customStatus: privacySettings.showActivityStatus
      ? targetUser.custom_status ||
        activeGuildMember?.custom_status ||
        activeParticipant?.custom_status ||
        fallbackProfile?.custom_status ||
        ""
      : "",
    discriminator:
      targetUser.discriminator || fallbackProfile?.discriminator || null,
    displayName:
      displayNameOverride ||
      targetUser.display_name ||
      activeGuildMember?.display_name ||
      targetUser.username ||
      fallbackProfile?.username ||
      "Umbra user",
    friendRequestId: friendRequestReceived?.id || friendRequestSent?.id || null,
    friendRequestState: friendRequestReceived
      ? "received"
      : friendRequestSent
        ? "sent"
        : null,
    infoLines,
    isBlockedByMe: (workspace.blocked_users || []).some((user) => user.id === targetUser.id),
    isCurrentUser: workspace.current_user.id === targetUser.id,
    isFriend: (workspace.friends || []).some((friend) => friend.id === targetUser.id),
    memberSinceLabel: privacySettings.showMemberSince ? memberSinceLabel : "",
    primaryTag: activeGuildMember ? activeGuild?.name || "Miembro" : sharedGuilds[0]?.name || null,
    privacySettings,
    profileColor:
      targetUser.profile_color ||
      activeGuildMember?.profile_color ||
      activeParticipant?.profile_color ||
      fallbackProfile?.profile_color ||
      "#5865F2",
    roleColor: targetUser.role_color || activeGuildMember?.role_color || null,
    sharedDmCount: sharedDms.length,
    sharedGuildCount: sharedGuilds.length,
    sharedGuilds: sharedGuildEntries,
    status: resolvedStatus,
    statusLabel:
      resolvedStatus === "online"
        ? "Online"
        : resolvedStatus === "idle"
          ? "Ausente"
          : resolvedStatus === "dnd"
            ? "No molestar"
            : resolvedStatus === "invisible"
              ? "Invisible"
              : "Offline",
    username:
      targetUser.username || fallbackProfile?.username || targetUser.display_name || "umbra_user"
  };
}
