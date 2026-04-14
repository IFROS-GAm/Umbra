import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

export function SettingsSidebarPanel({
  navGroups,
  onSearchChange,
  search,
  searchPlaceholder,
  user,
  userSubtitle
}) {
  return (
    <aside className="settings-sidebar">
      <div className="settings-user-lockup large">
        <Avatar
          hue={user.avatar_hue}
          label={user.username}
          size={54}
          src={user.avatar_url}
          status={user.status}
        />
        <div className="settings-user-copy">
          <strong>{user.username}</strong>
          <span>{userSubtitle}</span>
        </div>
      </div>

      <label className="settings-search">
        <Icon name="search" />
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          type="text"
          value={search}
        />
      </label>

      <div className="settings-nav stacked">
        {navGroups.map((group) => (
          <div
            className={`settings-nav-group ${group.className || ""}`.trim()}
            key={group.title}
          >
            <p className="settings-nav-title">{group.title}</p>
            {group.items.map((item) => (
              <button
                className={`settings-nav-item ${item.isActive ? "active" : ""} ${
                  item.disabled ? "muted" : ""
                }`.trim()}
                disabled={item.disabled}
                key={item.id}
                onClick={item.onSelect}
                type="button"
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
