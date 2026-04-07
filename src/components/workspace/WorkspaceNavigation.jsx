import React from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";
import { ServerAdminMenu } from "./ServerAdminMenu.jsx";
import { ServerContextMenu } from "./ServerContextMenu.jsx";
import {
  HOME_LINKS,
  buildGuildStructureEntries,
  formatVoiceCount,
  getDmSummary,
  resolveGuildIcon
} from "./workspaceHelpers.js";

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
  onLeaveGuild,
  onMarkGuildRead,
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
  onToggleGuildMenuPref,
  onUpdateGuildNotificationLevel,
  workspace
}) {
  const [collapsedSectionIds, setCollapsedSectionIds] = React.useState({});
  const [serverContextMenu, setServerContextMenu] = React.useState(null);
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

  function toggleSection(sectionId) {
    setCollapsedSectionIds((previous) => ({
      ...previous,
      [sectionId]: !previous[sectionId]
    }));
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

  function renderTextChannelRow(channel, { nested = false } = {}) {
    return (
      <button
        className={`channel-row ${nested ? "nested" : ""} ${
          activeSelection.channelId === channel.id ? "active" : ""
        } ${channel.unread_count ? "has-unread" : "is-read"}`.trim()}
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
          } ${joinedVoiceChannelId === channel.id ? "connected" : ""}`.trim()}
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
                  onContextMenu={(event) => {
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
                  }}
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
                <div className="panel-section-label category">
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
                    return isCollapsed ? null : <div className="category-empty">Sin canales por ahora.</div>;
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
                <div className="panel-section-label">
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
                <div className="panel-section-label voice">
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
