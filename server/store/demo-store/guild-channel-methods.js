import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  PERMISSIONS
} from "../../constants.js";
import {
  buildChannelMovePatchPlan,
  buildDefaultGuildStickerRows,
  buildGuildMovePatchPlan,
  createId,
  refreshChannelSummaries,
  upsertChannelMembership
} from "../helpers.js";
import {
  buildStoredRoleName,
  createError,
  normalizeProfileColor,
  splitStoredRoleName,
  normalizeStickerEmoji,
  sanitizeCategoryName,
  sanitizeChannelName,
  sanitizeStickerName
} from "./shared.js";

function decorateGuildRole(role, guildMembers) {
  const presentation = splitStoredRoleName(role?.name);
  return {
    ...role,
    display_name: presentation.name || role?.name || "Rol",
    icon_emoji: presentation.icon,
    is_admin: Boolean(Number(role?.permissions || 0) & PERMISSIONS.ADMINISTRATOR),
    is_default_role: role?.name === "@everyone",
    is_owner_role: role?.name === "Owner",
    member_count: guildMembers.filter((member) =>
      Array.isArray(member.role_ids) && member.role_ids.includes(role.id)
    ).length
  };
}

export const demoStoreGuildChannelMethods = {
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
          permissions:
            PERMISSIONS.READ_MESSAGES |
            PERMISSIONS.SEND_MESSAGES,
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

    this.db.guild_stickers.push(
      ...buildDefaultGuildStickerRows({
        createdBy: ownerId,
        guildId,
        now
      })
    );

    refreshChannelSummaries(this.db);
    await this.save();

    return {
      guild_id: guildId,
      channel_id: createdChannels.find((channel) => channel.type === CHANNEL_TYPES.TEXT)?.id || createdChannels[0]?.id
    };
  }
,
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
,
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
,
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
,
  async updateGuild({
    bannerColor,
    bannerImageUrl,
    description = "",
    guildId,
      iconUrl,
      name,
      allowMemberInvites,
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

    if (allowMemberInvites !== undefined) {
      const everyoneRole = this.db.roles.find(
        (role) => role.guild_id === guildId && role.name === "@everyone"
      );
      if (everyoneRole) {
        const currentPermissions = Number(everyoneRole.permissions || 0);
        everyoneRole.permissions = allowMemberInvites
          ? currentPermissions | PERMISSIONS.CREATE_INVITE
          : currentPermissions & ~PERMISSIONS.CREATE_INVITE;
      }
    }

    await this.save();
    return guild;
  }
,
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
,
  async listGuildStickers({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    if (
      !this.db.guild_members.some(
        (membership) => membership.guild_id === guildId && membership.user_id === userId
      )
    ) {
      throw createError("No perteneces a este servidor.", 403);
    }

    return (this.db.guild_stickers || [])
      .filter((sticker) => sticker.guild_id === guildId)
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
  }
,
  async createGuildSticker({ emoji = "", guildId, imageUrl = "", name, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

    const trimmedName = sanitizeStickerName(name);
    const trimmedEmoji = normalizeStickerEmoji(emoji);
    const normalizedImageUrl = String(imageUrl || "").trim();

    if (!trimmedName) {
      throw createError("El sticker necesita un nombre.", 400);
    }

    if (!trimmedEmoji && !normalizedImageUrl) {
      throw createError("El sticker necesita un emoji o una imagen.", 400);
    }

    const existingStickers = (this.db.guild_stickers || []).filter(
      (sticker) => sticker.guild_id === guildId
    );
    if (
      existingStickers.some(
        (sticker) => String(sticker.name || "").toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      throw createError("Ya existe un sticker con ese nombre.", 400);
    }

    const sticker = {
      id: createId(),
      guild_id: guildId,
      name: trimmedName,
      emoji: trimmedEmoji,
      image_url: normalizedImageUrl,
      is_default: false,
      position:
        existingStickers.reduce(
          (max, current) => Math.max(max, Number(current.position || 0)),
          -1
        ) + 1,
      created_by: userId,
      created_at: new Date().toISOString()
    };

    this.db.guild_stickers.push(sticker);
    await this.save();
    return sticker;
  }
,
  async deleteGuildSticker({ guildId, stickerId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageGuild(guildId, userId);

    const sticker = (this.db.guild_stickers || []).find((item) => item.id === stickerId);
    if (!sticker || sticker.guild_id !== guildId) {
      throw createError("Sticker no encontrado.", 404);
    }

    if (sticker.is_default) {
      throw createError("Los stickers predeterminados no se pueden eliminar.", 400);
    }

    const hasUsage = this.db.messages.some((message) => message.sticker_id === stickerId);
    if (hasUsage) {
      throw createError(
        "No puedes eliminar un sticker que ya fue usado en mensajes del servidor.",
        400
      );
    }

    this.db.guild_stickers = this.db.guild_stickers.filter((item) => item.id !== stickerId);
    refreshChannelSummaries(this.db);
    await this.save();

    return { ok: true, sticker_id: stickerId };
  }
,
  async listGuildRoles({ guildId, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageRoles(guildId, userId);

    return this.db.roles
      .filter((role) => role.guild_id === guildId)
      .sort((left, right) => Number(right.position || 0) - Number(left.position || 0))
      .map((role) => decorateGuildRole(role, this.db.guild_members));
  }
,
  async createGuildRole({ color = "#9AA4B2", guildId, icon = "", name, permissions = 0, userId }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageRoles(guildId, userId);

    const storedName = buildStoredRoleName({
      icon,
      name
    });

    if (!storedName) {
      throw createError("El rol necesita un nombre.", 400);
    }

    const normalizedName = splitStoredRoleName(storedName).name.toLowerCase();
    if (["@everyone", "owner"].includes(normalizedName)) {
      throw createError("Ese nombre de rol esta reservado.", 400);
    }

    const duplicateRole = this.db.roles.find((role) => {
      if (role.guild_id !== guildId) {
        return false;
      }

      return splitStoredRoleName(role.name).name.toLowerCase() === normalizedName;
    });

    if (duplicateRole) {
      throw createError("Ya existe un rol con ese nombre.", 400);
    }

    const ownerRole = this.db.roles.find(
      (role) => role.guild_id === guildId && role.name === "Owner"
    );
    const nextPosition = Math.max(1, Number(ownerRole?.position || 1));

    this.db.roles
      .filter((role) => role.guild_id === guildId && Number(role.position || 0) >= nextPosition)
      .forEach((role) => {
        role.position = Number(role.position || 0) + 1;
      });

    const role = {
      id: createId(),
      guild_id: guildId,
      name: storedName,
      color: normalizeProfileColor(color, "#9AA4B2"),
      position: nextPosition,
      permissions: Number(permissions || 0),
      hoist: false,
      mentionable: false,
      created_at: new Date().toISOString()
    };

    this.db.roles.push(role);
    await this.save();

    return decorateGuildRole(role, this.db.guild_members);
  }
,
  async updateGuildRole({
    color = "#9AA4B2",
    guildId,
    icon = "",
    name,
    permissions = 0,
    roleId,
    userId
  }) {
    const guild = this.db.guilds.find((item) => item.id === guildId);
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    this.assertCanManageRoles(guildId, userId);

    const role = this.db.roles.find((item) => item.id === roleId && item.guild_id === guildId);
    if (!role) {
      throw createError("Rol no encontrado.", 404);
    }

    if (role.name === "@everyone" || role.name === "Owner") {
      throw createError("Ese rol del sistema no se puede editar desde este panel.", 403);
    }

    const storedName = buildStoredRoleName({
      icon,
      name
    });

    if (!storedName) {
      throw createError("El rol necesita un nombre.", 400);
    }

    const normalizedName = splitStoredRoleName(storedName).name.toLowerCase();
    const duplicateRole = this.db.roles.find((item) => {
      if (item.id === role.id || item.guild_id !== guildId) {
        return false;
      }

      return splitStoredRoleName(item.name).name.toLowerCase() === normalizedName;
    });

    if (duplicateRole) {
      throw createError("Ya existe un rol con ese nombre.", 400);
    }

    role.name = storedName;
    role.color = normalizeProfileColor(color, role.color || "#9AA4B2");
    role.permissions = Number(permissions || 0);

    await this.save();
    return decorateGuildRole(role, this.db.guild_members);
  }
,
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
};
