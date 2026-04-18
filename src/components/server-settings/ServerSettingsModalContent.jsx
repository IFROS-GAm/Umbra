import React from "react";

import { buildInviteUrl, resolveAssetUrl } from "../../api.js";
import { translate } from "../../i18n.js";
import { Icon } from "../Icon.jsx";
import { ServerStickersPanel } from "../ServerStickersPanel.jsx";
import {
  buildGuildInitials,
  getRoleDisplayName,
  getRoleIcon,
  getRoleIconUrl,
  getRolePermissionOptions,
  buildRoleSummary,
  formatRelativeDate,
  normalizeColorInput,
  replaceCount,
  replaceName
} from "../serverSettingsModalHelpers.js";

function buildHeaderMeta(activeTab, copy) {
  if (activeTab === "members") {
    return {
      body: copy.headerMembersBody,
      title: copy.headerMembers
    };
  }

  if (activeTab === "roles") {
    return {
      body: copy.headerRolesBody,
      title: copy.headerRoles
    };
  }

  if (activeTab === "invites") {
    return {
      body: copy.headerInvitesBody,
      title: copy.headerInvites
    };
  }

  if (activeTab === "stickers") {
    return {
      body: copy.headerStickersBody,
      title: copy.headerStickers
    };
  }

  return {
    body: copy.headerProfileBody,
    title: copy.headerProfile
  };
}

function ServerSettingsProfileTab({
  copy,
  error,
  form,
  guild,
  iconInputRef,
  bannerInputRef,
  language,
  memberCount,
  normalizedBannerColor,
  onBannerSelection,
  onClearBanner,
  onClearIcon,
  onClose,
  onIconSelection,
  onSubmit,
  onUpdateForm,
  previewBanner,
  previewCardStyle,
  previewIcon,
  saved,
  saving
}) {
  return (
    <div className="server-settings-body">
      <form className="server-settings-form" onSubmit={onSubmit}>
        <input
          accept="image/*"
          className="hidden-file-input"
          onChange={onIconSelection}
          ref={iconInputRef}
          type="file"
        />
        <input
          accept="image/*"
          className="hidden-file-input"
          onChange={onBannerSelection}
          ref={bannerInputRef}
          type="file"
        />

        <label className="settings-field">
          <span>{copy.name}</span>
          <input
            maxLength={40}
            onChange={(event) => onUpdateForm("name", event.target.value)}
            required
            value={form.name}
          />
        </label>

        <label className="settings-field">
          <span>{copy.description}</span>
          <textarea
            maxLength={180}
            onChange={(event) => onUpdateForm("description", event.target.value)}
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
              <button className="ghost-button" onClick={onClearIcon} type="button">
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
              <button className="ghost-button" onClick={onClearBanner} type="button">
                <Icon name="close" />
                <span>{copy.hideBanner}</span>
              </button>
              <label className="settings-color-input compact">
                <input
                  onChange={(event) => onUpdateForm("bannerColor", event.target.value)}
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

function ServerSettingsMembersTab({
  banDraft,
  canManageMembers,
  canManageRoles,
  copy,
  currentUserId,
  filteredMembers,
  guild,
  language,
  memberActionState,
  membersQuery,
  assignableRoles,
  onBanDraftChange,
  onBanMember,
  onCloseBanDraft,
  onKickMember,
  onMembersQueryChange,
  onOpenBanDraft,
  onAssignRole,
  sortedMembers
}) {
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
            onChange={(event) => onMembersQueryChange(event.target.value)}
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
                (memberActionState.mode === "kick" ||
                  memberActionState.mode === "ban" ||
                  memberActionState.mode === "role");
              const canModerateMember =
                canManageMembers && member.id !== guild.owner_id && member.id !== currentUserId;
              const canAssignRole = canManageRoles && member.id !== guild.owner_id;
              const selectedRoleId =
                (member.role_ids || []).find((roleId) =>
                  assignableRoles.some((role) => role.id === roleId)
                ) || "";
              const selectedRole =
                assignableRoles.find((role) => role.id === selectedRoleId) || null;

              return (
                <div className="server-settings-list-stack" key={member.id}>
                  <div className="server-settings-list-row">
                    <div className="server-settings-member-main">
                      <div className="server-settings-member-avatar">
                        {member.avatar_url ? (
                          <img
                            alt={member.display_name || member.username}
                            src={resolveAssetUrl(member.avatar_url)}
                          />
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
                            onClick={() => onKickMember(member)}
                            type="button"
                          >
                            <span>
                              {isBusy && memberActionState.mode === "kick"
                                ? copy.membersModerating
                                : copy.kickAction}
                            </span>
                          </button>
                          <button
                            className={`ghost-button small ${
                              banDraft.memberId === member.id ? "active" : ""
                            }`.trim()}
                            disabled={Boolean(memberActionState.mode)}
                            onClick={() =>
                              banDraft.memberId === member.id
                                ? onCloseBanDraft()
                                : onOpenBanDraft(member.id)
                            }
                            type="button"
                          >
                            <span>{copy.banAction}</span>
                          </button>
                        </div>
                      ) : null}

                      {canAssignRole ? (
                        <label className="server-settings-member-role-select">
                          <span>{copy.assignRole}</span>
                          <div className="server-settings-member-role-current">
                            <span
                              className="server-settings-role-icon mini"
                              style={{
                                "--server-role-color": selectedRole?.color || "#7F8EA3"
                              }}
                            >
                              {selectedRole?.icon_url ? (
                                <img
                                  alt={getRoleDisplayName(selectedRole)}
                                  src={resolveAssetUrl(selectedRole.icon_url)}
                                />
                              ) : (
                                <span>{getRoleIcon(selectedRole) || "#"}</span>
                              )}
                            </span>
                            <strong
                              style={selectedRole?.color ? { color: selectedRole.color } : undefined}
                            >
                              {selectedRole ? getRoleDisplayName(selectedRole) : copy.noExtraRole}
                            </strong>
                          </div>
                          <select
                            disabled={Boolean(memberActionState.mode)}
                            onChange={(event) => onAssignRole(member, event.target.value)}
                            value={selectedRoleId}
                          >
                            <option value="">{copy.noExtraRole}</option>
                            {assignableRoles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.icon_emoji ? `${role.icon_emoji} ` : ""}
                                {getRoleDisplayName(role)}
                              </option>
                            ))}
                          </select>
                        </label>
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
                          onClick={onCloseBanDraft}
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
                                onBanDraftChange((previous) => ({
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
                                onBanDraftChange((previous) => ({
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
                          className={`server-settings-pill-button ${
                            banDraft.permanent ? "active" : ""
                          }`.trim()}
                          disabled={isBusy}
                          onClick={() =>
                            onBanDraftChange((previous) => ({
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
                          onClick={onCloseBanDraft}
                          type="button"
                        >
                          <span>{copy.banPanelCancel}</span>
                        </button>
                        <button
                          className="ghost-button small danger"
                          disabled={isBusy}
                          onClick={() => onBanMember(member)}
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

function ServerSettingsRolesTab({
  canManageRoles,
  copy,
  filteredRoles,
  language,
  onClearRoleIcon,
  onCreateRoleDraft,
  onRoleFieldChange,
  onRoleIconSelection,
  onRolePermissionToggle,
  onRolesQueryChange,
  onSaveRole,
  onSelectRole,
  permissionOptions,
  roleIconInputRef,
  roleIconPreview,
  roleForm,
  roleSaving,
  rolesQuery,
  rolesState
}) {
  const resolvedRoleIconUrl = roleIconPreview || roleForm.iconUrl || getRoleIconUrl(roleForm);
  return (
    <div className="server-settings-body single-column">
      <div className="server-settings-tab-panel">
        <input
          accept="image/*"
          className="hidden-file-input"
          onChange={onRoleIconSelection}
          ref={roleIconInputRef}
          type="file"
        />
        <div className="server-settings-list-header">
          <div>
            <h3>{copy.roles}</h3>
            <span>{copy.rolesSubtitle}</span>
          </div>
          <button
            className="primary-button small"
            disabled={!canManageRoles}
            onClick={onCreateRoleDraft}
            type="button"
          >
            <Icon name="add" />
            <span>{copy.createRole}</span>
          </button>
        </div>

        <label className="settings-search server-settings-search">
          <Icon name="search" size={16} />
          <input
            onChange={(event) => onRolesQueryChange(event.target.value)}
            placeholder={copy.searchRoles}
            type="text"
            value={rolesQuery}
          />
        </label>

        {rolesState.loading ? (
          <div className="server-settings-empty">{copy.rolesLoading}</div>
        ) : null}
        {rolesState.error ? (
          <div className="server-settings-empty error">{rolesState.error}</div>
        ) : null}

        {!rolesState.loading && !rolesState.error ? (
          <div className="server-settings-roles-shell">
            <div className="server-settings-list server-settings-roles-list">
              {filteredRoles.length ? (
                filteredRoles.map((role) => (
                  <button
                    className={`server-settings-list-row role-row ${
                      roleForm.id === role.id ? "active" : ""
                    }`.trim()}
                    key={role.id}
                    onClick={() => onSelectRole(role)}
                    type="button"
                  >
                    <div className="server-settings-role-main">
                      <span
                        className="server-settings-role-icon"
                        style={{
                          "--server-role-color": role.color || "#7F8EA3"
                        }}
                      >
                        {getRoleIconUrl(role) ? (
                          <img alt={getRoleDisplayName(role)} src={resolveAssetUrl(getRoleIconUrl(role))} />
                        ) : (
                          <span>{getRoleIcon(role) || "#"}</span>
                        )}
                      </span>
                      <div className="server-settings-role-copy">
                        <strong>{getRoleDisplayName(role)}</strong>
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
                  </button>
                ))
              ) : (
                <div className="server-settings-empty">
                  {rolesState.roles.length ? copy.noRolesMatch : copy.noRoles}
                </div>
              )}
            </div>

            <div className="server-settings-role-editor">
              <div className="server-settings-list-header role-editor-header">
                <div>
                  <h3>{roleForm.id ? getRoleDisplayName(roleForm) : copy.createRole}</h3>
                  <span>{copy.roleEditorHint}</span>
                </div>
                {roleForm.isSystem ? (
                  <span className="server-settings-pill">{copy.roleSystemLocked}</span>
                ) : null}
              </div>

              <div className="server-settings-role-preview-card">
                <span
                  className="server-settings-role-icon large"
                  style={{
                    "--server-role-color": normalizeColorInput(roleForm.color, "#9AA4B2")
                  }}
                >
                  {resolvedRoleIconUrl ? (
                    <img alt={roleForm.name || "Rol"} src={resolveAssetUrl(resolvedRoleIconUrl)} />
                  ) : (
                    <span>{roleForm.icon || "#"}</span>
                  )}
                </span>
                <div className="server-settings-role-copy">
                  <strong
                    style={{
                      color: normalizeColorInput(roleForm.color, "#9AA4B2")
                    }}
                  >
                    {roleForm.name || "Nuevo rol"}
                  </strong>
                  <span>{copy.roleEditorHint}</span>
                </div>
              </div>

              <div className="server-settings-role-form-grid">
                <label className="settings-field">
                  <span>{copy.roleIcon}</span>
                  <div className="server-settings-role-visual-field">
                    <button
                      className="server-settings-role-artwork"
                      disabled={roleForm.isSystem}
                      onClick={() => roleIconInputRef.current?.click()}
                      type="button"
                    >
                      {resolvedRoleIconUrl ? (
                        <img alt={roleForm.name || "Rol"} src={resolveAssetUrl(resolvedRoleIconUrl)} />
                      ) : (
                        <span>{roleForm.icon || "#"}</span>
                      )}
                    </button>
                    <div className="server-settings-role-visual-actions">
                      <div className="server-settings-member-actions compact">
                        <button
                          className="ghost-button small"
                          disabled={roleForm.isSystem}
                          onClick={() => roleIconInputRef.current?.click()}
                          type="button"
                        >
                          <Icon name="image" />
                          <span>Subir imagen</span>
                        </button>
                        <button
                          className="ghost-button small"
                          disabled={roleForm.isSystem || (!resolvedRoleIconUrl && !roleForm.icon)}
                          onClick={onClearRoleIcon}
                          type="button"
                        >
                          <Icon name="close" />
                          <span>Quitar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <input
                    disabled={roleForm.isSystem}
                    maxLength={4}
                    onChange={(event) => onRoleFieldChange("icon", event.target.value)}
                    placeholder="✨"
                    value={roleForm.icon}
                  />
                </label>

                <label className="settings-field">
                  <span>{copy.roleName}</span>
                  <input
                    disabled={roleForm.isSystem}
                    maxLength={40}
                    onChange={(event) => onRoleFieldChange("name", event.target.value)}
                    placeholder="Moderador"
                    value={roleForm.name}
                  />
                </label>

                <label className="settings-field">
                  <span>{copy.roleColor}</span>
                  <div className="server-settings-role-color-row">
                    <input
                      disabled={roleForm.isSystem}
                      onChange={(event) => onRoleFieldChange("color", event.target.value)}
                      type="color"
                      value={normalizeColorInput(roleForm.color, "#9AA4B2")}
                    />
                    <span>{normalizeColorInput(roleForm.color, "#9AA4B2")}</span>
                  </div>
                </label>
              </div>

              <div className="server-settings-role-permissions">
                <strong>{copy.rolePermissions}</strong>
                <div className="server-settings-role-permission-grid">
                  {permissionOptions.map((permission) => {
                    const selected = roleForm.permissionKeys.includes(permission.key);
                    return (
                      <button
                        className={`server-settings-role-permission ${
                          selected ? "active" : ""
                        }`.trim()}
                        disabled={roleForm.isSystem || !canManageRoles}
                        key={permission.key}
                        onClick={() => onRolePermissionToggle(permission.key)}
                        type="button"
                      >
                        <span>{permission.label}</span>
                        {selected ? <Icon name="check" size={16} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="settings-form-actions">
                <button
                  className="primary-button"
                  disabled={roleSaving || roleForm.isSystem || !canManageRoles}
                  onClick={onSaveRole}
                  type="button"
                >
                  <Icon name="save" />
                  <span>{roleSaving ? copy.saving : copy.saveChanges}</span>
                </button>
                <button className="ghost-button" onClick={onCreateRoleDraft} type="button">
                  <Icon name="add" />
                  <span>{copy.createRole}</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ServerSettingsInvitesTab({
  allowMemberInvites,
  copy,
  invitesState,
  language,
  onCopyInvite,
  onCreateInvite,
  onToggleAllowMemberInvites,
  saving,
  saved
}) {
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
            onClick={onCreateInvite}
            type="button"
          >
            <Icon name="userAdd" />
            <span>{invitesState.creating ? copy.creating : copy.createInvite}</span>
          </button>
        </div>

        <div className="server-settings-list-row invite-row invite-access-row">
          <div className="server-settings-invite-copy">
            <strong>{copy.allowMemberInvites}</strong>
            <span>{copy.allowMemberInvitesHint}</span>
          </div>
          <button
            className={`server-settings-pill-button ${allowMemberInvites ? "active" : ""}`.trim()}
            disabled={saving}
            onClick={onToggleAllowMemberInvites}
            type="button"
          >
            {allowMemberInvites ? "Activado" : "Desactivado"}
          </button>
        </div>

        {saved ? <p className="settings-form-success">{saved}</p> : null}
        {invitesState.loading ? (
          <div className="server-settings-empty">{copy.invitesLoading}</div>
        ) : null}
        {invitesState.error ? (
          <div className="server-settings-empty error">{invitesState.error}</div>
        ) : null}

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
                      )}{" "}
                      - {formatRelativeDate(invite.created_at, language)} -{" "}
                      {replaceCount(
                        copy.uses,
                        Number(invite.uses || 0),
                        `${Number(invite.uses || 0)} usos`
                      )}
                    </span>
                  </div>
                  <button
                    className="ghost-button small"
                    onClick={() => onCopyInvite(invite.code)}
                    type="button"
                  >
                    <Icon name="copy" />
                    <span>{copy.copy}</span>
                  </button>
                </div>
              ))
            ) : (
              <div className="server-settings-empty">{copy.invitesEmpty}</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ServerSettingsModalContent({
  activeTab,
  copy,
  currentUserId,
  guild,
  language,
  memberCount,
  onClose,
  onDeleteServer,
  state
}) {
  const headerMeta = buildHeaderMeta(activeTab, copy);
  const canDeleteServer = guild.owner_id === currentUserId;
  const navItems = [
    { id: "profile", label: copy.editProfile },
    { id: "members", label: copy.members },
    { id: "roles", label: copy.roles },
    { id: "invites", label: copy.invites },
    { id: "stickers", label: copy.stickerTab }
  ];

  return (
    <>
      <aside className="server-settings-sidebar">
        <div className="server-settings-sidebar-title">
          <small>{guild.name.toUpperCase()}</small>
          <strong>{copy.editProfile}</strong>
        </div>

        <div className="server-settings-nav">
          {navItems.map((item) => (
            <button
              className={`server-settings-nav-item ${
                activeTab === item.id ? "active" : ""
              }`.trim()}
              key={item.id}
              onClick={() => state.setActiveTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {canDeleteServer ? (
          <div className="server-settings-sidebar-footer">
            <span>{copy.deleteServerHint}</span>
            <button
              className="server-settings-danger-trigger"
              onClick={() => onDeleteServer?.(guild)}
              type="button"
            >
              <Icon name="trash" />
              <span>{copy.deleteServer}</span>
            </button>
          </div>
        ) : null}
      </aside>

      <section className="server-settings-panel">
        <div className="server-settings-header">
          <div>
            <h2>{headerMeta.title}</h2>
            <p>{headerMeta.body}</p>
          </div>
          <button className="ghost-button icon-only" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>

        {activeTab === "profile" ? (
          <ServerSettingsProfileTab
            copy={copy}
            error={state.error}
            form={state.form}
            guild={guild}
            iconInputRef={state.iconInputRef}
            bannerInputRef={state.bannerInputRef}
            language={language}
            memberCount={memberCount}
            normalizedBannerColor={state.normalizedBannerColor}
            onBannerSelection={state.handleBannerSelection}
            onClearBanner={state.clearBannerPreview}
            onClearIcon={state.clearIconPreview}
            onClose={onClose}
            onIconSelection={state.handleIconSelection}
            onSubmit={state.handleSubmit}
            onUpdateForm={state.updateForm}
            previewBanner={state.previewBanner}
            previewCardStyle={state.previewCardStyle}
            previewIcon={state.previewIcon}
            saved={state.saved}
            saving={state.saving}
          />
        ) : null}

        {activeTab === "members" ? (
          <ServerSettingsMembersTab
            banDraft={state.banDraft}
            canManageMembers={state.canManageMembers}
            canManageRoles={state.canManageRoles}
            copy={copy}
            currentUserId={currentUserId}
            filteredMembers={state.filteredMembers}
            guild={guild}
            language={language}
            memberActionState={state.memberActionState}
            membersQuery={state.membersQuery}
            assignableRoles={state.assignableRoles}
            onBanDraftChange={state.setBanDraft}
            onBanMember={state.handleBanMemberAction}
            onCloseBanDraft={state.closeBanDraft}
            onKickMember={state.handleKickMemberAction}
            onMembersQueryChange={state.setMembersQuery}
            onOpenBanDraft={state.openBanDraft}
            onAssignRole={state.handleAssignRoleToMember}
            sortedMembers={state.sortedMembers}
          />
        ) : null}

        {activeTab === "roles" ? (
          <ServerSettingsRolesTab
            canManageRoles={state.canManageRoles}
            copy={copy}
            filteredRoles={state.filteredRoles}
            language={language}
            onClearRoleIcon={state.clearRoleIconPreview}
            onCreateRoleDraft={state.handleCreateRoleDraft}
            onRoleFieldChange={state.updateRoleForm}
            onRoleIconSelection={state.handleRoleIconSelection}
            onRolePermissionToggle={state.handleToggleRolePermission}
            onRolesQueryChange={state.setRolesQuery}
            onSaveRole={state.handleSaveRole}
            onSelectRole={state.handleSelectRole}
            permissionOptions={getRolePermissionOptions(language)}
            roleIconInputRef={state.roleIconInputRef}
            roleIconPreview={state.roleIconPreview}
            roleForm={state.roleForm}
            roleSaving={state.roleSaving}
            rolesQuery={state.rolesQuery}
            rolesState={state.rolesState}
          />
        ) : null}

        {activeTab === "invites" ? (
          <ServerSettingsInvitesTab
            allowMemberInvites={Boolean(state.form.allowMemberInvites)}
            copy={copy}
            invitesState={state.invitesState}
            language={language}
            onCopyInvite={state.handleCopyInvite}
            onCreateInvite={state.handleCreateInvite}
            onToggleAllowMemberInvites={state.handleToggleAllowMemberInvites}
            saving={state.saving}
            saved={state.saved}
          />
        ) : null}

        {activeTab === "stickers" ? (
          <ServerStickersPanel guildId={guild.id} language={language} />
        ) : null}
      </section>
    </>
  );
}
