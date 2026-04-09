export const COMPOSER_SHORTCUTS = [
  {
    id: "upload",
    icon: "upload",
    label: "Subir un archivo",
    description: "Adjunta varias imagenes o archivos ligeros al mensaje actual."
  },
  {
    id: "thread",
    icon: "threads",
    label: "Crear hilo",
    description: "Hilos y vistas anidadas quedan para la siguiente capa del chat."
  },
  {
    id: "poll",
    icon: "mission",
    label: "Crear encuesta",
    description: "Las encuestas todavia no estan en backend."
  },
  {
    id: "apps",
    icon: "appGrid",
    label: "Usar aplicaciones",
    description: "Reserva visual para slash commands e integraciones."
  }
];

export const PICKER_CONTENT = {
  gif: {
    title: "GIFs",
    subtitle: "Atajos ligeros para insertar energia rapida en el composer.",
    items: ["Loop", "Wave", "Glow", "Pulse", "Orbit", "Drift"]
  },
  sticker: {
    title: "Stickers",
    subtitle: "Panel visual inspirado en Discord con respuestas rapidas.",
    items: ["Wave", "Nova", "Blink", "Pulse", "Ghost", "Echo"]
  },
  emoji: {
    title: "Emojis",
    subtitle: "Reacciones rapidas listas para insertar en un mensaje.",
    items: ["😀", "🔥", "❤️", "⚡", "🎯", "✨", "🚀", "👀", "👏", "🌙", "🫶", "🖤"]
  }
};

export const MESSAGE_TOOLBAR_REACTIONS = ["❤️", "✅", "🔞", "💀"];

export const HOME_LINKS = [
  {
    id: "home",
    icon: "friends",
    label: "Amigos",
    notice: null
  },
  {
    id: "requests",
    icon: "mail",
    label: "Solicitudes de mensajes",
    notice: null
  }
];

export const CHANNEL_CACHE_TTL_MS = 60_000;

export function isVisibleStatus(status) {
  return status && status !== "offline" && status !== "invisible";
}

export function buildMemberGroups(members = []) {
  const online = members.filter((member) => isVisibleStatus(member.status));
  const offline = members.filter((member) => !isVisibleStatus(member.status));

  return [
    {
      id: "online",
      label: `En linea - ${online.length}`,
      members: online
    },
    {
      id: "offline",
      label: `Sin conexion - ${offline.length}`,
      members: offline
    }
  ].filter((group) => group.members.length > 0);
}

export function renderHeaderCopy(activeChannel, kind) {
  if (kind === "guild") {
    if (activeChannel?.is_voice) {
      return {
        eyebrow: "Canal de voz",
        title: activeChannel?.name || "Lounge",
        description: activeChannel?.topic || "Canal de voz listo para entrar con el equipo."
      };
    }

    return {
      eyebrow: "Canal",
      title: `# ${activeChannel?.name || "general"}`,
      description: activeChannel?.topic || "Sin descripcion todavia."
    };
  }

  return {
    eyebrow: "Conversacion",
    title: activeChannel?.display_name || "Mensajes directos",
    description: activeChannel?.topic || "Abre conversaciones 1 a 1 o grupos pequenos."
  };
}

export function getDmSummary(dm, currentUserId) {
  if (!dm) {
    return "Sin mensajes todavia";
  }

  if (dm.type === "group_dm") {
    return `${dm.participants?.length || 0} miembros`;
  }

  const other = dm.participants?.find((participant) => participant.id !== currentUserId);
  return other?.custom_status || dm.last_message_preview || "Sin mensajes todavia";
}

export function findDirectDmByUserId(dms = [], currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId) {
    return null;
  }

  return (
    dms.find((dm) => {
      if (dm?.type !== "dm") {
        return false;
      }

      const participants = (dm.participants || []).map((participant) => participant.id).filter(Boolean);
      if (participants.length !== 2) {
        return false;
      }

      return participants.includes(currentUserId) && participants.includes(targetUserId);
    }) || null
  );
}

export function isImageAttachment(attachment) {
  return Boolean(attachment?.content_type?.startsWith("image/"));
}

export function attachmentKey(attachment) {
  return attachment.path || attachment.url || attachment.name;
}

export function formatVoiceCount(count) {
  return String(count).padStart(2, "0");
}

export function buildVoiceStageTone(hue = 220) {
  return {
    background: `radial-gradient(circle at 30% 20%, hsla(${hue} 38% 82% / 0.18), transparent 34%), linear-gradient(135deg, hsl(${(hue + 20) % 360} 16% 18%), hsl(${(hue + 56) % 360} 18% 11%))`
  };
}

export function fallbackDeviceLabel(kind, index) {
  switch (kind) {
    case "audioinput":
      return `Microfono ${index + 1}`;
    case "audiooutput":
      return `Altavoces ${index + 1}`;
    case "videoinput":
      return `Camara ${index + 1}`;
    default:
      return `Dispositivo ${index + 1}`;
  }
}

function messageIdentity(message) {
  if (!message) {
    return "";
  }

  return String(message.id || message.client_nonce || "");
}

export function isChannelCacheFresh(entry, ttl = CHANNEL_CACHE_TTL_MS) {
  if (!entry?.fetchedAt) {
    return false;
  }

  return Date.now() - Number(entry.fetchedAt) < ttl;
}

export function mergeChannelMessages(existing = [], incoming = [], { prepend = false } = {}) {
  const ordered = prepend ? [...incoming, ...existing] : [...existing, ...incoming];
  const result = [];
  const indexById = new Map();
  const indexByNonce = new Map();

  ordered.forEach((message) => {
    const existingIndex =
      (message?.id ? indexById.get(String(message.id)) : undefined) ??
      (message?.client_nonce ? indexByNonce.get(String(message.client_nonce)) : undefined);

    if (existingIndex !== undefined) {
      const nextMessage = {
        ...result[existingIndex],
        ...message
      };
      result[existingIndex] = nextMessage;

      if (nextMessage.id) {
        indexById.set(String(nextMessage.id), existingIndex);
      }

      if (nextMessage.client_nonce) {
        indexByNonce.set(String(nextMessage.client_nonce), existingIndex);
      }

      return;
    }

    const nextIndex = result.length;
    result.push(message);

    if (message?.id) {
      indexById.set(String(message.id), nextIndex);
    }

    if (message?.client_nonce) {
      indexByNonce.set(String(message.client_nonce), nextIndex);
    }
  });

  return result;
}

export function upsertChannelMessage(messages = [], message) {
  return mergeChannelMessages(messages, [message]);
}

export function removeChannelMessage(messages = [], messageId) {
  const targetId = String(messageId || "");
  return messages.filter((message) => messageIdentity(message) !== targetId);
}

export function toggleReactionBucket(messages = [], { emoji, messageId, userId }) {
  const targetId = String(messageId || "");

  return messages.map((message) => {
    if (String(message.id || "") !== targetId) {
      return message;
    }

    const buckets = [...(message.reactions || [])];
    const index = buckets.findIndex((reaction) => reaction.emoji === emoji);

    if (index === -1) {
      return {
        ...message,
        reactions: [...buckets, { emoji, count: 1, selected: true }]
      };
    }

    const current = buckets[index];
    const nextSelected = !current.selected;
    const nextCount = Math.max(0, Number(current.count || 0) + (nextSelected ? 1 : -1));

    if (!nextCount) {
      return {
        ...message,
        reactions: buckets.filter((reaction) => reaction.emoji !== emoji)
      };
    }

    buckets[index] = {
      ...current,
      count: nextCount,
      selected: userId ? nextSelected : current.selected
    };

    return {
      ...message,
      reactions: buckets
    };
  });
}

export function listLikelyChannelIds(workspace, activeSelection, limit = 6) {
  if (!workspace) {
    return [];
  }

  const sortByRecent = (left, right) => {
    const leftUnread = Number(left.unread_count || 0);
    const rightUnread = Number(right.unread_count || 0);
    if (leftUnread !== rightUnread) {
      return rightUnread - leftUnread;
    }

    const leftTime = left.last_message_at ? new Date(left.last_message_at).getTime() : 0;
    const rightTime = right.last_message_at ? new Date(right.last_message_at).getTime() : 0;
    return rightTime - leftTime;
  };

  const guildCandidates =
    workspace.guilds
      .flatMap((guild) => guild.channels || [])
      .filter(
        (channel) =>
          !channel.is_voice &&
          !channel.is_category &&
          channel.id !== activeSelection.channelId &&
          (!activeSelection.guildId || channel.guild_id === activeSelection.guildId)
      )
      .sort(sortByRecent)
      .slice(0, 4) || [];

  const dmCandidates =
    [...(workspace.dms || [])]
      .filter((dm) => dm.id !== activeSelection.channelId)
      .sort(sortByRecent)
      .slice(0, 3) || [];

  return [...guildCandidates, ...dmCandidates]
    .map((channel) => channel.id)
    .filter(Boolean)
    .slice(0, limit);
}

export function resolveGuildIcon(guild) {
  return guild?.icon_url || guild?.image_url || guild?.avatar_url || "";
}

function sortChannelsByPosition(channels = []) {
  return [...channels].sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
}

export function buildGuildStructureEntries(guild) {
  if (!guild?.channels?.length) {
    return [];
  }

  const allChannels = sortChannelsByPosition(guild.channels);
  const childChannelsByParent = new Map();

  allChannels
    .filter((channel) => channel.parent_id)
    .forEach((channel) => {
      const current = childChannelsByParent.get(channel.parent_id) || [];
      current.push(channel);
      childChannelsByParent.set(channel.parent_id, current);
    });

  return allChannels
    .filter((channel) => !channel.parent_id)
    .map((channel) => {
      if (channel.is_category) {
        return {
          id: channel.id,
          type: "category",
          category: channel,
          channels: sortChannelsByPosition(childChannelsByParent.get(channel.id) || [])
        };
      }

      return {
        id: channel.id,
        type: "channel",
        channel
      };
    });
}

function resolveLatestReadAt(...candidates) {
  let latest = null;
  let latestTime = 0;

  candidates.forEach((candidate) => {
    if (!candidate) {
      return;
    }

    const time = new Date(candidate).getTime();
    if (!Number.isFinite(time) || time < latestTime) {
      return;
    }

    latest = candidate;
    latestTime = time;
  });

  return latest;
}

function computeChannelUnread(channel, currentUserId, lastReadAt = channel?.last_read_at, { forceRead = false } = {}) {
  if (
    !channel?.last_message_at ||
    channel.last_message_author_id === currentUserId ||
    channel.is_voice
  ) {
    return 0;
  }

  if (forceRead) {
    return 0;
  }

  const lastReadTime = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  const lastMessageTime = new Date(channel.last_message_at).getTime();
  return lastReadTime < lastMessageTime ? 1 : 0;
}

function applyReadStateToChannel(channel, currentUserId, localReadState = null, { forceRead = false } = {}) {
  const localLastReadAt = localReadState?.lastReadAt || localReadState || null;
  const nextLastReadAt = resolveLatestReadAt(
    channel.last_read_at,
    localLastReadAt,
    forceRead ? channel.last_message_at : null
  );

  return {
    ...channel,
    last_read_at: nextLastReadAt,
    unread_count: computeChannelUnread(channel, currentUserId, nextLastReadAt, {
      forceRead
    })
  };
}

function sortDmsByRecent(dms = []) {
  return [...dms].sort((a, b) => {
    const aDate = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bDate = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bDate - aDate;
  });
}

export function applyChannelPreviewToWorkspace(
  workspace,
  preview,
  { localReadStateByChannel = null, openChannelId = null } = {}
) {
  if (!workspace || !preview?.id) {
    return workspace;
  }

  const currentUserId = workspace.current_user?.id;
  let changed = false;

  const guilds = workspace.guilds.map((guild) => {
    let guildTouched = false;
    const channels = guild.channels.map((channel) => {
      if (channel.id !== preview.id) {
        return channel;
      }

      guildTouched = true;
      changed = true;
      const mergedChannel = {
        ...channel,
        ...preview
      };
      const localReadState = localReadStateByChannel?.get?.(mergedChannel.id) || null;

      return applyReadStateToChannel(mergedChannel, currentUserId, localReadState, {
        forceRead: mergedChannel.id === openChannelId
      });
    });

    if (!guildTouched) {
      return guild;
    }

    return {
      ...guild,
      channels,
      unread_count: channels.reduce(
        (sum, channel) => sum + Number(channel.unread_count || 0),
        0
      )
    };
  });

  const dms = sortDmsByRecent(
    workspace.dms.map((dm) => {
      if (dm.id !== preview.id) {
        return dm;
      }

      changed = true;
      const mergedDm = {
        ...dm,
        ...preview
      };
      const localReadState = localReadStateByChannel?.get?.(mergedDm.id) || null;

      return applyReadStateToChannel(mergedDm, currentUserId, localReadState, {
        forceRead: mergedDm.id === openChannelId
      });
    })
  );

  if (!changed) {
    return workspace;
  }

  return {
    ...workspace,
    guilds,
    dms
  };
}

export function mergeLocalReadStateIntoWorkspace(
  workspace,
  localReadStateByChannel = null,
  openChannelId = null
) {
  if (!workspace) {
    return workspace;
  }

  const currentUserId = workspace.current_user?.id;
  let changed = false;

  const guilds = workspace.guilds.map((guild) => {
    let guildTouched = false;
    const channels = guild.channels.map((channel) => {
      const localReadState = localReadStateByChannel?.get?.(channel.id) || null;
      const forceRead = channel.id === openChannelId;

      if (!localReadState && !forceRead) {
        return channel;
      }

      const nextChannel = applyReadStateToChannel(channel, currentUserId, localReadState, {
        forceRead
      });

      if (
        nextChannel.last_read_at === channel.last_read_at &&
        nextChannel.unread_count === channel.unread_count
      ) {
        return channel;
      }

      changed = true;
      guildTouched = true;
      return nextChannel;
    });

    if (!guildTouched) {
      return guild;
    }

    return {
      ...guild,
      channels,
      unread_count: channels.reduce(
        (sum, channel) => sum + Number(channel.unread_count || 0),
        0
      )
    };
  });

  const dms = sortDmsByRecent(
    workspace.dms.map((dm) => {
      const localReadState = localReadStateByChannel?.get?.(dm.id) || null;
      const forceRead = dm.id === openChannelId;

      if (!localReadState && !forceRead) {
        return dm;
      }

      const nextDm = applyReadStateToChannel(dm, currentUserId, localReadState, {
        forceRead
      });

      if (
        nextDm.last_read_at === dm.last_read_at &&
        nextDm.unread_count === dm.unread_count
      ) {
        return dm;
      }

      changed = true;
      return nextDm;
    })
  );

  if (!changed) {
    return workspace;
  }

  return {
    ...workspace,
    guilds,
    dms
  };
}

export function markChannelReadInWorkspace(workspace, { channelId, lastReadAt }) {
  if (!workspace || !channelId) {
    return workspace;
  }

  let changed = false;

  const guilds = workspace.guilds.map((guild) => {
    let guildTouched = false;
    const channels = guild.channels.map((channel) => {
      if (channel.id !== channelId) {
        return channel;
      }

      guildTouched = true;
      changed = true;
      return {
        ...channel,
        last_read_at: lastReadAt || channel.last_message_at || channel.last_read_at,
        unread_count: 0
      };
    });

    if (!guildTouched) {
      return guild;
    }

    return {
      ...guild,
      channels,
      unread_count: channels.reduce(
        (sum, channel) => sum + Number(channel.unread_count || 0),
        0
      )
    };
  });

  const dms = sortDmsByRecent(
    workspace.dms.map((dm) => {
      if (dm.id !== channelId) {
        return dm;
      }

      changed = true;
      return {
        ...dm,
        last_read_at: lastReadAt || dm.last_message_at || dm.last_read_at,
        unread_count: 0
      };
    })
  );

  if (!changed) {
    return workspace;
  }

  return {
    ...workspace,
    guilds,
    dms
  };
}
