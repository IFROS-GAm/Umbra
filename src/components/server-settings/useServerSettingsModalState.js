import { useEffect, useMemo, useRef, useState } from "react";

import { api, buildInviteUrl } from "../../api.js";
import {
  buildRolePermissionBits,
  buildGuildBannerStyle,
  buildRoleSummary,
  extractRolePermissionKeys,
  getServerSettingsCopy,
  getRoleDisplayName,
  getRoleIcon,
  normalizeColorInput,
  replaceName
} from "../serverSettingsModalHelpers.js";

function buildInitialForm(guild) {
  return {
    allowMemberInvites: Boolean(guild.allow_member_invites),
    bannerColor: guild.banner_color || "#5865F2",
    description: guild.description || "",
    name: guild.name || ""
  };
}

function buildInitialBanDraft() {
  return {
    memberId: null,
    permanent: false,
    unit: "hours",
    value: "24"
  };
}

function buildInitialRolesState() {
  return {
    error: "",
    loaded: false,
    loading: false,
    roles: []
  };
}

function buildInitialRoleForm() {
  return {
    color: "#9AA4B2",
    icon: "",
    id: null,
    isSystem: false,
    name: "",
    permissionKeys: ["readMessages", "sendMessages"]
  };
}

function buildRoleForm(role, language) {
  if (!role) {
    return buildInitialRoleForm();
  }

  return {
    color: role.color || "#9AA4B2",
    icon: getRoleIcon(role),
    id: role.id,
    isSystem: Boolean(role.is_default_role || role.is_owner_role),
    name: getRoleDisplayName(role),
    permissionKeys: extractRolePermissionKeys(role.permissions, language)
  };
}

function buildInitialInvitesState() {
  return {
    creating: false,
    error: "",
    invites: [],
    loaded: false,
    loading: false
  };
}

function buildInitialMemberActionState() {
  return {
    error: "",
    memberId: null,
    mode: "",
    success: ""
  };
}

export function useServerSettingsModalState({
  copy,
  currentUserId,
  guild,
  language,
  onBanMember,
  onKickMember,
  onRefresh,
  onSave
}) {
  const iconInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [form, setForm] = useState(() => buildInitialForm(guild));
  const [iconFile, setIconFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [iconPreview, setIconPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");
  const [clearIcon, setClearIcon] = useState(false);
  const [clearBanner, setClearBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [membersQuery, setMembersQuery] = useState("");
  const [rolesQuery, setRolesQuery] = useState("");
  const [rolesState, setRolesState] = useState(buildInitialRolesState);
  const [creatingRoleDraft, setCreatingRoleDraft] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [roleForm, setRoleForm] = useState(buildInitialRoleForm);
  const [roleSaving, setRoleSaving] = useState(false);
  const [invitesState, setInvitesState] = useState(buildInitialInvitesState);
  const [memberActionState, setMemberActionState] = useState(buildInitialMemberActionState);
  const [banDraft, setBanDraft] = useState(buildInitialBanDraft);

  useEffect(() => {
    setActiveTab("profile");
    setForm(buildInitialForm(guild));
    setIconFile(null);
    setBannerFile(null);
    setIconPreview("");
    setBannerPreview("");
    setClearIcon(false);
    setClearBanner(false);
    setSaving(false);
    setError("");
    setSaved("");
    setMembersQuery("");
    setRolesQuery("");
    setRolesState(buildInitialRolesState());
    setCreatingRoleDraft(false);
    setSelectedRoleId(null);
    setRoleForm(buildInitialRoleForm());
    setRoleSaving(false);
    setInvitesState(buildInitialInvitesState());
    setMemberActionState(buildInitialMemberActionState());
    setBanDraft(buildInitialBanDraft());
  }, [guild.id]);

  useEffect(
    () => () => {
      if (iconPreview.startsWith("blob:")) {
        URL.revokeObjectURL(iconPreview);
      }
      if (bannerPreview.startsWith("blob:")) {
        URL.revokeObjectURL(bannerPreview);
      }
    },
    [bannerPreview, iconPreview]
  );

  const normalizedBannerColor = normalizeColorInput(
    form.bannerColor,
    guild.banner_color || "#5865F2"
  );
  const previewIcon = iconPreview || (clearIcon ? "" : guild.icon_url || "");
  const previewBanner = bannerPreview || (clearBanner ? "" : guild.banner_image_url || "");
  const previewCardStyle = useMemo(
    () => buildGuildBannerStyle(normalizedBannerColor, previewBanner),
    [normalizedBannerColor, previewBanner]
  );

  const sortedMembers = useMemo(
    () =>
      [...(guild.members || [])].sort((left, right) => {
        if (left.id === guild.owner_id) {
          return -1;
        }
        if (right.id === guild.owner_id) {
          return 1;
        }

        return (left.display_name || left.username || "").localeCompare(
          right.display_name || right.username || "",
          "es"
        );
      }),
    [guild.members, guild.owner_id]
  );

  const filteredMembers = useMemo(() => {
    const normalizedQuery = String(membersQuery || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return sortedMembers;
    }

    return sortedMembers.filter((member) =>
      `${member.display_name || ""} ${member.username || ""} ${member.custom_status || ""}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [membersQuery, sortedMembers]);

  const canManageMembers = useMemo(
    () => guild.owner_id === currentUserId || Boolean(guild.permissions?.can_manage_guild),
    [currentUserId, guild.owner_id, guild.permissions?.can_manage_guild]
  );
  const canManageRoles = useMemo(
    () => guild.owner_id === currentUserId || Boolean(guild.permissions?.can_manage_roles),
    [currentUserId, guild.owner_id, guild.permissions?.can_manage_roles]
  );

  const filteredRoles = useMemo(() => {
    const normalizedQuery = String(rolesQuery || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return rolesState.roles;
    }

    return rolesState.roles.filter((role) =>
      `${getRoleDisplayName(role)} ${buildRoleSummary(role, language)}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [language, rolesQuery, rolesState.roles]);

  const assignableRoles = useMemo(
    () =>
      (rolesState.roles || []).filter((role) => !role.is_default_role && !role.is_owner_role),
    [rolesState.roles]
  );

  useEffect(() => {
    if (!["members", "roles"].includes(activeTab) || rolesState.loaded) {
      return;
    }

    let cancelled = false;
    setRolesState((previous) => ({
      ...previous,
      error: "",
      loading: true
    }));

    api
      .listGuildRoles({ guildId: guild.id })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setRolesState({
          error: "",
          loaded: true,
          loading: false,
          roles: payload.roles || []
        });
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }

        setRolesState({
          error: loadError.message,
          loaded: false,
          loading: false,
          roles: []
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, guild.id, rolesState.loaded]);

  useEffect(() => {
    if (creatingRoleDraft) {
      return;
    }

    const availableRoles = rolesState.roles || [];
    if (!availableRoles.length) {
      if (selectedRoleId || roleForm.id) {
        setSelectedRoleId(null);
        setRoleForm(buildInitialRoleForm());
      }
      return;
    }

    const preferredRole =
      availableRoles.find((role) => role.id === selectedRoleId) ||
      availableRoles.find((role) => !role.is_default_role && !role.is_owner_role) ||
      availableRoles[0];

    if (!preferredRole) {
      return;
    }

    if (preferredRole.id === roleForm.id && selectedRoleId === preferredRole.id) {
      return;
    }

    setSelectedRoleId(preferredRole.id);
    setRoleForm(buildRoleForm(preferredRole, language));
  }, [creatingRoleDraft, language, roleForm.id, rolesState.roles, selectedRoleId]);

  useEffect(() => {
    if (activeTab !== "invites" || invitesState.loaded) {
      return;
    }

    let cancelled = false;
    setInvitesState((previous) => ({
      ...previous,
      error: "",
      loading: true
    }));

    api
      .listGuildInvites({ guildId: guild.id })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setInvitesState({
          creating: false,
          error: "",
          invites: payload.invites || [],
          loaded: true,
          loading: false
        });
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }

        setInvitesState({
          creating: false,
          error: loadError.message,
          invites: [],
          loaded: false,
          loading: false
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, guild.id, invitesState.loaded]);

  function updateForm(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  async function refreshWorkspaceSnapshot() {
    if (typeof onRefresh === "function") {
      await onRefresh();
    }
  }

  async function refreshRoles() {
    setRolesState((previous) => ({
      ...previous,
      error: "",
      loading: true
    }));

    try {
      const payload = await api.listGuildRoles({ guildId: guild.id });
      setRolesState({
        error: "",
        loaded: true,
        loading: false,
        roles: payload.roles || []
      });
      return payload.roles || [];
    } catch (loadError) {
      setRolesState({
        error: loadError.message,
        loaded: false,
        loading: false,
        roles: []
      });
      throw loadError;
    }
  }

  function updateRoleForm(key, value) {
    setRoleForm((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  function handleSelectRole(role) {
    if (!role) {
      setCreatingRoleDraft(false);
      setSelectedRoleId(null);
      setRoleForm(buildInitialRoleForm());
      return;
    }

    setCreatingRoleDraft(false);
    setSelectedRoleId(role.id);
    setRoleForm(buildRoleForm(role, language));
  }

  function handleCreateRoleDraft() {
    setCreatingRoleDraft(true);
    setSelectedRoleId(null);
    setRoleForm(buildInitialRoleForm());
    setSaved("");
    setError("");
  }

  function handleToggleRolePermission(permissionKey) {
    setRoleForm((previous) => {
      const hasPermission = previous.permissionKeys.includes(permissionKey);
      const nextPermissionKeys = hasPermission
        ? previous.permissionKeys.filter((key) => key !== permissionKey)
        : [...previous.permissionKeys, permissionKey];

      return {
        ...previous,
        permissionKeys: nextPermissionKeys
      };
    });
  }

  function rememberPreview(file, setter, resetClear) {
    setter((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(file);
    });
    resetClear(false);
  }

  function handleIconSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError(copy.invalidIcon);
      return;
    }

    setError("");
    setSaved("");
    setIconFile(file);
    rememberPreview(file, setIconPreview, setClearIcon);
  }

  function handleBannerSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError(copy.invalidBanner);
      return;
    }

    setError("");
    setSaved("");
    setBannerFile(file);
    rememberPreview(file, setBannerPreview, setClearBanner);
  }

  function clearIconPreview() {
    setIconFile(null);
    setIconPreview((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return "";
    });
    setClearIcon(true);
  }

  function clearBannerPreview() {
    setBannerFile(null);
    setBannerPreview((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return "";
    });
    setClearBanner(true);
  }

  async function persistGuildSettings(nextPatch, { successMessage } = {}) {
    setSaving(true);
    setError("");
    setSaved("");

    try {
      await onSave(nextPatch);
      setSaved(successMessage || copy.serverUpdated);
      return true;
    } catch (saveError) {
      setError(saveError.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const didSave = await persistGuildSettings(
      {
        allowMemberInvites: Boolean(form.allowMemberInvites),
        bannerColor: normalizedBannerColor,
        bannerFile,
        bannerImageUrl: clearBanner ? "" : undefined,
        clearBanner,
        clearIcon,
        description: form.description,
        iconFile,
        iconUrl: clearIcon ? "" : undefined,
        name: form.name
      },
      {
        successMessage: copy.serverUpdated
      }
    );

    if (didSave) {
      setIconFile(null);
      setBannerFile(null);
      setIconPreview("");
      setBannerPreview("");
      setClearIcon(false);
      setClearBanner(false);
    }
  }

  async function handleToggleAllowMemberInvites() {
    const nextAllowMemberInvites = !form.allowMemberInvites;
    const previousAllowMemberInvites = form.allowMemberInvites;

    setForm((previous) => ({
      ...previous,
      allowMemberInvites: nextAllowMemberInvites
    }));

    const didSave = await persistGuildSettings(
      {
        allowMemberInvites: nextAllowMemberInvites,
        bannerColor: normalizedBannerColor,
        description: form.description,
        name: form.name
      },
      {
        successMessage: nextAllowMemberInvites
          ? copy.allowMemberInvitesEnabled
          : copy.allowMemberInvitesDisabled
      }
    );

    if (!didSave) {
      setForm((previous) => ({
        ...previous,
        allowMemberInvites: previousAllowMemberInvites
      }));
    }
  }

  async function handleSaveRole() {
    setRoleSaving(true);
    setError("");
    setSaved("");

    try {
      const permissions = buildRolePermissionBits(roleForm.permissionKeys, language);
      const payload = roleForm.id
        ? await api.updateGuildRole({
            color: normalizeColorInput(roleForm.color, "#9AA4B2"),
            guildId: guild.id,
            icon: roleForm.icon,
            name: roleForm.name,
            permissions,
            roleId: roleForm.id
          })
        : await api.createGuildRole({
            color: normalizeColorInput(roleForm.color, "#9AA4B2"),
            guildId: guild.id,
            icon: roleForm.icon,
            name: roleForm.name,
            permissions
          });

      const nextRoles = await refreshRoles();
      const nextSelectedRole =
        nextRoles.find((role) => role.id === payload.role?.id) ||
        nextRoles.find((role) => role.id === roleForm.id) ||
        null;

      if (nextSelectedRole) {
        setCreatingRoleDraft(false);
        setSelectedRoleId(nextSelectedRole.id);
        setRoleForm(buildRoleForm(nextSelectedRole, language));
      }

      await refreshWorkspaceSnapshot();
      setSaved(roleForm.id ? copy.roleSaved : copy.roleCreated);
      return true;
    } catch (saveError) {
      setError(saveError.message);
      return false;
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleCreateInvite() {
    setInvitesState((previous) => ({
      ...previous,
      creating: true,
      error: ""
    }));

    try {
      await api.createGuildInvite({
        guildId: guild.id
      });
      const invitePayload = await api.listGuildInvites({ guildId: guild.id });

      setInvitesState((previous) => ({
        ...previous,
        creating: false,
        invites: invitePayload.invites || [],
        loaded: true
      }));
    } catch (inviteError) {
      setInvitesState((previous) => ({
        ...previous,
        creating: false,
        error: inviteError.message
      }));
    }
  }

  async function handleAssignRoleToMember(member, nextRoleId) {
    if (!member?.id) {
      return;
    }

    setMemberActionState({
      error: "",
      memberId: member.id,
      mode: "role",
      success: ""
    });

    try {
      await api.updateGuildMemberRole({
        guildId: guild.id,
        roleId: nextRoleId || null,
        userId: member.id
      });
      await refreshWorkspaceSnapshot();
      await refreshRoles();
      setMemberActionState({
        error: "",
        memberId: null,
        mode: "",
        success: replaceName(
          copy.roleAssignedSuccess,
          member.display_name || member.username,
          `${member.display_name || member.username} ahora tiene el rol seleccionado.`
        )
      });
    } catch (actionError) {
      setMemberActionState({
        error: actionError.message,
        memberId: null,
        mode: "",
        success: ""
      });
    }
  }

  async function handleCopyInvite(code) {
    const inviteUrl = buildInviteUrl(code) || code;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setSaved(copy.inviteCopied);
      setError("");
    } catch {
      setSaved(`Invitacion: ${inviteUrl}`);
      setError("");
    }
  }

  function clearMemberActionFeedback() {
    setMemberActionState((previous) => ({
      ...previous,
      error: "",
      success: ""
    }));
  }

  function openBanDraft(memberId) {
    clearMemberActionFeedback();
    setBanDraft({
      memberId,
      permanent: false,
      unit: "hours",
      value: "24"
    });
  }

  function closeBanDraft() {
    setBanDraft(buildInitialBanDraft());
  }

  function buildBanExpirationIso() {
    if (banDraft.permanent) {
      return null;
    }

    const numericValue = Number(banDraft.value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      throw new Error(copy.banDurationValueInvalid);
    }

    const unitToMs = {
      days: 24 * 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      minutes: 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000
    };

    const multiplier = unitToMs[banDraft.unit] || unitToMs.hours;
    return new Date(Date.now() + numericValue * multiplier).toISOString();
  }

  async function handleKickMemberAction(member) {
    if (!onKickMember || !member?.id) {
      return;
    }

    setMemberActionState({
      error: "",
      memberId: member.id,
      mode: "kick",
      success: ""
    });

    try {
      await onKickMember({
        guildId: guild.id,
        member
      });
      closeBanDraft();
      setMemberActionState({
        error: "",
        memberId: null,
        mode: "",
        success: replaceName(
          copy.kickSuccess,
          member.display_name || member.username,
          `${member.display_name || member.username} fue expulsado del servidor.`
        )
      });
    } catch (actionError) {
      setMemberActionState({
        error: actionError.message,
        memberId: null,
        mode: "",
        success: ""
      });
    }
  }

  async function handleBanMemberAction(member) {
    if (!onBanMember || !member?.id) {
      return;
    }

    let expiresAt = null;
    try {
      expiresAt = buildBanExpirationIso();
    } catch (validationError) {
      setMemberActionState({
        error: validationError.message,
        memberId: null,
        mode: "",
        success: ""
      });
      return;
    }

    setMemberActionState({
      error: "",
      memberId: member.id,
      mode: "ban",
      success: ""
    });

    try {
      await onBanMember({
        expiresAt,
        guildId: guild.id,
        member
      });
      closeBanDraft();
      setMemberActionState({
        error: "",
        memberId: null,
        mode: "",
        success: replaceName(
          copy.banSuccess,
          member.display_name || member.username,
          `${member.display_name || member.username} fue baneado del servidor.`
        )
      });
    } catch (actionError) {
      setMemberActionState({
        error: actionError.message,
        memberId: null,
        mode: "",
        success: ""
      });
    }
  }

  return {
    activeTab,
    assignableRoles,
    bannerInputRef,
    banDraft,
    canManageMembers,
    canManageRoles,
    clearBannerPreview,
    clearIconPreview,
    closeBanDraft,
    error,
    filteredMembers,
    filteredRoles,
    form,
    handleAssignRoleToMember,
    handleBanMemberAction,
    handleCopyInvite,
    handleCreateInvite,
    handleCreateRoleDraft,
    handleIconSelection,
    handleBannerSelection,
    handleKickMemberAction,
    handleSaveRole,
    handleSelectRole,
    handleSubmit,
    handleToggleRolePermission,
    handleToggleAllowMemberInvites,
    iconInputRef,
    invitesState,
    memberActionState,
    membersQuery,
    normalizedBannerColor,
    openBanDraft,
    previewBanner,
    previewCardStyle,
    previewIcon,
    roleForm,
    roleSaving,
    rolesQuery,
    rolesState,
    saved,
    saving,
    setActiveTab,
    setBanDraft,
    setMembersQuery,
    setRolesQuery,
    sortedMembers,
    updateForm,
    updateRoleForm
  };
}

export function useServerSettingsCopy(language) {
  return useMemo(() => getServerSettingsCopy(language), [language]);
}
