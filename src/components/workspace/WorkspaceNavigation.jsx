import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";
import { HOME_LINKS, formatVoiceCount, getDmSummary, resolveGuildIcon } from "./workspaceHelpers.js";

export function WorkspaceNavigation({
  activeGuild,
  activeGuildTextChannels,
  activeGuildVoiceChannels,
  activeSelection,
  currentUserLabel,
  directUnreadCount,
  hoveredVoiceChannelId,
  inputMenuNode,
  isVoiceChannel,
  joinedVoiceChannel,
  joinedVoiceChannelId,
  onHandleVoiceLeave,
  onOpenDialog,
  onOpenProfileCard,
  onOpenSettings,
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
  workspace
}) {
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
            {workspace.guilds.map((guild) => {
              const guildIcon = resolveGuildIcon(guild);

              return (
                <button
                  className={`server-pill tooltip-anchor ${guildIcon ? "has-image" : ""} ${
                    activeGuild?.id === guild.id ? "active" : ""
                  }`}
                  data-tooltip={guild.name}
                  data-tooltip-position="right"
                  key={guild.id}
                  onClick={() => onSelectGuild(guild)}
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
            })}
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

      <aside className="navigator-panel">
        <div className="navigator-top">
          {activeGuild ? (
            <>
              <button
                className="navigator-server-trigger"
                onClick={() => onShowNotice("Menu del servidor listo para una siguiente iteracion.")}
                type="button"
              >
                <strong>{activeGuild.name}</strong>
                <Icon name="chevronDown" size={15} />
              </button>
              <div className="navigator-top-actions">
                <button
                  className="ghost-button icon-only tooltip-anchor"
                  data-tooltip="Invitar personas"
                  data-tooltip-position="bottom"
                  onClick={() => onOpenDialog("dm")}
                  type="button"
                >
                  <Icon name="userAdd" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="navigator-title-block compact">
                <h2>{activeSelection.kind === "home" ? "Amigos" : "Mensajes directos"}</h2>
                <p className="subcopy">Accesos directos, charlas privadas y grupos oscuros.</p>
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
            <div className="panel-section-label">
              <span>Canales de texto</span>
              <button className="ghost-button icon-only" onClick={() => onOpenDialog("channel")} type="button">
                <Icon name="add" />
              </button>
            </div>
            {activeGuildTextChannels.map((channel) => (
              <button
                className={`channel-row ${activeSelection.channelId === channel.id ? "active" : ""} ${
                  channel.unread_count ? "has-unread" : "is-read"
                }`}
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
            ))}

            <div className="panel-section-label voice">
              <span>Canales de voz</span>
              <button className="ghost-button icon-only" onClick={() => onOpenDialog("channel")} type="button">
                <Icon name="add" />
              </button>
            </div>
            {activeGuildVoiceChannels.map((channel) => (
              <div
                className="voice-channel-block"
                key={channel.id}
                onMouseEnter={() => onSetHoveredVoiceChannelId(channel.id)}
                onMouseLeave={() =>
                  onSetHoveredVoiceChannelId((previous) => (previous === channel.id ? null : previous))
                }
              >
                <button
                  className={`channel-row voice ${
                    activeSelection.channelId === channel.id ? "active" : ""
                  } ${joinedVoiceChannelId === channel.id ? "connected" : ""}`}
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
            ))}
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
                    }`}
                    key={dm.id}
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
                <strong>{currentUserLabel}</strong>
                <span>{workspace.current_user.status || "Offline"}</span>
              </div>
            </button>

            <div className="footer-actions footer-voice-actions">
              <button
                aria-label={voiceState.micMuted ? "Activar microfono" : "Silenciar microfono"}
                className={`ghost-button icon-only tooltip-anchor ${voiceState.micMuted ? "danger active" : ""}`}
                data-tooltip={voiceState.micMuted ? "Activar microfono" : "Silenciar"}
                data-tooltip-position="top"
                onClick={() => onToggleVoiceState("micMuted")}
                type="button"
              >
                <Icon name={voiceState.micMuted ? "micOff" : "mic"} />
              </button>
              <button
                aria-label="Opciones del microfono"
                className={`ghost-button icon-only dock-caret tooltip-anchor ${voiceMenu === "input" ? "active" : ""}`}
                data-tooltip="Ajustes de voz"
                data-tooltip-position="top"
                onClick={() => onToggleVoiceMenu("input")}
                type="button"
              >
                <Icon name="chevronDown" size={14} />
              </button>
              <button
                aria-label={voiceState.deafen ? "Activar audio" : "Ensordecer"}
                className={`ghost-button icon-only tooltip-anchor ${voiceState.deafen ? "active" : ""}`}
                data-tooltip={voiceState.deafen ? "Activar audio" : "Ensordecer"}
                data-tooltip-position="top"
                onClick={() => onToggleVoiceState("deafen")}
                type="button"
              >
                <Icon name={voiceState.deafen ? "deafen" : "headphones"} />
              </button>
              <button
                aria-label="Opciones de audio"
                className={`ghost-button icon-only dock-caret tooltip-anchor ${voiceMenu === "input" ? "active" : ""}`}
                data-tooltip="Salida de audio"
                data-tooltip-position="top"
                onClick={() => onToggleVoiceMenu("input")}
                type="button"
              >
                <Icon name="chevronDown" size={14} />
              </button>
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
