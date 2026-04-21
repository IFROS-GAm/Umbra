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

function isMissingChannelIconColumnError(error) {
  const cause = error?.cause || error;
  const haystack = [
    error?.message,
    cause?.message,
    cause?.hint,
    cause?.details
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  return (
    (haystack.includes("schema cache") ||
      haystack.includes("could not find the column") ||
      (haystack.includes("column") && haystack.includes("does not exist"))) &&
    haystack.includes("icon_url") &&
    haystack.includes("channels")
  );
}

export const supabaseStoreRuntimeInviteDmMethods = {
  async createInvite({ guildId, userId }) {
    const guildRows = await expectData(
      this.client.from("guilds").select("*").eq("id", guildId).limit(1)
    );
    if (!guildRows[0]) {
      throw createError("Servidor no encontrado.", 404);
    }

    const permissionBits = await this.getPermissionBits(guildId, userId);
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

    await expectData(this.client.from("invites").insert(invite));
    return invite;
  }
,
  async getInviteByCode({ code, userId = null }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const inviteRows = await expectData(
      this.client.from("invites").select("*").eq("code", normalizedCode).limit(1)
    );
    const invite = inviteRows[0] || null;
    assertInviteUsable(invite);

    const [guildRows, guildMembers, channels] = await Promise.all([
      expectData(this.client.from("guilds").select("*").eq("id", invite.guild_id).limit(1)),
      expectData(this.client.from("guild_members").select("*").eq("guild_id", invite.guild_id)),
      expectData(
        this.client
          .from("channels")
          .select("id,guild_id,type,name,position,parent_id")
          .eq("guild_id", invite.guild_id)
      )
    ]);

    const guild = guildRows[0] || null;
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const memberIds = [...new Set(guildMembers.map((membership) => membership.user_id))];
    const profiles = memberIds.length
      ? await expectData(
          this.client
            .from("profiles")
            .select("id,status")
            .in("id", memberIds)
        )
      : [];

    return buildInvitePreview({
      channels,
      guild,
      guildMembers,
      invite,
      profiles,
      userId
    });
  }
,
  async acceptInvite({ code, userId }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const inviteRows = await expectData(
      this.client.from("invites").select("*").eq("code", normalizedCode).limit(1)
    );
    const invite = inviteRows[0] || null;
    assertInviteUsable(invite);

    const [guildRows, guildMembers, channels, roles] = await Promise.all([
      expectData(this.client.from("guilds").select("*").eq("id", invite.guild_id).limit(1)),
      expectData(this.client.from("guild_members").select("*").eq("guild_id", invite.guild_id)),
      expectData(this.client.from("channels").select("*").eq("guild_id", invite.guild_id)),
      expectData(this.client.from("roles").select("*").eq("guild_id", invite.guild_id))
    ]);

    const guild = guildRows[0] || null;
    if (!guild) {
      throw createError("Servidor no encontrado.", 404);
    }

    const activeBan = await this.getActiveGuildBan(guild.id, userId);
    if (activeBan) {
      throw createError(buildGuildBanMessage(activeBan), 403);
    }

    const defaultChannel = getDefaultGuildChannel(channels, guild.id);
    const alreadyJoined = guildMembers.some((membership) => membership.user_id === userId);

    if (!alreadyJoined) {
      const everyoneRole = roles.find((role) => role.name === "@everyone");
      const joinedAt = new Date().toISOString();
      const nextPosition = await this.getNextGuildMembershipPosition(userId);

      await expectData(
        this.client.from("guild_members").insert({
          guild_id: guild.id,
          user_id: userId,
          position: nextPosition,
          role_ids: everyoneRole ? [everyoneRole.id] : [],
          nickname: "",
          joined_at: joinedAt
        })
      );

      const membershipRows = channels
        .filter((channel) => channel.type !== CHANNEL_TYPES.CATEGORY)
        .map((channel) => ({
          channel_id: channel.id,
          user_id: userId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: joinedAt
        }));

      if (membershipRows.length) {
        await expectData(
          this.client.from("channel_members").upsert(membershipRows, {
            onConflict: "channel_id,user_id"
          })
        );
      }

      await expectData(
        this.client
          .from("invites")
          .update({
            uses: Number(invite.uses || 0) + 1
          })
          .eq("id", invite.id)
      );
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
  async createOrGetDm({ ownerId, recipientId }) {
    if (ownerId === recipientId) {
      throw createError("No puedes abrir un DM contigo mismo.", 400);
    }

    const dmKey = buildDirectDmKey(ownerId, recipientId);
    this.dmLocks = this.dmLocks || new Map();
    const existingLock = this.dmLocks.get(dmKey);
    if (existingLock) {
      return existingLock;
    }

    const task = (async () => {
      const recipient = await this.getProfileById(recipientId);
      if (!recipient) {
        throw createError("Destinatario no encontrado.", 404);
      }

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
          const ownerMembership = candidateMemberships.find(
            (item) => item.channel_id === exact.id && item.user_id === ownerId
          );

          await expectData(
            this.client
              .from("channel_members")
              .upsert(
                {
                  channel_id: exact.id,
                  user_id: ownerId,
                  hidden: false,
                  joined_at: ownerMembership?.joined_at || new Date().toISOString(),
                  last_read_at: ownerMembership?.last_read_at || null,
                  last_read_message_id: ownerMembership?.last_read_message_id || null
                },
                { onConflict: "channel_id,user_id" }
              )
          );
          return exact;
        }
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
    const channel = await this.getChannel(channelId);
    if (!channel || ![CHANNEL_TYPES.DM, CHANNEL_TYPES.GROUP_DM].includes(channel.type)) {
      throw createError("Conversacion no encontrada.", 404);
    }

    const membershipRows = await expectData(
      this.client
        .from("channel_members")
        .select("*")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .limit(1)
    );
    const membership = membershipRows[0] || null;

    if (!membership) {
      throw createError("No puedes cambiar esta conversacion.", 403);
    }

    await expectData(
      this.client
        .from("channel_members")
        .update({
          hidden: Boolean(hidden)
        })
        .eq("channel_id", channelId)
        .eq("user_id", userId)
    );

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
      throw createError("Selecciona al menos dos amigos para crear el grupo.", 400);
    }

    if (uniqueRecipientIds.length > maxRecipients) {
      throw createError("Un grupo directo admite maximo 10 personas contando contigo.", 400);
    }

    const participantIds = [ownerId, ...uniqueRecipientIds];
    const profiles = await expectData(
      this.client.from("profiles").select("id").in("id", participantIds)
    );

    if (profiles.length !== participantIds.length) {
      throw createError("Una de las personas seleccionadas ya no esta disponible.", 400);
    }

    await Promise.all(
      uniqueRecipientIds.map(async (recipientId) => {
        const [leftId, rightId] = buildFriendshipPair(ownerId, recipientId);
        const friendshipRows = await expectData(
          this.client
            .from("friendships")
            .select("user_id, friend_id")
            .eq("user_id", leftId)
            .eq("friend_id", rightId)
            .limit(1)
        );

        if (!friendshipRows[0]) {
          throw createError("Solo puedes crear grupos directos con amistades activas.", 403);
        }
      })
    );

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

    try {
      await expectData(this.client.from("channels").insert(channel));
    } catch (error) {
      if (!isMissingChannelIconColumnError(error)) {
        throw error;
      }

      const { icon_url: _ignoredIconUrl, ...fallbackChannel } = channel;
      await expectData(this.client.from("channels").insert(fallbackChannel));
      channel.icon_url = "";
    }

    await expectData(
      this.client.from("channel_members").insert(
        participantIds.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          last_read_message_id: null,
          last_read_at: null,
          hidden: false,
          joined_at: now
        }))
      )
    );

    return channel;
  }
};
