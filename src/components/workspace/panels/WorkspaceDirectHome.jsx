import React from "react";

import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";
import { HOME_LINKS, getDmSummary, resolveDirectChannelVisual } from "../workspaceHelpers.js";

export function WorkspaceDirectHome({
  activeSelection,
  dmMenuPrefs,
  onOpenDialog,
  onOpenDmContextMenu,
  onSelectDirectLink,
  workspace
}) {
  return (
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
          const visual = resolveDirectChannelVisual(dm, workspace.current_user.id);

          return (
            <button
              className={`dm-row ${activeSelection.channelId === dm.id ? "active" : ""} ${
                dm.unread_count ? "has-unread" : "is-read"
              } ${dmMenuPrefs?.[dm.id]?.muted ? "is-muted" : ""}`.trim()}
              key={dm.id}
              onContextMenu={(event) => onOpenDmContextMenu(event, dm)}
              onClick={() => onSelectDirectLink("dm", null, dm.id)}
              type="button"
            >
              <Avatar
                hue={visual.avatarHue}
                label={dm.display_name}
                size={38}
                src={visual.avatarUrl}
                status={visual.status}
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
  );
}
