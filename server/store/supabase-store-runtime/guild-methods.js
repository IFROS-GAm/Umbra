import {
  CHANNEL_TYPES,
  GUILD_CHANNEL_KINDS,
  GUILD_TEMPLATES,
  GUILD_MEMBER_MESSAGE_SELECT,
  GUILD_PERMISSION_SELECT,
  PERMISSIONS,
  PROFILE_MESSAGE_SELECT,
  REACTION_SELECT,
  ROLE_PERMISSION_SELECT,
  assertInviteUsable,
  buildDirectDmKey,
  buildFriendshipPair,
  buildGuildBanMessage,
  buildGuildMovePatchPlan,
  buildInviteCode,
  buildInvitePreview,
  buildStoredRoleName,
  buildMessagePreview,
  buildChannelMovePatchPlan,
  buildDefaultGuildStickerRows,
  createError,
  createId,
  enrichMessages,
  expectData,
  getDefaultGuildChannel,
  isGuildVoiceChannel,
  normalizeBanExpiration,
  normalizePrivacySettings,
  normalizeProfileColor,
  splitStoredRoleName,
  normalizeRecoveryAccount,
  normalizeRecoveryProvider,
  normalizeSocialLinks,
  normalizeStickerEmoji,
  resolveMentionUserIds,
  sanitizeCategoryName,
  sanitizeChannelName,
  sanitizeStickerName,
  sanitizeUsername,
  sortByDateDesc,
  sortGuildStickers
} from "./shared.js";

function decorateGuildRole(role, guildMembers) {
  const presentation = splitStoredRoleName(role?.name);
  return {
    ...role,
    display_name: presentation.name || role?.name || "Rol",
    icon_emoji: presentation.icon,
    icon_url: presentation.iconUrl,
    is_admin: Boolean(Number(role?.permissions || 0) & PERMISSIONS.ADMINISTRATOR),
    is_default_role: role?.name === "@everyone",
    is_owner_role: role?.name === "Owner",
    member_count: guildMembers.filter((member) =>
      Array.isArray(member.role_ids) && member.role_ids.includes(role.id)
    ).length
  };
}

export const supabaseStoreRuntimeGuildMethods = {
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

    await expectData(
      this.client.from("guilds").insert({
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

    const ownerPosition = await this.getNextGuildMembershipPosition(ownerId);

    await expectData(
      this.client.from("guild_members").insert({
        guild_id: guildId,
        user_id: ownerId,
        position: ownerPosition,
        role_ids: [everyoneRoleId, ownerRoleId],
        nickname: "",
        joined_at: now
      })
    );

    const textChannels =
      template.textChannels?.length ? template.textChannels : GUILD_TEMPLATES.default.textChannels;
    const voiceChannels = template.voiceChannels || [];
    const createdChannels = [...textChannels, ...voiceChannels].map((channelName, index) => {
      const isVoice = index >= textChannels.length;
      return {
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
    });

    await expectData(this.client.from("channels").insert(createdChannels));

    await expectData(
      this.client.from("channel_members").upsert(
        createdChannels.map((channel) => ({
          channel_id: channel.id,
          user_id: ownerId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        })),
        { onConflict: "channel_id,user_id" }
      )
    );

    if (this.guildStickersEnabled) {
      await expectData(
        this.client.from("guild_stickers").insert(
          buildDefaultGuildStickerRows({
            createdBy: ownerId,
            guildId,
            now
          })
        )
      );
    }

    return {
      guild_id: guildId,
      channel_id:
        createdChannels.find((channel) => channel.type === CHANNEL_TYPES.TEXT)?.id ||
        createdChannels[0]?.id
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
    const guild = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    if (!guild[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, createdBy);
    if ((permissionBits & PERMISSIONS.MANAGE_CHANNELS) !== PERMISSIONS.MANAGE_CHANNELS) {
      throw createError("No tienes permisos para cambiar la estructura del servidor.", 403);
    }

    const trimmed = sanitizeChannelName(name);
    if (!trimmed) {
      throw createError("El canal necesita un nombre.", 400);
    }

    const existingChannels = await expectData(
      this.client.from("channels").select("id,name,position,type,guild_id").eq("guild_id", guildId)
    );
    if (existingChannels.some((channel) => channel.name === trimmed)) {
      throw createError("Ya existe un canal con ese nombre.", 400);
    }

    if (parentId) {
      const parent = existingChannels.find((channel) => channel.id === parentId);
      if (!parent || parent.type !== CHANNEL_TYPES.CATEGORY) {
        throw createError("La categoria seleccionada no existe.", 400);
      }
    }

    const nextPosition =
      existingChannels.reduce(
        (max, channel) => Math.max(max, Number(channel.position)),
        -1
      ) + 1;

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

    await expectData(this.client.from("channels").insert(channel));
    return channel;
  }
,
  async createCategory({ createdBy, guildId, name }) {
    const guild = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    if (!guild[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, createdBy);
    if ((permissionBits & PERMISSIONS.MANAGE_CHANNELS) !== PERMISSIONS.MANAGE_CHANNELS) {
      throw createError("No tienes permisos para cambiar la estructura del servidor.", 403);
    }

    const trimmed = sanitizeCategoryName(name);
    if (!trimmed) {
      throw createError("La categoria necesita un nombre.", 400);
    }

    const existingChannels = await expectData(
      this.client.from("channels").select("id,name,position").eq("guild_id", guildId)
    );
    if (
      existingChannels.some(
        (channel) => String(channel.name).toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      throw createError("Ya existe una categoria o canal con ese nombre.", 400);
    }

    const nextPosition =
      existingChannels.reduce(
        (max, channel) => Math.max(max, Number(channel.position)),
        -1
      ) + 1;

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

    await expectData(this.client.from("channels").insert(category));
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
    const guildRows = await expectData(
      this.client.from("guilds").select("id").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, createdBy);
    if ((permissionBits & PERMISSIONS.MANAGE_CHANNELS) !== PERMISSIONS.MANAGE_CHANNELS) {
      throw createError("No tienes permisos para cambiar la estructura del servidor.", 403);
    }

    const channels = await expectData(
      this.client
        .from("channels")
        .select("id,guild_id,type,parent_id,position")
        .eq("guild_id", guildId)
    );

    let patches = [];
    try {
      patches = buildChannelMovePatchPlan({
        channelId,
        channels,
        guildId,
        parentId,
        placement,
        relativeToChannelId
      });
    } catch (error) {
      throw createError(error.message, 400);
    }

    if (!patches.length) {
      return channels.find((channel) => channel.id === channelId) || null;
    }

    const now = new Date().toISOString();
    await Promise.all(
      patches.map((patch) =>
        expectData(
          this.client
            .from("channels")
            .update({
              parent_id: patch.parent_id,
              position: patch.position,
              updated_at: now
            })
            .eq("id", patch.id)
        )
      )
    );

    const updatedRows = await expectData(
      this.client.from("channels").select("*").eq("id", channelId).limit(1)
    );
    return updatedRows[0] || null;
  }
,
  async moveGuild({
    createdBy,
    guildId,
    placement = "after",
    relativeToGuildId = null
  }) {
    const guildRows = await expectData(
      this.client.from("guilds").select("id,owner_id").eq("id", guildId).limit(1)
    );
    const guild = guildRows[0] || null;
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const guildMemberships = await expectData(
      this.client
        .from("guild_members")
        .select("guild_id,user_id,position,joined_at")
        .eq("user_id", createdBy)
    );

    let patches = [];
    try {
      patches = buildGuildMovePatchPlan({
        guildId,
        guildMemberships,
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

    await Promise.all(
      patches.map((patch) =>
        expectData(
          this.client
            .from("guild_members")
            .update({ position: patch.position })
            .eq("guild_id", patch.guild_id)
            .eq("user_id", patch.user_id)
        )
      )
    );

    return guild;
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
    const guildRows = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    const guild = guildRows[0];
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_GUILD) !== PERMISSIONS.MANAGE_GUILD) {
      throw createError("No tienes permisos para editar este servidor.", 403);
    }

    const trimmed = String(name || "").trim();
    if (!trimmed) {
      throw createError("El servidor necesita un nombre.", 400);
    }

    const updatedRows = await expectData(
      this.client
        .from("guilds")
        .update({
          name: trimmed,
          description: String(description || "").trim().slice(0, 180),
          icon_text: trimmed
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase())
            .join(""),
          icon_url: iconUrl !== undefined ? String(iconUrl || "").trim() : guild.icon_url || "",
          banner_color: normalizeProfileColor(bannerColor, guild.banner_color || "#5865F2"),
          banner_image_url:
            bannerImageUrl !== undefined
              ? String(bannerImageUrl || "").trim()
              : guild.banner_image_url || "",
          updated_at: new Date().toISOString()
        })
        .eq("id", guildId)
        .select("*")
    );

    if (allowMemberInvites !== undefined) {
      const everyoneRoles = await expectData(
        this.client
          .from("roles")
          .select("id,permissions")
          .eq("guild_id", guildId)
          .eq("name", "@everyone")
          .limit(1)
      );
      const everyoneRole = everyoneRoles[0] || null;
      if (everyoneRole) {
        const currentPermissions = Number(everyoneRole.permissions || 0);
        await expectData(
          this.client
            .from("roles")
            .update({
              permissions: allowMemberInvites
                ? currentPermissions | PERMISSIONS.CREATE_INVITE
                : currentPermissions & ~PERMISSIONS.CREATE_INVITE
            })
            .eq("id", everyoneRole.id)
        );
      }
    }

    this.invalidateGuildMessageContext(guildId);

    return updatedRows[0] || guild;
  }
,
  async listGuildStickers({ guildId, userId }) {
    this.assertGuildStickerFeatureAvailable();

    const guildRows = await expectData(
      this.client.from("guilds").select("id").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const memberships = await expectData(
      this.client
        .from("guild_members")
        .select("guild_id")
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .limit(1)
    );
    if (!memberships[0]) {
      throw createError("No perteneces a este servidor.", 403);
    }

    const stickers = await this.loadGuildStickers(guildId);

    return sortGuildStickers(stickers);
  }
,
  async createGuildSticker({ emoji = "", guildId, imageUrl = "", name, userId }) {
    this.assertGuildStickerFeatureAvailable();

    const guildRows = await expectData(
      this.client.from("guilds").select("id").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_GUILD) !== PERMISSIONS.MANAGE_GUILD) {
      throw createError("No tienes permisos para crear stickers del servidor.", 403);
    }

    const trimmedName = sanitizeStickerName(name);
    const trimmedEmoji = normalizeStickerEmoji(emoji);
    const normalizedImageUrl = String(imageUrl || "").trim();

    if (!trimmedName) {
      throw createError("El sticker necesita un nombre.", 400);
    }

    if (!trimmedEmoji && !normalizedImageUrl) {
      throw createError("El sticker necesita un emoji o una imagen.", 400);
    }

    const existing = await this.loadGuildStickers(guildId);
    if (
      existing.some(
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
        existing.reduce((max, current) => Math.max(max, Number(current.position || 0)), -1) + 1,
      created_by: userId,
      created_at: new Date().toISOString()
    };

    const rows = await expectData(this.client.from("guild_stickers").insert(sticker).select("*"));
    this.invalidateGuildMessageContext(guildId);
    return rows[0] || sticker;
  }
,
  async deleteGuildSticker({ guildId, stickerId, userId }) {
    this.assertGuildStickerFeatureAvailable();

    const guildRows = await expectData(
      this.client.from("guilds").select("id").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_GUILD) !== PERMISSIONS.MANAGE_GUILD) {
      throw createError("No tienes permisos para eliminar stickers del servidor.", 403);
    }

    const sticker = await this.getGuildStickerById(stickerId);
    if (!sticker || sticker.guild_id !== guildId) {
      throw createError("Sticker no encontrado.", 404);
    }

    if (sticker.is_default) {
      throw createError("Los stickers predeterminados no se pueden eliminar.", 400);
    }

    const usageRows = await expectData(
      this.client.from("messages").select("id").eq("sticker_id", stickerId).limit(1)
    );
    if (usageRows.length) {
      throw createError(
        "No puedes eliminar un sticker que ya fue usado en mensajes del servidor.",
        400
      );
    }

    await expectData(this.client.from("guild_stickers").delete().eq("id", stickerId));
    this.invalidateGuildMessageContext(guildId);
    return { ok: true, sticker_id: stickerId };
  }
,
  async listGuildRoles({ guildId, userId }) {
    const guildRows = await expectData(
      this.client.from("guilds").select(GUILD_PERMISSION_SELECT).eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_ROLES) !== PERMISSIONS.MANAGE_ROLES) {
      throw createError("No tienes permisos para ver los roles del servidor.", 403);
    }

    const [roles, guildMembers] = await Promise.all([
      expectData(
        this.client
          .from("roles")
          .select(ROLE_PERMISSION_SELECT)
          .eq("guild_id", guildId)
          .order("position", { ascending: false })
      ),
      expectData(this.client.from("guild_members").select("role_ids").eq("guild_id", guildId))
    ]);

    return roles.map((role) => decorateGuildRole(role, guildMembers));
  }
,
  async createGuildRole({
    color = "#9AA4B2",
    guildId,
    icon = "",
    iconUrl = "",
    name,
    permissions = 0,
    userId
  }) {
    const guildRows = await expectData(
      this.client.from("guilds").select("id").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_ROLES) !== PERMISSIONS.MANAGE_ROLES) {
      throw createError("No tienes permisos para crear roles en este servidor.", 403);
    }

    const storedName = buildStoredRoleName({ icon, iconUrl, name });
    if (!storedName) {
      throw createError("El rol necesita un nombre.", 400);
    }

    const normalizedName = splitStoredRoleName(storedName).name.toLowerCase();
    if (["@everyone", "owner"].includes(normalizedName)) {
      throw createError("Ese nombre de rol esta reservado.", 400);
    }

    const existingRoles = await expectData(
      this.client.from("roles").select(ROLE_PERMISSION_SELECT).eq("guild_id", guildId)
    );
    const duplicateRole = existingRoles.find((role) => {
      return splitStoredRoleName(role.name).name.toLowerCase() === normalizedName;
    });
    if (duplicateRole) {
      throw createError("Ya existe un rol con ese nombre.", 400);
    }

    const ownerRole = existingRoles.find((role) => role.name === "Owner");
    const nextPosition = Math.max(1, Number(ownerRole?.position || 1));

    await Promise.all(
      existingRoles
        .filter((role) => Number(role.position || 0) >= nextPosition)
        .map((role) =>
          expectData(
            this.client
              .from("roles")
              .update({ position: Number(role.position || 0) + 1 })
              .eq("id", role.id)
          )
        )
    );

    const rolePayload = {
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

    const rows = await expectData(this.client.from("roles").insert(rolePayload).select("*"));
    const guildMembers = await expectData(
      this.client.from("guild_members").select("role_ids").eq("guild_id", guildId)
    );
    return decorateGuildRole(rows[0] || rolePayload, guildMembers);
  }
,
  async updateGuildRole({
    color = "#9AA4B2",
    guildId,
    icon = "",
    iconUrl = "",
    name,
    permissions = 0,
    roleId,
    userId
  }) {
    const guildRows = await expectData(
      this.client.from("guilds").select("id").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_ROLES) !== PERMISSIONS.MANAGE_ROLES) {
      throw createError("No tienes permisos para editar roles en este servidor.", 403);
    }

    const roleRows = await expectData(
      this.client.from("roles").select(ROLE_PERMISSION_SELECT).eq("id", roleId).limit(1)
    );
    const role = roleRows[0] || null;
    if (!role || role.guild_id !== guildId) {
      throw createError("Rol no encontrado.", 404);
    }
    if (role.name === "@everyone" || role.name === "Owner") {
      throw createError("Ese rol del sistema no se puede editar desde este panel.", 403);
    }

    const storedName = buildStoredRoleName({ icon, iconUrl, name });
    if (!storedName) {
      throw createError("El rol necesita un nombre.", 400);
    }

    const normalizedName = splitStoredRoleName(storedName).name.toLowerCase();
    const existingRoles = await expectData(
      this.client.from("roles").select(ROLE_PERMISSION_SELECT).eq("guild_id", guildId)
    );
    const duplicateRole = existingRoles.find((item) => {
      if (item.id === role.id) {
        return false;
      }

      return splitStoredRoleName(item.name).name.toLowerCase() === normalizedName;
    });
    if (duplicateRole) {
      throw createError("Ya existe un rol con ese nombre.", 400);
    }

    const rows = await expectData(
      this.client
        .from("roles")
        .update({
          color: normalizeProfileColor(color, role.color || "#9AA4B2"),
          name: storedName,
          permissions: Number(permissions || 0)
        })
        .eq("id", role.id)
        .select("*")
    );
    const guildMembers = await expectData(
      this.client.from("guild_members").select("role_ids").eq("guild_id", guildId)
    );
    return decorateGuildRole(rows[0] || role, guildMembers);
  }
,
  async updateGuildMemberRole({ guildId, roleId = null, targetUserId, userId }) {
    const guildRows = await expectData(
      this.client.from("guilds").select("id,owner_id").eq("id", guildId).limit(1)
    );
    const guild = guildRows[0] || null;
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_ROLES) !== PERMISSIONS.MANAGE_ROLES) {
      throw createError("No tienes permisos para asignar roles en este servidor.", 403);
    }
    if (targetUserId === guild.owner_id) {
      throw createError("No puedes cambiar el rol del owner desde este panel.", 403);
    }

    const membershipRows = await expectData(
      this.client
        .from("guild_members")
        .select("guild_id,user_id,role_ids")
        .eq("guild_id", guildId)
        .eq("user_id", targetUserId)
        .limit(1)
    );
    const membership = membershipRows[0] || null;
    if (!membership) {
      throw createError("Ese miembro ya no pertenece a este servidor.", 404);
    }

    const roleRows = await expectData(
      this.client.from("roles").select(ROLE_PERMISSION_SELECT).eq("guild_id", guildId)
    );
    const everyoneRole = roleRows.find((role) => role.name === "@everyone");
    const nextRoleIds = everyoneRole ? [everyoneRole.id] : [];

    if (roleId) {
      const targetRole = roleRows.find((role) => role.id === roleId);
      if (!targetRole) {
        throw createError("El rol seleccionado no existe.", 404);
      }
      if (targetRole.name === "@everyone" || targetRole.name === "Owner") {
        throw createError("Ese rol no se puede asignar desde este panel.", 400);
      }
      nextRoleIds.push(targetRole.id);
    }

    await expectData(
      this.client
        .from("guild_members")
        .update({
          role_ids: nextRoleIds
        })
        .eq("guild_id", guildId)
        .eq("user_id", targetUserId)
    );

    return {
      guild_id: guildId,
      role_ids: nextRoleIds,
      user_id: targetUserId
    };
  }
,
  async transferGuildOwnership({ guildId, targetUserId, userId }) {
    const [guildRows, targetMembershipRows, allMembers, roles] = await Promise.all([
      expectData(this.client.from("guilds").select("id,owner_id").eq("id", guildId).limit(1)),
      expectData(
        this.client
          .from("guild_members")
          .select("guild_id,user_id,role_ids")
          .eq("guild_id", guildId)
          .eq("user_id", targetUserId)
          .limit(1)
      ),
      expectData(
        this.client
          .from("guild_members")
          .select("guild_id,user_id,role_ids")
          .eq("guild_id", guildId)
      ),
      expectData(this.client.from("roles").select("id,name").eq("guild_id", guildId))
    ]);

    const guild = guildRows[0] || null;
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

    const targetMembership = targetMembershipRows[0] || null;
    if (!targetMembership) {
      throw createError("Ese miembro ya no pertenece a este servidor.", 404);
    }

    const ownerRole = roles.find((role) => role.name === "Owner") || null;
    const everyoneRole = roles.find((role) => role.name === "@everyone") || null;
    const affectedUserIds = [...new Set(allMembers.map((member) => member.user_id).filter(Boolean))];

    await expectData(
      this.client
        .from("guilds")
        .update({
          owner_id: targetUserId,
          updated_at: new Date().toISOString()
        })
        .eq("id", guildId)
    );

    if (ownerRole?.id) {
      await Promise.all(
        allMembers.map((member) => {
          const nextRoleIds = new Set(Array.isArray(member.role_ids) ? member.role_ids : []);
          nextRoleIds.delete(ownerRole.id);

          if (member.user_id === targetUserId) {
            nextRoleIds.add(ownerRole.id);
            if (everyoneRole?.id) {
              nextRoleIds.add(everyoneRole.id);
            }
          }

          return expectData(
            this.client
              .from("guild_members")
              .update({
                role_ids: [...nextRoleIds]
              })
              .eq("guild_id", guildId)
              .eq("user_id", member.user_id)
          );
        })
      );
    }

    return {
      affected_user_ids: affectedUserIds,
      guild_id: guildId,
      transferred_owner_id: targetUserId
    };
  }
,
  async listGuildInvites({ guildId, userId }) {
    const guildRows = await expectData(
      this.client.from("guilds").select(GUILD_PERMISSION_SELECT).eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
    if ((permissionBits & PERMISSIONS.MANAGE_GUILD) !== PERMISSIONS.MANAGE_GUILD) {
      throw createError("No tienes permisos para ver las invitaciones del servidor.", 403);
    }

    const invites = await expectData(
      this.client
        .from("invites")
        .select("*")
        .eq("guild_id", guildId)
        .order("created_at", { ascending: false })
    );

    const creatorIds = [...new Set(invites.map((invite) => invite.creator_id).filter(Boolean))];
    const creators = creatorIds.length
      ? await expectData(
          this.client
            .from("profiles")
            .select("id,username,avatar_url")
            .in("id", creatorIds)
        )
      : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

    return invites.map((invite) => {
      const creator = creatorById.get(invite.creator_id);
      return {
        ...invite,
        creator_name: creator?.username || "Umbra",
        creator_avatar_url: creator?.avatar_url || ""
      };
    });
  }
};
