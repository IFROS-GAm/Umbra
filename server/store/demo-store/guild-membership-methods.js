import { CHANNEL_TYPES, PERMISSIONS } from "../../constants.js";
import { computePermissionBits } from "../helpers.js";
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
  async deleteGuild({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    if (guild.owner_id !== userId) {
      throw createError("Solo el owner puede eliminar este servidor.", 403);
    }

    const guildMemberUserIds = this.db.guild_members
      .filter((membership) => membership.guild_id === guildId)
      .map((membership) => membership.user_id);
    const guildChannelIds = new Set(
      this.db.channels
        .filter((channel) => channel.guild_id === guildId)
        .map((channel) => channel.id)
    );
    const guildMessageIds = new Set(
      this.db.messages
        .filter((message) => message.guild_id === guildId || guildChannelIds.has(message.channel_id))
        .map((message) => message.id)
    );

    this.db.message_reactions = this.db.message_reactions.filter(
      (reaction) => !guildMessageIds.has(reaction.message_id)
    );
    this.db.messages = this.db.messages.filter(
      (message) => !guildMessageIds.has(message.id)
    );
    this.db.channel_members = this.db.channel_members.filter(
      (membership) => !guildChannelIds.has(membership.channel_id)
    );
    this.db.channels = this.db.channels.filter((channel) => channel.guild_id !== guildId);
    this.db.roles = this.db.roles.filter((role) => role.guild_id !== guildId);
    this.db.guild_members = this.db.guild_members.filter((membership) => membership.guild_id !== guildId);
    this.db.invites = this.db.invites.filter((invite) => invite.guild_id !== guildId);
    this.db.guild_stickers = this.db.guild_stickers.filter((sticker) => sticker.guild_id !== guildId);
    this.db.guild_bans = this.db.guild_bans.filter((ban) => ban.guild_id !== guildId);
    this.db.guilds = this.db.guilds.filter((item) => item.id !== guildId);

    await this.save();

    return {
      affected_user_ids: [...new Set(guildMemberUserIds)],
      deleted: true,
      guild_id: guildId
    };
  }
,
  async createInvite({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = computePermissionBits({
      guilds: this.db.guilds,
      guildId,
      guildMembers: this.db.guild_members,
      roles: this.db.roles,
      userId
    });

    if ((permissionBits & PERMISSIONS.CREATE_INVITE) !== PERMISSIONS.CREATE_INVITE) {
      throw createError("No tienes permisos para invitar personas a este servidor.", 403);
    }

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

    const remainingMembers = this.db.guild_members.filter(
      (membership) => membership.guild_id === guildId && membership.user_id !== userId
    );
    const guildMemberUserIds = [
      userId,
      ...remainingMembers.map((membership) => membership.user_id)
    ];

    if (guild.owner_id === userId) {
      if (!remainingMembers.length) {
        return this.deleteGuild({ guildId, userId });
      }

      const nextOwnerMembership =
        remainingMembers[Math.floor(Math.random() * remainingMembers.length)] || null;
      const ownerRole = this.db.roles.find(
        (role) => role.guild_id === guildId && role.name === "Owner"
      );
      const everyoneRole = this.db.roles.find(
        (role) => role.guild_id === guildId && role.name === "@everyone"
      );

      guild.owner_id = nextOwnerMembership.user_id;
      guild.updated_at = new Date().toISOString();

      if (ownerRole) {
        this.db.guild_members.forEach((member) => {
          if (member.guild_id !== guildId) {
            return;
          }

          member.role_ids = Array.isArray(member.role_ids)
            ? member.role_ids.filter((roleId) => roleId !== ownerRole.id)
            : [];
        });

        const nextOwnerRoleIds = new Set(nextOwnerMembership.role_ids || []);
        if (everyoneRole?.id) {
          nextOwnerRoleIds.add(everyoneRole.id);
        }
        nextOwnerRoleIds.add(ownerRole.id);
        nextOwnerMembership.role_ids = [...nextOwnerRoleIds];
      }
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
      affected_user_ids: [...new Set(guildMemberUserIds)],
      guild_id: guildId,
      left: true,
      transferred_owner_id: guild.owner_id !== userId ? guild.owner_id : null
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
,
  async updateGuildMemberRole({ guildId, roleId = null, targetUserId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageRoles(guildId, userId);

    if (targetUserId === guild.owner_id) {
      throw createError("No puedes cambiar el rol del owner desde este panel.", 403);
    }

    const membership = this.db.guild_members.find(
      (member) => member.guild_id === guildId && member.user_id === targetUserId
    );
    if (!membership) {
      throw createError("Ese miembro ya no pertenece a este servidor.", 404);
    }

    const everyoneRole = this.db.roles.find(
      (role) => role.guild_id === guildId && role.name === "@everyone"
    );
    const nextRoleIds = everyoneRole ? [everyoneRole.id] : [];

    if (roleId) {
      const targetRole = this.db.roles.find(
        (role) => role.id === roleId && role.guild_id === guildId
      );
      if (!targetRole) {
        throw createError("El rol seleccionado no existe.", 404);
      }
      if (targetRole.name === "@everyone" || targetRole.name === "Owner") {
        throw createError("Ese rol no se puede asignar desde este panel.", 400);
      }

      nextRoleIds.push(targetRole.id);
    }

    membership.role_ids = nextRoleIds;
    await this.save();

    return {
      guild_id: guildId,
      role_ids: nextRoleIds,
      user_id: targetUserId
    };
  }
,
  async transferGuildOwnership({ guildId, targetUserId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    if (guild.owner_id !== userId) {
      throw createError("Solo el owner puede transferir el servidor.", 403);
    }

    if (!targetUserId) {
      throw createError("Debes elegir a quien transferir el owner.", 400);
    }

    if (targetUserId === guild.owner_id) {
      throw createError("Ese miembro ya es el owner del servidor.", 400);
    }

    const targetMembership = this.db.guild_members.find(
      (member) => member.guild_id === guildId && member.user_id === targetUserId
    );
    if (!targetMembership) {
      throw createError("Ese miembro ya no pertenece a este servidor.", 404);
    }

    const ownerRole = this.db.roles.find(
      (role) => role.guild_id === guildId && role.name === "Owner"
    );
    const everyoneRole = this.db.roles.find(
      (role) => role.guild_id === guildId && role.name === "@everyone"
    );
    const guildMembers = this.db.guild_members.filter((member) => member.guild_id === guildId);

    guild.owner_id = targetUserId;
    guild.updated_at = new Date().toISOString();

    if (ownerRole?.id) {
      guildMembers.forEach((member) => {
        const nextRoleIds = new Set(Array.isArray(member.role_ids) ? member.role_ids : []);
        nextRoleIds.delete(ownerRole.id);

        if (member.user_id === targetUserId) {
          nextRoleIds.add(ownerRole.id);
          if (everyoneRole?.id) {
            nextRoleIds.add(everyoneRole.id);
          }
        }

        member.role_ids = [...nextRoleIds];
      });
    }

    await this.save();

    return {
      affected_user_ids: [...new Set(guildMembers.map((member) => member.user_id).filter(Boolean))],
      guild_id: guildId,
      transferred_owner_id: targetUserId
    };
  }
};
