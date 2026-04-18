import { v4 as uuidv4 } from "uuid";

import {
  ALL_PERMISSIONS,
  CHANNEL_TYPES,
  DEFAULT_GUILD_STICKERS,
  PERMISSIONS
} from "../constants.js";

const statusOrder = {
  online: 0,
  idle: 1,
  dnd: 2,
  offline: 3,
  invisible: 4
};

export function createId() {
  return uuidv4();
}

export function sortByDateAsc(a, b) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function sortByDateDesc(a, b) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function visibleStatus(status) {
  return status === "invisible" ? "offline" : status;
}

export function stripMarkdown(text = "") {
  return text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\|\|([^|]+)\|\|/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

export function safePreview(text = "", maxLength = 84) {
  const normalized = stripMarkdown(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function isGuildVoiceChannel(channel) {
  return (
    Boolean(channel?.guild_id) &&
    (channel.type === CHANNEL_TYPES.VOICE || channel.type === CHANNEL_TYPES.GROUP_DM)
  );
}

export function isGuildCategoryChannel(channel) {
  return Boolean(channel?.guild_id) && channel.type === CHANNEL_TYPES.CATEGORY;
}

export function buildMessagePreview(content = "", attachments = [], sticker = null) {
  const textPreview = safePreview(content);
  if (textPreview) {
    return textPreview;
  }

  if (sticker?.name) {
    return `[sticker] ${sticker.name}`;
  }

  const attachmentCount = attachments.length || 0;
  if (!attachmentCount) {
    return "";
  }

  if (attachmentCount === 1) {
    const attachment = attachments[0] || {};
    const contentType = String(attachment.content_type || "").toLowerCase();

    if (contentType.startsWith("image/gif")) {
      return "[gif]";
    }

    if (contentType.startsWith("image/")) {
      return "[imagen]";
    }

    if (contentType.startsWith("video/")) {
      return "[video]";
    }

    if (contentType.startsWith("audio/")) {
      return "[audio]";
    }

    return `[${attachment?.name || "archivo"}]`;
  }

  return `[${attachmentCount} adjuntos]`;
}

export function resolveMentionUserIds(content, profiles, options = {}) {
  const matches = [...content.matchAll(/(^|\s)@([a-zA-Z0-9_-]+)/g)];
  const mentionIds = new Set();
  const everyoneMentioned = /(^|\s)@everyone\b/i.test(content);
  const audienceIds = options.audienceUserIds || [];
  const authorId = options.authorId || null;

  if (everyoneMentioned) {
    audienceIds.forEach((id) => {
      if (id && id !== authorId) {
        mentionIds.add(id);
      }
    });
  }

  matches.forEach((match) => {
    const username = match[2]?.toLowerCase();
    if (!username) {
      return;
    }

    const target = profiles.find(
      (profile) => profile.username.toLowerCase() === username
    );

    if (target) {
      mentionIds.add(target.id);
    }
  });

  return [...mentionIds];
}

export function hasPermission(bits, permission) {
  return (Number(bits) & permission) === permission;
}

export function getGuildMember(guildMembers, guildId, userId) {
  return guildMembers.find(
    (member) => member.guild_id === guildId && member.user_id === userId
  );
}

export function getRolesForMember(roles, member) {
  if (!member) {
    return [];
  }

  return roles
    .filter((role) => member.role_ids.includes(role.id))
    .sort((a, b) => Number(b.position) - Number(a.position));
}

export function computePermissionBits({
  guilds,
  guildId,
  guildMembers,
  roles,
  userId
}) {
  const guild = guilds.find((item) => item.id === guildId);
  if (!guild) {
    return 0;
  }

  if (guild.owner_id === userId) {
    return ALL_PERMISSIONS;
  }

  const member = getGuildMember(guildMembers, guildId, userId);
  if (!member) {
    return 0;
  }

  const bits = getRolesForMember(roles, member).reduce(
    (sum, role) => sum | Number(role.permissions),
    0
  );

  if (hasPermission(bits, PERMISSIONS.ADMINISTRATOR)) {
    return ALL_PERMISSIONS;
  }

  return bits;
}

export function getDisplayName({ guildId, guildMembers, profiles, userId }) {
  const profile = profiles.find((item) => item.id === userId);
  if (!profile) {
    return "Usuario";
  }

  if (!guildId) {
    return profile.username;
  }

  const guildMember = getGuildMember(guildMembers, guildId, userId);
  return guildMember?.nickname?.trim() || profile.username;
}

export function getHighestRoleColor({ guildId, guildMembers, roles, userId }) {
  const member = getGuildMember(guildMembers, guildId, userId);
  if (!member) {
    return "#C7D0DD";
  }

  const role = getRolesForMember(roles, member).find((item) => item.name !== "@everyone");
  return role?.color || "#C7D0DD";
}

export function getDefaultGuildChannel(channels = [], guildId) {
  const guildChannels = channels
    .filter((channel) => channel.guild_id === guildId)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));

  return (
    guildChannels.find(
      (channel) =>
        channel.type === CHANNEL_TYPES.TEXT && !isGuildCategoryChannel(channel)
    ) ||
    guildChannels.find((channel) => !isGuildCategoryChannel(channel)) ||
    null
  );
}

export function buildDefaultGuildStickerRows({
  createdBy,
  guildId,
  now = new Date().toISOString()
}) {
  return DEFAULT_GUILD_STICKERS.map((sticker, index) => ({
    id: createId(),
    guild_id: guildId,
    name: sticker.name,
    emoji: sticker.emoji,
    image_url: "",
    is_default: true,
    position: index,
    created_by: createdBy,
    created_at: now
  }));
}

export function sortGuildStickers(stickers = []) {
  return [...stickers].sort((left, right) => {
    const positionDiff = Number(left.position || 0) - Number(right.position || 0);
    if (positionDiff !== 0) {
      return positionDiff;
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "es");
  });
}

function findGuildSticker(db, stickerId) {
  return (db.guild_stickers || []).find((sticker) => sticker.id === stickerId) || null;
}

function normalizeParentId(parentId) {
  return parentId || null;
}

function sortChannelsByPosition(channels = []) {
  return [...channels].sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
}

export function buildChannelMovePatchPlan({
  channelId,
  channels = [],
  guildId,
  parentId = null,
  placement = "after",
  relativeToChannelId = null
}) {
  const guildChannels = channels.filter((channel) => channel.guild_id === guildId);
  const draggedChannel = guildChannels.find((channel) => channel.id === channelId);

  if (!draggedChannel) {
    throw new Error("Canal no encontrado.");
  }

  if (isGuildCategoryChannel(draggedChannel)) {
    throw new Error("Las categorias no se pueden reordenar desde aqui.");
  }

  const nextParentId = normalizeParentId(parentId);
  const currentParentId = normalizeParentId(draggedChannel.parent_id);

  if (nextParentId) {
    const parentChannel = guildChannels.find((channel) => channel.id === nextParentId);
    if (!parentChannel || !isGuildCategoryChannel(parentChannel)) {
      throw new Error("La categoria seleccionada no existe.");
    }
  }

  const referenceChannel = relativeToChannelId
    ? guildChannels.find((channel) => channel.id === relativeToChannelId)
    : null;

  if (relativeToChannelId && !referenceChannel) {
    throw new Error("No se encontro el canal de referencia.");
  }

  if (referenceChannel && isGuildCategoryChannel(referenceChannel)) {
    throw new Error("El canal de referencia no es valido.");
  }

  if (
    referenceChannel &&
    normalizeParentId(referenceChannel.parent_id) !== nextParentId
  ) {
    throw new Error("El canal de referencia no pertenece a ese grupo.");
  }

  const targetSiblings = sortChannelsByPosition(
    guildChannels.filter(
      (channel) =>
        channel.id !== draggedChannel.id &&
        !isGuildCategoryChannel(channel) &&
        normalizeParentId(channel.parent_id) === nextParentId
    )
  );

  let insertIndex = targetSiblings.length;
  if (referenceChannel) {
    const referenceIndex = targetSiblings.findIndex((channel) => channel.id === referenceChannel.id);
    if (referenceIndex === -1) {
      throw new Error("No se pudo calcular la nueva posicion.");
    }

    insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
  }

  const reorderedTargetSiblings = [...targetSiblings];
  reorderedTargetSiblings.splice(insertIndex, 0, draggedChannel);

  const patches = [];

  const queuePatch = (channel, position, nextParent = normalizeParentId(channel.parent_id)) => {
    if (
      Number(channel.position || 0) === Number(position) &&
      normalizeParentId(channel.parent_id) === normalizeParentId(nextParent)
    ) {
      return;
    }

    patches.push({
      id: channel.id,
      parent_id: normalizeParentId(nextParent),
      position
    });
  };

  reorderedTargetSiblings.forEach((channel, index) => {
    queuePatch(channel, index, nextParentId);
  });

  if (currentParentId !== nextParentId) {
    const reorderedSourceSiblings = sortChannelsByPosition(
      guildChannels.filter(
        (channel) =>
          channel.id !== draggedChannel.id &&
          !isGuildCategoryChannel(channel) &&
          normalizeParentId(channel.parent_id) === currentParentId
      )
    );

    reorderedSourceSiblings.forEach((channel, index) => {
      queuePatch(channel, index, currentParentId);
    });
  }

  return patches;
}

function sortGuildMembershipsByPosition(memberships = []) {
  return [...memberships].sort((left, right) => {
    const positionDiff = Number(left.position || 0) - Number(right.position || 0);
    if (positionDiff !== 0) {
      return positionDiff;
    }

    const leftJoined = left.joined_at ? new Date(left.joined_at).getTime() : 0;
    const rightJoined = right.joined_at ? new Date(right.joined_at).getTime() : 0;
    if (leftJoined !== rightJoined) {
      return leftJoined - rightJoined;
    }

    return String(left.guild_id || "").localeCompare(String(right.guild_id || ""), "es");
  });
}

export function buildGuildMovePatchPlan({
  guildId,
  guildMemberships = [],
  placement = "after",
  relativeToGuildId = null,
  userId
}) {
  const memberships = sortGuildMembershipsByPosition(
    guildMemberships.filter((membership) => membership.user_id === userId)
  );

  const draggedMembership = memberships.find((membership) => membership.guild_id === guildId);
  if (!draggedMembership) {
    throw new Error("No perteneces a este servidor.");
  }

  const remainingMemberships = memberships.filter((membership) => membership.guild_id !== guildId);
  let insertIndex = remainingMemberships.length;

  if (relativeToGuildId) {
    const referenceIndex = remainingMemberships.findIndex(
      (membership) => membership.guild_id === relativeToGuildId
    );

    if (referenceIndex === -1) {
      throw new Error("No se encontro el servidor de referencia.");
    }

    insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
  }

  const reorderedMemberships = [...remainingMemberships];
  reorderedMemberships.splice(insertIndex, 0, draggedMembership);

  return reorderedMemberships
    .map((membership, index) => ({
      guild_id: membership.guild_id,
      position: index,
      user_id: membership.user_id
    }))
    .filter((patch) => {
      const current = memberships.find((membership) => membership.guild_id === patch.guild_id);
      return Number(current?.position || 0) !== patch.position;
    });
}

export function buildInvitePreview({
  channels = [],
  guild,
  guildMembers = [],
  invite,
  profiles = [],
  userId = null
}) {
  if (!guild || !invite) {
    return null;
  }

  const defaultChannel = getDefaultGuildChannel(channels, guild.id);
  const memberIds = guildMembers
    .filter((membership) => membership.guild_id === guild.id)
    .map((membership) => membership.user_id);
  const memberIdSet = new Set(memberIds);
  const members = profiles.filter((profile) => memberIdSet.has(profile.id));
  const onlineCount = members.filter(
    (profile) => visibleStatus(profile.status) !== "offline"
  ).length;
  const memberCount = memberIds.length;

  return {
    id: invite.id,
    code: invite.code,
    uses: Number(invite.uses || 0),
    max_uses: invite.max_uses ?? null,
    expires_at: invite.expires_at ?? null,
    already_joined: Boolean(
      userId &&
        guildMembers.some(
          (membership) =>
            membership.guild_id === guild.id && membership.user_id === userId
        )
    ),
    guild: {
      created_at: guild.created_at || null,
      id: guild.id,
      name: guild.name,
      description: guild.description || "",
      icon_text: guild.icon_text || "",
      icon_url: guild.icon_url || "",
      banner_color: guild.banner_color || "#5865F2",
      banner_image_url: guild.banner_image_url || ""
    },
    channel: defaultChannel
      ? {
          id: defaultChannel.id,
          name: defaultChannel.name,
          type: defaultChannel.type
        }
      : null,
    stats: {
      member_count: memberCount,
      online_count: onlineCount
    }
  };
}

export function refreshChannelSummaries(db) {
  db.channels.forEach((channel) => {
    const latestMessage = db.messages
      .filter((message) => message.channel_id === channel.id && !message.deleted_at)
      .sort(sortByDateDesc)[0];
    const latestSticker = latestMessage?.sticker_id
      ? findGuildSticker(db, latestMessage.sticker_id)
      : null;

    channel.last_message_id = latestMessage?.id ?? null;
    channel.last_message_author_id = latestMessage?.author_id ?? null;
    channel.last_message_preview = latestMessage
      ? buildMessagePreview(
          latestMessage.content,
          latestMessage.attachments || [],
          latestSticker
        )
      : "";
    channel.last_message_at = latestMessage?.created_at ?? null;
    channel.updated_at = latestMessage?.created_at ?? channel.updated_at;
  });
}

export function upsertChannelMembership(db, membership) {
  const existing = db.channel_members.find(
    (item) =>
      item.channel_id === membership.channel_id &&
      item.user_id === membership.user_id
  );

  if (existing) {
    Object.assign(existing, membership);
    return existing;
  }

  db.channel_members.push(membership);
  return membership;
}

export function buildBootstrapState(db, userId) {
  const currentUser =
    db.profiles.find((profile) => profile.id === userId) || db.profiles[0];
  const viewerId = currentUser.id;
  const userChannelMemberships = db.channel_members.filter(
    (membership) => membership.user_id === viewerId && !membership.hidden
  );
  const userChannelMembershipById = new Map(
    userChannelMemberships.map((membership) => [membership.channel_id, membership])
  );

  const guildMemberships = sortGuildMembershipsByPosition(
    db.guild_members.filter((membership) => membership.user_id === viewerId)
  );

  const guilds = guildMemberships
    .map((membership) => {
      const guild = db.guilds.find((item) => item.id === membership.guild_id);
      if (!guild) {
        return null;
      }

      return {
        guild,
        membership
      };
    })
    .filter(Boolean)
    .map(({ guild, membership }) => {
      const permissionBits = computePermissionBits({
        guilds: db.guilds,
        guildId: guild.id,
        guildMembers: db.guild_members,
        roles: db.roles,
        userId: viewerId
      });

      const channels = db.channels
        .filter((channel) => channel.guild_id === guild.id)
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map((channel) => {
          const membership = userChannelMembershipById.get(channel.id);
          const unread =
            !isGuildVoiceChannel(channel) &&
            !isGuildCategoryChannel(channel) &&
            Boolean(channel.last_message_at) &&
            channel.last_message_author_id !== viewerId &&
            (!membership?.last_read_at ||
              new Date(membership.last_read_at).getTime() <
                new Date(channel.last_message_at).getTime())
              ? 1
              : 0;

          return {
            ...channel,
            is_category: isGuildCategoryChannel(channel),
            is_voice: isGuildVoiceChannel(channel),
            unread_count: unread,
            last_read_at: membership?.last_read_at ?? null
          };
        });

      const members = db.guild_members
        .filter((member) => member.guild_id === guild.id)
        .map((member) => {
          const profile = db.profiles.find((item) => item.id === member.user_id);
          if (!profile) {
            return null;
          }

          return {
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar_hue: profile.avatar_hue,
            avatar_url: profile.avatar_url || "",
            profile_banner_url: profile.profile_banner_url || "",
            profile_color: profile.profile_color || "#5865F2",
            status: visibleStatus(profile.status),
            custom_status: profile.custom_status,
            bio: profile.bio,
            display_name: member.nickname?.trim() || profile.username,
            role_color: getHighestRoleColor({
              guildId: guild.id,
              guildMembers: db.guild_members,
              roles: db.roles,
              userId: profile.id
            })
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const statusDiff = statusOrder[a.status] - statusOrder[b.status];
          if (statusDiff !== 0) {
            return statusDiff;
          }

          return a.display_name.localeCompare(b.display_name, "es");
        });

      return {
        ...guild,
        position: Number(membership.position || 0),
        unread_count: channels.reduce(
          (sum, channel) => sum + Number(channel.unread_count || 0),
          0
        ),
        permissions: {
          bits: permissionBits,
          is_admin: hasPermission(permissionBits, PERMISSIONS.ADMINISTRATOR),
          can_manage_channels: hasPermission(permissionBits, PERMISSIONS.ADMINISTRATOR),
          can_manage_messages: hasPermission(
            permissionBits,
            PERMISSIONS.MANAGE_MESSAGES
          ),
          can_manage_roles: hasPermission(permissionBits, PERMISSIONS.ADMINISTRATOR),
          can_manage_guild: hasPermission(permissionBits, PERMISSIONS.ADMINISTRATOR)
        },
        channels,
        members,
        stickers: sortGuildStickers(
          (db.guild_stickers || [])
            .filter((sticker) => sticker.guild_id === guild.id)
            .map((sticker) => ({
              ...sticker,
              image_url: sticker.image_url || ""
            }))
        )
      };
    });

  const dms = db.channels
    .filter((channel) =>
      [CHANNEL_TYPES.DM, CHANNEL_TYPES.GROUP_DM].includes(channel.type)
    )
    .filter((channel) => userChannelMembershipById.has(channel.id))
    .map((channel) => {
      const participants = db.channel_members
        .filter((membership) => membership.channel_id === channel.id)
        .map((membership) =>
          db.profiles.find((profile) => profile.id === membership.user_id)
        )
        .filter(Boolean)
        .map((profile) => ({
          id: profile.id,
          username: profile.username,
          discriminator: profile.discriminator,
          avatar_hue: profile.avatar_hue,
          avatar_url: profile.avatar_url || "",
          profile_banner_url: profile.profile_banner_url || "",
          profile_color: profile.profile_color || "#5865F2",
          status: visibleStatus(profile.status),
          custom_status: profile.custom_status,
          bio: profile.bio
        }));
      const otherParticipants = participants.filter(
        (participant) => participant.id !== viewerId
      );

      if (channel.type === CHANNEL_TYPES.DM && otherParticipants.length < 1) {
        return null;
      }

      if (channel.type === CHANNEL_TYPES.GROUP_DM && otherParticipants.length < 2) {
        return null;
      }

      const fallbackName =
        channel.type === CHANNEL_TYPES.DM
          ? otherParticipants[0]?.username ||
            "DM"
          : otherParticipants
              .map((participant) => participant.username)
              .join(", ");

      const membership = userChannelMembershipById.get(channel.id);
      const unread =
        Boolean(channel.last_message_at) &&
        channel.last_message_author_id !== viewerId &&
        (!membership?.last_read_at ||
          new Date(membership.last_read_at).getTime() <
            new Date(channel.last_message_at).getTime())
          ? 1
          : 0;

      return {
        ...channel,
        display_name: channel.name || fallbackName || "Conversacion",
        unread_count: unread,
        participants
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bDate = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bDate - aDate;
    });

  const defaultGuild = guilds.find((guild) => guild.is_default) || guilds[0] || null;
  const defaultChannel = defaultGuild?.channels[0] ?? null;
  const defaultDm = dms[0] ?? null;
  const friendIds = [...new Set(
    (db.friendships || [])
      .flatMap((friendship) => {
        if (friendship.user_id === viewerId) {
          return [friendship.friend_id];
        }

        if (friendship.friend_id === viewerId) {
          return [friendship.user_id];
        }

        return [];
      })
      .filter(Boolean)
  )];
  const friends = friendIds
    .map((friendId) => db.profiles.find((profile) => profile.id === friendId))
    .filter(Boolean)
    .sort((a, b) => a.username.localeCompare(b.username, "es"));
  const pendingFriendRequests = (db.friend_requests || []).filter(
    (request) => String(request.status || "pending") === "pending"
  );
  const friendRequestsSent = pendingFriendRequests
    .filter((request) => request.requester_id === viewerId)
    .map((request) => ({
      ...request,
      user:
        db.profiles.find((profile) => profile.id === request.recipient_id) || null
    }))
    .filter((request) => request.user);
  const friendRequestsReceived = pendingFriendRequests
    .filter((request) => request.recipient_id === viewerId)
    .map((request) => ({
      ...request,
      user:
        db.profiles.find((profile) => profile.id === request.requester_id) || null
    }))
    .filter((request) => request.user);
  const blockedUsers = (db.user_blocks || [])
    .filter((entry) => entry.blocker_id === viewerId)
    .map((entry) => db.profiles.find((profile) => profile.id === entry.blocked_id))
    .filter(Boolean)
    .sort((a, b) => a.username.localeCompare(b.username, "es"));

  return {
    current_user: currentUser,
    available_users: [...db.profiles].sort((a, b) =>
      a.username.localeCompare(b.username, "es")
    ),
    blocked_users: blockedUsers,
    friends,
    friend_requests_received: friendRequestsReceived,
    friend_requests_sent: friendRequestsSent,
    guilds,
    dms,
    defaults: {
      guild_id: defaultGuild?.id ?? null,
      channel_id: defaultChannel?.id ?? defaultDm?.id ?? null
    }
  };
}

export function enrichMessages({ channelId, db, messages, userId }) {
  const channel = db.channels.find((item) => item.id === channelId);
  const guildId = channel?.guild_id ?? null;
  const permissionBits = guildId
    ? computePermissionBits({
        guilds: db.guilds,
        guildId,
        guildMembers: db.guild_members,
        roles: db.roles,
        userId
      })
    : 0;

  return messages
    .sort(sortByDateAsc)
    .map((message) => {
      const author = db.profiles.find((profile) => profile.id === message.author_id);
      const sticker = message.sticker_id ? findGuildSticker(db, message.sticker_id) : null;
      const replyTarget = message.reply_to
        ? db.messages.find((item) => item.id === message.reply_to && !item.deleted_at)
        : null;
      const replySticker = replyTarget?.sticker_id
        ? findGuildSticker(db, replyTarget.sticker_id)
        : null;
      const reactions = db.message_reactions.filter(
        (reaction) => reaction.message_id === message.id
      );
      const reactionBuckets = [...new Set(reactions.map((reaction) => reaction.emoji))].map(
        (emoji) => {
          const bucket = reactions.filter((reaction) => reaction.emoji === emoji);
          return {
            emoji,
            count: bucket.length,
            selected: bucket.some((reaction) => reaction.user_id === userId)
          };
        }
      );

      return {
        ...message,
        author: author
          ? {
              id: author.id,
              username: author.username,
              discriminator: author.discriminator,
              avatar_hue: author.avatar_hue,
              avatar_url: author.avatar_url || "",
              profile_banner_url: author.profile_banner_url || "",
              profile_color: author.profile_color || "#5865F2",
              status: visibleStatus(author.status)
            }
          : null,
        display_name: getDisplayName({
          guildId,
          guildMembers: db.guild_members,
          profiles: db.profiles,
          userId: message.author_id
        }),
        can_edit: message.author_id === userId,
        can_delete:
          message.author_id === userId ||
          hasPermission(permissionBits, PERMISSIONS.MANAGE_MESSAGES),
        attachments: message.attachments || [],
        sticker: sticker
          ? {
              id: sticker.id,
              name: sticker.name,
              emoji: sticker.emoji || "",
              image_url: sticker.image_url || "",
              is_default: Boolean(sticker.is_default)
            }
          : null,
        is_mentioning_me: message.mention_user_ids.includes(userId),
        reply_preview: replyTarget
          ? {
              id: replyTarget.id,
              author_name: getDisplayName({
                guildId,
                guildMembers: db.guild_members,
                profiles: db.profiles,
                userId: replyTarget.author_id
              }),
              content: buildMessagePreview(
                replyTarget.content,
                replyTarget.attachments || [],
                replySticker
              )
            }
          : null,
        reactions: reactionBuckets
      };
    });
}
