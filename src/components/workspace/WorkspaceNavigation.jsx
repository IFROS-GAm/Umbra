import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";
import { ServerAdminMenu } from "./ServerAdminMenu.jsx";
import { DmContextMenu } from "./DmContextMenu.jsx";
import { ServerContextMenu } from "./ServerContextMenu.jsx";
import {
  HOME_LINKS,
  buildGuildStructureEntries,
  formatVoiceCount,
  getDmSummary,
  resolveGuildIcon
} from "./workspaceHelpers.js";
import { buildServerRailItems, findServerFolderByGuildId } from "./serverFolders.js";

export function WorkspaceNavigation({
  activeGuild,
  activeGuildTextChannels,
  activeGuildVoiceChannels,
  activeSelection,
  currentUserLabel,
  directUnreadCount,
  hoveredVoiceChannelId,
  inputMenuNode,
  outputMenuNode,
  isVoiceChannel,
  joinedVoiceChannel,
  joinedVoiceChannelId,
  onHandleVoiceLeave,
  onOpenDialog,
  onOpenProfileCard,
  onOpenSettings,
  onOpenGuildPrivacy,
  onOpenGuildSettings,
  onOpenInviteModal,
  onCopyGuildId,
  onCloseDm,
  onLeaveGuild,
  onMarkGuildRead,
  onMoveGuild,
  onMoveGuildChannel,
  onSelectDirectLink,
  onSelectGuild,
  onSelectGuildChannel,
  onSelectHome,
  onSetHoveredVoiceChannelId,
  onShowNotice,
  onToggleVoiceMenu,
  onToggleVoiceState,
  voiceMenu,
  voiceSessions,
  voiceState,
  voiceUsersByChannel,
  guildMenuPrefs,
  dmMenuPrefs,
  onToggleGuildMenuPref,
  onToggleDmMenuPref,
  onToggleServerFolder,
  onUpdateGuildNotificationLevel,
  onMarkDmRead,
  onOpenFullProfile,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRemoveFriend,
  onBlockUser,
  onReportUser,
  onCopyDmId,
  serverFolders,
  workspace
}) {
  const [collapsedSectionIds, setCollapsedSectionIds] = React.useState({});
  const [serverContextMenu, setServerContextMenu] = React.useState(null);
  const [dmContextMenu, setDmContextMenu] = React.useState(null);
  const [draggedGuildId, setDraggedGuildId] = React.useState(null);
  const [guildDropHint, setGuildDropHint] = React.useState(null);
  const [draggedChannelId, setDraggedChannelId] = React.useState(null);
  const [channelDropHint, setChannelDropHint] = React.useState(null);
  const draggedGuildIdRef = React.useRef(null);
  const guildDropHintRef = React.useRef(null);
  const guildPointerDragRef = React.useRef(null);
  const guildDragCleanupRef = React.useRef(null);
  const suppressGuildClickRef = React.useRef(false);
  const draggedChannelIdRef = React.useRef(null);
  const serverDropTargetsRef = React.useRef(new Map());
  const truncatedCurrentUserLabel =
    currentUserLabel.length > 16 ? `${currentUserLabel.slice(0, 13)}...` : currentUserLabel;
  const canManageStructure = Boolean(activeGuild?.permissions?.can_manage_channels);
  const canManageGuild = Boolean(activeGuild?.permissions?.can_manage_guild);
  const guildStructureEntries = buildGuildStructureEntries(activeGuild);
  const categoryEntries = guildStructureEntries.filter((entry) => entry.type === "category");
  const uncategorizedTextChannels = guildStructureEntries
    .filter((entry) => entry.type === "channel" && !entry.channel.is_voice)
    .map((entry) => entry.channel);
  const uncategorizedVoiceChannels = guildStructureEntries
    .filter((entry) => entry.type === "channel" && entry.channel.is_voice)
    .map((entry) => entry.channel);
  const serverRailItems = React.useMemo(
    () => buildServerRailItems(workspace.guilds, serverFolders || []),
    [serverFolders, workspace.guilds]
  );

  function toggleSection(sectionId) {
    setCollapsedSectionIds((previous) => ({
      ...previous,
      [sectionId]: !previous[sectionId]
    }));
  }

  function clearGuildDragState() {
    draggedGuildIdRef.current = null;
    guildDropHintRef.current = null;
    setDraggedGuildId(null);
    setGuildDropHint(null);
  }

  function canDragGuild(guild) {
    return Boolean(guild?.id);
  }

  function getDraggedGuildFolder() {
    return findServerFolderByGuildId(serverFolders || [], draggedGuildIdRef.current) || null;
  }

  function setServerDropTargetNode(kind, id, folderId = null) {
    return (node) => {
      const key = `${kind}:${id}`;
      if (!node) {
        serverDropTargetsRef.current.delete(key);
        return;
      }

      serverDropTargetsRef.current.set(key, {
        folderId: folderId || null,
        id,
        kind,
        node
      });
    };
  }

  function getGuildDropModeByRect(rect, clientY, { allowInto = true } = {}) {
    const y = clientY - rect.top;
    const edgeSize = Math.min(12, Math.max(8, rect.height * 0.2));

    if (y <= edgeSize) {
      return "before";
    }

    if (y >= rect.height - edgeSize) {
      return "after";
    }

    if (!allowInto) {
      return y < rect.height / 2 ? "before" : "after";
    }

    return "into";
  }

  function setGuildDropState(nextHint) {
    guildDropHintRef.current = nextHint;
    setGuildDropHint(nextHint);
  }

  function resolveGuildDropTarget(clientX, clientY) {
    const draggedGuildIdValue = draggedGuildIdRef.current;
    const targets = Array.from(serverDropTargetsRef.current.values())
      .filter((target) => target.node?.isConnected)
      .map((target) => ({
        folderId: target.folderId,
        id: target.id,
        kind: target.kind,
        rect: target.node.getBoundingClientRect()
      }))
      .filter((target) => !(target.kind === "guild" && target.id === draggedGuildIdValue))
      .sort((left, right) => left.rect.top - right.rect.top);

    if (!targets.length) {
      return null;
    }

    const minLeft = Math.min(...targets.map((target) => target.rect.left)) - 20;
    const maxRight = Math.max(...targets.map((target) => target.rect.right)) + 20;
    if (clientX < minLeft || clientX > maxRight) {
      return null;
    }

    const expandedHitTarget = targets.find(
      (target) =>
        clientY >= target.rect.top - 6 &&
        clientY <= target.rect.bottom + 6 &&
        clientX >= target.rect.left - 12 &&
        clientX <= target.rect.right + 12
    );

    if (expandedHitTarget) {
      return {
        folderId: expandedHitTarget.folderId || null,
        placement: getGuildDropModeByRect(expandedHitTarget.rect, clientY),
        targetId: expandedHitTarget.id,
        type: expandedHitTarget.kind
      };
    }

    if (clientY <= targets[0].rect.top) {
      return {
        folderId: targets[0].folderId || null,
        placement: "before",
        targetId: targets[0].id,
        type: targets[0].kind
      };
    }

    const lastTarget = targets.at(-1);
    if (clientY >= lastTarget.rect.bottom) {
      return {
        folderId: lastTarget.folderId || null,
        placement: "after",
        targetId: lastTarget.id,
        type: lastTarget.kind
      };
    }

    const betweenTarget =
      targets.find((target) => clientY < target.rect.top) ||
      lastTarget;

    return {
      folderId: betweenTarget.folderId || null,
      placement: "before",
      targetId: betweenTarget.id,
      type: betweenTarget.kind
    };
  }

  function commitResolvedGuildDrop(dropTarget) {
    const draggedGuildIdValue = draggedGuildIdRef.current;
    if (!draggedGuildIdValue || !dropTarget) {
      return;
    }

    const sourceFolder = getDraggedGuildFolder();

    if (dropTarget.type === "folder") {
      const targetFolder = (serverFolders || []).find((folder) => folder.id === dropTarget.targetId);
      if (!targetFolder?.guilds?.length) {
        return;
      }

      const firstGuild = targetFolder.guilds[0];
      const lastGuild = targetFolder.guilds.at(-1);

      if (dropTarget.placement === "into") {
        void commitGuildMove({
          guildId: draggedGuildIdValue,
          placement: "after",
          relativeToGuildId: lastGuild?.id || firstGuild?.id || null,
          nextFolderAction: {
            type: "assign",
            folderId: targetFolder.id,
            placement: "after",
            targetGuildId: lastGuild?.id || null
          }
        });
        return;
      }

      const relativeToGuildId =
        dropTarget.placement === "before" ? firstGuild?.id : lastGuild?.id;
      void commitGuildMove({
        guildId: draggedGuildIdValue,
        placement: dropTarget.placement,
        relativeToGuildId,
        nextFolderAction:
          sourceFolder?.id && sourceFolder.id !== targetFolder.id
            ? { type: "remove" }
            : sourceFolder?.id === targetFolder.id
              ? { type: "remove" }
              : null
      });
      return;
    }

    if (dropTarget.type !== "guild") {
      return;
    }

    if (dropTarget.placement === "into") {
      if (dropTarget.folderId) {
        void commitGuildMove({
          guildId: draggedGuildIdValue,
          placement: "after",
          relativeToGuildId: dropTarget.targetId,
          nextFolderAction: {
            type: "assign",
            folderId: dropTarget.folderId,
            placement: "after",
            targetGuildId: dropTarget.targetId
          }
        });
        return;
      }

      void commitGuildMove({
        guildId: draggedGuildIdValue,
        placement: "after",
        relativeToGuildId: dropTarget.targetId,
        nextFolderAction: {
          type: "create",
          targetGuildId: dropTarget.targetId
        }
      });
      return;
    }

    void commitGuildMove({
      guildId: draggedGuildIdValue,
      placement: dropTarget.placement,
      relativeToGuildId: dropTarget.targetId,
      nextFolderAction: dropTarget.folderId
        ? {
            type: "assign",
            folderId: dropTarget.folderId,
            placement: dropTarget.placement,
            targetGuildId: dropTarget.targetId
          }
        : sourceFolder
          ? { type: "remove" }
          : null
    });
  }

  function beginGuildPointerDrag(event, guild) {
    if (!canDragGuild(guild) || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (guildDragCleanupRef.current) {
      guildDragCleanupRef.current();
      guildDragCleanupRef.current = null;
    }

    guildPointerDragRef.current = {
      didDrag: false,
      guildId: guild.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };

    const handleMove = (moveEvent) => {
      const dragState = guildPointerDragRef.current;
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) {
        return;
      }

      const distance = Math.hypot(moveEvent.clientX - dragState.startX, moveEvent.clientY - dragState.startY);
      if (!dragState.didDrag && distance < 6) {
        return;
      }

      if (!dragState.didDrag) {
        dragState.didDrag = true;
        draggedGuildIdRef.current = dragState.guildId;
        setDraggedGuildId(dragState.guildId);
        setGuildDropState(null);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      const nextHint = resolveGuildDropTarget(moveEvent.clientX, moveEvent.clientY);
      setGuildDropState(nextHint);
    };

    const handleStop = (upEvent) => {
      const dragState = guildPointerDragRef.current;
      if (
        dragState &&
        upEvent?.type !== "blur" &&
        upEvent?.pointerId !== undefined &&
        upEvent.pointerId !== dragState.pointerId
      ) {
        return;
      }

      guildPointerDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleStop, true);
      window.removeEventListener("pointercancel", handleStop, true);
      window.removeEventListener("blur", handleStop);
      guildDragCleanupRef.current = null;

      if (!dragState?.didDrag) {
        clearGuildDragState();
        return;
      }

      suppressGuildClickRef.current = true;
      window.setTimeout(() => {
        suppressGuildClickRef.current = false;
      }, 0);

      const dropTarget =
        guildDropHintRef.current || resolveGuildDropTarget(upEvent.clientX, upEvent.clientY);
      if (dropTarget) {
        commitResolvedGuildDrop(dropTarget);
        return;
      }

      clearGuildDragState();
    };

    guildDragCleanupRef.current = () => {
      guildPointerDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleStop, true);
      window.removeEventListener("pointercancel", handleStop, true);
      window.removeEventListener("blur", handleStop);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleStop, true);
    window.addEventListener("pointercancel", handleStop, true);
    window.addEventListener("blur", handleStop);
  }

  function commitGuildMove({
    guildId,
    placement = "after",
    relativeToGuildId = null,
    nextFolderAction = null
  }) {
    if (!guildId) {
      clearGuildDragState();
      return;
    }

    try {
      void onMoveGuild?.({
        guildId,
        placement,
        relativeToGuildId,
        nextFolderAction
      });
    } finally {
      clearGuildDragState();
    }
  }

  React.useEffect(
    () => () => {
      if (guildDragCleanupRef.current) {
        guildDragCleanupRef.current();
        guildDragCleanupRef.current = null;
      }
    },
    []
  );

  function handleGuildClick(event, guild) {
    if (suppressGuildClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onSelectGuild(guild);
  }

  function clearChannelDragState() {
    draggedChannelIdRef.current = null;
    setDraggedChannelId(null);
    setChannelDropHint(null);
  }

  function canDragChannel(channel) {
    return Boolean(canManageStructure && activeGuild?.id && channel && !channel.is_category);
  }

  function beginChannelDrag(event, channel) {
    if (!canDragChannel(channel)) {
      return;
    }

    draggedChannelIdRef.current = channel.id;
    setDraggedChannelId(channel.id);
    setChannelDropHint(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", channel.id);
  }

  function allowChannelDrop(event) {
    if (!canManageStructure || !draggedChannelIdRef.current || !activeGuild?.id) {
      return false;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    return true;
  }

  async function commitChannelMove({
    channelId,
    parentId = null,
    placement = "after",
    relativeToChannelId = null
  }) {
    if (!channelId || !activeGuild?.id) {
      clearChannelDragState();
      return;
    }

    try {
      await onMoveGuildChannel?.({
        channelId,
        guildId: activeGuild.id,
        parentId,
        placement,
        relativeToChannelId
      });
    } finally {
      clearChannelDragState();
    }
  }

  function handleChannelDragOver(event, channel) {
    if (!allowChannelDrop(event) || draggedChannelId === channel.id) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setChannelDropHint({
      placement,
      targetId: channel.id,
      type: "channel"
    });
  }

  function handleCategoryDragOver(event, categoryId) {
    if (!allowChannelDrop(event)) {
      return;
    }

    setChannelDropHint({
      placement: "after",
      targetId: categoryId,
      type: "category"
    });
  }

  function handleRootSectionDragOver(event, sectionKey) {
    if (!allowChannelDrop(event)) {
      return;
    }

    setChannelDropHint({
      placement: "after",
      targetId: sectionKey,
      type: "root"
    });
  }

  function handleCategoryDrop(event, categoryId, categoryChannels = []) {
    if (!allowChannelDrop(event)) {
      return;
    }

    const referenceChannel =
      categoryChannels.filter((channel) => channel.id !== draggedChannelIdRef.current).at(-1) || null;
    void commitChannelMove({
      channelId: draggedChannelIdRef.current,
      parentId: categoryId,
      placement: "after",
      relativeToChannelId: referenceChannel?.id || null
    });
  }

  function handleRootSectionDrop(event, kind) {
    if (!allowChannelDrop(event)) {
      return;
    }

    const rootChannels = (
      kind === "voice" ? uncategorizedVoiceChannels : uncategorizedTextChannels
    ).filter((channel) => channel.id !== draggedChannelIdRef.current);
    const referenceChannel = rootChannels.at(-1) || null;

    void commitChannelMove({
      channelId: draggedChannelIdRef.current,
      parentId: null,
      placement: "after",
      relativeToChannelId: referenceChannel?.id || null
    });
  }

  function handleChannelDrop(event, channel) {
    if (!allowChannelDrop(event) || draggedChannelId === channel.id) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    void commitChannelMove({
      channelId: draggedChannelIdRef.current,
      parentId: channel.parent_id || null,
      placement,
      relativeToChannelId: channel.id
    });
  }

  const serverContextGuild =
    workspace.guilds.find((guild) => guild.id === serverContextMenu?.guildId) || null;
  const serverContextPrefs = serverContextGuild
    ? guildMenuPrefs?.[serverContextGuild.id] || {
        hideMutedChannels: false,
        notificationLevel: "mentions",
        showAllChannels: true
      }
    : null;
  const dmContextChannel =
    workspace.dms.find((dm) => dm.id === dmContextMenu?.channelId) || null;
  const dmContextPrefs = dmContextChannel
    ? dmMenuPrefs?.[dmContextChannel.id] || {
        muted: false
      }
    : null;

  function buildDmContextProfile(dm) {
    if (!dm || dm.type !== "dm") {
      return null;
    }

    const other =
      dm.participants?.find((participant) => participant.id !== workspace.current_user.id) || null;

    if (!other) {
      return null;
    }

    const friendRequestSent =
      (workspace.friend_requests_sent || []).find(
        (request) => (request.user?.id || request.recipient_id) === other.id
      ) || null;
    const friendRequestReceived =
      (workspace.friend_requests_received || []).find(
        (request) => (request.user?.id || request.requester_id) === other.id
      ) || null;

    return {
      ...other,
      avatarHue: other.avatar_hue || 210,
      avatarUrl: other.avatar_url || "",
      displayName: other.display_name || other.username || "Umbra user",
      friendRequestId: friendRequestReceived?.id || friendRequestSent?.id || null,
      friendRequestState: friendRequestReceived
        ? "received"
        : friendRequestSent
          ? "sent"
          : null,
      isBlockedByMe: (workspace.blocked_users || []).some((user) => user.id === other.id),
      isCurrentUser: workspace.current_user.id === other.id,
      isFriend: (workspace.friends || []).some((friend) => friend.id === other.id),
      username: other.username || "umbra_user"
    };
  }

  const dmContextProfile = dmContextChannel ? buildDmContextProfile(dmContextChannel) : null;

  function openDmContextMenu(event, dm) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDmContextMenu({
      anchorRect: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      },
      channelId: dm.id,
      x: rect.right + 6,
      y: rect.top - 6
    });
  }

  function renderTextChannelRow(channel, { nested = false } = {}) {
    return (
      <button
        className={`channel-row ${nested ? "nested" : ""} ${
          activeSelection.channelId === channel.id ? "active" : ""
        } ${channel.unread_count ? "has-unread" : "is-read"} ${
          draggedChannelId === channel.id ? "dragging" : ""
        } ${
          channelDropHint?.type === "channel" && channelDropHint.targetId === channel.id
            ? `drop-${channelDropHint.placement}`
            : ""
        }`.trim()}
        draggable={canDragChannel(channel)}
        onDragEnd={clearChannelDragState}
        onDragOver={(event) => handleChannelDragOver(event, channel)}
        onDragStart={(event) => beginChannelDrag(event, channel)}
        onDrop={(event) => handleChannelDrop(event, channel)}
        key={channel.id}
        onClick={() => onSelectGuildChannel(channel)}
        type="button"
      >
        <span className="channel-label">
          <Icon name="channel" size={16} />
          <span>{channel.name}</span>
        </span>
        {channel.unread_count ? <b>Nuevo</b> : null}
      </button>
    );
  }

  function renderVoiceChannel(channel, { nested = false } = {}) {
    return (
      <div
        className={`voice-channel-block ${nested ? "nested" : ""}`.trim()}
        key={channel.id}
        onMouseEnter={() => onSetHoveredVoiceChannelId(channel.id)}
        onMouseLeave={() =>
          onSetHoveredVoiceChannelId((previous) => (previous === channel.id ? null : previous))
        }
      >
        <button
          className={`channel-row voice ${nested ? "nested" : ""} ${
            activeSelection.channelId === channel.id ? "active" : ""
          } ${joinedVoiceChannelId === channel.id ? "connected" : ""} ${
            draggedChannelId === channel.id ? "dragging" : ""
          } ${
            channelDropHint?.type === "channel" && channelDropHint.targetId === channel.id
              ? `drop-${channelDropHint.placement}`
              : ""
          }`.trim()}
          draggable={canDragChannel(channel)}
          onDragEnd={clearChannelDragState}
          onDragOver={(event) => handleChannelDragOver(event, channel)}
          onDragStart={(event) => beginChannelDrag(event, channel)}
          onDrop={(event) => handleChannelDrop(event, channel)}
          onClick={() => onSelectGuildChannel(channel)}
          type="button"
        >
          <span className="channel-label">
            <Icon name="headphones" size={16} />
            <span>{channel.name}</span>
          </span>
          <span className="voice-channel-meta">
            <b>{formatVoiceCount((voiceSessions[channel.id] || []).length)} / 15</b>
          </span>
        </button>

        {(voiceUsersByChannel[channel.id] || []).length ? (
          <div className="voice-channel-occupants">
            {(voiceUsersByChannel[channel.id] || []).map((user) => (
              <button
                className="voice-channel-occupant"
                key={`${channel.id}-${user.id}`}
                onClick={(event) => onOpenProfileCard(event, user, user.display_name)}
                type="button"
              >
                <Avatar
                  hue={user.avatar_hue}
                  label={user.display_name || user.username}
                  size={24}
                  src={user.avatar_url}
                  status={user.status}
                />
                <span title={user.display_name || user.username}>
                  {user.display_name || user.username}
                </span>
                {user.id === workspace.current_user.id && voiceState.screenShareEnabled ? (
                  <em>EN VIVO</em>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {hoveredVoiceChannelId === channel.id ? (
          <div className="voice-channel-preview floating-surface">
            <strong>{channel.name}</strong>
            <span>
              {(voiceUsersByChannel[channel.id] || []).length
                ? `${(voiceUsersByChannel[channel.id] || []).length} persona(s) dentro`
                : "Nadie dentro todavia"}
            </span>
            {(voiceUsersByChannel[channel.id] || []).length ? (
              <div className="voice-channel-preview-avatars">
                {(voiceUsersByChannel[channel.id] || []).slice(0, 4).map((user) => (
                  <Avatar
                    hue={user.avatar_hue}
                    key={`${channel.id}-preview-${user.id}`}
                    label={user.display_name || user.username}
                    size={28}
                    src={user.avatar_url}
                    status={user.status}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function openServerContextMenu(event, guild) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setServerContextMenu({
      guildId: guild.id,
      x: rect.right + 12,
      y: rect.top - 6,
      anchorRect: {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top
      }
    });
  }

  function renderFolderPreview(folder) {
    const previewGuilds = folder.guilds.slice(0, 4);

    return (
      <span className="server-folder-grid">
        {previewGuilds.map((guild) => {
          const guildIcon = resolveGuildIcon(guild);
          return (
            <span className={`server-folder-cell ${guildIcon ? "has-image" : ""}`.trim()} key={guild.id}>
              {guildIcon ? (
                <img alt={guild.name} className="server-folder-cell-image" draggable="false" src={guildIcon} />
              ) : (
                <small>{guild.icon_text || guild.name.slice(0, 2).toUpperCase()}</small>
              )}
            </span>
          );
        })}
      </span>
    );
  }

  function renderGuildPill(guild, { nested = false, folderId = null } = {}) {
    const guildIcon = resolveGuildIcon(guild);
    const isDropTarget =
      guildDropHint?.type === "guild" && guildDropHint.targetId === guild.id;

    return (
      <button
        className={`server-pill tooltip-anchor ${guildIcon ? "has-image" : ""} ${
          nested ? "nested" : ""
        } ${canDragGuild(guild) ? "draggable-guild" : ""} ${activeGuild?.id === guild.id ? "active" : ""} ${
          draggedGuildId === guild.id ? "dragging" : ""
        } ${isDropTarget ? `drop-${guildDropHint.placement}` : ""}`.trim()}
        data-tooltip={guild.name}
        data-tooltip-position="right"
        data-server-drop-kind="guild"
        data-server-drop-id={guild.id}
        data-server-folder-id={folderId || ""}
        key={guild.id}
        ref={setServerDropTargetNode("guild", guild.id, folderId)}
        onClick={(event) => handleGuildClick(event, guild)}
        onContextMenu={(event) => openServerContextMenu(event, guild)}
        onPointerDown={(event) => beginGuildPointerDrag(event, guild)}
        type="button"
      >
        {guildIcon ? (
          <img
            alt={guild.name}
            className="server-pill-image"
            draggable="false"
            src={guildIcon}
          />
        ) : (
          <span>{guild.icon_text || guild.name.slice(0, 2).toUpperCase()}</span>
        )}
        {guild.unread_count ? <i>{guild.unread_count}</i> : null}
      </button>
    );
  }

  function renderServerRailItem(item) {
    if (item.type === "guild") {
      return renderGuildPill(item.guild);
    }

    const folder = item.folder;
    const isActive = folder.guilds.some((guild) => guild.id === activeGuild?.id);
    const unreadCount = folder.guilds.reduce(
      (total, guild) => total + Number(guild.unread_count || 0),
      0
    );
    const isDropTarget =
      guildDropHint?.type === "folder" && guildDropHint.targetId === folder.id;

    return (
      <div className="server-folder-shell" key={folder.id}>
        <button
          className={`server-folder-pill tooltip-anchor ${folder.collapsed ? "collapsed" : "expanded"} ${
            isActive ? "active" : ""
          } ${isDropTarget ? `drop-${guildDropHint.placement}` : ""}`.trim()}
          data-tooltip={folder.name}
          data-tooltip-position="right"
          data-server-drop-kind="folder"
          data-server-drop-id={folder.id}
          ref={setServerDropTargetNode("folder", folder.id)}
          onClick={() => onToggleServerFolder?.(folder.id)}
          type="button"
        >
          {renderFolderPreview(folder)}
          {unreadCount ? <i>{unreadCount}</i> : null}
          <span className="server-folder-chevron">
            <Icon name={folder.collapsed ? "arrowRight" : "chevronDown"} size={12} />
          </span>
        </button>

        {!folder.collapsed ? (
          <div className="server-folder-children">
            {folder.guilds.map((guild) => renderGuildPill(guild, { nested: true, folderId: folder.id }))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <aside className="server-rail">
        <div className="server-rail-stack">
          <button
            className={`server-pill tooltip-anchor home ${
              activeSelection.kind === "dm" || activeSelection.kind === "home" ? "active" : ""
            }`}
            data-tooltip="Mensajes directos"
            data-tooltip-position="right"
            onClick={onSelectHome}
            type="button"
          >
            <UmbraLogo alt="Mensajes directos" className="server-pill-logo" size={24} />
            {directUnreadCount ? <i>{directUnreadCount}</i> : null}
          </button>

          <div className="server-rail-divider" />

          <div className="server-stack">
            {serverRailItems.map((item) => renderServerRailItem(item))}
          </div>

          <button
            className="server-pill add tooltip-anchor"
            data-tooltip="Crear servidor"
            data-tooltip-position="right"
            onClick={() => onOpenDialog("guild")}
            type="button"
          >
            <Icon name="add" />
          </button>
        </div>
      </aside>

      {serverContextGuild ? (
        <ServerContextMenu
          canManageGuild={Boolean(serverContextGuild?.permissions?.can_manage_guild)}
          guild={serverContextGuild}
          onClose={() => setServerContextMenu(null)}
          onCopyId={onCopyGuildId}
          onInvite={onOpenInviteModal}
          onLeaveGuild={onLeaveGuild}
          onMarkRead={onMarkGuildRead}
          onOpenPrivacy={onOpenGuildPrivacy}
          onOpenSettings={onOpenGuildSettings}
          onTogglePref={onToggleGuildMenuPref}
          onUpdateNotificationLevel={onUpdateGuildNotificationLevel}
          position={serverContextMenu}
          prefs={serverContextPrefs}
        />
      ) : null}
      {dmContextChannel ? (
        <DmContextMenu
          dm={dmContextChannel}
          muted={Boolean(dmContextPrefs?.muted)}
          onBlockUser={onBlockUser}
          onClose={() => setDmContextMenu(null)}
          onCloseDm={onCloseDm}
          onCopyId={onCopyDmId}
          onMarkRead={onMarkDmRead}
          onOpenProfile={onOpenFullProfile}
          onRelationshipAction={(profile) => {
            if (!profile) {
              return;
            }

            if (profile.isFriend) {
              onRemoveFriend?.(profile);
              return;
            }

            if (profile.friendRequestState === "received") {
              onAcceptFriendRequest?.(profile);
              return;
            }

            if (profile.friendRequestState === "sent") {
              return;
            }

            onSendFriendRequest?.(profile);
          }}
          onReportUser={onReportUser}
          onToggleMute={onToggleDmMenuPref}
          position={dmContextMenu}
          profile={dmContextProfile}
        />
      ) : null}

      <aside className="navigator-panel">
        <div className={`navigator-top ${activeGuild ? "" : "direct-home-header"}`.trim()}>
          {activeGuild ? (
            <>
              <div className="navigator-server-header">
                <div className="navigator-server-header-copy">
                  <small>UMBRA VEIL</small>
                  <ServerAdminMenu
                    canManageGuild={canManageGuild}
                    guild={activeGuild}
                    onCopyId={onCopyGuildId}
                    onCreateCategory={() => onOpenDialog("category")}
                    onCreateChannel={() => onOpenDialog("channel", { initialKind: "text" })}
                    onInvite={onOpenInviteModal}
                    onOpenSettings={onOpenGuildSettings}
                  />
                </div>
              </div>
              <div className="navigator-top-actions">
                {canManageGuild ? (
                  <button
                    className="ghost-button icon-only tooltip-anchor"
                    data-tooltip="Invitar al servidor"
                    data-tooltip-position="bottom"
                    onClick={onOpenInviteModal}
                    type="button"
                  >
                    <Icon name="userAdd" />
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="navigator-title-block compact navigator-title-brand">
                <UmbraLogo alt="Umbra" className="navigator-title-logo" size={34} />
                <div className="navigator-title-copy">
                  <small>UMBRA DIRECT</small>
                  <h2>Mensajes directos</h2>
                  <p className="subcopy">Ecos privados, grupos y accesos.</p>
                </div>
              </div>
              <button
                className="ghost-button navigator-create-button"
                onClick={() => onOpenDialog("dm_group")}
                type="button"
              >
                <Icon name="add" />
                <span>Nuevo DM</span>
              </button>
            </>
          )}
        </div>

        <div className="navigator-search">
          <input
            aria-label="Buscar en el panel lateral"
            placeholder={
              activeGuild
                ? `Buscar en ${activeGuild.name}`
                : activeSelection.kind === "home"
                  ? "Buscar o iniciar una conversacion"
                  : "Buscar mensajes directos"
            }
            type="text"
          />
        </div>

        {activeGuild ? (
          <div className="channel-list">
            {categoryEntries.map((entry) => (
              <div className="channel-category-group" key={entry.id}>
                <div
                  className={`panel-section-label category ${
                    channelDropHint?.type === "category" && channelDropHint.targetId === entry.category.id
                      ? "drop-target"
                      : ""
                  }`.trim()}
                  onDragOver={(event) => handleCategoryDragOver(event, entry.category.id)}
                  onDrop={(event) => handleCategoryDrop(event, entry.category.id, entry.channels)}
                >
                  <button
                    aria-expanded={!collapsedSectionIds[entry.category.id]}
                    className="category-toggle"
                    onClick={() => toggleSection(entry.category.id)}
                    type="button"
                  >
                    <Icon
                      name={collapsedSectionIds[entry.category.id] ? "arrowRight" : "chevronDown"}
                      size={14}
                    />
                    <span>{entry.category.name}</span>
                  </button>
                  {canManageStructure ? (
                    <button
                      className="ghost-button icon-only category-action"
                      onClick={() =>
                        onOpenDialog("channel", {
                          initialKind: "text",
                          initialParentId: entry.category.id
                        })
                      }
                      type="button"
                    >
                      <Icon name="add" />
                    </button>
                  ) : null}
                </div>
                {(() => {
                  const isCollapsed = Boolean(collapsedSectionIds[entry.category.id]);
                  const activeNestedChannel =
                    entry.channels.find((channel) => channel.id === activeSelection.channelId) || null;
                  const visibleChannels = isCollapsed
                    ? activeNestedChannel
                      ? [activeNestedChannel]
                      : []
                    : entry.channels;

                  if (!visibleChannels.length) {
                    return (
                      <div className="category-empty">
                        {isCollapsed ? "Categoria vacia" : "Sin canales por ahora."}
                      </div>
                    );
                  }

                  return visibleChannels.map((channel) =>
                    channel.is_voice
                      ? renderVoiceChannel(channel, { nested: true })
                      : renderTextChannelRow(channel, { nested: true })
                  );
                })()}
              </div>
            ))}

            {uncategorizedTextChannels.length ? (
              <>
                <div
                  className={`panel-section-label ${
                    channelDropHint?.type === "root" && channelDropHint.targetId === "__uncategorized_text__"
                      ? "drop-target"
                      : ""
                  }`.trim()}
                  onDragOver={(event) => handleRootSectionDragOver(event, "__uncategorized_text__")}
                  onDrop={(event) => handleRootSectionDrop(event, "text")}
                >
                  <button
                    aria-expanded={!collapsedSectionIds.__uncategorized_text__}
                    className="category-toggle"
                    onClick={() => toggleSection("__uncategorized_text__")}
                    type="button"
                  >
                    <Icon
                      name={collapsedSectionIds.__uncategorized_text__ ? "arrowRight" : "chevronDown"}
                      size={14}
                    />
                    <span>Canales de texto</span>
                  </button>
                  {canManageStructure ? (
                    <button
                      className="ghost-button icon-only category-action"
                      onClick={() => onOpenDialog("channel", { initialKind: "text" })}
                      type="button"
                    >
                      <Icon name="add" />
                    </button>
                  ) : null}
                </div>
                {(() => {
                  const isCollapsed = Boolean(collapsedSectionIds.__uncategorized_text__);
                  const activeTextChannel =
                    uncategorizedTextChannels.find(
                      (channel) => channel.id === activeSelection.channelId
                    ) || null;
                  const visibleChannels = isCollapsed
                    ? activeTextChannel
                      ? [activeTextChannel]
                      : []
                    : uncategorizedTextChannels;

                  return visibleChannels.map((channel) => renderTextChannelRow(channel));
                })()}
              </>
            ) : null}

            {uncategorizedVoiceChannels.length ? (
              <>
                <div
                  className={`panel-section-label voice ${
                    channelDropHint?.type === "root" && channelDropHint.targetId === "__uncategorized_voice__"
                      ? "drop-target"
                      : ""
                  }`.trim()}
                  onDragOver={(event) => handleRootSectionDragOver(event, "__uncategorized_voice__")}
                  onDrop={(event) => handleRootSectionDrop(event, "voice")}
                >
                  <button
                    aria-expanded={!collapsedSectionIds.__uncategorized_voice__}
                    className="category-toggle"
                    onClick={() => toggleSection("__uncategorized_voice__")}
                    type="button"
                  >
                    <Icon
                      name={collapsedSectionIds.__uncategorized_voice__ ? "arrowRight" : "chevronDown"}
                      size={14}
                    />
                    <span>Canales de voz</span>
                  </button>
                  {canManageStructure ? (
                    <button
                      className="ghost-button icon-only category-action"
                      onClick={() => onOpenDialog("channel", { initialKind: "voice" })}
                      type="button"
                    >
                      <Icon name="add" />
                    </button>
                  ) : null}
                </div>
                {(() => {
                  const isCollapsed = Boolean(collapsedSectionIds.__uncategorized_voice__);
                  const activeVoiceChannel =
                    uncategorizedVoiceChannels.find(
                      (channel) => channel.id === activeSelection.channelId
                    ) || null;
                  const visibleChannels = isCollapsed
                    ? activeVoiceChannel
                      ? [activeVoiceChannel]
                      : []
                    : uncategorizedVoiceChannels;

                  return visibleChannels.map((channel) => renderVoiceChannel(channel));
                })()}
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="direct-home-nav">
              {HOME_LINKS.map((item) => (
                <button
                  className={`direct-home-link ${
                    (item.id === "home" && activeSelection.kind === "home") ||
                    (item.id === "requests" && activeSelection.kind === "requests")
                      ? "active"
                      : ""
                  }`}
                  key={item.id}
                  onClick={() => onSelectDirectLink(item.id, item.notice)}
                  type="button"
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="dm-list">
              <div className="panel-section-label">
                <span>Mensajes directos</span>
                <button className="ghost-button icon-only" onClick={() => onOpenDialog("dm_group")} type="button">
                  <Icon name="add" />
                </button>
              </div>
              {workspace.dms.map((dm) => {
                const other = dm.participants.find(
                  (participant) => participant.id !== workspace.current_user.id
                );

                return (
                  <button
                    className={`dm-row ${activeSelection.channelId === dm.id ? "active" : ""} ${
                      dm.unread_count ? "has-unread" : "is-read"
                    } ${dmMenuPrefs?.[dm.id]?.muted ? "is-muted" : ""}`.trim()}
                    key={dm.id}
                    onContextMenu={(event) => openDmContextMenu(event, dm)}
                    onClick={() => onSelectDirectLink("dm", null, dm.id)}
                    type="button"
                  >
                    <Avatar
                      hue={other?.avatar_hue || 210}
                      label={dm.display_name}
                      size={38}
                      src={other?.avatar_url}
                      status={dm.type === "dm" ? other?.status : null}
                    />
                    <div className="dm-copy">
                      <strong title={dm.display_name}>{dm.display_name}</strong>
                      <span title={getDmSummary(dm, workspace.current_user.id)}>
                        {getDmSummary(dm, workspace.current_user.id)}
                      </span>
                    </div>
                    {dm.unread_count ? <i>{dm.unread_count}</i> : null}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="navigator-footer">
          {joinedVoiceChannel ? (
            <div className="joined-voice-chip">
              <button
                className="joined-voice-main"
                onClick={() => onSelectGuildChannel(joinedVoiceChannel)}
                type="button"
              >
                <Icon name="headphones" size={15} />
                <span>
                  <strong title={joinedVoiceChannel.name}>{joinedVoiceChannel.name}</strong>
                  <small>{(voiceSessions[joinedVoiceChannel.id] || []).length} conectado(s)</small>
                </span>
              </button>
              <button
                aria-label="Salir del canal de voz"
                className="ghost-button icon-only small"
                onClick={onHandleVoiceLeave}
                type="button"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ) : null}

          {inputMenuNode}
          {outputMenuNode}

          <div className="user-dock">
            <button
              className="profile-card profile-card-button user-dock-profile"
              onClick={onOpenSettings}
              type="button"
            >
              <Avatar
                hue={workspace.current_user.avatar_hue}
                label={workspace.current_user.username}
                size={36}
                src={workspace.current_user.avatar_url}
                status={workspace.current_user.status}
              />
              <div className="profile-meta">
                <strong title={currentUserLabel}>{truncatedCurrentUserLabel}</strong>
                <span>{workspace.current_user.status || "Offline"}</span>
              </div>
            </button>

            <div className="footer-actions footer-voice-actions">
              <div
                className={`dock-split-control ${
                  voiceState.micMuted ? "danger active" : voiceMenu === "input" ? "active" : ""
                }`}
              >
                <button
                  aria-label={voiceState.micMuted ? "Activar microfono" : "Silenciar microfono"}
                  className={`dock-split-main tooltip-anchor ${voiceState.micMuted ? "danger active" : ""}`}
                  data-tooltip={voiceState.micMuted ? "Activar microfono" : "Silenciar"}
                  data-tooltip-position="top"
                  onClick={() => onToggleVoiceState("micMuted")}
                  type="button"
                >
                  <Icon name={voiceState.micMuted ? "micOff" : "mic"} />
                </button>
                <button
                  aria-label="Opciones del microfono"
                  className={`dock-split-caret tooltip-anchor ${voiceMenu === "input" ? "active" : ""}`}
                  data-tooltip="Opciones de entrada"
                  data-tooltip-position="top"
                  onClick={() => onToggleVoiceMenu("input")}
                  type="button"
                >
                  <Icon name="chevronDown" size={14} />
                </button>
              </div>
              <div
                className={`dock-split-control ${
                  voiceState.deafen ? "danger active" : voiceMenu === "output" ? "active" : ""
                }`}
              >
                <button
                  aria-label={voiceState.deafen ? "Activar audio" : "Ensordecer"}
                  className={`dock-split-main tooltip-anchor ${voiceState.deafen ? "danger active" : ""}`}
                  data-tooltip={voiceState.deafen ? "Activar audio" : "Ensordecer"}
                  data-tooltip-position="top"
                  onClick={() => onToggleVoiceState("deafen")}
                  type="button"
                >
                  <Icon name={voiceState.deafen ? "deafen" : "headphones"} />
                </button>
                <button
                  aria-label="Opciones de audio"
                  className={`dock-split-caret tooltip-anchor ${voiceMenu === "output" ? "active" : ""}`}
                  data-tooltip="Opciones de salida"
                  data-tooltip-position="top"
                  onClick={() => onToggleVoiceMenu("output")}
                  type="button"
                >
                  <Icon name="chevronDown" size={14} />
                </button>
              </div>
              <button
                aria-label="Abrir ajustes"
                className="ghost-button icon-only tooltip-anchor"
                data-tooltip="Ajustes"
                data-tooltip-position="top"
                onClick={onOpenSettings}
                type="button"
              >
                <Icon name="settings" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
