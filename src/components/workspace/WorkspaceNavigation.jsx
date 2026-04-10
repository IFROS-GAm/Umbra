import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";
import { ServerAdminMenu } from "./ServerAdminMenu.jsx";
import { DmContextMenu } from "./DmContextMenu.jsx";
import { ServerContextMenu } from "./ServerContextMenu.jsx";
import { WorkspaceChannelList } from "./WorkspaceChannelList.jsx";
import { WorkspaceDirectHome } from "./WorkspaceDirectHome.jsx";
import { WorkspaceNavigatorFooter } from "./WorkspaceNavigatorFooter.jsx";
import { WorkspaceServerRail } from "./WorkspaceServerRail.jsx";
import {
  buildGuildStructureEntries,
  formatVoiceCount
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
  language = "es",
  outputMenuNode,
  isVoiceChannel,
  joinedVoiceChannel,
  joinedVoiceChannelId,
  onHandleVoiceLeave,
  onOpenDialog,
  onOpenProfileCard,
  onOpenSelfMenu,
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

  return (
    <>
      <WorkspaceServerRail
        activeGuildId={activeGuild?.id}
        activeSelectionKind={activeSelection.kind}
        beginGuildPointerDrag={beginGuildPointerDrag}
        canDragGuild={canDragGuild}
        directUnreadCount={directUnreadCount}
        draggedGuildId={draggedGuildId}
        guildDropHint={guildDropHint}
        handleGuildClick={handleGuildClick}
        onOpenContextMenu={openServerContextMenu}
        onOpenDialog={onOpenDialog}
        onSelectHome={onSelectHome}
        onToggleServerFolder={onToggleServerFolder}
        serverRailItems={serverRailItems}
        setServerDropTargetNode={setServerDropTargetNode}
      />

      {serverContextGuild ? (
        <ServerContextMenu
          canManageGuild={Boolean(serverContextGuild?.permissions?.can_manage_guild)}
          guild={serverContextGuild}
          language={language}
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
                    language={language}
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
          <WorkspaceChannelList
            activeSelection={activeSelection}
            canManageStructure={canManageStructure}
            categoryEntries={categoryEntries}
            channelDropHint={channelDropHint}
            collapsedSectionIds={collapsedSectionIds}
            handleCategoryDragOver={handleCategoryDragOver}
            handleCategoryDrop={handleCategoryDrop}
            handleRootSectionDragOver={handleRootSectionDragOver}
            handleRootSectionDrop={handleRootSectionDrop}
            onOpenDialog={onOpenDialog}
            renderTextChannelRow={renderTextChannelRow}
            renderVoiceChannel={renderVoiceChannel}
            toggleSection={toggleSection}
            uncategorizedTextChannels={uncategorizedTextChannels}
            uncategorizedVoiceChannels={uncategorizedVoiceChannels}
          />
        ) : (
          <WorkspaceDirectHome
            activeSelection={activeSelection}
            dmMenuPrefs={dmMenuPrefs}
            onOpenDialog={onOpenDialog}
            onOpenDmContextMenu={openDmContextMenu}
            onSelectDirectLink={onSelectDirectLink}
            workspace={workspace}
          />
        )}

        <WorkspaceNavigatorFooter
          currentUserLabel={currentUserLabel}
          inputMenuNode={inputMenuNode}
          joinedVoiceChannel={joinedVoiceChannel}
          onHandleVoiceLeave={onHandleVoiceLeave}
          onOpenSelfMenu={onOpenSelfMenu}
          onOpenSettings={onOpenSettings}
          onSelectGuildChannel={onSelectGuildChannel}
          onToggleVoiceMenu={onToggleVoiceMenu}
          onToggleVoiceState={onToggleVoiceState}
          outputMenuNode={outputMenuNode}
          truncatedCurrentUserLabel={truncatedCurrentUserLabel}
          voiceMenu={voiceMenu}
          voiceSessions={voiceSessions}
          voiceState={voiceState}
          workspace={workspace}
        />
      </aside>
    </>
  );
}
