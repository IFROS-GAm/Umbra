import { CHANNEL_TYPES } from "../../constants.js";
import { createId, upsertChannelMembership } from "../helpers.js";
import {
  buildDirectDmKey,
  buildFriendshipPair,
  createError
} from "./shared.js";

export const demoStoreDmMethods = {
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
,
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
,
  async createGroupDm({ iconUrl = "", name = "", ownerId, recipientIds }) {
    const uniqueRecipientIds = [...new Set((recipientIds || []).map((id) => String(id)).filter(Boolean))]
      .filter((id) => id !== ownerId);
    const maxRecipients = 9;

    if (uniqueRecipientIds.length < 2) {
      const error = new Error("Selecciona al menos dos amigos para crear el grupo.");
      error.statusCode = 400;
      throw error;
    }

    if (uniqueRecipientIds.length > maxRecipients) {
      const error = new Error("Un grupo directo admite maximo 10 personas contando contigo.");
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

    const nonFriendId = uniqueRecipientIds.find((userId) => {
      const [leftId, rightId] = buildFriendshipPair(ownerId, userId);
      return !(this.db.friendships || []).some(
        (friendship) =>
          friendship.user_id === leftId && friendship.friend_id === rightId
      );
    });

    if (nonFriendId) {
      const error = new Error("Solo puedes crear grupos directos con amistades activas.");
      error.statusCode = 403;
      throw error;
    }

    const now = new Date().toISOString();
    const channel = {
      id: createId(),
      guild_id: null,
      type: CHANNEL_TYPES.GROUP_DM,
      icon_url: String(iconUrl || "").trim(),
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
  },
  async updateGroupDm({ channelId, clearIcon = false, iconUrl, name, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel || channel.type !== CHANNEL_TYPES.GROUP_DM) {
      throw createError("Grupo no encontrado.", 404);
    }

    const membership = this.db.channel_members.find(
      (item) => item.channel_id === channelId && item.user_id === userId
    );
    if (!membership) {
      throw createError("No puedes editar este grupo.", 403);
    }

    channel.name = String(name || "").trim();
    if (clearIcon) {
      channel.icon_url = "";
    } else if (iconUrl !== undefined) {
      channel.icon_url = String(iconUrl || "").trim();
    }
    channel.updated_at = new Date().toISOString();

    await this.save();

    return {
      channel
    };
  },
  async inviteGroupDmMembers({ channelId, recipientIds, userId }) {
    const channel = this.getChannel(channelId);
    if (!channel || channel.type !== CHANNEL_TYPES.GROUP_DM) {
      throw createError("Grupo no encontrado.", 404);
    }

    const membership = this.db.channel_members.find(
      (item) => item.channel_id === channelId && item.user_id === userId
    );
    if (!membership) {
      throw createError("No puedes invitar personas a este grupo.", 403);
    }

    const currentMemberships = this.db.channel_members.filter((item) => item.channel_id === channelId);
    const existingParticipantIds = new Set(currentMemberships.map((item) => item.user_id));
    const requestedIds = [...new Set((recipientIds || []).map((id) => String(id)).filter(Boolean))]
      .filter((id) => id !== userId && !existingParticipantIds.has(id));

    if (!requestedIds.length) {
      throw createError("Selecciona al menos una amistad nueva para invitar.", 400);
    }

    if (currentMemberships.length + requestedIds.length > 10) {
      throw createError("Este grupo ya no admite mas participantes.", 400);
    }

    const missingUserId = requestedIds.find(
      (targetId) => !this.db.profiles.some((profile) => profile.id === targetId)
    );

    if (missingUserId) {
      throw createError("Una de las personas seleccionadas ya no esta disponible.", 400);
    }

    const nonFriendId = requestedIds.find((targetId) => {
      const [leftId, rightId] = buildFriendshipPair(userId, targetId);
      return !(this.db.friendships || []).some(
        (friendship) => friendship.user_id === leftId && friendship.friend_id === rightId
      );
    });

    if (nonFriendId) {
      throw createError("Solo puedes invitar amistades activas a este grupo.", 403);
    }

    const now = new Date().toISOString();
    requestedIds.forEach((targetId) => {
      upsertChannelMembership(this.db, {
        channel_id: channelId,
        hidden: false,
        joined_at:
          currentMemberships.find((item) => item.user_id === targetId)?.joined_at || now,
        last_read_at:
          currentMemberships.find((item) => item.user_id === targetId)?.last_read_at || null,
        last_read_message_id:
          currentMemberships.find((item) => item.user_id === targetId)?.last_read_message_id || null,
        user_id: targetId
      });
    });
    channel.updated_at = now;

    await this.save();

    return {
      affected_user_ids: [...new Set([...currentMemberships.map((item) => item.user_id), ...requestedIds])],
      channel_id: channelId,
      invited_user_ids: requestedIds
    };
  }
};
