import React, { useEffect, useMemo, useRef, useState } from "react";

import { api, buildInviteUrl, resolveAssetUrl } from "../api.js";
import { translate } from "../i18n.js";
import { Icon } from "./Icon.jsx";
import { ServerStickersPanel } from "./ServerStickersPanel.jsx";

function resolveLanguageLocale(language) {
  switch (language) {
    case "en":
      return "en-US";
    case "fr":
      return "fr-FR";
    case "es":
    default:
      return "es-CO";
  }
}

function getServerSettingsCopy(language) {
  const t = (key, fallback) => translate(language, key, fallback);

  return {
    banAction: t("server.settings.members.ban", "Banear"),
    banDurationDays: t("server.settings.members.duration.days", "dias"),
    banDurationHours: t("server.settings.members.duration.hours", "horas"),
    banDurationMinutes: t("server.settings.members.duration.minutes", "minutos"),
    banDurationWeeks: t("server.settings.members.duration.weeks", "semanas"),
    banDurationLabel: t("server.settings.members.duration.label", "Duracion del ban"),
    banDurationPlaceholder: t("server.settings.members.duration.placeholder", "Cantidad"),
    banDurationPermanent: t("server.settings.members.duration.permanent", "Permanente"),
    banDurationValueInvalid: t(
      "server.settings.members.duration.invalid",
      "Elige una duracion valida o marca el ban como permanente."
    ),
    banPanelCancel: t("common.cancel", "Cancelar"),
    banPanelConfirm: t("server.settings.members.confirmBan", "Confirmar ban"),
    banPanelTitle: t("server.settings.members.banPanelTitle", "Configurar ban"),
    banSuccess: t("server.settings.members.banSuccess", "{name} fue baneado del servidor."),
    admin: t("server.settings.role.admin", "Admin"),
    banner: t("server.settings.profile.banner", "Cartel"),
    changeBanner: t("server.settings.profile.changeBanner", "Cambiar imagen del cartel"),
    changeIcon: t("server.settings.profile.changeIcon", "Cambiar icono del servidor"),
    close: t("common.close", "Cerrar"),
    copy: t("common.copy", "Copiar"),
    createInvite: t("server.settings.invites.create", "Nueva invitacion"),
    creating: t("common.creating", "Creando..."),
    createdBy: t("server.settings.invites.createdBy", "Creada por {name}"),
    description: t("server.settings.profile.description", "Descripcion"),
    editProfile: t("server.settings.nav.profile", "Perfil de servidor"),
    emptyDescription: t("server.settings.preview.emptyDescription", "Sin descripcion todavia."),
    headerInvites: t("server.settings.header.invites", "Invitaciones"),
    headerInvitesBody: t(
      "server.settings.header.invitesBody",
      "Genera enlaces y revisa los accesos activos de tu servidor."
    ),
    headerMembers: t("server.settings.header.members", "Miembros"),
    headerMembersBody: t(
      "server.settings.header.membersBody",
      "Gestiona y revisa la gente que forma parte de tu espacio."
    ),
    headerProfile: t("server.settings.header.profile", "Perfil de servidor"),
    headerProfileBody: t(
      "server.settings.header.profileBody",
      "Personaliza como aparece tu servidor dentro de Umbra."
    ),
    headerRoles: t("server.settings.header.roles", "Roles"),
    headerRolesBody: t(
      "server.settings.header.rolesBody",
      "Consulta la estructura visual y de permisos del servidor."
    ),
    headerStickers: t("server.settings.header.stickers", "Stickers"),
    headerStickersBody: t(
      "server.settings.header.stickersBody",
      "Crea stickers propios y manten a mano los predeterminados del servidor."
    ),
    hideBanner: t("server.settings.profile.removeBanner", "Quitar imagen del cartel"),
    hideIcon: t("server.settings.profile.removeIcon", "Eliminar icono"),
    invites: t("server.settings.nav.invites", "Invitaciones"),
    inviteCopied: t("server.settings.invites.copied", "Invitacion copiada."),
    invitesEmpty: t("server.settings.invites.empty", "No hay invitaciones creadas todavia. Genera una para compartir este servidor."),
    invitesLoading: t("server.settings.invites.loading", "Cargando invitaciones..."),
    invitesSubtitle: t("server.settings.invites.subtitle", "Genera y comparte accesos al servidor"),
    invalidBanner: t(
      "server.settings.profile.invalidBanner",
      "Selecciona una imagen valida para el cartel del servidor."
    ),
    invalidIcon: t(
      "server.settings.profile.invalidIcon",
      "Selecciona una imagen valida para el icono del servidor."
    ),
    kickAction: t("server.settings.members.kick", "Expulsar"),
    kickSuccess: t("server.settings.members.kickSuccess", "{name} fue expulsado del servidor."),
    members: t("server.settings.nav.members", "Miembros"),
    membersCount: t("server.settings.members.count", "personas en este servidor"),
    membersEmpty: t("server.settings.members.empty", "No se encontraron miembros con ese filtro."),
    membersHeaderSubtitle: t(
      "server.settings.header.membersBody",
      "Gestiona y revisa la gente que forma parte de tu espacio."
    ),
    membersModerating: t("server.settings.members.moderating", "Aplicando cambios..."),
    membersVisible: t("server.settings.preview.visibleMembers", "miembros visibles"),
    memberYou: t("server.settings.members.you", "Tu"),
    name: t("server.settings.profile.name", "Nombre"),
    noDate: t("common.noDate", "Sin fecha"),
    noRoles: t("server.settings.roles.empty", "No hay roles configurados todavia."),
    noRolesMatch: t("server.settings.roles.noMatch", "No se encontraron roles con ese filtro."),
    owner: t("server.settings.role.owner", "Owner"),
    profileDescription: t("server.settings.profile.subtitle", "Personaliza como aparece tu servidor dentro de Umbra."),
    roles: t("server.settings.nav.roles", "Roles"),
    rolesLoading: t("server.settings.roles.loading", "Cargando roles..."),
    rolesSubtitle: t("server.settings.roles.subtitle", "Jerarquia y acceso visual del servidor"),
    rolesMemberCount: t("server.settings.roles.memberCount", "{count} miembros"),
    saveChanges: t("server.settings.profile.save", "Guardar cambios"),
    saving: t("common.saving", "Guardando..."),
    searchMembers: t("server.settings.members.search", "Buscar miembros"),
    searchRoles: t("server.settings.roles.search", "Buscar roles"),
    serverUpdated: t("server.settings.profile.saved", "Servidor actualizado."),
    stickerTab: t("server.settings.nav.stickers", "Stickers"),
    uploadBanner: t("server.settings.profile.uploadBanner", "Subir cartel"),
    uses: t("server.settings.invites.uses", "{count} usos")
  };
}

function normalizeColorInput(candidate, fallback = "#5865F2") {
  const normalized = String(candidate || "")
    .trim()
    .replace(/^([^#])/, "#$1")
    .toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return fallback;
}

function buildGuildBannerStyle(color, imageUrl) {
  const normalizedColor = normalizeColorInput(color);
  if (imageUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.58)), url("${resolveAssetUrl(
        imageUrl
      )}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  return {
    background: `linear-gradient(135deg, ${normalizedColor}, rgba(15, 18, 24, 0.96))`
  };
}

function buildGuildInitials(name) {
  const parts = String(name || "Umbra")
    .trim()
    .split(/\s+/)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "UM";
}

function formatRelativeDate(value, language = "es") {
  if (!value) {
    return getServerSettingsCopy(language).noDate;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getServerSettingsCopy(language).noDate;
  }

  return new Intl.DateTimeFormat(resolveLanguageLocale(language), {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function buildRoleSummary(role, language = "es") {
  const copy = getServerSettingsCopy(language);
  if (role.is_admin) {
    return copy.admin;
  }

  if (role.name === "@everyone") {
    return translate(language, "server.settings.role.base", "Rol base del servidor");
  }

  return translate(
    language,
    "server.settings.role.memberCount",
    `${role.member_count || 0} miembros con este rol`
  ).replace("{count}", String(role.member_count || 0));
}

function replaceCount(template, count, fallback) {
  return String(template || fallback).replace("{count}", String(count));
}

function replaceName(template, name, fallback) {
  return String(template || fallback).replace("{name}", name || "Umbra");
}

export function ServerSettingsModal({
  currentUserId = null,
  guild,
  language = "es",
  memberCount = 0,
  onBanMember,
  onClose,
  onKickMember,
  onSave
}) {
  const iconInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const copy = useMemo(() => getServerSettingsCopy(language), [language]);

  const [form, setForm] = useState({
    bannerColor: guild.banner_color || "#5865F2",
    description: guild.description || "",
    name: guild.name || ""
  });
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
  const [rolesState, setRolesState] = useState({
    error: "",
    loaded: false,
    loading: false,
    roles: []
  });
  const [invitesState, setInvitesState] = useState({
    creating: false,
    error: "",
    invites: [],
    loaded: false,
    loading: false
  });
  const [memberActionState, setMemberActionState] = useState({
    error: "",
    memberId: null,
    mode: "",
    success: ""
  });
  const [banDraft, setBanDraft] = useState({
    memberId: null,
    permanent: false,
    unit: "hours",
    value: "24"
  });

  useEffect(() => {
    setActiveTab("profile");
    setForm({
      bannerColor: guild.banner_color || "#5865F2",
      description: guild.description || "",
      name: guild.name || ""
    });
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
    setRolesState({
      error: "",
      loaded: false,
      loading: false,
      roles: []
    });
    setInvitesState({
      creating: false,
      error: "",
      invites: [],
      loaded: false,
      loading: false
    });
    setMemberActionState({
      error: "",
      memberId: null,
      mode: "",
      success: ""
    });
    setBanDraft({
      memberId: null,
      permanent: false,
      unit: "hours",
      value: "24"
    });
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

  const normalizedBannerColor = normalizeColorInput(form.bannerColor, guild.banner_color || "#5865F2");
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
  const filteredRoles = useMemo(() => {
    const normalizedQuery = String(rolesQuery || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return rolesState.roles;
    }

    return rolesState.roles.filter((role) =>
      `${role.name || ""} ${buildRoleSummary(role, language)}`.toLowerCase().includes(normalizedQuery)
    );
  }, [rolesQuery, rolesState.roles]);

  useEffect(() => {
    if (activeTab !== "roles" || rolesState.loaded) {
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

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");

    try {
      await onSave({
        bannerColor: normalizedBannerColor,
        bannerFile,
        bannerImageUrl: clearBanner ? "" : undefined,
        clearBanner,
        clearIcon,
        description: form.description,
        iconFile,
        iconUrl: clearIcon ? "" : undefined,
        name: form.name
      });
      setSaved(copy.serverUpdated);
      setIconFile(null);
      setBannerFile(null);
      setIconPreview("");
      setBannerPreview("");
      setClearIcon(false);
      setClearBanner(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
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
    setBanDraft({
      memberId: null,
      permanent: false,
      unit: "hours",
      value: "24"
    });
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

  function renderProfileTab() {
    return (
      <div className="server-settings-body">
        <form className="server-settings-form" onSubmit={handleSubmit}>
          <input
            accept="image/*"
            className="hidden-file-input"
            onChange={handleIconSelection}
            ref={iconInputRef}
            type="file"
          />
          <input
            accept="image/*"
            className="hidden-file-input"
            onChange={handleBannerSelection}
            ref={bannerInputRef}
            type="file"
          />

          <label className="settings-field">
            <span>{copy.name}</span>
            <input
              maxLength={40}
              onChange={(event) => updateForm("name", event.target.value)}
              required
              value={form.name}
            />
          </label>

          <label className="settings-field">
            <span>{copy.description}</span>
            <textarea
              maxLength={180}
              onChange={(event) => updateForm("description", event.target.value)}
              rows={4}
              value={form.description}
            />
          </label>

          <div className="settings-field">
            <span>{translate(language, "server.settings.profile.icon", "Icono")}</span>
            <div className="server-asset-row">
              <div className="server-icon-preview">
                {previewIcon ? (
                  <img alt={form.name || guild.name} src={resolveAssetUrl(previewIcon)} />
                ) : (
                  <span>{buildGuildInitials(form.name || guild.name)}</span>
                )}
              </div>
              <div className="server-asset-actions">
                <button
                  className="ghost-button"
                  onClick={() => iconInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="upload" />
                  <span>{copy.changeIcon}</span>
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setIconFile(null);
                    setIconPreview((previous) => {
                      if (previous?.startsWith("blob:")) {
                        URL.revokeObjectURL(previous);
                      }
                      return "";
                    });
                    setClearIcon(true);
                  }}
                  type="button"
                >
                  <Icon name="close" />
                  <span>{copy.hideIcon}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="settings-field">
            <span>{copy.banner}</span>
            <div className="server-banner-editor">
              <div className="server-banner-preview" style={previewCardStyle}>
                <button
                  className="server-banner-upload"
                  onClick={() => bannerInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="camera" />
                  <span>{copy.uploadBanner}</span>
                </button>
              </div>
              <div className="server-asset-actions">
                <button
                  className="ghost-button"
                  onClick={() => bannerInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="upload" />
                  <span>{copy.changeBanner}</span>
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setBannerFile(null);
                    setBannerPreview((previous) => {
                      if (previous?.startsWith("blob:")) {
                        URL.revokeObjectURL(previous);
                      }
                      return "";
                    });
                    setClearBanner(true);
                  }}
                  type="button"
                >
                  <Icon name="close" />
                  <span>{copy.hideBanner}</span>
                </button>
                <label className="settings-color-input compact">
                  <input
                    onChange={(event) => updateForm("bannerColor", event.target.value)}
                    type="color"
                    value={normalizedBannerColor}
                  />
                  <span>{normalizedBannerColor}</span>
                </label>
              </div>
            </div>
          </div>

          {error ? <p className="form-error settings-form-error">{error}</p> : null}
          {saved ? <p className="settings-form-success">{saved}</p> : null}

          <div className="settings-form-actions">
            <button className="primary-button" disabled={saving} type="submit">
              <Icon name="save" />
              <span>{saving ? copy.saving : copy.saveChanges}</span>
            </button>
            <button className="ghost-button" onClick={onClose} type="button">
              <Icon name="close" />
              <span>{copy.close}</span>
            </button>
          </div>
        </form>

        <aside className="server-settings-preview">
          <div className="server-preview-card">
            <div className="server-preview-banner" style={previewCardStyle} />
            <div className="server-preview-body">
              <div className="server-preview-icon">
                {previewIcon ? (
                  <img alt={form.name || guild.name} src={resolveAssetUrl(previewIcon)} />
                ) : (
                  <span>{buildGuildInitials(form.name || guild.name)}</span>
                )}
              </div>
              <strong>{form.name || guild.name}</strong>
              <span>{form.description || copy.emptyDescription}</span>
              <small>{memberCount} {copy.membersVisible}</small>
            </div>
          </div>
        </aside>
      </div>
    );
  }

  function renderMembersTab() {
    return (
      <div className="server-settings-body single-column">
        <div className="server-settings-tab-panel">
          <div className="server-settings-list-header">
            <h3>{copy.members}</h3>
            <span>
              {replaceCount(
                copy.membersCount,
                sortedMembers.length,
                `${sortedMembers.length} personas en este servidor`
              )}
            </span>
          </div>

          <label className="settings-search server-settings-search">
            <Icon name="search" size={16} />
            <input
              onChange={(event) => setMembersQuery(event.target.value)}
              placeholder={copy.searchMembers}
              type="text"
              value={membersQuery}
            />
          </label>

          <div className="server-settings-list">
            {filteredMembers.length ? filteredMembers.map((member) => (
              <div className="server-settings-list-row" key={member.id}>
                <div className="server-settings-member-main">
                  <div className="server-settings-member-avatar">
                    {member.avatar_url ? (
                      <img alt={member.display_name || member.username} src={resolveAssetUrl(member.avatar_url)} />
                    ) : (
                      <span>{buildGuildInitials(member.display_name || member.username)}</span>
                    )}
                  </div>
                  <div className="server-settings-member-copy">
                    <strong style={member.role_color ? { color: member.role_color } : undefined}>
                      {member.display_name || member.username}
                    </strong>
                    <span>
                      @{member.username}
                      {member.custom_status ? ` • ${member.custom_status}` : ""}
                    </span>
                  </div>
                </div>
                <div className="server-settings-badges">
                  {member.id === guild.owner_id ? (
                    <span className="server-settings-pill accent">{copy.owner}</span>
                  ) : null}
                  <span className="server-settings-pill">
                    {member.status || translate(language, "presence.offline", "offline")}
                  </span>
                </div>
              </div>
            )) : (
              <div className="server-settings-empty">{copy.membersEmpty}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderMembersModerationTab() {
    return (
      <div className="server-settings-body single-column">
        <div className="server-settings-tab-panel">
          <div className="server-settings-list-header">
            <h3>{copy.members}</h3>
            <span>
              {replaceCount(
                copy.membersCount,
                sortedMembers.length,
                `${sortedMembers.length} personas en este servidor`
              )}
            </span>
          </div>

          <label className="settings-search server-settings-search">
            <Icon name="search" size={16} />
            <input
              onChange={(event) => setMembersQuery(event.target.value)}
              placeholder={copy.searchMembers}
              type="text"
              value={membersQuery}
            />
          </label>

          {memberActionState.success ? (
            <p className="settings-form-success">{memberActionState.success}</p>
          ) : null}
          {memberActionState.error ? (
            <div className="server-settings-empty error">{memberActionState.error}</div>
          ) : null}

          <div className="server-settings-list">
            {filteredMembers.length ? (
              filteredMembers.map((member) => {
                const isBusy =
                  memberActionState.memberId === member.id &&
                  (memberActionState.mode === "kick" || memberActionState.mode === "ban");
                const canModerateMember =
                  canManageMembers && member.id !== guild.owner_id && member.id !== currentUserId;

                return (
                  <div className="server-settings-list-stack" key={member.id}>
                    <div className="server-settings-list-row">
                      <div className="server-settings-member-main">
                        <div className="server-settings-member-avatar">
                          {member.avatar_url ? (
                            <img alt={member.display_name || member.username} src={resolveAssetUrl(member.avatar_url)} />
                          ) : (
                            <span>{buildGuildInitials(member.display_name || member.username)}</span>
                          )}
                        </div>
                        <div className="server-settings-member-copy">
                          <strong style={member.role_color ? { color: member.role_color } : undefined}>
                            {member.display_name || member.username}
                          </strong>
                          <span>
                            @{member.username}
                            {member.custom_status ? ` - ${member.custom_status}` : ""}
                          </span>
                        </div>
                      </div>

                      <div className="server-settings-member-side">
                        <div className="server-settings-badges">
                          {member.id === currentUserId ? (
                            <span className="server-settings-pill">{copy.memberYou}</span>
                          ) : null}
                          {member.id === guild.owner_id ? (
                            <span className="server-settings-pill accent">{copy.owner}</span>
                          ) : null}
                          <span className="server-settings-pill">
                            {member.status || translate(language, "presence.offline", "offline")}
                          </span>
                        </div>

                        {canModerateMember ? (
                          <div className="server-settings-member-actions">
                            <button
                              className="ghost-button small danger"
                              disabled={Boolean(memberActionState.mode)}
                              onClick={() => handleKickMemberAction(member)}
                              type="button"
                            >
                              <span>
                                {isBusy && memberActionState.mode === "kick"
                                  ? copy.membersModerating
                                  : copy.kickAction}
                              </span>
                            </button>
                            <button
                              className={`ghost-button small ${banDraft.memberId === member.id ? "active" : ""}`.trim()}
                              disabled={Boolean(memberActionState.mode)}
                              onClick={() =>
                                banDraft.memberId === member.id
                                  ? closeBanDraft()
                                  : openBanDraft(member.id)
                              }
                              type="button"
                            >
                              <span>{copy.banAction}</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {banDraft.memberId === member.id ? (
                      <div className="server-settings-member-ban-panel">
                        <div className="server-settings-member-ban-header">
                          <div>
                            <strong>{copy.banPanelTitle}</strong>
                            <span>@{member.username}</span>
                          </div>
                          <button
                            className="ghost-button small"
                            disabled={isBusy}
                            onClick={closeBanDraft}
                            type="button"
                          >
                            <span>{copy.banPanelCancel}</span>
                          </button>
                        </div>

                        <div className="server-settings-ban-controls">
                          <label className="settings-field server-settings-ban-field">
                            <span>{copy.banDurationLabel}</span>
                            <div className="server-settings-ban-grid">
                              <input
                                disabled={banDraft.permanent || isBusy}
                                min="1"
                                onChange={(event) =>
                                  setBanDraft((previous) => ({
                                    ...previous,
                                    value: event.target.value
                                  }))
                                }
                                placeholder={copy.banDurationPlaceholder}
                                type="number"
                                value={banDraft.value}
                              />
                              <select
                                disabled={banDraft.permanent || isBusy}
                                onChange={(event) =>
                                  setBanDraft((previous) => ({
                                    ...previous,
                                    unit: event.target.value
                                  }))
                                }
                                value={banDraft.unit}
                              >
                                <option value="minutes">{copy.banDurationMinutes}</option>
                                <option value="hours">{copy.banDurationHours}</option>
                                <option value="days">{copy.banDurationDays}</option>
                                <option value="weeks">{copy.banDurationWeeks}</option>
                              </select>
                            </div>
                          </label>

                          <button
                            className={`server-settings-pill-button ${banDraft.permanent ? "active" : ""}`.trim()}
                            disabled={isBusy}
                            onClick={() =>
                              setBanDraft((previous) => ({
                                ...previous,
                                permanent: !previous.permanent
                              }))
                            }
                            type="button"
                          >
                            {copy.banDurationPermanent}
                          </button>
                        </div>

                        <div className="server-settings-member-actions">
                          <button
                            className="ghost-button small"
                            disabled={isBusy}
                            onClick={closeBanDraft}
                            type="button"
                          >
                            <span>{copy.banPanelCancel}</span>
                          </button>
                          <button
                            className="ghost-button small danger"
                            disabled={isBusy}
                            onClick={() => handleBanMemberAction(member)}
                            type="button"
                          >
                            <span>
                              {isBusy && memberActionState.mode === "ban"
                                ? copy.membersModerating
                                : copy.banPanelConfirm}
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="server-settings-empty">{copy.membersEmpty}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderRolesTab() {
    return (
      <div className="server-settings-body single-column">
        <div className="server-settings-tab-panel">
          <div className="server-settings-list-header">
            <h3>{copy.roles}</h3>
            <span>{copy.rolesSubtitle}</span>
          </div>

          <label className="settings-search server-settings-search">
            <Icon name="search" size={16} />
            <input
              onChange={(event) => setRolesQuery(event.target.value)}
              placeholder={copy.searchRoles}
              type="text"
              value={rolesQuery}
            />
          </label>

          {rolesState.loading ? <div className="server-settings-empty">{copy.rolesLoading}</div> : null}
          {rolesState.error ? <div className="server-settings-empty error">{rolesState.error}</div> : null}

          {!rolesState.loading && !rolesState.error ? (
            <div className="server-settings-list">
              {filteredRoles.length ? (
                filteredRoles.map((role) => (
                  <div className="server-settings-list-row role-row" key={role.id}>
                    <div className="server-settings-role-main">
                      <span
                        className="server-settings-role-dot"
                        style={{ background: role.color || "#7F8EA3" }}
                      />
                      <div className="server-settings-role-copy">
                        <strong>{role.name}</strong>
                        <span>{buildRoleSummary(role, language)}</span>
                      </div>
                    </div>
                    <div className="server-settings-badges">
                      <span className="server-settings-pill">
                        {replaceCount(
                          copy.rolesMemberCount,
                          role.member_count || 0,
                          `${role.member_count || 0} miembros`
                        )}
                      </span>
                      {role.is_admin ? (
                        <span className="server-settings-pill accent">{copy.admin}</span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="server-settings-empty">
                  {rolesState.roles.length
                    ? copy.noRolesMatch
                    : copy.noRoles}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderInvitesTab() {
    return (
      <div className="server-settings-body single-column">
        <div className="server-settings-tab-panel">
          <div className="server-settings-list-header">
            <div>
              <h3>{copy.invites}</h3>
              <span>{copy.invitesSubtitle}</span>
            </div>
            <button
              className="primary-button small"
              disabled={invitesState.creating}
              onClick={handleCreateInvite}
              type="button"
            >
              <Icon name="userAdd" />
              <span>{invitesState.creating ? copy.creating : copy.createInvite}</span>
            </button>
          </div>

          {saved ? <p className="settings-form-success">{saved}</p> : null}
          {invitesState.loading ? <div className="server-settings-empty">{copy.invitesLoading}</div> : null}
          {invitesState.error ? <div className="server-settings-empty error">{invitesState.error}</div> : null}

          {!invitesState.loading && !invitesState.error ? (
            <div className="server-settings-list">
              {invitesState.invites.length ? (
                invitesState.invites.map((invite) => (
                  <div className="server-settings-list-row invite-row" key={invite.id}>
                    <div className="server-settings-invite-copy">
                      <strong>{buildInviteUrl(invite.code) || invite.code}</strong>
                      <span>
                        {replaceName(
                          copy.createdBy,
                          invite.creator_name || "Umbra",
                          `Creada por ${invite.creator_name || "Umbra"}`
                        )} • {formatRelativeDate(invite.created_at, language)} •{" "}
                        {replaceCount(copy.uses, Number(invite.uses || 0), `${Number(invite.uses || 0)} usos`)}
                      </span>
                    </div>
                    <button
                      className="ghost-button small"
                      onClick={() => handleCopyInvite(invite.code)}
                      type="button"
                    >
                      <Icon name="copy" />
                      <span>{copy.copy}</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="server-settings-empty">
                  {copy.invitesEmpty}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="server-settings-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="server-settings-sidebar">
          <div className="server-settings-sidebar-title">
            <small>{guild.name.toUpperCase()}</small>
            <strong>{copy.editProfile}</strong>
          </div>

          <div className="server-settings-nav">
            <button
              className={`server-settings-nav-item ${activeTab === "profile" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("profile")}
              type="button"
            >
              {copy.editProfile}
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "members" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("members")}
              type="button"
            >
              {copy.members}
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "roles" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("roles")}
              type="button"
            >
              {copy.roles}
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "invites" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("invites")}
              type="button"
            >
              {copy.invites}
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "stickers" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("stickers")}
              type="button"
            >
              {copy.stickerTab}
            </button>
          </div>
        </aside>

        <section className="server-settings-panel">
          <div className="server-settings-header">
            <div>
              <h2>
                {activeTab === "profile"
                  ? copy.headerProfile
                  : activeTab === "members"
                    ? copy.headerMembers
                    : activeTab === "roles"
                      ? copy.headerRoles
                      : activeTab === "invites"
                        ? copy.headerInvites
                        : copy.headerStickers}
              </h2>
              <p>
                {activeTab === "profile"
                  ? copy.headerProfileBody
                  : activeTab === "members"
                    ? copy.headerMembersBody
                    : activeTab === "roles"
                      ? copy.headerRolesBody
                      : activeTab === "invites"
                        ? copy.headerInvitesBody
                        : copy.headerStickersBody}
              </p>
            </div>
            <button className="ghost-button icon-only" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </div>
          {activeTab === "profile" ? renderProfileTab() : null}
          {activeTab === "members" ? renderMembersModerationTab() : null}
          {activeTab === "roles" ? renderRolesTab() : null}
          {activeTab === "invites" ? renderInvitesTab() : null}
          {activeTab === "stickers" ? <ServerStickersPanel guildId={guild.id} language={language} /> : null}
        </section>
      </div>
    </div>
  );
}
