import React, { useEffect, useMemo, useRef, useState } from "react";

import { api, resolveAssetUrl } from "../api.js";
import { Icon } from "./Icon.jsx";
import { ServerStickersPanel } from "./ServerStickersPanel.jsx";

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

function formatRelativeDate(value) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function buildRoleSummary(role) {
  if (role.is_admin) {
    return "Administrador";
  }

  if (role.name === "@everyone") {
    return "Rol base del servidor";
  }

  return `${role.member_count || 0} miembros con este rol`;
}

export function ServerSettingsModal({ guild, memberCount = 0, onClose, onSave }) {
  const iconInputRef = useRef(null);
  const bannerInputRef = useRef(null);

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
  }, [guild]);

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
  const filteredRoles = useMemo(() => {
    const normalizedQuery = String(rolesQuery || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return rolesState.roles;
    }

    return rolesState.roles.filter((role) =>
      `${role.name || ""} ${buildRoleSummary(role)}`.toLowerCase().includes(normalizedQuery)
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
      setError("Selecciona una imagen valida para el icono del servidor.");
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
      setError("Selecciona una imagen valida para el cartel del servidor.");
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
      setSaved("Servidor actualizado.");
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
    const inviteUrl = `${window.location.origin}/invite/${code}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setSaved("Invitacion copiada.");
      setError("");
    } catch {
      setSaved(`Invitacion: ${inviteUrl}`);
      setError("");
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
            <span>Nombre</span>
            <input
              maxLength={40}
              onChange={(event) => updateForm("name", event.target.value)}
              required
              value={form.name}
            />
          </label>

          <label className="settings-field">
            <span>Descripcion</span>
            <textarea
              maxLength={180}
              onChange={(event) => updateForm("description", event.target.value)}
              rows={4}
              value={form.description}
            />
          </label>

          <div className="settings-field">
            <span>Icono</span>
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
                  <span>Cambiar icono del servidor</span>
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
                  <span>Eliminar icono</span>
                </button>
              </div>
            </div>
          </div>

          <div className="settings-field">
            <span>Cartel</span>
            <div className="server-banner-editor">
              <div className="server-banner-preview" style={previewCardStyle}>
                <button
                  className="server-banner-upload"
                  onClick={() => bannerInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="camera" />
                  <span>Subir cartel</span>
                </button>
              </div>
              <div className="server-asset-actions">
                <button
                  className="ghost-button"
                  onClick={() => bannerInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="upload" />
                  <span>Cambiar imagen del cartel</span>
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
                  <span>Quitar imagen del cartel</span>
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
              <span>{saving ? "Guardando..." : "Guardar cambios"}</span>
            </button>
            <button className="ghost-button" onClick={onClose} type="button">
              <Icon name="close" />
              <span>Cerrar</span>
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
              <span>{form.description || "Sin descripcion todavia."}</span>
              <small>{memberCount} miembros visibles</small>
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
            <h3>Miembros</h3>
            <span>{sortedMembers.length} personas en este servidor</span>
          </div>

          <label className="settings-search server-settings-search">
            <Icon name="search" size={16} />
            <input
              onChange={(event) => setMembersQuery(event.target.value)}
              placeholder="Buscar miembros"
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
                    <span className="server-settings-pill accent">Owner</span>
                  ) : null}
                  <span className="server-settings-pill">{member.status || "offline"}</span>
                </div>
              </div>
            )) : (
              <div className="server-settings-empty">No se encontraron miembros con ese filtro.</div>
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
            <h3>Roles</h3>
            <span>Jerarquia y acceso visual del servidor</span>
          </div>

          <label className="settings-search server-settings-search">
            <Icon name="search" size={16} />
            <input
              onChange={(event) => setRolesQuery(event.target.value)}
              placeholder="Buscar roles"
              type="text"
              value={rolesQuery}
            />
          </label>

          {rolesState.loading ? <div className="server-settings-empty">Cargando roles...</div> : null}
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
                        <span>{buildRoleSummary(role)}</span>
                      </div>
                    </div>
                    <div className="server-settings-badges">
                      <span className="server-settings-pill">
                        {role.member_count || 0} miembros
                      </span>
                      {role.is_admin ? (
                        <span className="server-settings-pill accent">Admin</span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="server-settings-empty">
                  {rolesState.roles.length
                    ? "No se encontraron roles con ese filtro."
                    : "No hay roles configurados todavia."}
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
              <h3>Invitaciones</h3>
              <span>Genera y comparte accesos al servidor</span>
            </div>
            <button
              className="primary-button small"
              disabled={invitesState.creating}
              onClick={handleCreateInvite}
              type="button"
            >
              <Icon name="userAdd" />
              <span>{invitesState.creating ? "Creando..." : "Nueva invitacion"}</span>
            </button>
          </div>

          {saved ? <p className="settings-form-success">{saved}</p> : null}
          {invitesState.loading ? <div className="server-settings-empty">Cargando invitaciones...</div> : null}
          {invitesState.error ? <div className="server-settings-empty error">{invitesState.error}</div> : null}

          {!invitesState.loading && !invitesState.error ? (
            <div className="server-settings-list">
              {invitesState.invites.length ? (
                invitesState.invites.map((invite) => (
                  <div className="server-settings-list-row invite-row" key={invite.id}>
                    <div className="server-settings-invite-copy">
                      <strong>{window.location.origin}/invite/{invite.code}</strong>
                      <span>
                        Creada por {invite.creator_name || "Umbra"} • {formatRelativeDate(invite.created_at)} •{" "}
                        {Number(invite.uses || 0)} usos
                      </span>
                    </div>
                    <button
                      className="ghost-button small"
                      onClick={() => handleCopyInvite(invite.code)}
                      type="button"
                    >
                      <Icon name="copy" />
                      <span>Copiar</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="server-settings-empty">
                  No hay invitaciones creadas todavia. Genera una para compartir este servidor.
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
            <strong>Perfil de servidor</strong>
          </div>

          <div className="server-settings-nav">
            <button
              className={`server-settings-nav-item ${activeTab === "profile" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("profile")}
              type="button"
            >
              Perfil de servidor
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "members" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("members")}
              type="button"
            >
              Miembros
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "roles" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("roles")}
              type="button"
            >
              Roles
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "invites" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("invites")}
              type="button"
            >
              Invitaciones
            </button>
            <button
              className={`server-settings-nav-item ${activeTab === "stickers" ? "active" : ""}`.trim()}
              onClick={() => setActiveTab("stickers")}
              type="button"
            >
              Stickers
            </button>
          </div>
        </aside>

        <section className="server-settings-panel">
          <div className="server-settings-header">
            <div>
              <h2>
                {activeTab === "profile"
                  ? "Perfil de servidor"
                  : activeTab === "members"
                    ? "Miembros"
                    : activeTab === "roles"
                      ? "Roles"
                      : activeTab === "invites"
                        ? "Invitaciones"
                        : "Stickers"}
              </h2>
              <p>
                {activeTab === "profile"
                  ? "Personaliza como aparece tu servidor dentro de Umbra."
                  : activeTab === "members"
                    ? "Gestiona y revisa la gente que forma parte de tu espacio."
                    : activeTab === "roles"
                      ? "Consulta la estructura visual y de permisos del servidor."
                      : activeTab === "invites"
                        ? "Genera enlaces y revisa los accesos activos de tu servidor."
                        : "Crea stickers propios y manten a mano los predeterminados del servidor."}
              </p>
            </div>
            <button className="ghost-button icon-only" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </div>
          {activeTab === "profile" ? renderProfileTab() : null}
          {activeTab === "members" ? renderMembersTab() : null}
          {activeTab === "roles" ? renderRolesTab() : null}
          {activeTab === "invites" ? renderInvitesTab() : null}
          {activeTab === "stickers" ? <ServerStickersPanel guildId={guild.id} /> : null}
        </section>
      </div>
    </div>
  );
}
