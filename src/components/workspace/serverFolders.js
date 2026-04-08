function normalizeFolderName(name = "", guilds = []) {
  const trimmed = String(name || "").trim();
  if (trimmed) {
    return trimmed.slice(0, 24);
  }

  const firstGuild = guilds[0];
  if (firstGuild?.name) {
    return firstGuild.name.slice(0, 24);
  }

  return "Carpeta";
}

export function sanitizeServerFolders(folders = [], guilds = []) {
  const guildIds = new Set(guilds.map((guild) => guild.id));
  const assignedGuildIds = new Set();

  return folders
    .map((folder) => {
      const filteredGuildIds = (folder.guildIds || []).filter((guildId) => {
        if (!guildIds.has(guildId) || assignedGuildIds.has(guildId)) {
          return false;
        }

        assignedGuildIds.add(guildId);
        return true;
      });

      if (!filteredGuildIds.length) {
        return null;
      }

      const folderGuilds = guilds.filter((guild) => filteredGuildIds.includes(guild.id));

      return {
        collapsed: Boolean(folder.collapsed),
        guildIds: filteredGuildIds,
        id: folder.id || `folder-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizeFolderName(folder.name, folderGuilds)
      };
    })
    .filter(Boolean);
}

export function findServerFolderByGuildId(folders = [], guildId) {
  return folders.find((folder) => (folder.guildIds || []).includes(guildId)) || null;
}

export function toggleServerFolder(folders = [], folderId) {
  return folders.map((folder) =>
    folder.id === folderId
      ? {
          ...folder,
          collapsed: !folder.collapsed
        }
      : folder
  );
}

export function removeGuildFromFolders(folders = [], guildId) {
  return folders
    .map((folder) => ({
      ...folder,
      guildIds: (folder.guildIds || []).filter((id) => id !== guildId)
    }))
    .filter((folder) => folder.guildIds.length);
}

export function reorderGuildList(
  guilds = [],
  { guildId, placement = "after", relativeToGuildId = null } = {}
) {
  const draggedGuild = guilds.find((guild) => guild.id === guildId);
  if (!draggedGuild) {
    return guilds;
  }

  const remainingGuilds = guilds.filter((guild) => guild.id !== guildId);
  let insertIndex = remainingGuilds.length;

  if (relativeToGuildId) {
    const referenceIndex = remainingGuilds.findIndex((guild) => guild.id === relativeToGuildId);

    if (referenceIndex >= 0) {
      insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
    }
  }

  const reorderedGuilds = [...remainingGuilds];
  reorderedGuilds.splice(insertIndex, 0, draggedGuild);

  return reorderedGuilds.map((guild, index) =>
    Number(guild.position ?? index) === index
      ? guild
      : {
          ...guild,
          position: index
        }
  );
}

export function ensureGuildInsideFolder(
  folders = [],
  guilds = [],
  { guildId, targetFolderId, targetGuildId = null, placement = "after" }
) {
  return sanitizeServerFolders(
    folders.map((folder) => {
      if (folder.id !== targetFolderId) {
        return {
          ...folder,
          guildIds: (folder.guildIds || []).filter((id) => id !== guildId)
        };
      }

      const nextGuildIds = (folder.guildIds || []).filter((id) => id !== guildId);
      let insertIndex = nextGuildIds.length;

      if (targetGuildId) {
        const targetIndex = nextGuildIds.indexOf(targetGuildId);
        if (targetIndex >= 0) {
          insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
        }
      }

      nextGuildIds.splice(insertIndex, 0, guildId);

      return {
        ...folder,
        guildIds: nextGuildIds
      };
    }),
    guilds
  );
}

export function createServerFolderFromGuilds(folders = [], guilds = [], draggedGuildId, targetGuildId) {
  const sourceFolders = removeGuildFromFolders(
    removeGuildFromFolders(folders, draggedGuildId),
    targetGuildId
  );
  const guildById = new Map(guilds.map((guild) => [guild.id, guild]));
  const folderGuilds = [guildById.get(targetGuildId), guildById.get(draggedGuildId)].filter(Boolean);

  return sanitizeServerFolders(
    [
      ...sourceFolders,
      {
        collapsed: false,
        guildIds: [targetGuildId, draggedGuildId],
        id: `folder-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizeFolderName("", folderGuilds)
      }
    ],
    guilds
  );
}

export function applyServerFolderAction(
  folders = [],
  guilds = [],
  { guildId, nextFolderAction = null } = {}
) {
  if (!guildId || !nextFolderAction) {
    return folders;
  }

  if (nextFolderAction.type === "assign") {
    return ensureGuildInsideFolder(folders, guilds, {
      guildId,
      placement: nextFolderAction.placement || "after",
      targetFolderId: nextFolderAction.folderId,
      targetGuildId: nextFolderAction.targetGuildId || null
    });
  }

  if (nextFolderAction.type === "create") {
    return createServerFolderFromGuilds(
      folders,
      guilds,
      guildId,
      nextFolderAction.targetGuildId
    );
  }

  if (nextFolderAction.type === "remove") {
    return removeGuildFromFolders(folders, guildId);
  }

  return folders;
}

export function buildServerRailItems(guilds = [], folders = []) {
  const sanitizedFolders = sanitizeServerFolders(folders, guilds);
  const folderByGuildId = new Map();
  const guildById = new Map(guilds.map((guild) => [guild.id, guild]));

  sanitizedFolders.forEach((folder) => {
    folder.guildIds.forEach((guildId) => {
      folderByGuildId.set(guildId, folder);
    });
  });

  const emittedFolders = new Set();

  return guilds.reduce((items, guild) => {
    const folder = folderByGuildId.get(guild.id);
    if (!folder) {
      items.push({
        type: "guild",
        guild
      });
      return items;
    }

    if (emittedFolders.has(folder.id)) {
      return items;
    }

    emittedFolders.add(folder.id);
    items.push({
      type: "folder",
      folder: {
        ...folder,
        guilds: folder.guildIds.map((guildId) => guildById.get(guildId)).filter(Boolean)
      }
    });
    return items;
  }, []);
}
