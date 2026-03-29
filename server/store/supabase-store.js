import { CHANNEL_TYPES, PERMISSIONS } from "../constants.js";
import {
  buildBootstrapState,
  computePermissionBits,
  createId,
  enrichMessages,
  resolveMentionUserIds,
  sortByDateDesc
} from "./helpers.js";

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function expectData(queryPromise, fallbackMessage = "Error consultando Supabase.") {
  const { data, error } = await queryPromise;
  if (error) {
    const wrapped = createError(error.message || fallbackMessage, 500);
    wrapped.cause = error;
    throw wrapped;
  }

  return data;
}

export class SupabaseStore {
  constructor(client) {
    this.client = client;
  }

  getMode() {
    return "supabase";
  }

  async init() {
    return this;
  }

  async getDefaultUserId() {
    const profiles = await expectData(
      this.client.from("profiles").select("id").order("created_at", { ascending: true }).limit(1)
    );
    return profiles?.[0]?.id ?? null;
  }

  async bootstrap(userId) {
    const viewerId = userId || (await this.getDefaultUserId());
    const snapshot = await this.loadBootstrapSnapshot(viewerId);
    return buildBootstrapState(snapshot, viewerId);
  }

  async loadBootstrapSnapshot(userId) {
    const [profiles, guildMemberships, dmMemberships] = await Promise.all([
      expectData(this.client.from("profiles").select("*")),
      expectData(
        this.client.from("guild_members").select("*").eq("user_id", userId)
      ),
      expectData(
        this.client
          .from("channel_members")
          .select("*")
          .eq("user_id", userId)
          .eq("hidden", false)
      )
    ]);

    const guildIds = [...new Set(guildMemberships.map((item) => item.guild_id))];
    const dmChannelIds = [...new Set(dmMemberships.map((item) => item.channel_id))];

    const [guilds, roles, guildMembers, guildChannels, dmChannels] = await Promise.all([
      guildIds.length
        ? expectData(this.client.from("guilds").select("*").in("id", guildIds))
        : Promise.resolve([]),
      guildIds.length
        ? expectData(this.client.from("roles").select("*").in("guild_id", guildIds))
        : Promise.resolve([]),
      guildIds.length
        ? expectData(
            this.client.from("guild_members").select("*").in("guild_id", guildIds)
          )
        : Promise.resolve([]),
      guildIds.length
        ? expectData(
            this.client.from("channels").select("*").in("guild_id", guildIds)
          )
        : Promise.resolve([]),
      dmChannelIds.length
        ? expectData(this.client.from("channels").select("*").in("id", dmChannelIds))
        : Promise.resolve([])
    ]);

    const channels = [...guildChannels, ...dmChannels].filter(
      (channel, index, collection) =>
        collection.findIndex((item) => item.id === channel.id) === index
    );
    const channelIds = channels.map((channel) => channel.id);
    const channelMembers = channelIds.length
      ? await expectData(
          this.client.from("channel_members").select("*").in("channel_id", channelIds)
        )
      : [];

    const snapshot = {
      profiles,
      guilds,
      roles,
      guild_members: guildMembers,
      channels,
      channel_members: channelMembers,
      messages: [],
      message_reactions: []
    };
    return snapshot;
  }

  async getChannel(channelId) {
    const rows = await expectData(
      this.client.from("channels").select("*").eq("id", channelId).limit(1)
    );
    return rows[0] || null;
  }

  async getMessage(messageId) {
    const rows = await expectData(
      this.client.from("messages").select("*").eq("id", messageId).limit(1)
    );
    return rows[0] || null;
  }

  async getPermissionBits(guildId, userId) {
    const [guilds, roles, guildMembers] = await Promise.all([
      expectData(this.client.from("guilds").select("*").eq("id", guildId)),
      expectData(this.client.from("roles").select("*").eq("guild_id", guildId)),
      expectData(this.client.from("guild_members").select("*").eq("guild_id", guildId))
    ]);

    return computePermissionBits({
      guilds,
      guildId,
      guildMembers,
      roles,
      userId
    });
  }

  async listChannelMessages({ before, channelId, limit = 30, userId }) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    let createdBefore = null;
    if (before) {
      const anchor = await this.getMessage(before);
      createdBefore = anchor?.created_at ?? null;
    }

    let query = this.client
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (createdBefore) {
      query = query.lt("created_at", createdBefore);
    }

    const messages = await expectData(query);
    const pageMessageIds = messages.map((message) => message.id);
    const replyIds = messages.map((message) => message.reply_to).filter(Boolean);
    const allMessageIds = [...new Set([...pageMessageIds, ...replyIds])];

    const [reactions, profiles, guildMembers, roles, replyMessages] = await Promise.all([
      pageMessageIds.length
        ? expectData(
            this.client
              .from("message_reactions")
              .select("*")
              .in("message_id", pageMessageIds)
          )
        : Promise.resolve([]),
      expectData(this.client.from("profiles").select("*")),
      channel.guild_id
        ? expectData(
            this.client
              .from("guild_members")
              .select("*")
              .eq("guild_id", channel.guild_id)
          )
        : Promise.resolve([]),
      channel.guild_id
        ? expectData(this.client.from("roles").select("*").eq("guild_id", channel.guild_id))
        : Promise.resolve([]),
      replyIds.length
        ? expectData(
            this.client.from("messages").select("*").in("id", replyIds)
          )
        : Promise.resolve([])
    ]);

    const snapshot = {
      profiles,
      guilds: channel.guild_id
        ? await expectData(this.client.from("guilds").select("*").eq("id", channel.guild_id))
        : [],
      roles,
      guild_members: guildMembers,
      channels: [channel],
      channel_members: [],
      messages: [...messages, ...replyMessages].filter(
        (message, index, collection) =>
          collection.findIndex((item) => item.id === message.id) === index
      ),
      message_reactions: reactions
    };

    return {
      messages: enrichMessages({
        channelId,
        db: snapshot,
        messages,
        userId
      }),
      has_more: messages.length === limit
    };
  }

  async createMessage({ authorId, channelId, content, replyTo = null }) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      throw createError("El mensaje no puede estar vacío.", 400);
    }

    if (channel.guild_id) {
      const permissionBits = await this.getPermissionBits(channel.guild_id, authorId);
      if (
        (permissionBits & PERMISSIONS.SEND_MESSAGES) !== PERMISSIONS.SEND_MESSAGES
      ) {
        throw createError("No tienes permisos para enviar mensajes en este canal.", 403);
      }
    }

    if (replyTo) {
      const replyTarget = await this.getMessage(replyTo);
      if (!replyTarget || replyTarget.channel_id !== channelId) {
        throw createError("El mensaje al que respondes no existe en este canal.", 400);
      }
    }

    const profiles = await expectData(this.client.from("profiles").select("*"));
    const now = new Date().toISOString();
    const message = {
      id: createId(),
      channel_id: channelId,
      guild_id: channel.guild_id,
      author_id: authorId,
      content: trimmed,
      reply_to: replyTo,
      attachments: [],
      mention_user_ids: resolveMentionUserIds(trimmed, profiles),
      edited_at: null,
      deleted_at: null,
      created_at: now
    };

    await expectData(this.client.from("messages").insert(message));
    await this.markChannelRead({
      channelId,
      lastReadMessageId: message.id,
      userId: authorId
    });
    await this.refreshChannelSummary(channelId);

    return this.getChannelSnapshot(channelId, authorId, message.id);
  }

  async updateMessage({ content, messageId, userId }) {
    const message = await this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    if (message.author_id !== userId) {
      throw createError("Solo el autor puede editar este mensaje.", 403);
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      throw createError("El mensaje editado no puede estar vacío.", 400);
    }

    const profiles = await expectData(this.client.from("profiles").select("*"));
    await expectData(
      this.client
        .from("messages")
        .update({
          content: trimmed,
          edited_at: new Date().toISOString(),
          mention_user_ids: resolveMentionUserIds(trimmed, profiles)
        })
        .eq("id", messageId)
    );

    await this.refreshChannelSummary(message.channel_id);
    return this.getChannelSnapshot(message.channel_id, userId, messageId);
  }

  async deleteMessage({ messageId, userId }) {
    const message = await this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    let canManage = false;
    if (message.guild_id) {
      const permissionBits = await this.getPermissionBits(message.guild_id, userId);
      canManage =
        (permissionBits & PERMISSIONS.MANAGE_MESSAGES) ===
        PERMISSIONS.MANAGE_MESSAGES;
    }

    if (message.author_id !== userId && !canManage) {
      throw createError("No puedes eliminar este mensaje.", 403);
    }

    await expectData(
      this.client
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId)
    );
    await expectData(
      this.client.from("message_reactions").delete().eq("message_id", messageId)
    );
    await this.refreshChannelSummary(message.channel_id);

    return {
      id: messageId,
      channel_id: message.channel_id
    };
  }

  async toggleReaction({ emoji, messageId, userId }) {
    const message = await this.getMessage(messageId);
    if (!message || message.deleted_at) {
      throw createError("Mensaje no encontrado.", 404);
    }

    const existing = await expectData(
      this.client
        .from("message_reactions")
        .select("*")
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", emoji)
        .limit(1)
    );

    if (existing[0]) {
      await expectData(
        this.client
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", userId)
          .eq("emoji", emoji)
      );
    } else {
      await expectData(
        this.client.from("message_reactions").insert({
          message_id: messageId,
          user_id: userId,
          emoji,
          created_at: new Date().toISOString()
        })
      );
    }

    return this.getChannelSnapshot(message.channel_id, userId, messageId);
  }

  async createGuild({ description = "", name, ownerId }) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    const guildId = createId();
    const everyoneRoleId = createId();
    const ownerRoleId = createId();
    const channelId = createId();
    const now = new Date().toISOString();

    await expectData(
      this.client.from("guilds").insert({
        id: guildId,
        name: trimmed,
        description: description.trim(),
        icon_text: trimmed
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0]?.toUpperCase())
          .join(""),
        banner_color: "#5865F2",
        owner_id: ownerId,
        created_at: now,
        updated_at: now
      })
    );

    await expectData(
      this.client.from("roles").insert([
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
      ])
    );

    await expectData(
      this.client.from("guild_members").insert({
        guild_id: guildId,
        user_id: ownerId,
        role_ids: [everyoneRoleId, ownerRoleId],
        nickname: "",
        joined_at: now
      })
    );

    await expectData(
      this.client.from("channels").insert({
        id: channelId,
        guild_id: guildId,
        type: CHANNEL_TYPES.TEXT,
        name: "general",
        topic: "Canal inicial del servidor.",
        position: 0,
        parent_id: null,
        created_by: ownerId,
        last_message_id: null,
        last_message_author_id: null,
        last_message_preview: "",
        last_message_at: null,
        created_at: now,
        updated_at: now
      })
    );

    await expectData(
      this.client.from("channel_members").upsert(
        {
          channel_id: channelId,
          user_id: ownerId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        },
        { onConflict: "channel_id,user_id" }
      )
    );

    return {
      guild_id: guildId,
      channel_id: channelId
    };
  }

  async createChannel({ createdBy, guildId, name, topic = "" }) {
    const guild = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    if (!guild[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, createdBy);
    if (
      (permissionBits & PERMISSIONS.MANAGE_CHANNELS) !==
      PERMISSIONS.MANAGE_CHANNELS
    ) {
      throw createError("No tienes permisos para crear canales.", 403);
    }

    const trimmed = name?.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed) {
      throw createError("El canal necesita un nombre.", 400);
    }

    const existingChannels = await expectData(
      this.client.from("channels").select("id,name,position").eq("guild_id", guildId)
    );
    if (existingChannels.some((channel) => channel.name === trimmed)) {
      throw createError("Ya existe un canal con ese nombre.", 400);
    }

    const nextPosition =
      existingChannels.reduce(
        (max, channel) => Math.max(max, Number(channel.position)),
        -1
      ) + 1;

    const channel = {
      id: createId(),
      guild_id: guildId,
      type: CHANNEL_TYPES.TEXT,
      name: trimmed,
      topic: topic.trim(),
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

    await expectData(this.client.from("channels").insert(channel));
    return channel;
  }

  async createOrGetDm({ ownerId, recipientId }) {
    const memberships = await expectData(
      this.client
        .from("channel_members")
        .select("*")
        .in("user_id", [ownerId, recipientId])
    );

    const candidateIds = [...new Set(memberships.map((item) => item.channel_id))];
    if (candidateIds.length) {
      const [candidateChannels, candidateMemberships] = await Promise.all([
        expectData(
          this.client
            .from("channels")
            .select("*")
            .in("id", candidateIds)
            .eq("type", CHANNEL_TYPES.DM)
        ),
        expectData(
          this.client
            .from("channel_members")
            .select("*")
            .in("channel_id", candidateIds)
        )
      ]);

      const exact = candidateChannels.find((channel) => {
        const participants = candidateMemberships
          .filter((item) => item.channel_id === channel.id)
          .map((item) => item.user_id)
          .sort();
        const expected = [ownerId, recipientId].sort();
        return (
          participants.length === 2 &&
          participants[0] === expected[0] &&
          participants[1] === expected[1]
        );
      });

      if (exact) {
        return exact;
      }
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

    await expectData(this.client.from("channels").insert(channel));
    await expectData(
      this.client.from("channel_members").insert([
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
      ])
    );

    return channel;
  }

  async markChannelRead({ channelId, lastReadMessageId = null, userId }) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      throw createError("Canal no encontrado.", 404);
    }

    const targetMessageId = lastReadMessageId || channel.last_message_id || null;
    const targetMessage = targetMessageId ? await this.getMessage(targetMessageId) : null;

    await expectData(
      this.client.from("channel_members").upsert(
        {
          channel_id: channelId,
          user_id: userId,
          last_read_message_id: targetMessageId,
          last_read_at: targetMessage?.created_at || new Date().toISOString(),
          hidden: false,
          joined_at: new Date().toISOString()
        },
        { onConflict: "channel_id,user_id" }
      )
    );

    return {
      channel_id: channelId,
      last_read_message_id: targetMessageId
    };
  }

  async setPresence({ status, userId }) {
    const rows = await expectData(
      this.client
        .from("profiles")
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("*")
    );

    return rows[0] || null;
  }

  async syncConnectionPresence({ isOnline, userId }) {
    const rows = await expectData(
      this.client.from("profiles").select("*").eq("id", userId).limit(1)
    );
    const profile = rows[0];
    if (!profile) {
      return null;
    }

    let nextStatus = profile.status;
    if (isOnline) {
      if (profile.status === "offline") {
        nextStatus = "online";
      }
    } else if (profile.status !== "invisible") {
      nextStatus = "offline";
    }

    if (nextStatus !== profile.status) {
      return this.setPresence({ status: nextStatus, userId });
    }

    return profile;
  }

  async refreshChannelSummary(channelId) {
    const latest = await expectData(
      this.client
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
    );

    const message = latest[0];
    await expectData(
      this.client
        .from("channels")
        .update({
          last_message_id: message?.id ?? null,
          last_message_author_id: message?.author_id ?? null,
          last_message_preview: message ? message.content.slice(0, 84) : "",
          last_message_at: message?.created_at ?? null,
          updated_at: new Date().toISOString()
        })
        .eq("id", channelId)
    );
  }

  async getChannelSnapshot(channelId, userId, messageId = null) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return null;
    }

    let messages = [];
    if (messageId) {
      const target = await this.getMessage(messageId);
      if (!target || target.deleted_at) {
        return null;
      }
      messages = [target];
      if (target.reply_to) {
        const replyTarget = await this.getMessage(target.reply_to);
        if (replyTarget) {
          messages.push(replyTarget);
        }
      }
    } else {
      const rows = await expectData(
        this.client
          .from("messages")
          .select("*")
          .eq("channel_id", channelId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
      );
      messages = rows;
    }

    if (!messages.length) {
      return null;
    }

    const targetMessages = messageId
      ? messages.filter((message) => message.id === messageId)
      : [...messages].sort(sortByDateDesc).slice(0, 1);
    const reactionMessageIds = targetMessages.map((message) => message.id);

    const [profiles, guilds, roles, guildMembers, reactions] = await Promise.all([
      expectData(this.client.from("profiles").select("*")),
      channel.guild_id
        ? expectData(this.client.from("guilds").select("*").eq("id", channel.guild_id))
        : Promise.resolve([]),
      channel.guild_id
        ? expectData(this.client.from("roles").select("*").eq("guild_id", channel.guild_id))
        : Promise.resolve([]),
      channel.guild_id
        ? expectData(
            this.client
              .from("guild_members")
              .select("*")
              .eq("guild_id", channel.guild_id)
          )
        : Promise.resolve([]),
      reactionMessageIds.length
        ? expectData(
            this.client
              .from("message_reactions")
              .select("*")
              .in("message_id", reactionMessageIds)
          )
        : Promise.resolve([])
    ]);

    const snapshot = {
      profiles,
      guilds,
      roles,
      guild_members: guildMembers,
      channels: [channel],
      channel_members: [],
      messages,
      message_reactions: reactions
    };

    const enriched = enrichMessages({
      channelId,
      db: snapshot,
      messages: targetMessages,
      userId
    });

    return enriched[0] || null;
  }

  async getChannelPreview(channelId) {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return null;
    }

    return {
      id: channel.id,
      last_message_id: channel.last_message_id,
      last_message_author_id: channel.last_message_author_id,
      last_message_preview: channel.last_message_preview,
      last_message_at: channel.last_message_at
    };
  }
}
