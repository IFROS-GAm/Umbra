import fs from "node:fs/promises";
import path from "node:path";

import { PERMISSIONS } from "../../constants.js";
import { createSeedData } from "../../seed-data.js";
import {
  buildBootstrapState,
  computePermissionBits,
  createId,
  enrichMessages,
  refreshChannelSummaries,
  safePreview,
  sortByDateDesc
} from "../helpers.js";
import {
  createError,
  ensureDefaultGuildStickersForDb,
  normalizePrivacySettings,
  normalizeRecoveryAccount,
  normalizeRecoveryProvider,
  normalizeSocialLinks
} from "./shared.js";

export const demoStoreBaseMethods = {
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
    this.db.channels = (this.db.channels || []).map((channel) => ({
      icon_url: "",
      ...channel
    }));
    this.db.guild_bans = this.db.guild_bans || [];
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
    this.db.guild_stickers = this.db.guild_stickers || [];
    this.db.invites = this.db.invites || [];
    this.db.profile_reports = this.db.profile_reports || [];
    this.db.user_blocks = this.db.user_blocks || [];

    const stickersChanged = ensureDefaultGuildStickersForDb(this.db);

    refreshChannelSummaries(this.db);
    if (stickersChanged) {
      await this.save();
    }
    return this;
  }
,
  getDefaultUserId() {
    return this.db?.profiles?.[0]?.id ?? null;
  }
,
  getProfileById(profileId) {
    return this.db.profiles.find((profile) => profile.id === profileId) || null;
  }
,
  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.db, null, 2), "utf8");
  }
,
  getChannel(channelId) {
    return this.db.channels.find((channel) => channel.id === channelId);
  }
,
  getMessage(messageId) {
    return this.db.messages.find((message) => message.id === messageId);
  }
,
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
,
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
,
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
,
  assertCanManageChannels(guildId, userId) {
    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.MANAGE_CHANNELS) !== PERMISSIONS.MANAGE_CHANNELS) {
      throw createError("No tienes permisos para cambiar la estructura del servidor.", 403);
    }
  }
,
  assertCanManageGuild(guildId, userId) {
    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.MANAGE_GUILD) !== PERMISSIONS.MANAGE_GUILD) {
      throw createError("No tienes permisos para editar este servidor.", 403);
    }
  }
,
  assertCanManageRoles(guildId, userId) {
    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.MANAGE_ROLES) !== PERMISSIONS.MANAGE_ROLES) {
      throw createError("No tienes permisos para gestionar roles en este servidor.", 403);
    }
  }
,
  pruneExpiredGuildBans({ guildId = null, userId = null } = {}) {
    const previousLength = this.db.guild_bans.length;
    const now = Date.now();

    this.db.guild_bans = this.db.guild_bans.filter((ban) => {
      if (!ban?.expires_at) {
        return true;
      }

      if (guildId && ban.guild_id !== guildId) {
        return true;
      }

      if (userId && ban.user_id !== userId) {
        return true;
      }

      const expiresAt = new Date(ban.expires_at).getTime();
      if (!Number.isFinite(expiresAt)) {
        return true;
      }

      return expiresAt > now;
    });

    return this.db.guild_bans.length !== previousLength;
  }
,
  getActiveGuildBan(guildId, userId) {
    return (
      this.db.guild_bans.find(
        (ban) => ban.guild_id === guildId && ban.user_id === userId
      ) || null
    );
  }
,
  removeGuildMembershipRecords(guildId, userId) {
    const membershipIndex = this.db.guild_members.findIndex(
      (membership) => membership.guild_id === guildId && membership.user_id === userId
    );
    if (membershipIndex === -1) {
      return false;
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
    return true;
  }
,
  assertCanModerateGuildMember(guildId, actorId, targetUserId) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, actorId);

    if (targetUserId === actorId) {
      throw createError("No puedes moderarte a ti mismo desde este panel.", 400);
    }

    if (targetUserId === guild.owner_id) {
      throw createError("No puedes moderar al owner del servidor.", 403);
    }

    return guild;
  }
,
  getNextGuildMembershipPosition(userId) {
    return (
      this.db.guild_members
        .filter((membership) => membership.user_id === userId)
        .reduce((max, membership) => Math.max(max, Number(membership.position || 0)), -1) + 1
    );
  }
,
  async bootstrap(userId) {
    refreshChannelSummaries(this.db);
    return buildBootstrapState(this.db, userId);
  }
,
  async storeAttachments(files = []) {
    const attachments = [];

    for (const file of files) {
      if (!file?.buffer) {
        continue;
      }

      const extension = path.extname(file.originalname || "") || ".bin";
      const objectName = `${createId()}${extension}`;
      await fs.writeFile(path.join(this.uploadDir, objectName), file.buffer);

      attachments.push({
        content_type: file.mimetype || "application/octet-stream",
        name: file.originalname || objectName,
        path: `/uploads/${objectName}`,
        size: file.size || file.buffer.length,
        url: `/uploads/${objectName}`
      });
    }

    return attachments;
  }
,
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
,
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
,
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
};
