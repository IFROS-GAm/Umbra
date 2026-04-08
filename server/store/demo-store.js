import fs from "node:fs/promises";
import path from "node:path";

import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  PERMISSIONS
} from "../constants.js";
import { createSeedData } from "../seed-data.js";
import {
  buildInvitePreview,
  buildBootstrapState,
  buildChannelMovePatchPlan,
  buildGuildMovePatchPlan,
  computePermissionBits,
  createId,
  enrichMessages,
  getDefaultGuildChannel,
  isGuildVoiceChannel,
  refreshChannelSummaries,
  resolveMentionUserIds,
  sortByDateDesc,
  upsertChannelMembership
} from "./helpers.js";

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeUsername(candidate = "") {
  const normalized = candidate
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);

  return normalized || "umbra_user";
}

function normalizeProfileColor(candidate, fallback = "#5865F2") {
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

function normalizeSocialLinks(entries = []) {
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

function normalizePrivacySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    allowDirectMessages: source.allowDirectMessages !== false,
    showActivityStatus: source.showActivityStatus !== false,
    showMemberSince: source.showMemberSince !== false,
    showSocialLinks: source.showSocialLinks !== false
  };
}

function normalizeRecoveryProvider(provider = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  return ["", "google", "outlook", "apple", "discord", "other"].includes(normalized)
    ? normalized
    : "";
}

function normalizeRecoveryAccount(value = "") {
  return String(value || "").trim().slice(0, 160);
}

function sanitizeChannelName(candidate = "") {
  return String(candidate || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function sanitizeCategoryName(candidate = "") {
  return String(candidate || "").trim();
}

function buildDirectDmKey(ownerId, recipientId) {
  return [String(ownerId || ""), String(recipientId || "")].sort().join(":");
}

function buildFriendshipPair(leftId, rightId) {
  return [String(leftId || ""), String(rightId || "")].sort();
}

function buildInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function assertInviteUsable(invite) {
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

export class DemoStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.uploadDir = path.join(path.dirname(filePath), "uploads");
    this.db = null;
    this.dmLocks = new Map();
  }

  getMode() {
    return "demo";
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.mkdir(this.uploadDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.db = JSON.parse(raw);
    } catch {
      this.db = createSeedData();
      refreshChannelSummaries(this.db);
      await this.save();
    }

    this.db.profiles = (this.db.profiles || []).map((profile) => ({
      ...profile,
      avatar_url: profile?.avatar_url || "",
      privacy_settings: normalizePrivacySettings(profile?.privacy_settings),
      profile_banner_url: profile?.profile_banner_url || "",
      profile_color: profile?.profile_color || "#5865F2",
      recovery_account: normalizeRecoveryAccount(profile?.recovery_account),
      recovery_provider: normalizeRecoveryProvider(profile?.recovery_provider),
      social_links: normalizeSocialLinks(profile?.social_links)
    }));
    this.db.guilds = (this.db.guilds || []).map((guild) => ({
      icon_url: "",
      banner_image_url: "",
      ...guild
    }));
    const membershipOrderByUser = new Map();
    this.db.guild_members = (this.db.guild_members || []).map((membership) => {
      const nextPosition = membershipOrderByUser.get(membership.user_id) ?? 0;
      membershipOrderByUser.set(membership.user_id, nextPosition + 1);

      return {
        ...membership,
        position: Number.isFinite(Number(membership.position))
          ? Number(membership.position)
          : nextPosition
      };
    });
    this.db.friendships = this.db.friendships || [];
    this.db.friend_requests = this.db.friend_requests || [];
    this.db.invites = this.db.invites || [];
    this.db.profile_reports = this.db.profile_reports || [];
    this.db.user_blocks = this.db.user_blocks || [];

    refreshChannelSummaries(this.db);
    return this;
  }

  getDefaultUserId() {
    return this.db?.profiles?.[0]?.id ?? null;
  }

  getProfileById(profileId) {
    return this.db.profiles.find((profile) => profile.id === profileId) || null;
  }

  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.db, null, 2), "utf8");
  }

  getChannel(channelId) {
    return this.db.channels.find((channel) => channel.id === channelId);
  }

  getMessage(messageId) {
    return this.db.messages.find((message) => message.id === messageId);
  }

  canAccessChannel({ channelId, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      return false;
    }

    if (channel.guild_id) {
      return this.db.guild_members.some(
        (membership) =>
          membership.guild_id === channel.guild_id && membership.user_id === userId
      );
    }

    return this.db.channel_members.some(
      (membership) =>
        membership.channel_id === channelId &&
        membership.user_id === userId &&
        !membership.hidden
    );
  }

  assertCanSend(channel, userId) {
    if (!channel?.guild_id) {
      return;
    }

    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId: channel.guild_id,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.SEND_MESSAGES) !== PERMISSIONS.SEND_MESSAGES) {
      throw createError("No tienes permisos para enviar mensajes en este canal.", 403);
    }
  }

  assertCanManageMessages(channel, userId) {
    if (!channel?.guild_id) {
      return false;
    }

    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId: channel.guild_id,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    return (permissionBits & PERMISSIONS.MANAGE_MESSAGES) === PERMISSIONS.MANAGE_MESSAGES;
  }

  assertCanManageChannels(guildId, userId) {
    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.ADMINISTRATOR) !== PERMISSIONS.ADMINISTRATOR) {
      throw createError("Solo el administrador puede cambiar la estructura del servidor.", 403);
    }
  }

  assertCanManageGuild(guildId, userId) {
    this.assertCanManageChannels(guildId, userId);
  }

  getNextGuildMembershipPosition(userId) {
    return (
      this.db.guild_members
        .filter((membership) => membership.user_id === userId)
        .reduce((max, membership) => Math.max(max, Number(membership.position || 0)), -1) + 1
    );
  }

  async bootstrap(userId) {
    refreshChannelSummaries(this.db);
    return buildBootstrapState(this.db, userId);
  }

  async listChannelMessages({ before, channelId, limit = 30, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    const filtered = this.db.messages
      .filter((message) => message.channel_id === channelId && !message.deleted_at)
      .sort(sortByDateDesc);

    let sliceBase = filtered;
    if (before) {
      const anchor = filtered.find((message) => message.id === before);
      if (anchor) {
        sliceBase = filtered.filter(
          (message) =>
            new Date(message.created_at).getTime() <
              new Date(anchor.created_at).getTime() ||
            (message.created_at === anchor.created_at && message.id !== anchor.id)
        );
      }
    }

    const page = sliceBase.slice(0, limit);

    return {
      messages: enrichMessages({
        channelId,
        db: this.db,
        messages: page,
        userId
      }),
      has_more: sliceBase.length > limit
    };
  }

  async createMessage({
    attachments = [],
    authorId,
    channelId,
    clientNonce = null,
    content,
    replyMentionUserId = null,
    replyTo = null
  }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    if (isGuildVoiceChannel(channel)) {
      throw createError("No puedes enviar mensajes dentro de un canal de voz.", 400);
    }

    const trimmed = content?.trim() || "";
    if (!trimmed && !attachments.length) {
      throw createError("El mensaje no puede estar vacío.", 400);
    }

    this.assertCanSend(channel, authorId);

    let replyTarget = null;
    if (replyTo) {
      replyTarget = this.getMessage(replyTo);
      if (!replyTarget || replyTarget.channel_id !== channelId) {
        throw createError("El mensaje al que respondes no existe en este canal.", 400);
      }
    }

    const mentionUserIds = resolveMentionUserIds(trimmed, this.db.profiles, {
      audienceUserIds: channel.guild_id
        ? this.db.guild_members
            .filter((membership) => membership.guild_id === channel.guild_id)
            .map((membership) => membership.user_id)
        : this.db.channel_members
            .filter((membership) => membership.channel_id === channelId && !membership.hidden)
            .map((membership) => membership.user_id),
      authorId
    });

    if (
      replyTarget &&
      replyMentionUserId &&
      replyTarget.author_id === replyMentionUserId &&
      replyTarget.author_id !== authorId &&
      !mentionUserIds.includes(replyTarget.author_id)
    ) {
      mentionUserIds.push(replyTarget.author_id);
    }

    const message = {
      id: createId(),
      channel_id: channelId,
      guild_id: channel.guild_id,
      author_id: authorId,
      content: trimmed,
      reply_to: replyTo,
      attachments,
      mention_user_ids: mentionUserIds,
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString()
    };

    this.db.messages.push(message);

    upsertChannelMembership(this.db, {
      channel_id: channelId,
      user_id: authorId,
      last_read_message_id: message.id,
      last_read_at: message.created_at,
      hidden: false,
      joined_at: new Date().toISOString()
    });

    refreshChannelSummaries(this.db);
    await this.save();

    const enrichedMessage = enrichMessages({
      channelId,
      db: this.db,
      messages: [message],
      userId: authorId
    })[0];

    if (enrichedMessage && clientNonce) {
      enrichedMessage.client_nonce = clientNonce;
    }

    return {
      message: enrichedMessage,
      preview: this.getChannelPreview(channelId)
    };
  }

  async updateMessage({ content, messageId, userId }) {
    const message = this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    if (message.author_id !== userId) {
      throw createError("Solo el autor puede editar este mensaje.", 403);
    }

    const trimmed = content?.trim() || "";
    if (!trimmed && !(message.attachments || []).length) {
      throw createError("El mensaje editado no puede estar vacío.", 400);
    }

    message.content = trimmed;
    message.mention_user_ids = resolveMentionUserIds(trimmed, this.db.profiles, {
      audienceUserIds: message.guild_id
        ? this.db.guild_members
            .filter((membership) => membership.guild_id === message.guild_id)
            .map((membership) => membership.user_id)
        : this.db.channel_members
            .filter((membership) => membership.channel_id === message.channel_id && !membership.hidden)
            .map((membership) => membership.user_id),
      authorId: userId
    });
    message.edited_at = new Date().toISOString();

    refreshChannelSummaries(this.db);
    await this.save();

    return enrichMessages({
      channelId: message.channel_id,
      db: this.db,
      messages: [message],
      userId
    })[0];
  }

  async deleteMessage({ messageId, userId }) {
    const message = this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    const channel = this.getChannel(message.channel_id);
    const canManage = this.assertCanManageMessages(channel, userId);
    if (message.author_id !== userId && !canManage) {
      throw createError("No puedes eliminar este mensaje.", 403);
    }

    this.db.messages = this.db.messages.filter((item) => item.id !== messageId);
    this.db.message_reactions = this.db.message_reactions.filter(
      (reaction) => reaction.message_id !== messageId
    );

    refreshChannelSummaries(this.db);
    await this.save();

    return {
      id: messageId,
      channel_id: message.channel_id
    };
  }

  async toggleReaction({ emoji, messageId, userId }) {
    const message = this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    const existing = this.db.message_reactions.find(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.user_id === userId &&
        reaction.emoji === emoji
    );

    if (existing) {
      this.db.message_reactions = this.db.message_reactions.filter(
        (reaction) =>
          !(
            reaction.message_id === messageId &&
            reaction.user_id === userId &&
            reaction.emoji === emoji
          )
      );
    } else {
      this.db.message_reactions.push({
        message_id: messageId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString()
      });
    }

    await this.save();

    return enrichMessages({
      channelId: message.channel_id,
      db: this.db,
      messages: [message],
      userId
    })[0];
  }

  async createGuild({ description = "", name, ownerId, templateId = "default" }) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    const template = GUILD_TEMPLATES[templateId] || GUILD_TEMPLATES.default;
    const guildId = createId();
    const everyoneRoleId = createId();
    const ownerRoleId = createId();
    const now = new Date().toISOString();

    this.db.guilds.push({
      id: guildId,
      name: trimmed,
      description: description.trim() || template.description,
      icon_text: trimmed
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join(""),
      icon_url: "",
      banner_color: "#5865F2",
      banner_image_url: "",
      owner_id: ownerId,
      created_at: now,
      updated_at: now
    });

    this.db.roles.push(
      {
        id: everyoneRoleId,
        guild_id: guildId,
        name: "@everyone",
        color: "#9AA4B2",
        position: 0,
        permissions: PERMISSIONS.READ_MESSAGES | PERMISSIONS.SEND_MESSAGES,
        hoist: false,
        mentionable: false,
        created_at: now
      },
      {
        id: ownerRoleId,
        guild_id: guildId,
        name: "Owner",
        color: "#60A5FA",
        position: 2,
        permissions:
          PERMISSIONS.READ_MESSAGES |
          PERMISSIONS.SEND_MESSAGES |
          PERMISSIONS.MANAGE_MESSAGES |
          PERMISSIONS.MANAGE_CHANNELS |
          PERMISSIONS.MANAGE_GUILD |
          PERMISSIONS.MANAGE_ROLES |
          PERMISSIONS.ADMINISTRATOR,
        hoist: true,
        mentionable: false,
        created_at: now
      }
    );

    this.db.guild_members.push({
      guild_id: guildId,
      position: this.getNextGuildMembershipPosition(ownerId),
      user_id: ownerId,
      role_ids: [everyoneRoleId, ownerRoleId],
      nickname: "",
      joined_at: now
    });

    const createdChannels = [];
    const textChannels =
      template.textChannels?.length ? template.textChannels : GUILD_TEMPLATES.default.textChannels;
    const voiceChannels = template.voiceChannels || [];

    [...textChannels, ...voiceChannels].forEach((channelName, index) => {
      const isVoice = index >= textChannels.length;
      const channel = {
        id: createId(),
        guild_id: guildId,
        type: isVoice ? CHANNEL_TYPES.VOICE : CHANNEL_TYPES.TEXT,
        name: channelName,
        topic: isVoice ? "Canal de voz de Umbra." : "Canal inicial del servidor.",
        position: index,
        parent_id: null,
        created_by: ownerId,
        last_message_id: null,
        last_message_author_id: null,
        last_message_preview: "",
        last_message_at: null,
        created_at: now,
        updated_at: now
      };

      this.db.channels.push(channel);
      createdChannels.push(channel);
    });

    createdChannels.forEach((channel) => {
      upsertChannelMembership(this.db, {
        channel_id: channel.id,
        user_id: ownerId,
        last_read_message_id: null,
        last_read_at: null,
        hidden: false,
        joined_at: now
      });
    });

    refreshChannelSummaries(this.db);
    await this.save();

    return {
      guild_id: guildId,
      channel_id: createdChannels.find((channel) => channel.type === CHANNEL_TYPES.TEXT)?.id || createdChannels[0]?.id
    };
  }

  async createChannel({
    createdBy,
    guildId,
    kind = GUILD_CHANNEL_KINDS.TEXT,
    name,
    parentId = null,
    topic = ""
  }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageChannels(guildId, createdBy);

    const trimmed = sanitizeChannelName(name);
    if (!trimmed) {
      throw createError("El canal necesita un nombre.", 400);
    }

    if (parentId) {
      const parent = this.db.channels.find(
        (channel) => channel.id === parentId && channel.guild_id === guildId
      );
      if (!parent || parent.type !== CHANNEL_TYPES.CATEGORY) {
        throw createError("La categoria seleccionada no existe.", 400);
      }
    }

    const existingNames = this.db.channels
      .filter((channel) => channel.guild_id === guildId)
      .map((channel) => channel.name);

    if (existingNames.includes(trimmed)) {
      throw createError("Ya existe un canal con ese nombre.", 400);
    }

    const nextPosition =
      this.db.channels
        .filter((channel) => channel.guild_id === guildId)
        .reduce((max, channel) => Math.max(max, Number(channel.position)), -1) + 1;

    const channel = {
      id: createId(),
      guild_id: guildId,
      type: kind === GUILD_CHANNEL_KINDS.VOICE ? CHANNEL_TYPES.VOICE : CHANNEL_TYPES.TEXT,
      name: trimmed,
      topic: topic.trim(),
      position: nextPosition,
      parent_id: parentId,
      created_by: createdBy,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.db.channels.push(channel);
    await this.save();

    return channel;
  }

  async createCategory({ createdBy, guildId, name }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageChannels(guildId, createdBy);

    const trimmed = sanitizeCategoryName(name);
    if (!trimmed) {
      throw createError("La categoria necesita un nombre.", 400);
    }

    const existingNames = this.db.channels
      .filter((channel) => channel.guild_id === guildId)
      .map((channel) => channel.name.toLowerCase());

    if (existingNames.includes(trimmed.toLowerCase())) {
      throw createError("Ya existe una categoria o canal con ese nombre.", 400);
    }

    const nextPosition =
      this.db.channels
        .filter((channel) => channel.guild_id === guildId)
        .reduce((max, channel) => Math.max(max, Number(channel.position)), -1) + 1;

    const category = {
      id: createId(),
      guild_id: guildId,
      type: CHANNEL_TYPES.CATEGORY,
      name: trimmed,
      topic: "",
      position: nextPosition,
      parent_id: null,
      created_by: createdBy,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.db.channels.push(category);
    await this.save();

    return category;
  }

  async moveChannel({
    channelId,
    createdBy,
    guildId,
    parentId = null,
    placement = "after",
    relativeToChannelId = null
  }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageChannels(guildId, createdBy);

    let patches = [];
    try {
      patches = buildChannelMovePatchPlan({
        channelId,
        channels: this.db.channels,
        guildId,
        parentId,
        placement,
        relativeToChannelId
      });
    } catch (error) {
      throw createError(error.message, 400);
    }

    if (!patches.length) {
      return this.db.channels.find((channel) => channel.id === channelId) || null;
    }

    const now = new Date().toISOString();
    patches.forEach((patch) => {
      const target = this.db.channels.find((channel) => channel.id === patch.id);
      if (!target) {
        return;
      }

      target.parent_id = patch.parent_id;
      target.position = patch.position;
      target.updated_at = now;
    });

    await this.save();
    return this.db.channels.find((channel) => channel.id === channelId) || null;
  }

  async updateGuild({
    bannerColor,
    bannerImageUrl,
    description = "",
    guildId,
    iconUrl,
    name,
    userId
  }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    guild.name = trimmedName;
    guild.description = String(description || "").trim().slice(0, 180);
    guild.icon_text = trimmedName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("");
    if (iconUrl !== undefined) {
      guild.icon_url = String(iconUrl || "").trim();
    }
    if (bannerImageUrl !== undefined) {
      guild.banner_image_url = String(bannerImageUrl || "").trim();
    }
    guild.banner_color = normalizeProfileColor(bannerColor, guild.banner_color || "#5865F2");
    guild.updated_at = new Date().toISOString();

    await this.save();
    return guild;
  }

  async moveGuild({
    createdBy,
    guildId,
    placement = "after",
    relativeToGuildId = null
  }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    let patches = [];
    try {
      patches = buildGuildMovePatchPlan({
        guildId,
        guildMemberships: this.db.guild_members,
        placement,
        relativeToGuildId,
        userId: createdBy
      });
    } catch (error) {
      throw createError(error.message, 400);
    }

    if (!patches.length) {
      return guild;
    }

    patches.forEach((patch) => {
      const membership = this.db.guild_members.find(
        (item) => item.guild_id === patch.guild_id && item.user_id === patch.user_id
      );
      if (membership) {
        membership.position = patch.position;
      }
    });

    await this.save();
    return guild;
  }

  async listGuildRoles({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

    return this.db.roles
      .filter((role) => role.guild_id === guildId)
      .sort((left, right) => Number(right.position || 0) - Number(left.position || 0))
      .map((role) => ({
        ...role,
        is_admin: Boolean(role.permissions & PERMISSIONS.ADMINISTRATOR),
        member_count: this.db.guild_members.filter((member) =>
          Array.isArray(member.role_ids) && member.role_ids.includes(role.id)
        ).length
      }));
  }

  async listGuildInvites({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

    return (this.db.invites || [])
      .filter((invite) => invite.guild_id === guildId)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .map((invite) => {
        const creator = this.db.profiles.find((profile) => profile.id === invite.creator_id);
        return {
          ...invite,
          creator_name: creator?.username || "Umbra",
          creator_avatar_url: creator?.avatar_url || ""
        };
      });
  }

  async sendFriendRequest({ recipientId, requesterId }) {
    if (!recipientId || requesterId === recipientId) {
      throw createError("No puedes enviarte una solicitud a ti mismo.", 400);
    }

    const recipient = this.getProfileById(recipientId);
    if (!recipient) {
      throw createError("Usuario no encontrado.", 404);
    }

    const isBlocked = (this.db.user_blocks || []).some(
      (entry) =>
        (entry.blocker_id === requesterId && entry.blocked_id === recipientId) ||
        (entry.blocker_id === recipientId && entry.blocked_id === requesterId)
    );
    if (isBlocked) {
      throw createError("No puedes enviar una solicitud a este usuario.", 403);
    }

    const [user_id, friend_id] = buildFriendshipPair(requesterId, recipientId);
    const existingFriendship = (this.db.friendships || []).find(
      (friendship) => friendship.user_id === user_id && friendship.friend_id === friend_id
    );
    if (existingFriendship) {
      return {
        friend: recipient,
        friendship: existingFriendship,
        status: "friends"
      };
    }

    const reversePending = (this.db.friend_requests || []).find(
      (request) =>
        request.requester_id === recipientId &&
        request.recipient_id === requesterId &&
        String(request.status || "pending") === "pending"
    );
    if (reversePending) {
      const accepted = await this.acceptFriendRequest({
        requestId: reversePending.id,
        userId: requesterId
      });
      return {
        friend: recipient,
        friendship: accepted.friendship,
        status: "accepted"
      };
    }

    const existingPending = (this.db.friend_requests || []).find(
      (request) =>
        request.requester_id === requesterId &&
        request.recipient_id === recipientId &&
        String(request.status || "pending") === "pending"
    );
    if (existingPending) {
      return {
        request: existingPending,
        status: "pending",
        user: recipient
      };
    }

    const request = {
      id: createId(),
      requester_id: requesterId,
      recipient_id: recipientId,
      status: "pending",
      created_at: new Date().toISOString()
    };

    this.db.friend_requests.push(request);
    await this.save();

    return {
      request,
      status: "pending",
      user: recipient
    };
  }

  async acceptFriendRequest({ requestId, userId }) {
    const request = (this.db.friend_requests || []).find((item) => item.id === requestId);
    if (!request || String(request.status || "pending") !== "pending") {
      throw createError("Solicitud no encontrada.", 404);
    }

    if (request.recipient_id !== userId) {
      throw createError("No puedes aceptar esta solicitud.", 403);
    }

    const [leftId, rightId] = buildFriendshipPair(request.requester_id, request.recipient_id);
    let friendship = (this.db.friendships || []).find(
      (item) => item.user_id === leftId && item.friend_id === rightId
    );

    if (!friendship) {
      friendship = {
        id: createId(),
        user_id: leftId,
        friend_id: rightId,
        created_at: new Date().toISOString()
      };
      this.db.friendships.push(friendship);
    }

    this.db.friend_requests = (this.db.friend_requests || []).filter(
      (item) =>
        !(
          String(item.status || "pending") === "pending" &&
          ((item.requester_id === request.requester_id && item.recipient_id === request.recipient_id) ||
            (item.requester_id === request.recipient_id && item.recipient_id === request.requester_id))
        )
    );

    await this.save();

    return {
      friend_id: request.requester_id,
      friendship,
      status: "friends"
    };
  }

  async cancelFriendRequest({ requestId, userId }) {
    const request = (this.db.friend_requests || []).find((item) => item.id === requestId);
    if (!request || String(request.status || "pending") !== "pending") {
      throw createError("Solicitud no encontrada.", 404);
    }

    if (request.requester_id !== userId && request.recipient_id !== userId) {
      throw createError("No puedes cancelar esta solicitud.", 403);
    }

    this.db.friend_requests = (this.db.friend_requests || []).filter(
      (item) => item.id !== requestId
    );
    await this.save();
    return { ok: true, request_id: requestId };
  }

  async removeFriend({ friendId, userId }) {
    const [leftId, rightId] = buildFriendshipPair(userId, friendId);
    const previousCount = (this.db.friendships || []).length;
    this.db.friendships = (this.db.friendships || []).filter(
      (friendship) => !(friendship.user_id === leftId && friendship.friend_id === rightId)
    );

    if (this.db.friendships.length === previousCount) {
      throw createError("La amistad no existe.", 404);
    }

    await this.save();
    return { friend_id: friendId, ok: true };
  }

  async blockUser({ targetUserId, userId }) {
    if (!targetUserId || targetUserId === userId) {
      throw createError("No puedes bloquearte a ti mismo.", 400);
    }

    const target = this.getProfileById(targetUserId);
    if (!target) {
      throw createError("Usuario no encontrado.", 404);
    }

    const alreadyBlocked = (this.db.user_blocks || []).some(
      (entry) => entry.blocker_id === userId && entry.blocked_id === targetUserId
    );
    if (!alreadyBlocked) {
      this.db.user_blocks.push({
        blocker_id: userId,
        blocked_id: targetUserId,
        created_at: new Date().toISOString(),
        id: createId()
      });
    }

    const [leftId, rightId] = buildFriendshipPair(userId, targetUserId);
    this.db.friendships = (this.db.friendships || []).filter(
      (friendship) => !(friendship.user_id === leftId && friendship.friend_id === rightId)
    );
    this.db.friend_requests = (this.db.friend_requests || []).filter(
      (request) =>
        !(
          (request.requester_id === userId && request.recipient_id === targetUserId) ||
          (request.requester_id === targetUserId && request.recipient_id === userId)
        )
    );

    await this.save();
    return { blocked_id: targetUserId, ok: true };
  }

  async reportProfile({ reason = "spam", reporterId, targetUserId }) {
    if (!targetUserId || targetUserId === reporterId) {
      throw createError("No puedes reportarte a ti mismo.", 400);
    }

    const target = this.getProfileById(targetUserId);
    if (!target) {
      throw createError("Usuario no encontrado.", 404);
    }

    const report = {
      id: createId(),
      reporter_id: reporterId,
      target_user_id: targetUserId,
      reason: String(reason || "spam").slice(0, 64),
      created_at: new Date().toISOString()
    };

    this.db.profile_reports.push(report);
    await this.save();
    return { ok: true, report };
  }

  async createInvite({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

    const invite = {
      id: createId(),
      code: buildInviteCode(),
      guild_id: guildId,
      creator_id: userId,
      uses: 0,
      max_uses: null,
      expires_at: null,
      created_at: new Date().toISOString()
    };

    this.db.invites.push(invite);
    await this.save();
    return invite;
  }

  async getInviteByCode({ code, userId = null }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const invite = this.db.invites.find((item) => item.code === normalizedCode);
    assertInviteUsable(invite);

    const guild = this.db.guilds.find((item) => item.id === invite.guild_id);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    return buildInvitePreview({
      channels: this.db.channels,
      guild,
      guildMembers: this.db.guild_members,
      invite,
      profiles: this.db.profiles,
      userId
    });
  }

  async acceptInvite({ code, userId }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const invite = this.db.invites.find((item) => item.code === normalizedCode);
    assertInviteUsable(invite);

    const guild = this.db.guilds.find((item) => item.id === invite.guild_id);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const defaultChannel = getDefaultGuildChannel(this.db.channels, guild.id);
    const alreadyJoined = this.db.guild_members.some(
      (membership) => membership.guild_id === guild.id && membership.user_id === userId
    );

    if (!alreadyJoined) {
      const everyoneRole = this.db.roles.find(
        (role) => role.guild_id === guild.id && role.name === "@everyone"
      );
      const joinedAt = new Date().toISOString();

      this.db.guild_members.push({
        guild_id: guild.id,
        position: this.getNextGuildMembershipPosition(userId),
        user_id: userId,
        role_ids: everyoneRole ? [everyoneRole.id] : [],
        nickname: "",
        joined_at: joinedAt
      });

      this.db.channels
        .filter(
          (channel) =>
            channel.guild_id === guild.id &&
            channel.type !== CHANNEL_TYPES.CATEGORY
        )
        .forEach((channel) => {
          upsertChannelMembership(this.db, {
            channel_id: channel.id,
            user_id: userId,
            last_read_message_id: null,
            last_read_at: null,
            hidden: false,
            joined_at: joinedAt
          });
        });

      invite.uses = Number(invite.uses || 0) + 1;
      await this.save();
    }

    return {
      already_joined: alreadyJoined,
      channel_id: defaultChannel?.id || null,
      guild_id: guild.id,
      invite: await this.getInviteByCode({
        code: normalizedCode,
        userId
      })
    };
  }

  async createOrGetDm({ ownerId, recipientId }) {
    const existing = this.db.channels.find((channel) => {
      if (channel.type !== CHANNEL_TYPES.DM) {
        return false;
      }

      const participants = this.db.channel_members
        .filter((membership) => membership.channel_id === channel.id)
        .map((membership) => membership.user_id)
        .sort();

      return (
        participants.length === 2 &&
        participants[0] === [ownerId, recipientId].sort()[0] &&
        participants[1] === [ownerId, recipientId].sort()[1]
      );
    });

    if (existing) {
      upsertChannelMembership(this.db, {
        channel_id: existing.id,
        hidden: false,
        joined_at:
          this.db.channel_members.find(
            (membership) =>
              membership.channel_id === existing.id && membership.user_id === ownerId
          )?.joined_at || new Date().toISOString(),
        last_read_at:
          this.db.channel_members.find(
            (membership) =>
              membership.channel_id === existing.id && membership.user_id === ownerId
          )?.last_read_at || null,
        last_read_message_id:
          this.db.channel_members.find(
            (membership) =>
              membership.channel_id === existing.id && membership.user_id === ownerId
          )?.last_read_message_id || null,
        user_id: ownerId
      });
      await this.save();
      return existing;
    }

    const now = new Date().toISOString();
    const channel = {
      id: createId(),
      guild_id: null,
      type: CHANNEL_TYPES.DM,
      name: "",
      topic: "Conversación directa",
      position: 0,
      parent_id: null,
      created_by: ownerId,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: now,
      updated_at: now
    };

    this.db.channels.push(channel);
    this.db.channel_members.push(
      {
        channel_id: channel.id,
        user_id: ownerId,
        last_read_message_id: null,
        last_read_at: null,
        hidden: false,
        joined_at: now
      },
      {
        channel_id: channel.id,
        user_id: recipientId,
        last_read_message_id: null,
        last_read_at: null,
        hidden: false,
        joined_at: now
      }
    );

    await this.save();

    return channel;
  }

  async createOrGetDm({ ownerId, recipientId }) {
    const dmKey = buildDirectDmKey(ownerId, recipientId);
    const existingLock = this.dmLocks.get(dmKey);
    if (existingLock) {
      return existingLock;
    }

    const task = (async () => {
      const expected = [ownerId, recipientId].sort();
      const existing = this.db.channels.find((channel) => {
        if (channel.type !== CHANNEL_TYPES.DM) {
          return false;
        }

        const participants = this.db.channel_members
          .filter((membership) => membership.channel_id === channel.id)
          .map((membership) => membership.user_id)
          .sort();

        return (
          participants.length === 2 &&
          participants[0] === expected[0] &&
          participants[1] === expected[1]
        );
      });

      if (existing) {
        upsertChannelMembership(this.db, {
          channel_id: existing.id,
          hidden: false,
          joined_at:
            this.db.channel_members.find(
              (membership) =>
                membership.channel_id === existing.id && membership.user_id === ownerId
            )?.joined_at || new Date().toISOString(),
          last_read_at:
            this.db.channel_members.find(
              (membership) =>
                membership.channel_id === existing.id && membership.user_id === ownerId
            )?.last_read_at || null,
          last_read_message_id:
            this.db.channel_members.find(
              (membership) =>
                membership.channel_id === existing.id && membership.user_id === ownerId
            )?.last_read_message_id || null,
          user_id: ownerId
        });
        await this.save();
        return existing;
      }

      const now = new Date().toISOString();
      const channel = {
        id: createId(),
        guild_id: null,
        type: CHANNEL_TYPES.DM,
        name: "",
        topic: "ConversaciÃ³n directa",
        position: 0,
        parent_id: null,
        created_by: ownerId,
        last_message_id: null,
        last_message_author_id: null,
        last_message_preview: "",
        last_message_at: null,
        created_at: now,
        updated_at: now
      };

      this.db.channels.push(channel);
      this.db.channel_members.push(
        {
          channel_id: channel.id,
          user_id: ownerId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        },
        {
          channel_id: channel.id,
          user_id: recipientId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        }
      );

      await this.save();

      return channel;
    })();

    this.dmLocks.set(dmKey, task);

    try {
      return await task;
    } finally {
      if (this.dmLocks.get(dmKey) === task) {
        this.dmLocks.delete(dmKey);
      }
    }
  }

  async setDmVisibility({ channelId, hidden, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel || ![CHANNEL_TYPES.DM, CHANNEL_TYPES.GROUP_DM].includes(channel.type)) {
      throw createError("Conversacion no encontrada.", 404);
    }

    const existingMembership = this.db.channel_members.find(
      (membership) => membership.channel_id === channelId && membership.user_id === userId
    );
    if (!existingMembership) {
      throw createError("No puedes cambiar esta conversacion.", 403);
    }

    upsertChannelMembership(this.db, {
      channel_id: channelId,
      hidden: Boolean(hidden),
      joined_at: existingMembership.joined_at || new Date().toISOString(),
      last_read_at: existingMembership.last_read_at || null,
      last_read_message_id: existingMembership.last_read_message_id || null,
      user_id: userId
    });
    await this.save();

    return {
      channel_id: channelId,
      hidden: Boolean(hidden)
    };
  }

  async createGroupDm({ name = "", ownerId, recipientIds }) {
    const uniqueRecipientIds = [...new Set((recipientIds || []).map((id) => String(id)).filter(Boolean))]
      .filter((id) => id !== ownerId);

    if (uniqueRecipientIds.length < 2) {
      const error = new Error("Selecciona al menos dos amigos para crear el grupo.");
      error.statusCode = 400;
      throw error;
    }

    const missingUserId = uniqueRecipientIds.find(
      (userId) => !this.db.profiles.some((profile) => profile.id === userId)
    );

    if (missingUserId) {
      const error = new Error("Una de las personas seleccionadas ya no esta disponible.");
      error.statusCode = 400;
      throw error;
    }

    const now = new Date().toISOString();
    const channel = {
      id: createId(),
      guild_id: null,
      type: CHANNEL_TYPES.GROUP_DM,
      name: String(name || "").trim(),
      topic: "Grupo directo",
      position: 0,
      parent_id: null,
      created_by: ownerId,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: now,
      updated_at: now
    };

    this.db.channels.push(channel);
    [ownerId, ...uniqueRecipientIds].forEach((userId) => {
      this.db.channel_members.push({
        channel_id: channel.id,
        user_id: userId,
        last_read_message_id: null,
        last_read_at: null,
        hidden: false,
        joined_at: now
      });
    });

    await this.save();

    return channel;
  }

  async markChannelRead({ channelId, lastReadMessageId = null, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    const targetMessageId = lastReadMessageId || channel.last_message_id || null;
    const targetMessage = targetMessageId ? this.getMessage(targetMessageId) : null;

    upsertChannelMembership(this.db, {
      channel_id: channelId,
      user_id: userId,
      last_read_message_id: targetMessageId,
      last_read_at: targetMessage?.created_at || new Date().toISOString(),
      hidden: false,
      joined_at: new Date().toISOString()
    });

    await this.save();

    return {
      channel_id: channelId,
      last_read_message_id: targetMessageId
    };
  }

  async markGuildRead({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const isMember = this.db.guild_members.some(
      (membership) => membership.guild_id === guildId && membership.user_id === userId
    );
    if (!isMember) {
      throw createError("No perteneces a este servidor.", 403);
    }

    const joinedAt = new Date().toISOString();

    this.db.channels
      .filter((channel) => channel.guild_id === guildId && channel.type !== CHANNEL_TYPES.CATEGORY)
      .forEach((channel) => {
        const targetMessageId = channel.last_message_id || null;
        const targetMessage = targetMessageId ? this.getMessage(targetMessageId) : null;

        upsertChannelMembership(this.db, {
          channel_id: channel.id,
          user_id: userId,
          last_read_message_id: targetMessageId,
          last_read_at: targetMessage?.created_at || new Date().toISOString(),
          hidden: false,
          joined_at: joinedAt
        });
      });

    await this.save();

    return {
      guild_id: guildId
    };
  }

  async leaveGuild({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const membershipIndex = this.db.guild_members.findIndex(
      (membership) => membership.guild_id === guildId && membership.user_id === userId
    );
    if (membershipIndex === -1) {
      throw createError("No perteneces a este servidor.", 403);
    }

    this.db.guild_members.splice(membershipIndex, 1);
    const guildChannelIds = new Set(
      this.db.channels
        .filter((channel) => channel.guild_id === guildId)
        .map((channel) => channel.id)
    );
    this.db.channel_members = this.db.channel_members.filter(
      (membership) =>
        membership.user_id !== userId || !guildChannelIds.has(membership.channel_id)
    );

    await this.save();

    return {
      guild_id: guildId,
      left: true
    };
  }

  async setPresence({ status, userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    profile.status = status;
    profile.updated_at = new Date().toISOString();
    await this.save();

    return profile;
  }

  async updateProfile({
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
    userId,
    username
  }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    const nextUsername = sanitizeUsername(username);
    const duplicate = this.db.profiles.find(
      (item) => item.id !== userId && item.username.toLowerCase() === nextUsername.toLowerCase()
    );

    if (duplicate) {
      throw createError("Ese nombre de usuario ya esta en uso.", 400);
    }

    profile.username = nextUsername;
    profile.bio = String(bio || "").trim().slice(0, 240);
    profile.custom_status = String(customStatus || "").trim().slice(0, 80);
    profile.avatar_hue = Math.max(0, Math.min(360, Number(avatarHue) || 220));
    if (avatarUrl !== undefined) {
      profile.avatar_url = String(avatarUrl || "").trim();
    }
    if (bannerImageUrl !== undefined) {
      profile.profile_banner_url = String(bannerImageUrl || "").trim();
    }
    if (socialLinks !== undefined) {
      profile.social_links = normalizeSocialLinks(socialLinks);
    }
    if (privacySettings !== undefined) {
      profile.privacy_settings = normalizePrivacySettings(privacySettings);
    }
    if (recoveryAccount !== undefined) {
      profile.recovery_account = normalizeRecoveryAccount(recoveryAccount);
    }
    if (recoveryProvider !== undefined) {
      profile.recovery_provider = normalizeRecoveryProvider(recoveryProvider);
    }
    profile.profile_color = normalizeProfileColor(
      profileColor,
      profile.profile_color || "#5865F2"
    );
    profile.updated_at = new Date().toISOString();
    await this.save();

    return profile;
  }

  async resendEmailConfirmation({ userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    if (!profile.email) {
      throw createError("No hay un correo principal asociado a esta cuenta.", 400);
    }

    if (String(profile.auth_provider || "email").toLowerCase() !== "email") {
      throw createError("El correo de confirmacion solo aplica para accesos por email.", 400);
    }

    return {
      email: profile.email,
      kind: "confirmation",
      mode: "demo",
      ok: true,
      target: "primary"
    };
  }

  async sendEmailCheck({ target, userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw createError("Usuario no encontrado.", 404);
    }

    const normalizedTarget = String(target || "primary").trim().toLowerCase();
    if (normalizedTarget !== "primary" && normalizedTarget !== "recovery") {
      throw createError("Destino de verificacion no valido.", 400);
    }

    if (normalizedTarget === "primary") {
      if (!profile.email) {
        throw createError("No hay un correo principal asociado a esta cuenta.", 400);
      }

      return {
        email: profile.email,
        kind:
          String(profile.auth_provider || "email").toLowerCase() === "email" &&
          !profile.email_confirmed_at
            ? "confirmation"
            : "check",
        mode: "demo",
        ok: true,
        target: "primary"
      };
    }

    const recoveryEmail = normalizeRecoveryAccount(profile.recovery_account);
    if (!recoveryEmail) {
      throw createError("No hay un correo de respaldo configurado.", 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      throw createError(
        "El respaldo debe ser un correo valido para poder enviar una comprobacion.",
        400
      );
    }

    return {
      email: recoveryEmail,
      kind: "check",
      mode: "demo",
      ok: true,
      target: "recovery"
    };
  }

  async storeAttachments(files = []) {
    const attachments = [];

    for (const file of files) {
      if (!file?.buffer || !file.mimetype?.startsWith("image/")) {
        continue;
      }

      const extension = path.extname(file.originalname || "") || ".png";
      const objectName = `${createId()}${extension}`;
      await fs.writeFile(path.join(this.uploadDir, objectName), file.buffer);

      attachments.push({
        content_type: file.mimetype,
        name: file.originalname || objectName,
        path: `/uploads/${objectName}`,
        size: file.size || file.buffer.length,
        url: `/uploads/${objectName}`
      });
    }

    return attachments;
  }

  async syncConnectionPresence({ isOnline, userId }) {
    const profile = this.db.profiles.find((item) => item.id === userId);
    if (!profile) {
      return null;
    }

    if (isOnline) {
      if (profile.status === "offline") {
        profile.status = "online";
      }
    } else if (profile.status !== "invisible") {
      profile.status = "offline";
    }

    profile.updated_at = new Date().toISOString();
    await this.save();
    return profile;
  }

  async getChannelSnapshot(channelId, userId) {
    const message = this.db.messages
      .filter((item) => item.channel_id === channelId && !item.deleted_at)
      .sort(sortByDateDesc)[0];

    if (!message) {
      return null;
    }

    return enrichMessages({
      channelId,
      db: this.db,
      messages: [message],
      userId
    })[0];
  }

  getChannelPreview(channelId) {
    const channel = this.getChannel(channelId);
    return channel
      ? {
          id: channel.id,
          last_message_id: channel.last_message_id,
          last_message_author_id: channel.last_message_author_id,
          last_message_preview: channel.last_message_preview || safePreview(""),
          last_message_at: channel.last_message_at
        }
      : null;
  }
}
