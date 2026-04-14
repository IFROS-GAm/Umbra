import { CHANNEL_TYPES } from "../../constants.js";
import {
  buildInvitePreview,
  createId,
  getDefaultGuildChannel,
  upsertChannelMembership
} from "../helpers.js";
import {
  assertInviteUsable,
  buildGuildBanMessage,
  buildInviteCode,
  createError,
  normalizeBanExpiration
} from "./shared.js";

export const demoStoreGuildMembershipMethods = {
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
,
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
,
  async acceptInvite({ code, userId }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const invite = this.db.invites.find((item) => item.code === normalizedCode);
    assertInviteUsable(invite);

    const guild = this.db.guilds.find((item) => item.id === invite.guild_id);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const removedExpiredBans = this.pruneExpiredGuildBans({
      guildId: guild.id,
      userId
    });
    if (removedExpiredBans) {
      await this.save();
    }

    const activeBan = this.getActiveGuildBan(guild.id, userId);
    if (activeBan) {
      throw createError(buildGuildBanMessage(activeBan), 403);
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
,
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
,
  async kickGuildMember({ guildId, targetUserId, userId }) {
    this.assertCanModerateGuildMember(guildId, userId, targetUserId);

    const removed = this.removeGuildMembershipRecords(guildId, targetUserId);
    if (!removed) {
      throw createError("Ese miembro ya no pertenece a este servidor.", 404);
    }

    await this.save();

    return {
      guild_id: guildId,
      kicked: true,
      user_id: targetUserId
    };
  }
,
  async banGuildMember({ expiresAt = null, guildId, targetUserId, userId }) {
    this.assertCanModerateGuildMember(guildId, userId, targetUserId);

    const normalizedExpiresAt = normalizeBanExpiration(expiresAt);
    const existingBanIndex = this.db.guild_bans.findIndex(
      (ban) => ban.guild_id === guildId && ban.user_id === targetUserId
    );

    const nextBan = {
      created_at: new Date().toISOString(),
      created_by: userId,
      expires_at: normalizedExpiresAt,
      guild_id: guildId,
      id:
        existingBanIndex >= 0
          ? this.db.guild_bans[existingBanIndex].id
          : createId(),
      user_id: targetUserId
    };

    if (existingBanIndex >= 0) {
      this.db.guild_bans[existingBanIndex] = nextBan;
    } else {
      this.db.guild_bans.push(nextBan);
    }

    this.removeGuildMembershipRecords(guildId, targetUserId);
    await this.save();

    return {
      banned: true,
      expires_at: normalizedExpiresAt,
      guild_id: guildId,
      user_id: targetUserId
    };
  }
};
