import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  PERMISSIONS,
  SYSTEM_REACTIONS
} from "../../constants.js";
import {
  buildStoredGroupDmTopic,
  buildInvitePreview,
  buildChannelMovePatchPlan,
  buildStoredRoleName,
  buildDefaultGuildStickerRows,
  buildGuildMovePatchPlan,
  buildMessagePreview,
  canChangeGroupDmManageMode,
  canManageGroupDm,
  createId,
  enrichMessages,
  getDefaultGuildChannel,
  isGuildVoiceChannel,
  normalizeGroupDmManageMode,
  normalizeRoleIcon,
  parseStoredGroupDmTopic,
  resolveMentionUserIds,
  resolveGroupDmChannelState,
  splitStoredRoleName,
  sortByDateDesc
} from "../helpers.js";

export {
  buildStoredGroupDmTopic,
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  PERMISSIONS,
  SYSTEM_REACTIONS,
  buildInvitePreview,
  buildChannelMovePatchPlan,
  buildStoredRoleName,
  buildDefaultGuildStickerRows,
  buildGuildMovePatchPlan,
  buildMessagePreview,
  canChangeGroupDmManageMode,
  canManageGroupDm,
  createId,
  enrichMessages,
  getDefaultGuildChannel,
  isGuildVoiceChannel,
  normalizeGroupDmManageMode,
  normalizeRoleIcon,
  parseStoredGroupDmTopic,
  resolveMentionUserIds,
  resolveGroupDmChannelState,
  splitStoredRoleName,
  sortByDateDesc
};

export const PROFILE_MESSAGE_SELECT = [
  "id",
  "username",
  "discriminator",
  "avatar_hue",
  "avatar_url",
  "profile_banner_url",
  "profile_color",
  "status"
].join(",");

export const GUILD_PERMISSION_SELECT = ["id", "owner_id"].join(",");
export const GUILD_MEMBER_MESSAGE_SELECT = ["guild_id", "user_id", "nickname", "role_ids"].join(",");
export const ROLE_PERMISSION_SELECT = ["id", "guild_id", "name", "permissions", "position", "color"].join(",");
export const REACTION_SELECT = ["message_id", "user_id", "emoji"].join(",");

export function sanitizeStickerName(candidate = "") {
  return String(candidate || "").trim().slice(0, 32);
}

export function normalizeStickerEmoji(candidate = "") {
  return String(candidate || "").trim().slice(0, 16);
}

export function sortGuildStickers(stickers = []) {
  return [...stickers].sort(
    (left, right) => Number(left.position || 0) - Number(right.position || 0)
  );
}

export function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function normalizeBanExpiration(expiresAt) {
  if (!expiresAt) {
    return null;
  }

  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw createError("La duracion del ban no es valida.", 400);
  }

  if (parsed.getTime() <= Date.now()) {
    throw createError("La duracion del ban debe terminar en el futuro.", 400);
  }

  return parsed.toISOString();
}

export function buildGuildBanMessage(ban) {
  if (!ban) {
    return "";
  }

  if (ban.expires_at) {
    return `Sigues baneado de este servidor hasta ${ban.expires_at}.`;
  }

  return "No puedes unirte a este servidor porque sigues baneado.";
}

export function normalizeProfileColor(candidate, fallback = "#5865F2") {
  const normalized = String(candidate || "")
    .trim()
    .replace(/^([^#])/, "#$1")
    .toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return fallback;
}

export function normalizeSocialLinks(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .map((entry, index) => ({
      id: String(entry?.id || `social-${index}`),
      label: String(entry?.label || "").trim().slice(0, 48),
      platform: String(entry?.platform || "website").trim() || "website",
      url: String(entry?.url || "").trim().slice(0, 240)
    }))
    .filter((entry) => entry.label || entry.url)
    .slice(0, 8);
}

export function normalizePrivacySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    allowDirectMessages: source.allowDirectMessages !== false,
    showActivityStatus: source.showActivityStatus !== false,
    showMemberSince: source.showMemberSince !== false,
    showSocialLinks: source.showSocialLinks !== false
  };
}

export function normalizeRecoveryProvider(provider = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  return ["", "google", "outlook", "apple", "discord", "other"].includes(normalized)
    ? normalized
    : "";
}

export function normalizeRecoveryAccount(value = "") {
  return String(value || "").trim().slice(0, 160);
}

export function sanitizeUsername(candidate = "") {
  const normalized = String(candidate || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);

  return normalized || "umbra_user";
}

export function sanitizeChannelName(candidate = "") {
  return String(candidate || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function sanitizeCategoryName(candidate = "") {
  return String(candidate || "").trim();
}

export function buildDirectDmKey(ownerId, recipientId) {
  return [String(ownerId || ""), String(recipientId || "")].sort().join(":");
}

export function buildFriendshipPair(leftId, rightId) {
  return [String(leftId || ""), String(rightId || "")].sort();
}

export function buildInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function assertInviteUsable(invite) {
  if (!invite) {
    throw createError("Invitacion no encontrada.", 404);
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    throw createError("Esta invitacion ya expiro.", 410);
  }

  if (
    invite.max_uses !== null &&
    invite.max_uses !== undefined &&
    Number(invite.uses || 0) >= Number(invite.max_uses)
  ) {
    throw createError("Esta invitacion ya no esta disponible.", 410);
  }
}

export async function expectData(queryPromise, fallbackMessage = "Error consultando Supabase.") {
  const { data, error } = await queryPromise;
  if (error) {
    const wrapped = createError(error.message || fallbackMessage, 500);
    wrapped.cause = error;
    throw wrapped;
  }

  return data;
}
