import React from "react";

import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";
import { resolveGuildIcon } from "./workspaceHelpers.js";

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

function GuildPill({
  activeGuildId,
  beginGuildPointerDrag,
  canDragGuild,
  draggedGuildId,
  folderId = null,
  guild,
  guildDropHint,
  handleGuildClick,
  nested = false,
  onOpenContextMenu,
  setServerDropTargetNode
}) {
  const guildIcon = resolveGuildIcon(guild);
  const isDropTarget = guildDropHint?.type === "guild" && guildDropHint.targetId === guild.id;

  return (
    <button
      className={`server-pill tooltip-anchor ${guildIcon ? "has-image" : ""} ${
        nested ? "nested" : ""
      } ${canDragGuild(guild) ? "draggable-guild" : ""} ${activeGuildId === guild.id ? "active" : ""} ${
        draggedGuildId === guild.id ? "dragging" : ""
      } ${isDropTarget ? `drop-${guildDropHint.placement}` : ""}`.trim()}
      data-tooltip={guild.name}
      data-tooltip-position="right"
      data-server-drop-kind="guild"
      data-server-drop-id={guild.id}
      data-server-folder-id={folderId || ""}
      onClick={(event) => handleGuildClick(event, guild)}
      onContextMenu={(event) => onOpenContextMenu(event, guild)}
      onPointerDown={(event) => beginGuildPointerDrag(event, guild)}
      ref={setServerDropTargetNode("guild", guild.id, folderId)}
      type="button"
    >
      {guildIcon ? (
        <img alt={guild.name} className="server-pill-image" draggable="false" src={guildIcon} />
      ) : (
        <span>{guild.icon_text || guild.name.slice(0, 2).toUpperCase()}</span>
      )}
      {guild.unread_count ? <i>{guild.unread_count}</i> : null}
    </button>
  );
}

function ServerRailItem({
  activeGuildId,
  beginGuildPointerDrag,
  canDragGuild,
  draggedGuildId,
  guildDropHint,
  handleGuildClick,
  item,
  onOpenContextMenu,
  onToggleServerFolder,
  setServerDropTargetNode
}) {
  if (item.type === "guild") {
    return (
      <GuildPill
        activeGuildId={activeGuildId}
        beginGuildPointerDrag={beginGuildPointerDrag}
        canDragGuild={canDragGuild}
        draggedGuildId={draggedGuildId}
        guild={item.guild}
        guildDropHint={guildDropHint}
        handleGuildClick={handleGuildClick}
        onOpenContextMenu={onOpenContextMenu}
        setServerDropTargetNode={setServerDropTargetNode}
      />
    );
  }

  const folder = item.folder;
  const isActive = folder.guilds.some((guild) => guild.id === activeGuildId);
  const unreadCount = folder.guilds.reduce(
    (total, guild) => total + Number(guild.unread_count || 0),
    0
  );
  const isDropTarget = guildDropHint?.type === "folder" && guildDropHint.targetId === folder.id;

  return (
    <div className="server-folder-shell" key={folder.id}>
      <button
        className={`server-folder-pill tooltip-anchor ${folder.collapsed ? "collapsed" : "expanded"} ${
          isActive ? "active" : ""
        } ${isDropTarget ? `drop-${guildDropHint.placement}` : ""}`.trim()}
        data-tooltip={folder.name}
        data-tooltip-position="right"
        data-server-drop-id={folder.id}
        data-server-drop-kind="folder"
        onClick={() => onToggleServerFolder?.(folder.id)}
        ref={setServerDropTargetNode("folder", folder.id)}
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
          {folder.guilds.map((guild) => (
            <GuildPill
              activeGuildId={activeGuildId}
              beginGuildPointerDrag={beginGuildPointerDrag}
              canDragGuild={canDragGuild}
              draggedGuildId={draggedGuildId}
              folderId={folder.id}
              guild={guild}
              guildDropHint={guildDropHint}
              handleGuildClick={handleGuildClick}
              key={guild.id}
              nested
              onOpenContextMenu={onOpenContextMenu}
              setServerDropTargetNode={setServerDropTargetNode}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceServerRail({
  activeGuildId,
  activeSelectionKind,
  beginGuildPointerDrag,
  canDragGuild,
  directUnreadCount,
  draggedGuildId,
  guildDropHint,
  handleGuildClick,
  onOpenContextMenu,
  onOpenDialog,
  onSelectHome,
  onToggleServerFolder,
  serverRailItems,
  setServerDropTargetNode
}) {
  return (
    <aside className="server-rail">
      <div className="server-rail-stack">
        <button
          className={`server-pill tooltip-anchor home ${
            activeSelectionKind === "dm" || activeSelectionKind === "home" ? "active" : ""
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
          {serverRailItems.map((item) => (
            <ServerRailItem
              activeGuildId={activeGuildId}
              beginGuildPointerDrag={beginGuildPointerDrag}
              canDragGuild={canDragGuild}
              draggedGuildId={draggedGuildId}
              guildDropHint={guildDropHint}
              handleGuildClick={handleGuildClick}
              item={item}
              key={item.type === "guild" ? item.guild.id : item.folder.id}
              onOpenContextMenu={onOpenContextMenu}
              onToggleServerFolder={onToggleServerFolder}
              setServerDropTargetNode={setServerDropTargetNode}
            />
          ))}
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
  );
}
