import React from "react";

import { Avatar } from "../../Avatar.jsx";
import { Icon } from "../../Icon.jsx";
import { formatVoiceCount } from "../workspaceHelpers.js";
import { buildVoiceOccupantBadge } from "../workspaceNavigationHelpers.js";

export function createWorkspaceChannelRenderers({
  activeGuild,
  activeSelection,
  canDragChannel,
  channelDropHint,
  clearChannelDragState,
  draggedChannelId,
  hoveredVoiceChannelId,
  joinedVoiceChannelId,
  onBeginChannelDrag,
  onChannelDragOver,
  onChannelDrop,
  onOpenProfileCard,
  onSelectGuildChannel,
  onSetHoveredVoiceChannelId,
  voiceSessions,
  voiceState,
  voiceUsersByChannel,
  workspace
}) {
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
        key={channel.id}
        onClick={() => onSelectGuildChannel(channel)}
        onDragEnd={clearChannelDragState}
        onDragOver={(event) => onChannelDragOver(event, channel)}
        onDragStart={(event) => onBeginChannelDrag(event, channel)}
        onDrop={(event) => onChannelDrop(event, channel)}
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
    const channelUsers = voiceUsersByChannel[channel.id] || [];
    const connectedCount = Math.max(
      (voiceSessions[channel.id] || []).length,
      channelUsers.length,
      joinedVoiceChannelId === channel.id ? 1 : 0
    );
    const missingOccupantCount = Math.max(0, connectedCount - channelUsers.length);
    const visibleChannelUsers = [
      ...channelUsers,
      ...Array.from({ length: missingOccupantCount }, (_, index) => ({
        id: `${channel.id}-voice-fallback-${index}`,
        username: "Usuario conectado",
        display_name: "Usuario conectado",
        avatar_hue: 215,
        avatar_url: "",
        custom_status: "",
        is_voice_fallback: true,
        is_voice_self: false,
        role_color: null,
        status: "online"
      }))
    ];

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
            connectedCount ? "occupied" : ""
          } ${
            draggedChannelId === channel.id ? "dragging" : ""
          } ${
            channelDropHint?.type === "channel" && channelDropHint.targetId === channel.id
              ? `drop-${channelDropHint.placement}`
              : ""
          }`.trim()}
        draggable={canDragChannel(channel)}
          onClick={() => onSelectGuildChannel(channel)}
          onDragEnd={clearChannelDragState}
          onDragOver={(event) => onChannelDragOver(event, channel)}
          onDragStart={(event) => onBeginChannelDrag(event, channel)}
          onDrop={(event) => onChannelDrop(event, channel)}
          type="button"
        >
          <span className="channel-label">
            <Icon name="headphones" size={16} />
            <span>{channel.name}</span>
          </span>
          <span className="voice-channel-meta">
            <b>{formatVoiceCount(connectedCount)} / 15</b>
          </span>
        </button>

        {visibleChannelUsers.length ? (
          <div className="voice-channel-occupants voice-channel-occupants-layered">
            {visibleChannelUsers.map((user) => {
              const badge = buildVoiceOccupantBadge({
                activeGuild,
                user
              });

              return (
                <button
                  className={`voice-channel-occupant ${
                    user.is_voice_fallback ? "is-fallback" : ""
                  }`.trim()}
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
                  <span className="voice-channel-occupant-copy">
                    <strong
                      style={user.role_color ? { color: user.role_color } : undefined}
                      title={user.display_name || user.username}
                    >
                      {user.display_name || user.username}
                    </strong>
                    <small>
                      {user.custom_status ||
                        (user.is_voice_fallback
                          ? "Sincronizando presencia..."
                          : "Conectado al canal")}
                    </small>
                  </span>
                  <span className="voice-channel-occupant-badges">
                    {badge ? (
                      <em className={`voice-channel-badge ${badge.tone}`.trim()}>
                        {badge.label}
                      </em>
                    ) : null}
                    {user.id === workspace.current_user.id && voiceState.screenShareEnabled ? (
                      <em className="voice-channel-badge danger">EN VIVO</em>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {hoveredVoiceChannelId === channel.id ? (
          <div className="voice-channel-preview floating-surface">
            <strong>{channel.name}</strong>
            <span>
              {connectedCount
                ? `${connectedCount} persona(s) dentro`
                : "Nadie dentro todavia"}
            </span>
            {visibleChannelUsers.length ? (
              <div className="voice-channel-preview-avatars">
                {visibleChannelUsers.slice(0, 4).map((user) => (
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

  return {
    renderTextChannelRow,
    renderVoiceChannel
  };
}
