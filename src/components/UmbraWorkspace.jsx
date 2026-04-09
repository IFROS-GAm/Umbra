import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api.js";
import { Icon } from "./Icon.jsx";
import { UserProfileCard } from "./UserProfileCard.jsx";
import { UserProfileModal } from "./UserProfileModal.jsx";
import { ChatHeader } from "./workspace/ChatHeader.jsx";
import { DesktopTopbar } from "./workspace/DesktopTopbar.jsx";
import { MembersPanel } from "./workspace/MembersPanel.jsx";
import { WorkspaceNavigation } from "./workspace/WorkspaceNavigation.jsx";
import {
  applyServerFolderAction,
  reorderGuildList,
  sanitizeServerFolders,
  toggleServerFolder
} from "./workspace/serverFolders.js";
import {
  buildMemberGroups,
  buildVoiceStageTone,
  findDirectDmByUserId,
  fallbackDeviceLabel,
  isVisibleStatus,
  resolveGuildIcon
} from "./workspace/workspaceHelpers.js";
import { useUmbraWorkspaceCore } from "./workspace/useUmbraWorkspaceCore.js";

const lazyNamed = (loader, exportName) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] })));

const Dialog = lazyNamed(() => import("./Dialog.jsx"), "Dialog");
const ConfirmActionModal = lazyNamed(
  () => import("./ConfirmActionModal.jsx"),
  "ConfirmActionModal"
);
const FriendsHome = lazyNamed(() => import("./FriendsHome.jsx"), "FriendsHome");
const InviteServerModal = lazyNamed(() => import("./InviteServerModal.jsx"), "InviteServerModal");
const MessageRequestsHome = lazyNamed(
  () => import("./MessageRequestsHome.jsx"),
  "MessageRequestsHome"
);
const ServerSettingsModal = lazyNamed(
  () => import("./ServerSettingsModal.jsx"),
  "ServerSettingsModal"
);
const SettingsModal = lazyNamed(() => import("./SettingsModal.jsx"), "SettingsModal");
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

export function UmbraWorkspace({
  accessToken,
  initialSelection = null,
  language = "es",
  onChangeLanguage,
  onSignOut
}) {
  const {
    activeChannel, activeGuild, activeGuildTextChannels, activeGuildVoiceChannels, activeSelection,
    appError, attachmentInputRef, booting, cameraStatus, cameraStream, composer, composerAttachments, composerMenuOpen,
    composerPicker, composerRef, currentUserLabel, dialog, directUnreadCount, editingMessage,
    handleAttachmentSelection, handleComposerChange, handleComposerShortcut, handleDeleteMessage,
    handleDialogSubmit, handlePickerInsert, handleProfileUpdate, handleReaction, handleScroll,
    handleStickerSelect,
    handleJoinDirectCall, handleSelectGuildChannel, handleStatusChange, handleSubmitMessage, handleVoiceDeviceChange, handleVoiceLeave,
    headerActionsRef, headerCopy, headerPanel, headerPanelRef, hoveredVoiceChannelId, inboxTab,
    isVoiceChannel, joinedVoiceChannelId, listRef, loadBootstrap, loadingMessages, messageMenuFor, messages,
    membersPanelVisible, profileCard, reactionPickerFor, removeComposerAttachment,
    replyMentionEnabled, replyTarget, setActiveSelection, setBooting, setComposer,
    setComposerAttachments, setComposerMenuOpen, setComposerPicker, setDialog, setEditingMessage,
    setHeaderPanel, setHoveredVoiceChannelId, setInboxTab, setMembersPanelVisible,
    setMessageMenuFor, setProfileCard, setReactionPickerFor, setAppError, setWorkspace,
    setReplyMentionEnabled, setReplyTarget, setSettingsOpen, setTheme, theme, settingsOpen,
    showUiNotice, toggleHeaderPanel, toggleVoiceMenu, toggleVoiceState, topbarActionsRef,
    typingUsers, uiNotice, updateVoiceSetting, uploadingAttachments, voiceDevices, voiceMenu,
    voiceSessions, voiceState, voiceUserIds, voiceInputLevel, voiceInputSpeaking, voiceInputStatus, workspace,
    cycleVoiceDevice, getSelectedDeviceLabel, selectedVoiceDevices
  } = useUmbraWorkspaceCore({ accessToken, initialSelection, onSignOut });
  const [voiceInputPanel, setVoiceInputPanel] = useState(null);
  const [voiceOutputPanel, setVoiceOutputPanel] = useState(null);
  const [fullProfile, setFullProfile] = useState(null);
  const [isResizingMembersPanel, setIsResizingMembersPanel] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.visualViewport?.width || window.innerWidth : 1440
  );
  const [membersPanelWidth, setMembersPanelWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("umbra-members-panel-width"));
      return Number.isFinite(saved) && saved >= 340 && saved <= 520 ? saved : 356;
    } catch {
      return 356;
    }
  });
  const [serverSettingsGuildId, setServerSettingsGuildId] = useState(null);
  const [leaveGuildTarget, setLeaveGuildTarget] = useState(null);
  const [leavingGuild, setLeavingGuild] = useState(false);
  const [inviteModalState, setInviteModalState] = useState({
    error: "",
    guildId: null,
    invite: null,
    loading: false,
    open: false
  });
  const [guildMenuPrefs, setGuildMenuPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem("umbra-guild-menu-prefs");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [dmMenuPrefs, setDmMenuPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem("umbra-dm-menu-prefs");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [serverFolders, setServerFolders] = useState([]);
  const openingDmRequestsRef = useRef(new Map());
  const desktopShellRef = useRef(null);
  const appShellRef = useRef(null);
  const membersResizeRef = useRef(null);
  const membersResizeCleanupRef = useRef(null);

  const currentUser = workspace?.current_user || null;
  const currentUserId = currentUser?.id || "";
  const isDirectConversation = activeSelection?.kind === "dm";
  const isGroupDirectConversation = isDirectConversation && activeChannel?.type === "group_dm";
  const isCallableDirectConversation =
    isDirectConversation && ["dm", "group_dm"].includes(activeChannel?.type || "");
  const serverSettingsGuild =
    workspace?.guilds.find((guild) => guild.id === serverSettingsGuildId) || null;
  const inviteTargetGuild =
    workspace?.guilds.find((guild) => guild.id === inviteModalState.guildId) || null;
  const isSingleDirectMessagePanel =
    membersPanelVisible && isDirectConversation && activeChannel?.type === "dm";
  const resolvedMembersPanelWidth = isSingleDirectMessagePanel ? membersPanelWidth : 292;
  const resolvedMembersPanelMinWidth = isSingleDirectMessagePanel ? 320 : 292;
  const minimumNavigatorWidth = 272;
  const minimumChatStageWidth = isSingleDirectMessagePanel ? 540 : 500;
  const effectiveNavigatorVisible =
    viewportWidth >= 78 + minimumNavigatorWidth + minimumChatStageWidth;
  const requiredViewportWidth =
    78 +
    (effectiveNavigatorVisible ? minimumNavigatorWidth : 0) +
    resolvedMembersPanelWidth +
    (isSingleDirectMessagePanel ? 10 : 0) +
    minimumChatStageWidth;
  const effectiveMembersPanelVisible =
    membersPanelVisible && viewportWidth >= requiredViewportWidth;

  useEffect(() => {
    localStorage.setItem("umbra-guild-menu-prefs", JSON.stringify(guildMenuPrefs));
  }, [guildMenuPrefs]);

  useEffect(() => {
    localStorage.setItem("umbra-dm-menu-prefs", JSON.stringify(dmMenuPrefs));
  }, [dmMenuPrefs]);

  useEffect(() => {
    if (!currentUserId) {
      setServerFolders([]);
      return;
    }

    try {
      const saved = localStorage.getItem(`umbra-server-folders-${currentUserId}`);
      const parsed = saved ? JSON.parse(saved) : [];
      setServerFolders(sanitizeServerFolders(parsed, workspace?.guilds || []));
    } catch {
      setServerFolders([]);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!workspace?.guilds) {
      return;
    }

    setServerFolders((previous) => sanitizeServerFolders(previous, workspace.guilds));
  }, [workspace?.guilds]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    try {
      localStorage.setItem(
        `umbra-server-folders-${currentUserId}`,
        JSON.stringify(serverFolders)
      );
    } catch {
      // Ignore local preference persistence issues.
    }
  }, [currentUserId, serverFolders]);

  useEffect(() => {
    try {
      localStorage.setItem("umbra-members-panel-width", String(membersPanelWidth));
    } catch {
      // Ignore local-only persistence issues.
    }
  }, [membersPanelWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function updateViewportWidth() {
      const measuredWidth =
        appShellRef.current?.getBoundingClientRect?.().width ||
        desktopShellRef.current?.getBoundingClientRect?.().width ||
        window.visualViewport?.width ||
        window.innerWidth;
      setViewportWidth((previous) =>
        Math.abs(previous - measuredWidth) > 1 ? measuredWidth : previous
      );
    }

    updateViewportWidth();

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateViewportWidth());
      if (desktopShellRef.current) {
        resizeObserver.observe(desktopShellRef.current);
      }
      if (appShellRef.current) {
        resizeObserver.observe(appShellRef.current);
      }
    }

    window.addEventListener("resize", updateViewportWidth);
    window.visualViewport?.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
      window.visualViewport?.removeEventListener("resize", updateViewportWidth);
      resizeObserver?.disconnect();
    };
  }, []);

  const shellGridTemplateColumns = useMemo(() => {
    const columns = ["78px"];

    if (effectiveNavigatorVisible) {
      columns.push("272px");
    }

    columns.push("minmax(0, 1fr)");

    if (effectiveMembersPanelVisible) {
      if (isSingleDirectMessagePanel) {
        columns.push("10px");
      }

      columns.push(`${resolvedMembersPanelWidth}px`);
    }

    return columns.join(" ");
  }, [
    effectiveMembersPanelVisible,
    effectiveNavigatorVisible,
    isSingleDirectMessagePanel,
    resolvedMembersPanelWidth
  ]);

  useEffect(
    () => () => {
      if (membersResizeCleanupRef.current) {
        membersResizeCleanupRef.current();
        membersResizeCleanupRef.current = null;
      }
    },
    []
  );

  function formatMemberSinceLabel(isoDate) {
    if (!isoDate) {
      return "";
    }

    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(isoDate));
  }

  function extractProfileLinks(text = "") {
    return [...String(text).matchAll(/https?:\/\/[^\s]+/gi)].map((match, index) => ({
      href: match[0],
      id: `link-${index}`,
      label: match[0].replace(/^https?:\/\//i, "")
    }));
  }

  function normalizeProfileSocialLinks(entries = []) {
    const source = Array.isArray(entries) ? entries : [];
    return source
      .map((entry, index) => ({
        href: String(entry?.url || "").trim(),
        id: String(entry?.id || `profile-link-${index}`),
        label: String(entry?.label || "").trim(),
        platform: String(entry?.platform || "website").trim() || "website"
      }))
      .filter((entry) => entry.href || entry.label);
  }

  function normalizeProfilePrivacy(settings = {}) {
    const source = settings && typeof settings === "object" ? settings : {};
    return {
      allowDirectMessages: source.allowDirectMessages !== false,
      showActivityStatus: source.showActivityStatus !== false,
      showMemberSince: source.showMemberSince !== false,
      showSocialLinks: source.showSocialLinks !== false
    };
  }

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
      (guild.members || []).some((member) => member.id === targetUser.id)
    );
    const sharedDms = workspace.dms.filter((dm) =>
      dm.participants.some((participant) => participant.id === targetUser.id)
    );
    const sharedGuildEntries = sharedGuilds.map((guild) => {
      const member = (guild.members || []).find((item) => item.id === targetUser.id) || null;

      return {
        id: guild.id,
        iconUrl: resolveGuildIcon(guild),
        joinedAt: member?.joined_at || null,
        memberCount: guild.member_count || guild.members?.length || 0,
        name: guild.name
      };
    });
    const commonFriends = (workspace.friends || [])
      .filter((friend) => {
        if (!friend?.id || friend.id === targetUser.id || friend.id === workspace.current_user.id) {
          return false;
        }

        return sharedGuilds.some((guild) =>
          (guild.members || []).some((member) => member.id === friend.id)
        );
      })
      .slice(0, 8);
    const friendRequestSent =
      (workspace.friend_requests_sent || []).find(
        (request) => (request.user?.id || request.recipient_id) === targetUser.id
      ) || null;
    const friendRequestReceived =
      (workspace.friend_requests_received || []).find(
        (request) => (request.user?.id || request.requester_id) === targetUser.id
      ) || null;
    const accountCreatedAt =
      targetUser.created_at ||
      fallbackProfile?.created_at ||
      activeGuildMember?.created_at ||
      activeParticipant?.created_at ||
      null;
    const memberSinceLabel = formatMemberSinceLabel(accountCreatedAt);
    const bio =
      targetUser.bio ||
      activeGuildMember?.bio ||
      activeParticipant?.bio ||
      fallbackProfile?.bio ||
      "";
    const privacySettings = normalizeProfilePrivacy(
      targetUser.privacy_settings || fallbackProfile?.privacy_settings
    );
    const infoLines = bio
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const extractedLinks = extractProfileLinks(bio);
    const socialLinks = normalizeProfileSocialLinks(
      targetUser.social_links || fallbackProfile?.social_links
    );
    const visibleConnections = privacySettings.showSocialLinks
      ? socialLinks.length
        ? socialLinks.map((link) => ({
            href: link.href,
            id: link.id,
            kind: "link",
            label: link.label || link.href.replace(/^https?:\/\//i, ""),
            meta: link.platform
          }))
        : extractedLinks.map((link) => ({
            ...link,
            kind: "link",
            meta: "Enlace compartido en su perfil"
          }))
      : [];

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
      bio,
      connections: [
        ...sharedGuildEntries.slice(0, 6).map((guild) => ({
          iconUrl: guild.iconUrl,
          id: `guild-${guild.id}`,
          kind: "guild",
          label: guild.name,
          meta: guild.joinedAt
            ? `Miembro desde ${formatMemberSinceLabel(guild.joinedAt)}`
            : `${guild.memberCount} miembros visibles`
        })),
        ...visibleConnections
      ],
      customStatus: privacySettings.showActivityStatus
        ? targetUser.custom_status ||
          activeGuildMember?.custom_status ||
          activeParticipant?.custom_status ||
          fallbackProfile?.custom_status ||
          ""
        : "",
      discriminator:
        targetUser.discriminator || fallbackProfile?.discriminator || null,
      displayName:
        displayNameOverride ||
        targetUser.display_name ||
        activeGuildMember?.display_name ||
        targetUser.username ||
        fallbackProfile?.username ||
        "Umbra user",
      friendRequestId: friendRequestReceived?.id || friendRequestSent?.id || null,
      friendRequestState: friendRequestReceived
        ? "received"
        : friendRequestSent
          ? "sent"
          : null,
      infoLines,
      isCurrentUser: workspace.current_user.id === targetUser.id,
      isBlockedByMe: (workspace.blocked_users || []).some((user) => user.id === targetUser.id),
      isFriend: (workspace.friends || []).some((friend) => friend.id === targetUser.id),
      memberSinceLabel: privacySettings.showMemberSince ? memberSinceLabel : "",
      primaryTag: activeGuildMember ? activeGuild?.name || "Miembro" : sharedGuilds[0]?.name || null,
      profileColor:
        targetUser.profile_color ||
        activeGuildMember?.profile_color ||
        activeParticipant?.profile_color ||
        fallbackProfile?.profile_color ||
        "#5865F2",
      roleColor: targetUser.role_color || activeGuildMember?.role_color || null,
      privacySettings,
      commonFriends,
      sharedGuilds: sharedGuildEntries,
      sharedDmCount: sharedDms.length,
      sharedGuildCount: sharedGuilds.length,
      status:
        targetUser.status ||
        activeGuildMember?.status ||
        activeParticipant?.status ||
        fallbackProfile?.status ||
        "offline",
      statusLabel:
        (targetUser.status ||
          activeGuildMember?.status ||
          activeParticipant?.status ||
          fallbackProfile?.status ||
          "offline") === "online"
          ? "Online"
          : (targetUser.status ||
                activeGuildMember?.status ||
                activeParticipant?.status ||
                fallbackProfile?.status ||
                "offline") === "idle"
            ? "Ausente"
            : (targetUser.status ||
                  activeGuildMember?.status ||
                  activeParticipant?.status ||
                  fallbackProfile?.status ||
                  "offline") === "dnd"
              ? "No molestar"
              : (targetUser.status ||
                    activeGuildMember?.status ||
                    activeParticipant?.status ||
                    fallbackProfile?.status ||
                    "offline") === "invisible"
                ? "Invisible"
                : "Offline",
      username:
        targetUser.username || fallbackProfile?.username || targetUser.display_name || "umbra_user"
    };
  }

  async function handleCopyProfileId(profile) {
    if (!profile?.id) {
      showUiNotice("No hay ID visible para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(profile.id));
      showUiNotice("ID del usuario copiado.");
    } catch {
      showUiNotice("No se pudo copiar el ID del usuario.");
    }
  }

  function handleStartMembersResize(event) {
    if (!effectiveMembersPanelVisible || !isSingleDirectMessagePanel) {
      return;
    }

    if (membersResizeCleanupRef.current) {
      membersResizeCleanupRef.current();
      membersResizeCleanupRef.current = null;
    }

    const rightEdge = appShellRef.current?.getBoundingClientRect().right || window.innerWidth;
    membersResizeRef.current = { rightEdge };
    setIsResizingMembersPanel(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const handleMove = (moveEvent) => {
      if (!membersResizeRef.current) {
        return;
      }

      const edge = membersResizeRef.current.rightEdge || window.innerWidth;
      const nextWidth = Math.round(edge - moveEvent.clientX);
      setMembersPanelWidth(Math.max(320, Math.min(460, nextWidth)));
    };
    const handleStop = () => {
      membersResizeRef.current = null;
      setIsResizingMembersPanel(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove, true);
      window.removeEventListener("mouseup", handleStop, true);
      window.removeEventListener("blur", handleStop);
      window.removeEventListener("mouseleave", handleStop);
      membersResizeCleanupRef.current = null;
    };
    membersResizeCleanupRef.current = handleStop;
    window.addEventListener("mousemove", handleMove, true);
    window.addEventListener("mouseup", handleStop, true);
    window.addEventListener("blur", handleStop);
    window.addEventListener("mouseleave", handleStop);
    event.preventDefault();
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

  function openFullProfile(targetUser, displayNameOverride = null) {
    const resolved = buildProfileCardData(targetUser, displayNameOverride);
    if (!resolved) {
      return;
    }

    setFullProfile(resolved);
  }

  async function ensureDirectDmChannel(profile, { loadConversation = true } = {}) {
    if (!profile?.id) {
      return null;
    }

    if (profile.isCurrentUser) {
      setSettingsOpen(true);
      setProfileCard(null);
      return null;
    }

    const existingDm = findDirectDmByUserId(workspace?.dms || [], currentUserId, profile.id);
    if (existingDm) {
      if (loadConversation) {
        setProfileCard(null);
        setActiveSelection({
          channelId: existingDm.id,
          guildId: null,
          kind: "dm"
        });
        await loadBootstrap({
          channelId: existingDm.id,
          guildId: null,
          kind: "dm"
        });
      }
      return existingDm;
    }

    let pendingRequest = openingDmRequestsRef.current.get(profile.id);
    if (!pendingRequest) {
      pendingRequest = api
        .createDm({
          recipientId: profile.id
        })
        .then((payload) => payload.channel)
        .finally(() => {
          if (openingDmRequestsRef.current.get(profile.id) === pendingRequest) {
            openingDmRequestsRef.current.delete(profile.id);
          }
        });
      openingDmRequestsRef.current.set(profile.id, pendingRequest);
    }

    const channel = await pendingRequest;

    if (loadConversation && channel) {
      setProfileCard(null);
      setActiveSelection({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
      await loadBootstrap({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
    }

    return channel;
  }

  async function handleOpenDmFromCard(profile) {
    try {
      await ensureDirectDmChannel(profile, {
        loadConversation: true
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleSendDmFromCard(profile, content) {
    const trimmed = String(content || "").trim();
    if (!trimmed) {
      return;
    }

    try {
      const channel = await ensureDirectDmChannel(profile, {
        loadConversation: false
      });

      if (!channel?.id) {
        return;
      }

      await api.createMessage({
        attachments: [],
        channelId: channel.id,
        content: trimmed,
        replyMentionUserId: null,
        replyTo: null
      });

      setProfileCard(null);
      setActiveSelection({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
      await loadBootstrap({
        channelId: channel.id,
        guildId: null,
        kind: "dm"
      });
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function refreshSocialSelection(notice = "") {
    await loadBootstrap({
      channelId: activeSelection.channelId,
      guildId: activeSelection.guildId,
      kind: activeSelection.kind
    });
    if (notice) {
      showUiNotice(notice);
    }
  }

  async function handleSendFriendRequest(profile) {
    if (!profile?.id || profile.isCurrentUser || profile.isBlockedByMe || profile.isFriend) {
      return;
    }

    try {
      if (profile.friendRequestState === "received" && profile.friendRequestId) {
        await api.acceptFriendRequest({ requestId: profile.friendRequestId });
        await refreshSocialSelection("Ahora son sombras.");
        return;
      }

      if (profile.friendRequestState === "sent") {
        return;
      }

      const payload = await api.sendFriendRequest({ recipientId: profile.id });
      if (payload?.status === "accepted") {
        await refreshSocialSelection("Ahora son sombras.");
        return;
      }

      await refreshSocialSelection(`Solicitud enviada a ${profile.displayName || profile.username}.`);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleAcceptFriendRequest(requestOrProfile) {
    const requestId = requestOrProfile?.id || requestOrProfile?.friendRequestId;
    if (!requestId) {
      return;
    }

    try {
      await api.acceptFriendRequest({ requestId });
      await refreshSocialSelection("Ahora son sombras.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleCancelFriendRequest(requestOrProfile) {
    const requestId = requestOrProfile?.id || requestOrProfile?.friendRequestId;
    if (!requestId) {
      return;
    }

    try {
      await api.cancelFriendRequest({ requestId });
      await refreshSocialSelection("Solicitud actualizada.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleRemoveFriend(profile) {
    if (!profile?.id) {
      return;
    }

    try {
      await api.removeFriend({ friendId: profile.id });
      await refreshSocialSelection("Sombra eliminada.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleBlockUser(profile) {
    if (!profile?.id) {
      return;
    }

    try {
      await api.blockUser({ userId: profile.id });
      setProfileCard(null);
      setFullProfile(null);
      await refreshSocialSelection(`${profile.displayName || profile.username} ha sido bloqueado.`);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleReportUser(profile, reason = "spam") {
    if (!profile?.id) {
      return;
    }

    try {
      await api.reportUser({ reason, userId: profile.id });
      showUiNotice("Reporte enviado.");
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
  const blockedUsers = workspace?.blocked_users || [];
  const pendingFriendRequestsReceived = workspace?.friend_requests_received || [];
  const pendingFriendRequestsSent = workspace?.friend_requests_sent || [];
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

          if (isDirectConversation) {
            return (
              activeChannel?.participants?.find((participant) => participant.id === userId) ||
              availableUsersById[userId] ||
              null
            );
          }

          return (
            activeGuild?.members.find((member) => member.id === userId) ||
            availableUsersById[userId] ||
            null
          );
        })
        .filter(Boolean),
    [
      activeChannel?.participants,
      activeGuild?.members,
      availableUsersById,
      currentUser,
      currentUserId,
      isDirectConversation,
      voiceUserIds
    ]
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
  const directMessageProfile = useMemo(() => {
    if (activeSelection.kind !== "dm" || activeChannel?.type !== "dm" || !workspace?.current_user?.id) {
      return null;
    }

    const other =
      activeChannel.participants?.find((participant) => participant.id !== workspace.current_user.id) ||
      null;

    if (!other) {
      return null;
    }

    return buildProfileCardData(other, other.display_name || other.username || "Umbra user");
  }, [activeChannel, activeSelection.kind, workspace, activeGuild]);
  const isDirectCallActive =
    isCallableDirectConversation && joinedVoiceChannelId === activeChannel?.id;
  const voiceStageParticipants = useMemo(
    () =>
      voiceUsers.map((user) => ({
        ...user,
        isStreaming: user.id === currentUserId && voiceState.screenShareEnabled,
        isCameraOn: user.id === currentUserId && voiceState.cameraEnabled,
        localCameraStream: user.id === currentUserId ? cameraStream : null,
        isSpeaking:
          user.id === currentUserId &&
          !voiceState.micMuted &&
          !voiceState.deafen &&
          voiceInputSpeaking,
        stageStyle: buildVoiceStageTone(user.avatar_hue || 220)
      })),
    [
      cameraStream,
      currentUserId,
      voiceInputSpeaking,
      voiceState.cameraEnabled,
      voiceState.deafen,
      voiceState.micMuted,
      voiceState.screenShareEnabled,
      voiceUsers
    ]
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
            <small>
              {cameraStatus.error
                ? cameraStatus.error
                : voiceState.cameraEnabled && cameraStatus.ready
                  ? cameraStatus.label || "Camara activa"
                  : "Inactiva"}
            </small>
          </span>
          <Icon name="camera" size={16} />
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
    const defaultChannel =
      guild.channels.find((channel) => !channel.is_voice && !channel.is_category) ||
      guild.channels.find((channel) => channel.is_voice) ||
      guild.channels[0] ||
      null;

    setActiveSelection({
      channelId: defaultChannel?.id || null,
      guildId: guild.id,
      kind: "guild"
    });
  }

  async function handleCopyGuildId(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(guildOverride.id);
      showUiNotice("ID del servidor copiado.");
    } catch {
      showUiNotice(`ID del servidor: ${guildOverride.id}`);
    }
  }

  async function openInviteModal(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    setInviteModalState({
      error: "",
      guildId: guildOverride.id,
      invite: null,
      loading: true,
      open: true
    });

    try {
      const payload = await api.createGuildInvite({
        guildId: guildOverride.id
      });
      setInviteModalState({
        error: "",
        guildId: guildOverride.id,
        invite: payload.invite,
        loading: false,
        open: true
      });
      setAppError("");
    } catch (error) {
      setInviteModalState({
        error: error.message,
        guildId: guildOverride.id,
        invite: null,
        loading: false,
        open: true
      });
      setAppError(error.message);
    }
  }

  async function handleSaveGuildProfile(nextGuild) {
    if (!serverSettingsGuild?.id) {
      return;
    }

    try {
      const {
        bannerFile,
        bannerImageUrl: requestedBannerImageUrl,
        clearBanner,
        clearIcon,
        iconFile,
        iconUrl: requestedIconUrl,
        ...guildPatch
      } = nextGuild;

      let iconUrl = requestedIconUrl;
      let bannerImageUrl = requestedBannerImageUrl;

      if (iconFile) {
        const uploadPayload = await api.uploadAttachments([iconFile]);
        iconUrl = uploadPayload.attachments?.[0]?.url;

        if (!iconUrl) {
          throw new Error("No se pudo subir el icono del servidor.");
        }
      } else if (clearIcon) {
        iconUrl = "";
      }

      if (bannerFile) {
        const uploadPayload = await api.uploadAttachments([bannerFile]);
        bannerImageUrl = uploadPayload.attachments?.[0]?.url;

        if (!bannerImageUrl) {
          throw new Error("No se pudo subir el cartel del servidor.");
        }
      } else if (clearBanner) {
        bannerImageUrl = "";
      }

      await api.updateGuild({
        ...guildPatch,
        bannerImageUrl,
        guildId: serverSettingsGuild.id,
        iconUrl
      });

      await loadBootstrap(activeSelection);
      setAppError("");
      showUiNotice("Servidor actualizado.");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  async function handleMoveGuildChannel({
    channelId,
    guildId,
    parentId = null,
    placement = "after",
    relativeToChannelId = null
  }) {
    if (!channelId || !guildId) {
      return;
    }

    try {
      await api.moveChannel({
        channelId,
        guildId,
        parentId,
        placement,
        relativeToChannelId
      });
      await loadBootstrap(activeSelection);
      setAppError("");
    } catch (error) {
      setAppError(error.message);
      showUiNotice(error.message);
    }
  }

  async function handleMoveGuild({
    guildId,
    placement = "after",
    relativeToGuildId = null,
    nextFolderAction = null
  }) {
    if (!guildId) {
      return;
    }

    const previousWorkspace = workspace;
    const previousFolders = serverFolders;
    const currentGuilds = workspace?.guilds || [];
    const optimisticGuilds = reorderGuildList(currentGuilds, {
      guildId,
      placement,
      relativeToGuildId
    });

    setWorkspace((previous) => {
      if (!previous?.guilds?.length) {
        return previous;
      }

      return {
        ...previous,
        guilds: optimisticGuilds
      };
    });

    if (nextFolderAction) {
      setServerFolders((previous) =>
        applyServerFolderAction(previous, optimisticGuilds, {
          guildId,
          nextFolderAction
        })
      );
    }

    try {
      await api.moveGuild({
        guildId,
        placement,
        relativeToGuildId
      });
      setAppError("");
    } catch (error) {
      setWorkspace(previousWorkspace);
      setServerFolders(previousFolders);
      await loadBootstrap(activeSelection);
      setAppError(error.message);
      showUiNotice(error.message);
    }
  }

  function handleToggleServerFolder(folderId) {
    setServerFolders((previous) => toggleServerFolder(previous, folderId));
  }

  function handleUpdateGuildMenuPref(guildId, key, value = null) {
    if (!guildId || !key) {
      return;
    }

    setGuildMenuPrefs((previous) => {
      const current = previous[guildId] || {
        hideMutedChannels: false,
        notificationLevel: "mentions",
        showAllChannels: true
      };

      return {
        ...previous,
        [guildId]: {
          ...current,
          [key]: value === null ? !current[key] : value
        }
      };
    });
  }

  function handleToggleDmMenuPref(dmOrId) {
    const dmId = typeof dmOrId === "string" ? dmOrId : dmOrId?.id;
    if (!dmId) {
      return;
    }

    setDmMenuPrefs((previous) => {
      const current = previous[dmId] || {
        muted: false
      };

      return {
        ...previous,
        [dmId]: {
          ...current,
          muted: !current.muted
        }
      };
    });
  }

  async function handleMarkDmRead(dm) {
    if (!dm?.id) {
      return;
    }

    try {
      await api.markRead({
        channelId: dm.id,
        lastReadMessageId: dm.last_message_id || null
      });
      await loadBootstrap(activeSelection);
      showUiNotice(`Todo al dia en ${dm.display_name || "la conversacion"}.`);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleCopyDmId(dm) {
    if (!dm?.id) {
      showUiNotice("No hay ID visible para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(dm.id));
      showUiNotice("ID del chat copiado.");
    } catch {
      showUiNotice("No se pudo copiar el ID del chat.");
    }
  }

  async function handleCloseDm(dm) {
    if (!dm?.id) {
      return;
    }

    const nextVisibleDms = (workspace?.dms || []).filter((item) => item.id !== dm.id);
    const fallbackDm = nextVisibleDms[0] || null;
    const nextSelection =
      activeSelection.kind === "dm" && activeSelection.channelId === dm.id
        ? fallbackDm
          ? {
              channelId: fallbackDm.id,
              guildId: null,
              kind: "dm"
            }
          : {
              channelId: null,
              guildId: null,
              kind: "home"
            }
        : activeSelection;

    setWorkspace((previous) =>
      previous
        ? {
            ...previous,
            dms: (previous.dms || []).filter((item) => item.id !== dm.id)
          }
        : previous
    );

    if (nextSelection !== activeSelection) {
      setActiveSelection(nextSelection);
    }

    try {
      await api.setDmVisibility({
        channelId: dm.id,
        hidden: true
      });
      await loadBootstrap(nextSelection);
      showUiNotice(`Se oculto ${dm.display_name || "el DM"} del lateral.`);
    } catch (error) {
      await loadBootstrap(activeSelection);
      setAppError(error.message);
    }
  }

  async function handleMarkGuildRead(guild) {
    if (!guild?.id) {
      return;
    }

    try {
      await api.markGuildRead({
        guildId: guild.id
      });
      await loadBootstrap(
        activeSelection.guildId === guild.id
          ? activeSelection
          : {
              channelId: activeSelection.channelId,
              guildId: activeSelection.guildId,
              kind: activeSelection.kind
            }
      );
      showUiNotice(`Todo al dia en ${guild.name}.`);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleLeaveGuild(guild) {
    if (!guild?.id) {
      return;
    }
    setLeaveGuildTarget(guild);
  }

  async function confirmLeaveGuild() {
    if (!leaveGuildTarget?.id) {
      return;
    }

    setLeavingGuild(true);

    try {
      await api.leaveGuild({
        guildId: leaveGuildTarget.id
      });

      const fallbackGuild =
        workspace.guilds.find((item) => item.id !== leaveGuildTarget.id) || null;
      const fallbackChannel =
        fallbackGuild?.channels.find((channel) => !channel.is_voice && !channel.is_category) ||
        fallbackGuild?.channels.find((channel) => channel.is_voice) ||
        fallbackGuild?.channels[0] ||
        null;
      const fallbackSelection = fallbackGuild
        ? {
            channelId: fallbackChannel?.id || null,
            guildId: fallbackGuild.id,
            kind: "guild"
          }
        : {
            channelId: null,
            guildId: null,
            kind: "home"
          };

      setServerSettingsGuildId((previous) => (previous === leaveGuildTarget.id ? null : previous));
      setInviteModalState((previous) =>
        previous.guildId === leaveGuildTarget.id
          ? {
              error: "",
              guildId: null,
              invite: null,
              loading: false,
              open: false
            }
          : previous
      );
      setLeaveGuildTarget(null);
      await loadBootstrap(fallbackSelection);
      showUiNotice(`Saliste de ${leaveGuildTarget.name}.`);
    } catch (error) {
      setAppError(error.message);
    } finally {
      setLeavingGuild(false);
    }
  }

  function handleOpenGuildSettings(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    setServerSettingsGuildId(guildOverride.id);
  }

  function handleOpenGuildPrivacy(guildOverride = activeGuild) {
    if (!guildOverride?.id) {
      return;
    }

    showUiNotice(`Ajustes de privacidad de ${guildOverride.name} en camino.`);
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
    <div className={`desktop-shell theme-${theme}`} ref={desktopShellRef}>
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

      <div
        className={[
          "app-shell",
          effectiveMembersPanelVisible ? "" : "members-collapsed",
          effectiveNavigatorVisible ? "" : "navigator-collapsed"
        ]
          .filter(Boolean)
          .join(" ")}
        ref={appShellRef}
        style={{
          gridTemplateColumns: shellGridTemplateColumns,
          "--navigator-panel-width": effectiveNavigatorVisible ? "272px" : "0px",
          "--members-panel-min-width": `${resolvedMembersPanelMinWidth}px`,
          "--members-panel-resizer-width":
            effectiveMembersPanelVisible && isSingleDirectMessagePanel ? "10px" : "0px",
          "--members-panel-width": `${resolvedMembersPanelWidth}px`
        }}
      >
        {effectiveNavigatorVisible ? (
          <WorkspaceNavigation
            activeGuild={activeGuild}
            activeGuildTextChannels={activeGuildTextChannels}
            activeGuildVoiceChannels={activeGuildVoiceChannels}
            activeSelection={activeSelection}
            currentUserLabel={currentUserLabel}
            directUnreadCount={directUnreadCount}
            dmMenuPrefs={dmMenuPrefs}
            guildMenuPrefs={guildMenuPrefs}
            hoveredVoiceChannelId={hoveredVoiceChannelId}
            inputMenuNode={voiceMenu === "input" && !isVoiceChannel ? renderInputMenu() : null}
            outputMenuNode={voiceMenu === "output" && !isVoiceChannel ? renderOutputMenu() : null}
            isVoiceChannel={isVoiceChannel}
            joinedVoiceChannel={joinedVoiceChannel}
            joinedVoiceChannelId={joinedVoiceChannelId}
            onHandleVoiceLeave={handleVoiceLeave}
            onOpenDialog={openDialog}
            onOpenGuildPrivacy={handleOpenGuildPrivacy}
            onOpenGuildSettings={handleOpenGuildSettings}
            onOpenFullProfile={openFullProfile}
            onOpenInviteModal={openInviteModal}
            onOpenProfileCard={openProfileCard}
            onOpenSettings={() => setSettingsOpen(true)}
            onCloseDm={handleCloseDm}
            onCopyDmId={handleCopyDmId}
            onCopyGuildId={handleCopyGuildId}
            onBlockUser={handleBlockUser}
            onLeaveGuild={handleLeaveGuild}
            onMarkDmRead={handleMarkDmRead}
            onMarkGuildRead={handleMarkGuildRead}
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onRemoveFriend={handleRemoveFriend}
            onMoveGuild={handleMoveGuild}
            onMoveGuildChannel={handleMoveGuildChannel}
            onReportUser={handleReportUser}
            onSelectDirectLink={handleSelectDirectLink}
            onSelectGuild={handleSelectGuild}
            onSelectGuildChannel={handleSelectGuildChannel}
            onSelectHome={handleSelectHome}
            onSendFriendRequest={handleSendFriendRequest}
            onSetHoveredVoiceChannelId={setHoveredVoiceChannelId}
            onShowNotice={showUiNotice}
            onToggleDmMenuPref={handleToggleDmMenuPref}
            onToggleGuildMenuPref={handleUpdateGuildMenuPref}
            onToggleServerFolder={handleToggleServerFolder}
            onUpdateGuildNotificationLevel={(guildId, level) =>
              handleUpdateGuildMenuPref(guildId, "notificationLevel", level)
            }
            serverFolders={serverFolders}
            onToggleVoiceMenu={toggleVoiceMenu}
            onToggleVoiceState={toggleVoiceState}
            voiceMenu={voiceMenu}
            voiceSessions={voiceSessions}
            voiceState={voiceState}
            voiceUsersByChannel={voiceUsersByChannel}
            workspace={workspace}
          />
        ) : null}

        <main className="chat-stage">
          {activeSelection.kind === "home" ? (
            <>
              {appError ? <div className="error-banner">{appError}</div> : null}
              <Suspense fallback={<WorkspacePanelFallback />}>
                <FriendsHome
                  availableUsers={workspace.available_users}
                  blockedUsers={blockedUsers}
                  friends={friendUsers}
                  onAcceptFriendRequest={handleAcceptFriendRequest}
                  onCancelFriendRequest={handleCancelFriendRequest}
                  onOpenDm={handleOpenDmFromCard}
                  onOpenProfileCard={openProfileCard}
                  onRemoveFriend={handleRemoveFriend}
                  onSendFriendRequest={handleSendFriendRequest}
                  pendingReceived={pendingFriendRequestsReceived}
                  pendingSent={pendingFriendRequestsSent}
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
                activeChannel={activeChannel}
                directMessageProfile={directMessageProfile}
                headerActionsRef={headerActionsRef}
                headerPanel={headerPanel}
                headerPanelNode={renderChatHeaderPanel()}
                headerSearchPlaceholder={headerSearchPlaceholder}
                isDirectConversation={isDirectConversation}
                isDirectGroupConversation={isGroupDirectConversation}
                membersPanelVisible={effectiveMembersPanelVisible}
                onAddFriend={handleSendFriendRequest}
                onOpenDialog={openDialog}
                onStartDirectCall={() => handleJoinDirectCall()}
                onStartDirectVideoCall={() => handleJoinDirectCall({ enableCamera: true })}
                onShowNotice={showUiNotice}
                onToggleHeaderPanel={toggleHeaderPanel}
                onToggleMembersPanel={() => setMembersPanelVisible((previous) => !previous)}
                subtitle={activeGuild?.name || headerCopy.eyebrow}
                title={headerCopy.title}
              />

              {appError ? <div className="error-banner">{appError}</div> : null}

              {isVoiceChannel || isDirectCallActive ? (
                <Suspense fallback={<WorkspacePanelFallback />}>
                  <VoiceRoomStage
                    activeChannel={activeChannel}
                    cameraStatus={cameraStatus}
                    cameraMenuNode={voiceMenu === "camera" ? renderCameraMenu() : null}
                    inputMenuNode={voiceMenu === "input" ? renderInputMenu() : null}
                    isDirectCall={isDirectConversation}
                    joinedVoiceChannelId={joinedVoiceChannelId}
                    onHandleVoiceLeave={handleVoiceLeave}
                    onJoinVoiceChannel={() =>
                      isVoiceChannel
                        ? handleSelectGuildChannel(activeChannel)
                        : handleJoinDirectCall()
                    }
                    onOpenProfileCard={openProfileCard}
                    onShowNotice={showUiNotice}
                    onToggleVoiceMenu={toggleVoiceMenu}
                    onToggleVoiceState={toggleVoiceState}
                    shareMenuNode={voiceMenu === "share" ? renderShareMenu() : null}
                    voiceMenu={voiceMenu}
                    voiceInputLevel={voiceInputLevel}
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
                    directMessageProfile={directMessageProfile}
                    editingMessage={editingMessage}
                    handleAttachmentSelection={handleAttachmentSelection}
                    handleComposerChange={handleComposerChange}
                    handleComposerShortcut={handleComposerShortcut}
                    handleDeleteMessage={handleDeleteMessage}
                    handlePickerInsert={handlePickerInsert}
                    handleStickerSelect={handleStickerSelect}
                    handleReaction={handleReaction}
                    handleScroll={handleScroll}
                    handleSubmitMessage={handleSubmitMessage}
                    guildStickers={activeGuild?.stickers || []}
                    listRef={listRef}
                    loadingMessages={loadingMessages}
                    messageMenuFor={messageMenuFor}
                    messages={messages}
                    onAcceptFriendRequest={handleAcceptFriendRequest}
                    onAddFriend={handleSendFriendRequest}
                    onBlockUser={handleBlockUser}
                    onCancelEdit={() => {
                      setEditingMessage(null);
                      setComposerAttachments([]);
                      setComposer("");
                    }}
                    onCancelFriendRequest={handleCancelFriendRequest}
                    onCancelReply={() => {
                      setReplyTarget(null);
                      setReplyMentionEnabled(true);
                    }}
                    onEditMessage={handleEditMessage}
                    onSetComposerMenuOpen={setComposerMenuOpen}
                    onSetComposerPicker={setComposerPicker}
                    onSetMessageMenuFor={setMessageMenuFor}
                    onSetReactionPickerFor={setReactionPickerFor}
                    onReportUser={handleReportUser}
                    onShowNotice={showUiNotice}
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

        {effectiveMembersPanelVisible ? (
          <>
            {isSingleDirectMessagePanel ? (
              <button
                aria-label="Ajustar ancho del panel"
                className={`members-panel-divider ${isResizingMembersPanel ? "is-dragging" : ""}`.trim()}
                onMouseDown={handleStartMembersResize}
                type="button"
              />
            ) : null}
            <MembersPanel
              activeChannel={activeChannel}
              activeNowUsers={activeNowUsers}
              activeSelectionKind={activeSelection.kind}
              directMessageProfile={directMessageProfile}
              memberGroups={memberGroups}
              memberList={memberList}
              onAcceptFriendRequest={handleAcceptFriendRequest}
              onAddFriend={handleSendFriendRequest}
              onBlockUser={handleBlockUser}
              onCancelFriendRequest={handleCancelFriendRequest}
              onCopyProfileId={handleCopyProfileId}
              onOpenDm={handleOpenDmFromCard}
              onOpenFullProfile={openFullProfile}
              onOpenProfileCard={openProfileCard}
              onRemoveFriend={handleRemoveFriend}
              onReportUser={handleReportUser}
              onShowNotice={showUiNotice}
              workspace={workspace}
            />
          </>
        ) : null}

        {settingsOpen ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <SettingsModal
              dmCount={workspace.dms.length}
              guildCount={workspace.guilds.length}
              language={language}
              onClose={() => setSettingsOpen(false)}
              onChangeLanguage={onChangeLanguage}
              onSignOut={onSignOut}
              onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
              onUpdateProfile={handleProfileUpdate}
              theme={theme}
              user={workspace.current_user}
            />
          </Suspense>
        ) : null}

        {profileCard ? (
          <UserProfileCard
            card={profileCard}
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onAddFriend={handleSendFriendRequest}
            onBlockUser={handleBlockUser}
            onCancelFriendRequest={handleCancelFriendRequest}
            onChangeStatus={handleStatusChange}
            onClose={() => setProfileCard(null)}
            onOpenDm={handleOpenDmFromCard}
            onRemoveFriend={handleRemoveFriend}
            onReportUser={handleReportUser}
            onSendDm={handleSendDmFromCard}
            onOpenSelfProfile={() => {
              setProfileCard(null);
              setSettingsOpen(true);
            }}
            onShowNotice={showUiNotice}
          />
        ) : null}

        {fullProfile ? (
          <UserProfileModal
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onClose={() => setFullProfile(null)}
            onAddFriend={handleSendFriendRequest}
            onBlockUser={handleBlockUser}
            onCancelFriendRequest={handleCancelFriendRequest}
            onOpenDm={async (profile) => {
              await handleOpenDmFromCard(profile);
              setFullProfile(null);
            }}
            onRemoveFriend={handleRemoveFriend}
            onReportUser={handleReportUser}
            onShowNotice={showUiNotice}
            profile={fullProfile}
          />
        ) : null}

        {dialog ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <Dialog
              dialog={dialog}
              guildChannels={activeGuild?.channels || []}
              onClose={() => setDialog(null)}
              onSubmit={handleDialogSubmit}
              users={dialog.type === "dm_group" ? friendUsers : workspace.available_users}
            />
          </Suspense>
        ) : null}

        {serverSettingsGuild ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <ServerSettingsModal
              guild={serverSettingsGuild}
              memberCount={serverSettingsGuild.members?.length || 0}
              onClose={() => setServerSettingsGuildId(null)}
              onSave={handleSaveGuildProfile}
            />
          </Suspense>
        ) : null}

        {inviteModalState.open && inviteTargetGuild ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <InviteServerModal
              channelName={activeChannel?.name || activeChannel?.display_name || ""}
              error={inviteModalState.error}
              friends={friendUsers}
              guildName={inviteTargetGuild.name}
              invite={inviteModalState.invite}
              loading={inviteModalState.loading}
              onClose={() =>
                setInviteModalState((previous) => ({
                  ...previous,
                  open: false
                }))
              }
              onRefresh={() => openInviteModal(inviteTargetGuild)}
              onShowNotice={showUiNotice}
            />
          </Suspense>
        ) : null}

        {leaveGuildTarget ? (
          <Suspense fallback={<WorkspacePanelFallback compact />}>
            <ConfirmActionModal
              cancelLabel="Cancelar"
              confirmLabel="Abandonar"
              description={`Perderas acceso a ${leaveGuildTarget.name} hasta que alguien vuelva a invitarte.`}
              loading={leavingGuild}
              onClose={() => {
                if (!leavingGuild) {
                  setLeaveGuildTarget(null);
                }
              }}
              onConfirm={confirmLeaveGuild}
              title={`Abandonar ${leaveGuildTarget.name}?`}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
