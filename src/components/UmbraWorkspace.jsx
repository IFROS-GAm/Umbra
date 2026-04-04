import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { api } from "../api.js";
import { Icon } from "./Icon.jsx";
import { ChatHeader } from "./workspace/ChatHeader.jsx";
import { DesktopTopbar } from "./workspace/DesktopTopbar.jsx";
import { MembersPanel } from "./workspace/MembersPanel.jsx";
import { WorkspaceNavigation } from "./workspace/WorkspaceNavigation.jsx";
import {
  buildMemberGroups,
  buildVoiceStageTone,
  fallbackDeviceLabel,
  isVisibleStatus
} from "./workspace/workspaceHelpers.js";
import { useUmbraWorkspaceCore } from "./workspace/useUmbraWorkspaceCore.js";

const lazyNamed = (loader, exportName) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] })));

const Dialog = lazyNamed(() => import("./Dialog.jsx"), "Dialog");
const FriendsHome = lazyNamed(() => import("./FriendsHome.jsx"), "FriendsHome");
const MessageRequestsHome = lazyNamed(
  () => import("./MessageRequestsHome.jsx"),
  "MessageRequestsHome"
);
const SettingsModal = lazyNamed(() => import("./SettingsModal.jsx"), "SettingsModal");
const UserProfileCard = lazyNamed(() => import("./UserProfileCard.jsx"), "UserProfileCard");
const MessageStage = lazyNamed(() => import("./workspace/MessageStage.jsx"), "MessageStage");
const VoiceRoomStage = lazyNamed(() => import("./workspace/VoiceRoomStage.jsx"), "VoiceRoomStage");

function WorkspacePanelFallback({ compact = false }) {
  return (
    <div className={`workspace-panel-fallback ${compact ? "compact" : ""}`.trim()}>
      <div className="workspace-panel-pulse" />
      <div className="workspace-panel-pulse short" />
    </div>
  );
}

export function UmbraWorkspace({ accessToken, onSignOut }) {
  const {
    activeChannel, activeGuild, activeGuildTextChannels, activeGuildVoiceChannels, activeSelection,
    appError, attachmentInputRef, booting, composer, composerAttachments, composerMenuOpen,
    composerPicker, composerRef, currentUserLabel, dialog, directUnreadCount, editingMessage,
    handleAttachmentSelection, handleComposerChange, handleComposerShortcut, handleDeleteMessage,
    handleDialogSubmit, handlePickerInsert, handleProfileUpdate, handleReaction, handleScroll,
    handleSelectGuildChannel, handleStatusChange, handleSubmitMessage, handleVoiceDeviceChange, handleVoiceLeave,
    headerActionsRef, headerCopy, headerPanel, headerPanelRef, hoveredVoiceChannelId, inboxTab,
    isVoiceChannel, joinedVoiceChannelId, listRef, loadBootstrap, loadingMessages, messageMenuFor, messages,
    membersPanelVisible, profileCard, reactionPickerFor, removeComposerAttachment,
    replyMentionEnabled, replyTarget, setActiveSelection, setBooting, setComposer,
    setComposerAttachments, setComposerMenuOpen, setComposerPicker, setDialog, setEditingMessage,
    setHeaderPanel, setHoveredVoiceChannelId, setInboxTab, setMembersPanelVisible,
    setMessageMenuFor, setProfileCard, setReactionPickerFor, setAppError,
    setReplyMentionEnabled, setReplyTarget, setSettingsOpen, setTheme, theme, settingsOpen,
    showUiNotice, toggleHeaderPanel, toggleVoiceMenu, toggleVoiceState, topbarActionsRef,
    typingUsers, uiNotice, updateVoiceSetting, uploadingAttachments, voiceDevices, voiceMenu,
    voiceSessions, voiceState, voiceUserIds, voiceInputLevel, voiceInputStatus, workspace,
    cycleVoiceDevice, getSelectedDeviceLabel, selectedVoiceDevices
  } = useUmbraWorkspaceCore({ accessToken, onSignOut });
  const [voiceInputPanel, setVoiceInputPanel] = useState(null);
  const [voiceOutputPanel, setVoiceOutputPanel] = useState(null);

  const currentUser = workspace?.current_user || null;
  const currentUserId = currentUser?.id || "";

  function buildProfileCardData(targetUser, displayNameOverride = null) {
    if (!workspace || !targetUser?.id) {
      return null;
    }

    const fallbackProfile =
      workspace.available_users.find((item) => item.id === targetUser.id) ||
      (workspace.current_user.id === targetUser.id ? workspace.current_user : null);

    const activeGuildMember =
      activeGuild?.members.find((member) => member.id === targetUser.id) || null;
    const activeParticipant =
      activeChannel?.participants?.find((participant) => participant.id === targetUser.id) || null;
    const sharedGuilds = workspace.guilds.filter((guild) =>
      guild.members.some((member) => member.id === targetUser.id)
    );
    const sharedDms = workspace.dms.filter((dm) =>
      dm.participants.some((participant) => participant.id === targetUser.id)
    );

    return {
      id: targetUser.id,
      authProvider:
        targetUser.auth_provider || fallbackProfile?.auth_provider || null,
      avatarHue:
        targetUser.avatar_hue || activeGuildMember?.avatar_hue || fallbackProfile?.avatar_hue || 210,
      avatarUrl:
        targetUser.avatar_url ||
        activeGuildMember?.avatar_url ||
        activeParticipant?.avatar_url ||
        fallbackProfile?.avatar_url ||
        "",
      profileBannerUrl:
        targetUser.profile_banner_url ||
        activeGuildMember?.profile_banner_url ||
        activeParticipant?.profile_banner_url ||
        fallbackProfile?.profile_banner_url ||
        "",
      bio: targetUser.bio || activeGuildMember?.bio || fallbackProfile?.bio || "",
      customStatus:
        targetUser.custom_status ||
        activeGuildMember?.custom_status ||
        activeParticipant?.custom_status ||
        fallbackProfile?.custom_status ||
        "",
      discriminator:
        targetUser.discriminator || fallbackProfile?.discriminator || null,
      displayName:
        displayNameOverride ||
        targetUser.display_name ||
        activeGuildMember?.display_name ||
        targetUser.username ||
        fallbackProfile?.username ||
        "Umbra user",
      isCurrentUser: workspace.current_user.id === targetUser.id,
      primaryTag: activeGuildMember ? activeGuild?.name || "Miembro" : sharedGuilds[0]?.name || null,
      profileColor:
        targetUser.profile_color ||
        activeGuildMember?.profile_color ||
        activeParticipant?.profile_color ||
        fallbackProfile?.profile_color ||
        "#5865F2",
      roleColor: targetUser.role_color || activeGuildMember?.role_color || null,
      sharedDmCount: sharedDms.length,
      sharedGuildCount: sharedGuilds.length,
      status:
        targetUser.status ||
        activeGuildMember?.status ||
        activeParticipant?.status ||
        fallbackProfile?.status ||
        "offline",
      username:
        targetUser.username || fallbackProfile?.username || targetUser.display_name || "umbra_user"
    };
  }

  function openProfileCard(event, targetUser, displayNameOverride = null) {
    const resolved = buildProfileCardData(targetUser, displayNameOverride);
    if (!resolved) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setProfileCard({
      anchorRect: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      },
      profile: resolved
    });
  }

  async function handleOpenDmFromCard(profile) {
    if (!profile?.id) {
      return;
    }

    if (profile.isCurrentUser) {
      setSettingsOpen(true);
      setProfileCard(null);
      return;
    }

    try {
      const payload = await api.createDm({
        recipientId: profile.id
      });

      setProfileCard(null);
      setActiveSelection({
        channelId: payload.channel.id,
        guildId: null,
        kind: "dm"
      });
      await loadBootstrap({
        channelId: payload.channel.id,
        guildId: null,
        kind: "dm"
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleInboxItemAction(item) {
    if (!item) {
      return;
    }

    if (item.channelId && item.tab !== "for_you") {
      setHeaderPanel(null);
      setActiveSelection((previous) => ({
        channelId: item.channelId,
        guildId: item.tab === "mentions" ? activeGuild?.id || previous.guildId : null,
        kind: item.tab === "mentions" ? "guild" : "dm"
      }));
      return;
    }

    if (item.user?.id) {
      setHeaderPanel(null);
      await handleOpenDmFromCard({
        id: item.user.id,
        isCurrentUser: item.user.id === workspace.current_user.id
      });
    }
  }

  const friendUsers = useMemo(
    () =>
      (workspace?.friends || [])
        .filter((user) => user.id !== currentUserId)
        .sort((a, b) => {
          const aStatus = isVisibleStatus(a.status) ? 0 : 1;
          const bStatus = isVisibleStatus(b.status) ? 0 : 1;
          if (aStatus !== bStatus) {
            return aStatus - bStatus;
          }

          return String(a.username || "").localeCompare(String(b.username || ""), "es");
        }),
    [currentUserId, workspace?.friends]
  );
  const activeNowUsers = useMemo(
    () => friendUsers.filter((user) => isVisibleStatus(user.status)).slice(0, 3),
    [friendUsers]
  );
  const desktopTitle = activeGuild?.name || activeChannel?.display_name || activeChannel?.name || "Umbra";
  const inboxItems = useMemo(
    () => ({
      for_you: friendUsers.slice(0, 4).map((user, index) => ({
        id: `for-you-${user.id}`,
        actionLabel: "Enviar mensaje",
        tab: "for_you",
        meta: [`11 d`, `17 d`, `1 mes`, `2 mes`][index] || "Hace poco",
        text: `${user.display_name || user.username} ha aceptado tu solicitud de amistad.`,
        user
      })),
      unread: (workspace?.dms || [])
        .filter((dm) => dm.unread_count)
        .slice(0, 4)
        .map((dm) => {
          const user =
            dm.participants.find((participant) => participant.id !== currentUserId) || null;

          return {
            actionLabel: "Abrir chat",
            channelId: dm.id,
            id: `unread-${dm.id}`,
            meta: dm.unread_count === 1 ? "1 no leido" : `${dm.unread_count} no leidos`,
            tab: "unread",
            text: `${dm.display_name} tiene actividad pendiente para ti.`,
            user
          };
        }),
      mentions: activeGuild
        ? [
            {
              actionLabel: "Ver canal",
              channelId: activeSelection.channelId,
              id: `mention-${activeGuild.id}`,
              meta: activeChannel?.name ? `#${activeChannel.name}` : "Canal actual",
              tab: "mentions",
              text: `Actividad reciente en ${activeGuild.name} puede requerir tu atencion.`,
              user: currentUser
            }
          ]
        : []
    }),
    [
      activeChannel?.name,
      activeGuild,
      activeSelection.channelId,
      friendUsers,
      currentUser,
      currentUserId,
      workspace?.dms
    ]
  );
  const inboxCount = inboxItems.unread.length + inboxItems.mentions.length;
  const currentInboxItems = inboxItems[inboxTab] || [];
  const availableUsersById = useMemo(
    () => Object.fromEntries((workspace?.available_users || []).map((user) => [user.id, user])),
    [workspace?.available_users]
  );
  const voiceUsers = useMemo(
    () =>
      voiceUserIds
        .map((userId) => {
          if (currentUserId === userId) {
            return currentUser;
          }

          return (
            activeGuild?.members.find((member) => member.id === userId) ||
            availableUsersById[userId] ||
            null
          );
        })
        .filter(Boolean),
    [activeGuild?.members, availableUsersById, currentUser, currentUserId, voiceUserIds]
  );
  const joinedVoiceChannel =
    (workspace?.guilds || [])
      .flatMap((guild) => guild.channels)
      .find((channel) => channel.id === joinedVoiceChannelId) || null;
  const voiceUsersByChannel = useMemo(
    () =>
      Object.fromEntries(
        activeGuildVoiceChannels.map((channel) => [
          channel.id,
          (voiceSessions[channel.id] || [])
            .map((userId) => {
              if (currentUserId === userId) {
                return currentUser;
              }

              return (
                activeGuild?.members.find((member) => member.id === userId) ||
                availableUsersById[userId] ||
                null
              );
            })
            .filter(Boolean)
        ])
      ),
    [activeGuild?.members, activeGuildVoiceChannels, availableUsersById, currentUser, currentUserId, voiceSessions]
  );
  const memberList =
    activeSelection.kind === "guild"
      ? isVoiceChannel
        ? voiceUsers
        : activeGuild?.members || []
      : activeChannel?.participants || [];
  const memberGroups = useMemo(() => buildMemberGroups(memberList), [memberList]);
  const voiceStageParticipants = useMemo(
    () =>
      voiceUsers.map((user) => ({
        ...user,
        isStreaming: user.id === currentUserId && voiceState.screenShareEnabled,
        isCameraOn: user.id === currentUserId && voiceState.cameraEnabled,
        stageStyle: buildVoiceStageTone(user.avatar_hue || 220)
      })),
    [currentUserId, voiceState.cameraEnabled, voiceState.screenShareEnabled, voiceUsers]
  );
  const headerSearchPlaceholder = activeGuild
    ? `Buscar ${activeGuild.name}`
    : `Buscar ${activeChannel?.display_name || "Umbra"}`;
  const inputMeterBars = Array.from({ length: 18 }, (_, index) => index);
  const activeInputBars = Math.max(
    0,
    Math.round((voiceInputLevel / 100) * inputMeterBars.length)
  );
  const voiceSuppressionLabel =
    voiceInputStatus.engine === "speex"
      ? "Speex DSP activo"
      : voiceInputStatus.engine === "native"
        ? "Filtro nativo del navegador"
        : "Sin supresion adicional";
  const voiceSuppressionCopy = voiceInputStatus.error
    ? voiceInputStatus.error
    : voiceState.noiseSuppression
      ? voiceInputStatus.ready
        ? "Umbra esta limpiando el ruido del microfono en tiempo real."
        : "Activa la supresion y Umbra preparara el microfono cuando abras voz."
      : "La entrada llega sin filtro adicional para mantener la voz natural.";
  const voiceProfileOptions = [
    {
      description: "Filtro fuerte para reducir fondo y ruido continuo.",
      id: "isolation",
      label: "Aislamiento de voz",
      settings: {
        inputProfile: "isolation",
        inputVolume: 76,
        noiseSuppression: true
      }
    },
    {
      description: "Entrada mas natural para microfonos limpios o estudio.",
      id: "studio",
      label: "Estudio",
      settings: {
        inputProfile: "studio",
        inputVolume: 82,
        noiseSuppression: false
      }
    },
    {
      description: "Control manual del volumen y del filtro.",
      id: "custom",
      label: "Personalizar",
      settings: {
        inputProfile: "custom"
      }
    }
  ];
  const activeInputProfile = voiceState.inputProfile || "custom";
  const activeInputProfileLabel =
    voiceProfileOptions.find((option) => option.id === activeInputProfile)?.label || "Personalizar";

  useEffect(() => {
    if (voiceMenu !== "input" && voiceInputPanel) {
      setVoiceInputPanel(null);
    }
  }, [voiceInputPanel, voiceMenu]);

  useEffect(() => {
    if (voiceMenu !== "output" && voiceOutputPanel) {
      setVoiceOutputPanel(null);
    }
  }, [voiceOutputPanel, voiceMenu]);

  useEffect(() => {
    if (!voiceMenu && !voiceInputPanel && !voiceOutputPanel) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        target?.closest?.(".voice-control-menu") ||
        target?.closest?.(".dock-split-control") ||
        target?.closest?.(".voice-stage-menu-shell")
      ) {
        return;
      }

      setVoiceInputPanel(null);
      setVoiceOutputPanel(null);
      if (voiceMenu) {
        toggleVoiceMenu(voiceMenu);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [toggleVoiceMenu, voiceInputPanel, voiceMenu, voiceOutputPanel]);

  function handleApplyVoiceProfile(profile) {
    updateVoiceSetting("inputProfile", profile.id);
    if (typeof profile.settings.noiseSuppression === "boolean") {
      updateVoiceSetting("noiseSuppression", profile.settings.noiseSuppression);
    }
    if (typeof profile.settings.inputVolume === "number") {
      updateVoiceSetting("inputVolume", profile.settings.inputVolume);
    }
    setVoiceInputPanel(null);
    showUiNotice(`Perfil de entrada: ${profile.label}.`);
  }

  function buildUniqueDevices(devices, kind) {
    const seen = new Set();

    return devices.filter((device, index) => {
      const label = String(device.label || fallbackDeviceLabel(kind, index)).trim().toLowerCase();
      if (seen.has(label)) {
        return false;
      }
      seen.add(label);
      return true;
    });
  }

  if (booting) {
    return <div className="boot-screen">Despertando Umbra...</div>;
  }

  if (!workspace) {
    return (
      <div className="boot-screen">
        <div className="boot-failure-card">
          <strong>No se pudo cargar tu espacio en Umbra.</strong>
          <p>{appError || "Hubo un problema al conectar la app con tu backend local."}</p>
          <button
            className="primary-button"
            onClick={() => {
              setBooting(true);
              setAppError("");
              loadBootstrap();
            }}
            type="button"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  function renderInputMenu() {
    const inputDevices = voiceDevices.audioinput || [];

    function renderInputSubmenu() {
      if (voiceInputPanel === "device") {
        return (
          <div className="floating-surface voice-control-menu voice-control-submenu">
            <div className="voice-control-submenu-header">
              <div className="voice-control-heading">
                <strong>Dispositivo de entrada</strong>
                <small>{getSelectedDeviceLabel("audioinput")}</small>
              </div>
            </div>

            <div className="voice-control-option-list">
              {inputDevices.length ? (
                inputDevices.map((device, index) => {
                  const label = device.label || `Microfono ${index + 1}`;
                  const selected = selectedVoiceDevices.audioinput === device.deviceId;

                  return (
                    <button
                      className={`voice-control-option ${selected ? "selected" : ""}`.trim()}
                      key={device.deviceId || `${label}-${index}`}
                      onClick={() => {
                        handleVoiceDeviceChange("audioinput", device.deviceId);
                        setVoiceInputPanel(null);
                        showUiNotice(`Ahora usando ${label}.`);
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{label}</strong>
                      </span>
                      <i className={`voice-control-radio ${selected ? "selected" : ""}`.trim()} />
                    </button>
                  );
                })
              ) : (
                <div className="voice-control-empty">No hay microfonos disponibles.</div>
              )}
            </div>
          </div>
        );
      }

      if (voiceInputPanel === "profile") {
        return (
          <div className="floating-surface voice-control-menu voice-control-submenu">
            <div className="voice-control-submenu-header">
              <div className="voice-control-heading">
                <strong>Perfil de entrada</strong>
                <small>{activeInputProfileLabel}</small>
              </div>
            </div>

            <div className="voice-control-option-list">
              {voiceProfileOptions.map((profile) => {
                const selected = activeInputProfile === profile.id;

                return (
                  <button
                    className={`voice-control-option ${selected ? "selected" : ""}`.trim()}
                    key={profile.id}
                    onClick={() => handleApplyVoiceProfile(profile)}
                    type="button"
                  >
                    <span>
                      <strong>{profile.label}</strong>
                      <small>{profile.description}</small>
                    </span>
                    <i className={`voice-control-radio ${selected ? "selected" : ""}`.trim()} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      return null;
    }

    return (
      <div className="floating-surface voice-control-menu input-menu">
        <div className="voice-control-menu-header">
          <div className="voice-control-heading">
            <strong>Supresion de ruido</strong>
            <small>{voiceSuppressionLabel}</small>
          </div>
          <div className="voice-control-menu-actions">
            <button
              aria-label={
                voiceState.noiseSuppression
                  ? "Desactivar supresion de ruido"
                  : "Activar supresion de ruido"
              }
              className={`voice-noise-toggle ${voiceState.noiseSuppression ? "active" : ""}`}
              onClick={() => toggleVoiceState("noiseSuppression")}
              type="button"
            >
              <span />
            </button>
            <button
              className="ghost-button icon-only small"
              onClick={() => setVoiceMenu(null)}
              type="button"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <p className={`voice-noise-copy ${voiceInputStatus.error ? "error" : ""}`.trim()}>
          {voiceSuppressionCopy}
        </p>

        <div className="voice-control-divider" />

        <button
          className={`voice-control-link ${voiceInputPanel === "device" ? "panel-open" : ""}`.trim()}
          onClick={() =>
            setVoiceInputPanel((previous) => (previous === "device" ? null : "device"))
          }
          type="button"
        >
          <span>
            <strong>Dispositivo de entrada</strong>
            <small>{getSelectedDeviceLabel("audioinput")}</small>
          </span>
          <Icon name="arrowRight" size={15} />
        </button>

        <button
          className={`voice-control-link ${voiceInputPanel === "profile" ? "panel-open" : ""}`.trim()}
          onClick={() =>
            setVoiceInputPanel((previous) => (previous === "profile" ? null : "profile"))
          }
          type="button"
        >
          <span>
            <strong>Perfil de entrada</strong>
            <small>{activeInputProfileLabel}</small>
          </span>
          <Icon name="arrowRight" size={15} />
        </button>

        <div className="voice-control-slider-block">
          <div className="voice-control-title-row">
            <strong>Volumen de entrada</strong>
            <small>{voiceState.inputVolume}%</small>
          </div>
          <input
            max="100"
            min="0"
            onChange={(event) => {
              updateVoiceSetting("inputProfile", "custom");
              updateVoiceSetting("inputVolume", Number(event.target.value));
            }}
            type="range"
            value={voiceState.inputVolume}
          />
          <div className="voice-input-meter">
            {inputMeterBars.map((bar) => (
              <i className={bar < activeInputBars ? "active" : ""} key={`input-${bar}`} />
            ))}
          </div>
          <small className="voice-control-slider-caption">
            {voiceState.micMuted
              ? "El microfono esta silenciado."
              : voiceInputStatus.ready
                ? "Nivel en vivo del microfono."
                : "Abre este panel o entra a una sala para activar el analizador."}
          </small>
        </div>

        <div className="voice-control-divider" />

        <div className="voice-control-footer">
          <button className="ghost-button small" onClick={() => setSettingsOpen(true)} type="button">
            Ajustes de voz
          </button>
          <button
            className="ghost-button small"
            onClick={() =>
              showUiNotice(
                voiceInputStatus.engine === "speex"
                  ? "Speex DSP esta activo sobre tu microfono."
                  : voiceInputStatus.engine === "native"
                    ? "Umbra esta usando la supresion nativa del navegador."
                    : "La supresion esta desactivada."
              )
            }
            type="button"
          >
            Ver estado
          </button>
        </div>

        {renderInputSubmenu()}
      </div>
    );
  }

  function renderCameraMenu() {
    return (
      <div className="floating-surface voice-control-menu camera-menu">
        <button className="voice-control-link" type="button">
          <span>
            <strong>Camara</strong>
            <small>{getSelectedDeviceLabel("videoinput")}</small>
          </span>
          <Icon name="arrowRight" size={15} />
        </button>

        <div className="voice-control-divider" />

        <button
          className="voice-control-link"
          onClick={() => toggleVoiceState("cameraEnabled")}
          type="button"
        >
          <span>
            <strong>Vista previa de la camara</strong>
            <small>{voiceState.cameraEnabled ? "Activa" : "Inactiva"}</small>
          </span>
          <Icon name="emoji" size={16} />
        </button>

        <button className="voice-control-link" onClick={() => setSettingsOpen(true)} type="button">
          <span>
            <strong>Ajustes de video</strong>
            <small>Configuracion local de Umbra</small>
          </span>
          <Icon name="settings" size={16} />
        </button>
      </div>
    );
  }

  function renderOutputMenu() {
    const outputDevices = buildUniqueDevices(voiceDevices.audiooutput || [], "audiooutput");
    const currentOutputLabel = getSelectedDeviceLabel("audiooutput");
    const isDefaultOutputSelected =
      selectedVoiceDevices.audiooutput === "default" ||
      !outputDevices.some((device) => device.deviceId === selectedVoiceDevices.audiooutput);

    function describeOutputRoute(label, { isDefault = false } = {}) {
      const normalized = String(label || "").toLowerCase();

      if (isDefault) {
        return {
          badge: "Windows",
          description: "Umbra sigue la salida predeterminada del sistema en tiempo real.",
          tone: "system"
        };
      }

      if (/vb-audio|voicemeeter|virtual|cable/.test(normalized)) {
        return {
          badge: "Virtual",
          description: "Ideal para mezclar escenas, streams y rutas sonoras alternativas.",
          tone: "virtual"
        };
      }

      if (/bluetooth|airpods|buds|wireless/.test(normalized)) {
        return {
          badge: "Inalambrico",
          description: "Salida ligera para moverte por Umbra sin cables de por medio.",
          tone: "wireless"
        };
      }

      if (/usb|headset|audif|auric|webcam/.test(normalized)) {
        return {
          badge: "USB",
          description: "Ruta estable para monitoreo directo, llamadas y sesiones largas.",
          tone: "usb"
        };
      }

      if (/speaker|altavoc|realtek|high definition|hd audio/.test(normalized)) {
        return {
          badge: "Sistema",
          description: "Salida principal del equipo, limpia y lista para escuchar el canal.",
          tone: "system"
        };
      }

      return {
        badge: "Ruta",
        description: "Una salida disponible para dejar pasar la voz y el ambiente de Umbra.",
        tone: "umbra"
      };
    }

    const currentOutputRoute = describeOutputRoute(currentOutputLabel, {
      isDefault: isDefaultOutputSelected
    });

    function renderOutputSubmenu() {
      if (voiceOutputPanel !== "device") {
        return null;
      }

      return (
        <div className="floating-surface voice-control-menu voice-control-submenu">
          <div className="voice-control-submenu-header">
            <div className="voice-control-heading">
              <strong>Ruta de salida</strong>
              <small>Escoge por donde Umbra deja caer la voz del canal.</small>
            </div>
          </div>

          <div className="voice-control-option-list voice-output-choice-list">
            <button
              className={`voice-control-option voice-output-choice ${
                isDefaultOutputSelected ? "selected" : ""
              }`.trim()}
              onClick={() => {
                handleVoiceDeviceChange("audiooutput", "default");
                setVoiceOutputPanel(null);
                showUiNotice("Salida en configuracion predeterminada de Windows.");
              }}
              type="button"
            >
              <span className="voice-output-choice-copy">
                <strong>Configuracion predeterminada de Windows</strong>
                <small>{describeOutputRoute(currentOutputLabel, { isDefault: true }).description}</small>
              </span>
              <span className="voice-output-choice-meta">
                <em className="voice-route-badge system">Windows</em>
                <i className={`voice-control-radio ${isDefaultOutputSelected ? "selected" : ""}`.trim()} />
              </span>
            </button>

            {outputDevices.map((device, index) => {
              const label = device.label || fallbackDeviceLabel("audiooutput", index);
              const selected = selectedVoiceDevices.audiooutput === device.deviceId;
              const route = describeOutputRoute(label);

              return (
                <button
                  className={`voice-control-option voice-output-choice ${selected ? "selected" : ""}`.trim()}
                  key={device.deviceId || `${label}-${index}`}
                  onClick={() => {
                    handleVoiceDeviceChange("audiooutput", device.deviceId);
                    setVoiceOutputPanel(null);
                    showUiNotice(`Salida: ${label}.`);
                  }}
                  type="button"
                >
                  <span className="voice-output-choice-copy">
                    <strong>{label}</strong>
                    <small>{route.description}</small>
                  </span>
                  <span className="voice-output-choice-meta">
                    <em className={`voice-route-badge ${route.tone}`.trim()}>{route.badge}</em>
                    <i className={`voice-control-radio ${selected ? "selected" : ""}`.trim()} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="floating-surface voice-control-menu output-menu">
        <button
          className={`voice-control-link voice-route-card ${
            voiceOutputPanel === "device" ? "panel-open" : ""
          }`.trim()}
          onClick={() =>
            setVoiceOutputPanel((previous) => (previous === "device" ? null : "device"))
          }
          type="button"
        >
          <span className="voice-route-card-copy">
            <small className="voice-route-eyebrow">Ruta sonora</small>
            <strong>{currentOutputLabel}</strong>
            <small>{currentOutputRoute.description}</small>
          </span>
          <span className="voice-route-card-meta">
            <em className={`voice-route-badge ${currentOutputRoute.tone}`.trim()}>
              {currentOutputRoute.badge}
            </em>
            <Icon name="arrowRight" size={15} />
          </span>
        </button>

        <div className="voice-control-divider" />

        <div className="voice-control-slider-block">
          <div className="voice-control-title-row">
            <strong>Volumen de salida</strong>
            <small>{voiceState.outputVolume}%</small>
          </div>
          <input
            max="100"
            min="0"
            onChange={(event) => updateVoiceSetting("outputVolume", Number(event.target.value))}
            type="range"
            value={voiceState.outputVolume}
          />
        </div>

        <div className="voice-control-divider" />

        <div className="voice-control-footer">
          <button className="ghost-button small" onClick={() => setSettingsOpen(true)} type="button">
            Ajustes de voz
          </button>
        </div>

        {renderOutputSubmenu()}
      </div>
    );
  }

  function renderShareMenu() {
    return (
      <div className="floating-surface voice-control-menu share-menu">
        <button
          className={`voice-control-link danger ${voiceState.screenShareEnabled ? "active" : ""}`}
          onClick={() => toggleVoiceState("screenShareEnabled")}
          type="button"
        >
          <span>
            <strong>{voiceState.screenShareEnabled ? "Dejar de transmitir" : "Iniciar transmision"}</strong>
          </span>
          <Icon name="screenShare" size={16} />
        </button>

        <button className="voice-control-link" type="button">
          <span>
            <strong>Cambiar transmision</strong>
            <small>Ventana o pantalla local</small>
          </span>
          <Icon name="screenShare" size={16} />
        </button>

        <button className="voice-control-link" type="button">
          <span>
            <strong>Calidad de la transmision</strong>
            <small>720P 30 FPS</small>
          </span>
          <Icon name="arrowRight" size={15} />
        </button>

        <label className="voice-control-check">
          <span>Compartir audio de la transmision</span>
          <input
            checked={voiceState.shareAudio}
            onChange={() => toggleVoiceState("shareAudio")}
            type="checkbox"
          />
        </label>

        <div className="voice-control-divider" />

        <button className="voice-control-link danger" onClick={() => showUiNotice("Registro de incidencias de transmision pendiente.")} type="button">
          <span>
            <strong>Informar problema</strong>
          </span>
          <Icon name="help" size={16} />
        </button>
      </div>
    );
  }


  function handleStartReply(message) {
    setReplyTarget(message);
    setReplyMentionEnabled(true);
    setEditingMessage(null);
    setComposerAttachments([]);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }

  function handleEditMessage(message) {
    setEditingMessage(message);
    setReplyTarget(null);
    setReplyMentionEnabled(true);
    setComposerAttachments([]);
    setComposer(message.content);
  }

  function openDialog(type, meta = {}) {
    setDialog({
      ...meta,
      type,
      currentUserId: workspace.current_user.id
    });
  }

  function handleSelectHome() {
    setActiveSelection({
      channelId: null,
      guildId: null,
      kind: "home"
    });
  }

  function handleSelectGuild(guild) {
    setActiveSelection({
      channelId: guild.channels.find((channel) => !channel.is_voice)?.id || guild.channels[0]?.id || null,
      guildId: guild.id,
      kind: "guild"
    });
  }

  function handleSelectDirectLink(id, notice = null, channelId = null) {
    if (id === "home") {
      handleSelectHome();
      return;
    }

    if (id === "requests") {
      setActiveSelection({
        channelId: null,
        guildId: null,
        kind: "requests"
      });
      return;
    }

    if (id === "dm" && channelId) {
      setActiveSelection({
        channelId,
        guildId: null,
        kind: "dm"
      });
      return;
    }

    if (notice) {
      showUiNotice(notice);
    }
  }

  function renderChatHeaderPanel() {
    if (headerPanel === "threads") {
      return (
        <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
          <div className="header-panel-title">
            <Icon name="threads" size={18} />
            <strong>Hilos</strong>
          </div>
          <div className="header-empty-state">
            <Icon name="threads" size={34} />
            <strong>No hay hilos activos.</strong>
            <span>Cuando abras o sigas hilos en este canal apareceran aqui.</span>
          </div>
        </div>
      );
    }

    if (headerPanel === "notifications") {
      return (
        <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
          <div className="header-notification-menu">
            <button className="header-menu-row" type="button">
              <span>
                <strong>Silenciar canal</strong>
              </span>
              <Icon name="arrowRight" size={16} />
            </button>
            <div className="header-menu-divider" />
            <div className="header-menu-choice active">
              <span>
                <strong>Usar la categoria predeterminada</strong>
                <small>Todos los mensajes</small>
              </span>
              <i />
            </div>
            <div className="header-menu-choice">
              <span>
                <strong>Todos los mensajes</strong>
              </span>
              <i />
            </div>
            <div className="header-menu-choice">
              <span>
                <strong>Solo @mentions</strong>
              </span>
              <i />
            </div>
            <div className="header-menu-choice">
              <span>
                <strong>Nada</strong>
              </span>
              <i />
            </div>
          </div>
        </div>
      );
    }

    if (headerPanel === "pins") {
      return (
        <div className="floating-surface chat-header-panel compact-panel" ref={headerPanelRef}>
          <div className="header-panel-title">
            <Icon name="pin" size={18} />
            <strong>Mensajes fijados</strong>
          </div>
          <div className="header-empty-state pins-empty-state">
            <Icon name="pin" size={38} />
            <strong>Este canal no tiene ningun mensaje fijado.</strong>
            <span>Cuando fijes mensajes desde el chat, Umbra los mostrara aqui.</span>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className={`desktop-shell theme-${theme}`}>
      <DesktopTopbar
        activeGuild={activeGuild}
        currentInboxItems={currentInboxItems}
        desktopTitle={desktopTitle}
        headerPanel={headerPanel}
        headerPanelRef={headerPanelRef}
        inboxCount={inboxCount}
        inboxTab={inboxTab}
        onHandleInboxItemAction={handleInboxItemAction}
        onInboxTabChange={setInboxTab}
        onShowNotice={showUiNotice}
        onToggleHeaderPanel={toggleHeaderPanel}
        topbarActionsRef={topbarActionsRef}
      />

      <div className={`app-shell ${membersPanelVisible ? "" : "members-collapsed"}`.trim()}>
        <WorkspaceNavigation
          activeGuild={activeGuild}
          activeGuildTextChannels={activeGuildTextChannels}
          activeGuildVoiceChannels={activeGuildVoiceChannels}
          activeSelection={activeSelection}
          currentUserLabel={currentUserLabel}
          directUnreadCount={directUnreadCount}
          hoveredVoiceChannelId={hoveredVoiceChannelId}
          inputMenuNode={voiceMenu === "input" && !isVoiceChannel ? renderInputMenu() : null}
          outputMenuNode={voiceMenu === "output" && !isVoiceChannel ? renderOutputMenu() : null}
          isVoiceChannel={isVoiceChannel}
          joinedVoiceChannel={joinedVoiceChannel}
          joinedVoiceChannelId={joinedVoiceChannelId}
          onHandleVoiceLeave={handleVoiceLeave}
          onOpenDialog={openDialog}
          onOpenProfileCard={openProfileCard}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectDirectLink={handleSelectDirectLink}
          onSelectGuild={handleSelectGuild}
          onSelectGuildChannel={handleSelectGuildChannel}
          onSelectHome={handleSelectHome}
          onSetHoveredVoiceChannelId={setHoveredVoiceChannelId}
          onShowNotice={showUiNotice}
          onToggleVoiceMenu={toggleVoiceMenu}
          onToggleVoiceState={toggleVoiceState}
          voiceMenu={voiceMenu}
          voiceSessions={voiceSessions}
          voiceState={voiceState}
          voiceUsersByChannel={voiceUsersByChannel}
          workspace={workspace}
        />

        <main className="chat-stage">
          {activeSelection.kind === "home" ? (
            <>
              {appError ? <div className="error-banner">{appError}</div> : null}
              <Suspense fallback={<WorkspacePanelFallback />}>
                <FriendsHome
                  onOpenDm={handleOpenDmFromCard}
                  onOpenProfileCard={openProfileCard}
                  onShowNotice={showUiNotice}
                  users={friendUsers}
                />
              </Suspense>
            </>
          ) : activeSelection.kind === "requests" ? (
            <>
              {appError ? <div className="error-banner">{appError}</div> : null}
              <Suspense fallback={<WorkspacePanelFallback />}>
                <MessageRequestsHome
                  onOpenDm={handleOpenDmFromCard}
                  onShowNotice={showUiNotice}
                  requests={workspace.message_requests || []}
                  spam={workspace.message_request_spam || []}
                />
              </Suspense>
            </>
          ) : (
            <>
              <ChatHeader
                headerActionsRef={headerActionsRef}
                headerPanel={headerPanel}
                headerPanelNode={renderChatHeaderPanel()}
                headerSearchPlaceholder={headerSearchPlaceholder}
                membersPanelVisible={membersPanelVisible}
                onOpenDialog={openDialog}
                onToggleHeaderPanel={toggleHeaderPanel}
                onToggleMembersPanel={() => setMembersPanelVisible((previous) => !previous)}
                subtitle={activeGuild?.name || headerCopy.eyebrow}
                title={headerCopy.title}
              />

              {appError ? <div className="error-banner">{appError}</div> : null}

              {isVoiceChannel ? (
                <Suspense fallback={<WorkspacePanelFallback />}>
                  <VoiceRoomStage
                    activeChannel={activeChannel}
                    cameraMenuNode={voiceMenu === "camera" ? renderCameraMenu() : null}
                    inputMenuNode={voiceMenu === "input" ? renderInputMenu() : null}
                    joinedVoiceChannelId={joinedVoiceChannelId}
                    onHandleVoiceLeave={handleVoiceLeave}
                    onJoinVoiceChannel={() => handleSelectGuildChannel(activeChannel)}
                    onOpenProfileCard={openProfileCard}
                    onShowNotice={showUiNotice}
                    onToggleVoiceMenu={toggleVoiceMenu}
                    onToggleVoiceState={toggleVoiceState}
                    shareMenuNode={voiceMenu === "share" ? renderShareMenu() : null}
                    voiceMenu={voiceMenu}
                    voiceStageParticipants={voiceStageParticipants}
                    voiceState={voiceState}
                    workspace={workspace}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<WorkspacePanelFallback />}>
                  <MessageStage
                    activeChannel={activeChannel}
                    activeSelectionKind={activeSelection.kind}
                    attachmentInputRef={attachmentInputRef}
                    composer={composer}
                    composerAttachments={composerAttachments}
                    composerMenuOpen={composerMenuOpen}
                    composerPicker={composerPicker}
                    composerRef={composerRef}
                    editingMessage={editingMessage}
                    handleAttachmentSelection={handleAttachmentSelection}
                    handleComposerChange={handleComposerChange}
                    handleComposerShortcut={handleComposerShortcut}
                    handleDeleteMessage={handleDeleteMessage}
                    handlePickerInsert={handlePickerInsert}
                    handleReaction={handleReaction}
                    handleScroll={handleScroll}
                    handleSubmitMessage={handleSubmitMessage}
                    listRef={listRef}
                    loadingMessages={loadingMessages}
                    messageMenuFor={messageMenuFor}
                    messages={messages}
                    onCancelEdit={() => {
                      setEditingMessage(null);
                      setComposerAttachments([]);
                      setComposer("");
                    }}
                    onCancelReply={() => {
                      setReplyTarget(null);
                      setReplyMentionEnabled(true);
                    }}
                    onEditMessage={handleEditMessage}
                    onSetComposerMenuOpen={setComposerMenuOpen}
                    onSetComposerPicker={setComposerPicker}
                    onSetMessageMenuFor={setMessageMenuFor}
                    onSetReactionPickerFor={setReactionPickerFor}
                    onStartReply={handleStartReply}
                    onToggleReplyMention={() => setReplyMentionEnabled((previous) => !previous)}
                    openProfileCard={openProfileCard}
                    reactionPickerFor={reactionPickerFor}
                    removeComposerAttachment={removeComposerAttachment}
                    replyMentionEnabled={replyMentionEnabled}
                    replyTarget={replyTarget}
                    showUiNotice={showUiNotice}
                    typingUsers={typingUsers}
                    uiNotice={uiNotice}
                    uploadingAttachments={uploadingAttachments}
                    availableUsersById={availableUsersById}
                    workspace={workspace}
                  />
                </Suspense>
              )}
            </>
          )}
        </main>

        {membersPanelVisible ? (
          <MembersPanel
            activeNowUsers={activeNowUsers}
            activeSelectionKind={activeSelection.kind}
            memberGroups={memberGroups}
            memberList={memberList}
            onOpenProfileCard={openProfileCard}
            workspace={workspace}
          />
        ) : null}

        {settingsOpen ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <SettingsModal
              dmCount={workspace.dms.length}
              guildCount={workspace.guilds.length}
              onClose={() => setSettingsOpen(false)}
              onSignOut={onSignOut}
              onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
              onUpdateProfile={handleProfileUpdate}
              theme={theme}
              user={workspace.current_user}
            />
          </Suspense>
        ) : null}

        {profileCard ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <UserProfileCard
              card={profileCard}
              onChangeStatus={handleStatusChange}
              onClose={() => setProfileCard(null)}
              onOpenDm={handleOpenDmFromCard}
              onOpenSelfProfile={() => {
                setProfileCard(null);
                setSettingsOpen(true);
              }}
            />
          </Suspense>
        ) : null}

        {dialog ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <Dialog
              dialog={dialog}
              onClose={() => setDialog(null)}
              onSubmit={handleDialogSubmit}
              users={dialog.type === "dm_group" ? friendUsers : workspace.available_users}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
