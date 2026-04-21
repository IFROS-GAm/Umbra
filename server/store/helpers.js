import { v4 as uuidv4 } from "uuid";

import {
  ALL_PERMISSIONS,
  CHANNEL_TYPES,
  DEFAULT_GUILD_STICKERS,
  PERMISSIONS,
  SYSTEM_REACTIONS
} from "../constants.js";

const statusOrder = {
  online: 0,
  idle: 1,
  dnd: 2,
  offline: 3,
  invisible: 4
};
const GROUP_DM_META_PREFIX = "[[group-dm-meta:";
const GROUP_DM_META_SUFFIX = "]]";
const DEFAULT_GROUP_DM_TOPIC = "Grupo directo";
const GUILD_META_PREFIX = "[[guild-meta:";
const GUILD_META_SUFFIX = "]]";
const STORED_GUILD_STICKER_ATTACHMENT_KIND = "__umbra_guild_sticker__";

function sanitizeGuildStickerName(candidate = "") {
  return String(candidate || "").trim().slice(0, 32);
}

function sanitizeGuildStickerEmoji(candidate = "") {
  return String(candidate || "").trim().slice(0, 16);
}

function normalizeGuildStickerRecord(record = {}, fallback = {}) {
  const id = String(record?.id || fallback.id || "").trim();
  const guildId = String(record?.guild_id || fallback.guildId || "").trim();
  const name = sanitizeGuildStickerName(record?.name || fallback.name || "");
  const emoji = sanitizeGuildStickerEmoji(record?.emoji || fallback.emoji || "");
  const imageUrl = String(record?.image_url || record?.imageUrl || fallback.imageUrl || "").trim();

  if (!id || !guildId || !name || (!emoji && !imageUrl)) {
    return null;
  }

  return {
    id,
    guild_id: guildId,
    name,
    emoji,
    image_url: imageUrl,
    is_default: Boolean(record?.is_default ?? fallback.isDefault),
    position: Number(record?.position ?? fallback.position ?? 0),
    created_by: String(record?.created_by || record?.createdBy || fallback.createdBy || "").trim(),
    created_at: String(record?.created_at || record?.createdAt || fallback.createdAt || "").trim()
  };
}

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

  const visibleAttachments = stripStoredGuildStickerAttachments(attachments);
  const attachmentCount = visibleAttachments.length || 0;
  if (!attachmentCount) {
    return "";
  }

  if (attachmentCount === 1) {
    const attachment = visibleAttachments[0] || {};
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

export function normalizeGroupDmManageMode(candidate = "") {
  return String(candidate || "").trim().toLowerCase() === "members" ? "members" : "owner";
}

export function parseStoredGroupDmTopic(candidate = "") {
  const raw = String(candidate || "");
  if (!raw.startsWith(GROUP_DM_META_PREFIX)) {
    return {
      iconUrl: "",
      manageMode: "owner",
      topic: raw || DEFAULT_GROUP_DM_TOPIC
    };
  }

  const suffixIndex = raw.indexOf(GROUP_DM_META_SUFFIX, GROUP_DM_META_PREFIX.length);
  if (suffixIndex === -1) {
    return {
      iconUrl: "",
      manageMode: "owner",
      topic: raw || DEFAULT_GROUP_DM_TOPIC
    };
  }

  const encodedPayload = raw.slice(GROUP_DM_META_PREFIX.length, suffixIndex);
  const visibleTopic = raw.slice(suffixIndex + GROUP_DM_META_SUFFIX.length).trim();

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedPayload));
    return {
      iconUrl: String(parsed?.iconUrl || "").trim(),
      manageMode: normalizeGroupDmManageMode(parsed?.manageMode),
      topic: visibleTopic || DEFAULT_GROUP_DM_TOPIC
    };
  } catch {
    return {
      iconUrl: "",
      manageMode: "owner",
      topic: visibleTopic || DEFAULT_GROUP_DM_TOPIC
    };
  }
}

export function buildStoredGroupDmTopic({ iconUrl = "", manageMode = "owner", topic = "" } = {}) {
  const payload = encodeURIComponent(
    JSON.stringify({
      iconUrl: String(iconUrl || "").trim(),
      manageMode: normalizeGroupDmManageMode(manageMode)
    })
  );
  const visibleTopic = String(topic || "").trim() || DEFAULT_GROUP_DM_TOPIC;
  return `${GROUP_DM_META_PREFIX}${payload}${GROUP_DM_META_SUFFIX} ${visibleTopic}`;
}

export function resolveGroupDmChannelState(channel = {}) {
  if (channel?.type !== CHANNEL_TYPES.GROUP_DM) {
    return {
      ...channel
    };
  }

  const parsedTopic = parseStoredGroupDmTopic(channel.topic || "");
  return {
    ...channel,
    group_manage_mode: normalizeGroupDmManageMode(
      channel.group_manage_mode || parsedTopic.manageMode
    ),
    icon_url: String(channel.icon_url || parsedTopic.iconUrl || "").trim(),
    topic: parsedTopic.topic
  };
}

export function canManageGroupDm(channel = {}, userId = "") {
  if (!channel || channel.type !== CHANNEL_TYPES.GROUP_DM || !userId) {
    return false;
  }

  if (String(channel.created_by || "") === String(userId || "")) {
    return true;
  }

  const resolved = resolveGroupDmChannelState(channel);
  return normalizeGroupDmManageMode(resolved.group_manage_mode) === "members";
}

export function canChangeGroupDmManageMode(channel = {}, userId = "") {
  return (
    channel?.type === CHANNEL_TYPES.GROUP_DM &&
    String(channel.created_by || "") === String(userId || "")
  );
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

export function splitStoredRoleName(candidate = "") {
  const raw = String(candidate || "").trim();
  if (!raw) {
    return {
      icon: "",
      iconUrl: "",
      name: ""
    };
  }

  const iconUrlMatch = raw.match(/^\[\[icon-url:(.+?)\]\]\s*/i);
  const iconUrl = iconUrlMatch ? String(iconUrlMatch[1] || "").trim() : "";
  const withoutIconUrl = iconUrlMatch ? raw.slice(iconUrlMatch[0].length).trim() : raw;

  if (!withoutIconUrl) {
    return {
      icon: "",
      iconUrl,
      name: ""
    };
  }

  const [firstToken = ""] = withoutIconUrl.split(/\s+/, 1);
  const remainder = withoutIconUrl.slice(firstToken.length).trim();
  const looksLikeIcon =
    firstToken.length > 0 &&
    firstToken.length <= 4 &&
    /[^\p{L}\p{N}_-]/u.test(firstToken);

  if (looksLikeIcon && remainder) {
    return {
      icon: firstToken,
      iconUrl,
      name: remainder
    };
  }

  return {
    icon: "",
    iconUrl,
    name: withoutIconUrl
  };
}

export function normalizeRoleIcon(candidate = "") {
  return String(candidate || "").trim().slice(0, 4);
}

export function buildStoredRoleName({ icon = "", iconUrl = "", name = "" } = {}) {
  const normalizedName = String(name || "").trim().slice(0, 40);
  const normalizedIcon = normalizeRoleIcon(icon);
  const normalizedIconUrl = String(iconUrl || "").trim();

  if (!normalizedName) {
    return "";
  }

  const roleName = normalizedIcon ? `${normalizedIcon} ${normalizedName}` : normalizedName;
  return normalizedIconUrl ? `[[icon-url:${normalizedIconUrl}]] ${roleName}` : roleName;
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

function getEveryoneRole(roles = [], guildId) {
  return roles.find((role) => role.guild_id === guildId && role.name === "@everyone") || null;
}

function guildAllowsMemberInvites({ guildId, roles = [] }) {
  const everyoneRole = getEveryoneRole(roles, guildId);
  return Boolean(
    everyoneRole &&
      hasPermission(Number(everyoneRole.permissions || 0), PERMISSIONS.CREATE_INVITE)
  );
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

export function buildFallbackDefaultGuildStickerRows({
  createdBy,
  guildId,
  now = new Date().toISOString()
}) {
  return DEFAULT_GUILD_STICKERS.map((sticker, index) =>
    normalizeGuildStickerRecord(
      {
        created_at: now,
        created_by: createdBy,
        emoji: sticker.emoji,
        guild_id: guildId,
        id: `fallback-sticker:${guildId}:${sticker.key}`,
        image_url: "",
        is_default: true,
        name: sticker.name,
        position: index
      },
      {
        createdAt: now,
        createdBy,
        guildId,
        position: index
      }
    )
  ).filter(Boolean);
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

export function parseStoredGuildDescription(candidate = "", guild = {}) {
  const raw = String(candidate || "");
  let visibleDescription = raw;
  let customStickers = [];

  if (raw.startsWith(GUILD_META_PREFIX)) {
    const suffixIndex = raw.indexOf(GUILD_META_SUFFIX, GUILD_META_PREFIX.length);
    if (suffixIndex !== -1) {
      const encodedPayload = raw.slice(GUILD_META_PREFIX.length, suffixIndex);
      visibleDescription = raw.slice(suffixIndex + GUILD_META_SUFFIX.length).trim();

      try {
        const parsed = JSON.parse(decodeURIComponent(encodedPayload));
        customStickers = Array.isArray(parsed?.stickers) ? parsed.stickers : [];
      } catch {
        customStickers = [];
      }
    }
  }

  const normalizedCustomStickers = sortGuildStickers(
    customStickers
      .map((sticker, index) =>
        normalizeGuildStickerRecord(sticker, {
          createdAt: guild?.created_at,
          createdBy: sticker?.created_by || guild?.owner_id,
          guildId: guild?.id,
          position: index + DEFAULT_GUILD_STICKERS.length
        })
      )
      .filter((sticker) => sticker && !sticker.is_default)
  );

  return {
    customStickers: normalizedCustomStickers,
    description: visibleDescription,
    stickers: sortGuildStickers([
      ...buildFallbackDefaultGuildStickerRows({
        createdBy: guild?.owner_id,
        guildId: guild?.id,
        now: guild?.created_at || new Date().toISOString()
      }),
      ...normalizedCustomStickers
    ])
  };
}

export function buildStoredGuildDescription({
  customStickers = [],
  description = ""
} = {}) {
  const visibleDescription = String(description || "").trim();
  const normalizedCustomStickers = sortGuildStickers(
    (Array.isArray(customStickers) ? customStickers : [])
      .map((sticker, index) =>
        normalizeGuildStickerRecord(sticker, {
          guildId: sticker?.guild_id,
          position: index + DEFAULT_GUILD_STICKERS.length
        })
      )
      .filter((sticker) => sticker && !sticker.is_default)
  );

  if (!normalizedCustomStickers.length) {
    return visibleDescription;
  }

  const payload = encodeURIComponent(
    JSON.stringify({
      stickers: normalizedCustomStickers.map((sticker) => ({
        created_at: sticker.created_at || "",
        created_by: sticker.created_by || "",
        emoji: sticker.emoji || "",
        guild_id: sticker.guild_id || "",
        id: sticker.id,
        image_url: sticker.image_url || "",
        is_default: false,
        name: sticker.name,
        position: Number(sticker.position || 0)
      }))
    })
  );

  return `${GUILD_META_PREFIX}${payload}${GUILD_META_SUFFIX}${visibleDescription ? ` ${visibleDescription}` : ""}`;
}

export function buildStoredGuildStickerAttachment(sticker = {}) {
  const normalized = normalizeGuildStickerRecord(sticker, {
    guildId: sticker?.guild_id,
    imageUrl: sticker?.image_url,
    name: sticker?.name
  });

  if (!normalized) {
    return null;
  }

  return {
    guild_id: normalized.guild_id,
    id: normalized.id,
    image_url: normalized.image_url || "",
    is_default: Boolean(normalized.is_default),
    kind: STORED_GUILD_STICKER_ATTACHMENT_KIND,
    name: normalized.name,
    emoji: normalized.emoji || ""
  };
}

export function extractStoredGuildStickerAttachment(attachments = [], fallback = {}) {
  const stickerAttachment = (Array.isArray(attachments) ? attachments : []).find(
    (attachment) =>
      String(attachment?.kind || "").trim().toLowerCase() === STORED_GUILD_STICKER_ATTACHMENT_KIND
  );

  if (!stickerAttachment) {
    return null;
  }

  return normalizeGuildStickerRecord(stickerAttachment, {
    createdAt: fallback.createdAt,
    createdBy: fallback.createdBy,
    guildId: fallback.guildId || stickerAttachment?.guild_id,
    imageUrl: stickerAttachment?.image_url,
    name: stickerAttachment?.name
  });
}

export function stripStoredGuildStickerAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).filter(
    (attachment) =>
      String(attachment?.kind || "").trim().toLowerCase() !== STORED_GUILD_STICKER_ATTACHMENT_KIND
  );
}

function findGuildSticker(db, stickerId) {
  const directMatch = (db.guild_stickers || []).find((sticker) => sticker.id === stickerId) || null;
  if (directMatch) {
    return directMatch;
  }

  const guilds = Array.isArray(db?.guilds) ? db.guilds : [];
  for (const guild of guilds) {
    const parsed = parseStoredGuildDescription(guild?.description || "", guild);
    const fallbackMatch = (parsed.stickers || []).find((sticker) => sticker.id === stickerId);
    if (fallbackMatch) {
      return fallbackMatch;
    }
  }

  return null;
}

export function resolveMessageSticker(message = {}, db = {}) {
  if (!message) {
    return null;
  }

  if (message.sticker_id) {
    const sticker = findGuildSticker(db, message.sticker_id);
    if (sticker) {
      return sticker;
    }
  }

  return extractStoredGuildStickerAttachment(message.attachments || [], {
    createdAt: message.created_at,
    guildId: message.guild_id
  });
}

export function messageUsesSticker(message = {}, stickerId = "") {
  if (!message || !stickerId) {
    return false;
  }

  if (String(message.sticker_id || "") === String(stickerId)) {
    return true;
  }

  return Boolean(
    extractStoredGuildStickerAttachment(message.attachments || [], {
      createdAt: message.created_at,
      guildId: message.guild_id
    })?.id === String(stickerId)
  );
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

  const parsedGuild = parseStoredGuildDescription(guild.description || "", guild);
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
      description: parsedGuild.description || "",
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
    const latestSticker = resolveMessageSticker(latestMessage, db);

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
      const parsedGuild = parseStoredGuildDescription(guild.description || "", guild);
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
            }),
            role_ids: Array.isArray(member.role_ids) ? [...member.role_ids] : []
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
        description: parsedGuild.description || "",
        allow_member_invites: guildAllowsMemberInvites({
          guildId: guild.id,
          roles: db.roles
        }),
        position: Number(membership.position || 0),
        unread_count: channels.reduce(
          (sum, channel) => sum + Number(channel.unread_count || 0),
          0
        ),
        permissions: {
          bits: permissionBits,
          is_admin: hasPermission(permissionBits, PERMISSIONS.ADMINISTRATOR),
          can_manage_channels: hasPermission(permissionBits, PERMISSIONS.MANAGE_CHANNELS),
          can_manage_messages: hasPermission(
            permissionBits,
            PERMISSIONS.MANAGE_MESSAGES
          ),
          can_create_invite: hasPermission(permissionBits, PERMISSIONS.CREATE_INVITE),
          can_manage_roles: hasPermission(permissionBits, PERMISSIONS.MANAGE_ROLES),
          can_manage_guild: hasPermission(permissionBits, PERMISSIONS.MANAGE_GUILD)
        },
        channels,
        members,
        stickers: sortGuildStickers(
          (
            (() => {
              const guildStickers = (db.guild_stickers || []).filter(
                (sticker) => sticker.guild_id === guild.id
              );
              return guildStickers.length ? guildStickers : parsedGuild.stickers || [];
            })()
          ).map((sticker) => ({
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
          display_name: profile.username,
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

      const resolvedChannel = resolveGroupDmChannelState(channel);

      const fallbackName =
        resolvedChannel.type === CHANNEL_TYPES.DM
          ? otherParticipants[0]?.username ||
            "DM"
          : otherParticipants
              .map((participant) => participant.username)
              .join(", ");

      const membership = userChannelMembershipById.get(channel.id);
      const unread =
        Boolean(resolvedChannel.last_message_at) &&
        resolvedChannel.last_message_author_id !== viewerId &&
        (!membership?.last_read_at ||
          new Date(membership.last_read_at).getTime() <
            new Date(resolvedChannel.last_message_at).getTime())
          ? 1
          : 0;

      const canManageGroup = canManageGroupDm(resolvedChannel, viewerId);
      const canChangeGroupPermissions = canChangeGroupDmManageMode(
        resolvedChannel,
        viewerId
      );

      return {
        ...resolvedChannel,
        display_name: resolvedChannel.name || fallbackName || "Conversacion",
        unread_count: unread,
        can_change_group_permissions: canChangeGroupPermissions,
        can_edit_group: canManageGroup,
        can_invite_group_members: canManageGroup,
        is_group_creator:
          resolvedChannel.type === CHANNEL_TYPES.GROUP_DM &&
          String(resolvedChannel.created_by || "") === String(viewerId || ""),
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
      const sticker = resolveMessageSticker(message, db);
      const replyTarget = message.reply_to
        ? db.messages.find((item) => item.id === message.reply_to && !item.deleted_at)
        : null;
      const replySticker = resolveMessageSticker(replyTarget, db);
      const reactions = db.message_reactions.filter(
        (reaction) => reaction.message_id === message.id
      );
      const pinReactions = reactions
        .filter((reaction) => reaction.emoji === SYSTEM_REACTIONS.PIN)
        .sort(sortByDateAsc);
      const visibleReactions = reactions.filter(
        (reaction) => reaction.emoji !== SYSTEM_REACTIONS.PIN
      );
      const reactionBuckets = [...new Set(visibleReactions.map((reaction) => reaction.emoji))].map(
        (emoji) => {
          const bucket = visibleReactions.filter((reaction) => reaction.emoji === emoji);
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
        attachments: stripStoredGuildStickerAttachments(message.attachments || []),
        is_pinned: pinReactions.length > 0,
        pinned_at: pinReactions.at(-1)?.created_at || null,
        pinned_by: pinReactions.at(-1)?.user_id || null,
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
