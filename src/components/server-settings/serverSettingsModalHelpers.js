import { resolveAssetUrl } from "../../api.js";
import { translate } from "../../i18n.js";

const ROLE_PERMISSIONS = Object.freeze({
  CREATE_INVITE: 1 << 0,
  READ_MESSAGES: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  MANAGE_MESSAGES: 1 << 13,
  MANAGE_CHANNELS: 1 << 4,
  MANAGE_GUILD: 1 << 5,
  MANAGE_ROLES: 1 << 28,
  ADMINISTRATOR: 1 << 3
});

export function resolveLanguageLocale(language) {
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

export function getServerSettingsCopy(language) {
  const t = (key, fallback) => translate(language, key, fallback);

  return {
    assignRole: t("server.settings.members.assignRole", "Rol"),
    createRole: t("server.settings.roles.create", "Crear rol"),
    noExtraRole: t("server.settings.members.noExtraRole", "Sin rol extra"),
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
    allowMemberInvites: t(
      "server.settings.invites.allowMemberInvites",
      "Cualquier persona puede invitar"
    ),
    allowMemberInvitesDisabled: t(
      "server.settings.invites.allowMemberInvitesDisabled",
      "Solo staff con permiso puede crear invitaciones."
    ),
    allowMemberInvitesEnabled: t(
      "server.settings.invites.allowMemberInvitesEnabled",
      "Ahora cualquier miembro puede invitar personas."
    ),
    allowMemberInvitesHint: t(
      "server.settings.invites.allowMemberInvitesHint",
      "Si lo desactivas, el boton de invitar desaparece para quienes no tengan permiso."
    ),
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
    invitesEmpty: t(
      "server.settings.invites.empty",
      "No hay invitaciones creadas todavia. Genera una para compartir este servidor."
    ),
    invitesLoading: t("server.settings.invites.loading", "Cargando invitaciones..."),
    invitesSubtitle: t(
      "server.settings.invites.subtitle",
      "Genera y comparte accesos al servidor"
    ),
    invalidBanner: t(
      "server.settings.profile.invalidBanner",
      "Selecciona una imagen valida para el cartel del servidor."
    ),
    invalidIcon: t(
      "server.settings.profile.invalidIcon",
      "Selecciona una imagen valida para el icono del servidor."
    ),
    kickAction: t("server.settings.members.kick", "Expulsar"),
    kickSuccess: t(
      "server.settings.members.kickSuccess",
      "{name} fue expulsado del servidor."
    ),
    members: t("server.settings.nav.members", "Miembros"),
    membersCount: t("server.settings.members.count", "personas en este servidor"),
    membersEmpty: t(
      "server.settings.members.empty",
      "No se encontraron miembros con ese filtro."
    ),
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
    noRolesMatch: t(
      "server.settings.roles.noMatch",
      "No se encontraron roles con ese filtro."
    ),
    owner: t("server.settings.role.owner", "Owner"),
    profileDescription: t(
      "server.settings.profile.subtitle",
      "Personaliza como aparece tu servidor dentro de Umbra."
    ),
    roles: t("server.settings.nav.roles", "Roles"),
    roleColor: t("server.settings.roles.color", "Color del rol"),
    roleEditorHint: t(
      "server.settings.roles.editorHint",
      "Crea roles, cambia su icono, nombre, color y permisos del servidor."
    ),
    roleIcon: t("server.settings.roles.icon", "Icono del rol"),
    roleName: t("server.settings.roles.name", "Nombre del rol"),
    rolePermissions: t("server.settings.roles.permissions", "Permisos del rol"),
    roleAssignedSuccess: t(
      "server.settings.roles.assignedSuccess",
      "{name} ahora tiene el rol seleccionado."
    ),
    roleSaved: t("server.settings.roles.saved", "Rol actualizado."),
    roleCreated: t("server.settings.roles.created", "Rol creado."),
    roleSystemLocked: t(
      "server.settings.roles.systemLocked",
      "Ese rol del sistema no se puede editar desde este panel."
    ),
    rolesLoading: t("server.settings.roles.loading", "Cargando roles..."),
    rolesSubtitle: t(
      "server.settings.roles.subtitle",
      "Jerarquia y acceso visual del servidor"
    ),
    rolesMemberCount: t("server.settings.roles.memberCount", "{count} miembros"),
    rolesPermissionsCount: t("server.settings.roles.permissionsCount", "{count} permisos"),
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

export function splitRolePresentation(candidate = "") {
  const raw = String(candidate || "").trim();
  if (!raw) {
    return {
      icon: "",
      name: ""
    };
  }

  const [firstToken = ""] = raw.split(/\s+/, 1);
  const remainder = raw.slice(firstToken.length).trim();
  const looksLikeIcon =
    firstToken.length > 0 &&
    firstToken.length <= 4 &&
    /[^\p{L}\p{N}_-]/u.test(firstToken);

  if (looksLikeIcon && remainder) {
    return {
      icon: firstToken,
      name: remainder
    };
  }

  return {
    icon: "",
    name: raw
  };
}

export function getRoleDisplayName(role) {
  if (!role) {
    return "";
  }

  return role.display_name || splitRolePresentation(role.name).name || role.name || "Rol";
}

export function getRoleIcon(role) {
  if (!role) {
    return "";
  }

  return role.icon_emoji || splitRolePresentation(role.name).icon || "";
}

export function getRolePermissionOptions(language) {
  const t = (key, fallback) => translate(language, key, fallback);

  return [
    {
      bit: ROLE_PERMISSIONS.ADMINISTRATOR,
      key: "administrator",
      label: t("server.settings.roles.permissions.administrator", "Administrador")
    },
    {
      bit: ROLE_PERMISSIONS.MANAGE_GUILD,
      key: "manageGuild",
      label: t("server.settings.roles.permissions.manageGuild", "Administrar servidor")
    },
    {
      bit: ROLE_PERMISSIONS.MANAGE_ROLES,
      key: "manageRoles",
      label: t("server.settings.roles.permissions.manageRoles", "Administrar roles")
    },
    {
      bit: ROLE_PERMISSIONS.MANAGE_CHANNELS,
      key: "manageChannels",
      label: t("server.settings.roles.permissions.manageChannels", "Administrar canales")
    },
    {
      bit: ROLE_PERMISSIONS.MANAGE_MESSAGES,
      key: "manageMessages",
      label: t("server.settings.roles.permissions.manageMessages", "Gestionar mensajes")
    },
    {
      bit: ROLE_PERMISSIONS.CREATE_INVITE,
      key: "createInvite",
      label: t("server.settings.roles.permissions.createInvite", "Crear invitaciones")
    },
    {
      bit: ROLE_PERMISSIONS.READ_MESSAGES,
      key: "readMessages",
      label: t("server.settings.roles.permissions.readMessages", "Leer mensajes")
    },
    {
      bit: ROLE_PERMISSIONS.SEND_MESSAGES,
      key: "sendMessages",
      label: t("server.settings.roles.permissions.sendMessages", "Enviar mensajes")
    }
  ];
}

export function buildRolePermissionBits(selectedKeys = [], language = "es") {
  const options = getRolePermissionOptions(language);
  return options.reduce((sum, option) => {
    return selectedKeys.includes(option.key) ? sum | option.bit : sum;
  }, 0);
}

export function extractRolePermissionKeys(bits = 0, language = "es") {
  const numericBits = Number(bits || 0);
  return getRolePermissionOptions(language)
    .filter((option) => (numericBits & option.bit) === option.bit)
    .map((option) => option.key);
}

export function normalizeColorInput(candidate, fallback = "#5865F2") {
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

export function buildGuildBannerStyle(color, imageUrl) {
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

export function buildGuildInitials(name) {
  const parts = String(name || "Umbra")
    .trim()
    .split(/\s+/)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "UM";
}

export function formatRelativeDate(value, language = "es") {
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

export function buildRoleSummary(role, language = "es") {
  const copy = getServerSettingsCopy(language);
  if (role.is_admin) {
    return copy.admin;
  }

  if (role.is_default_role || role.name === "@everyone") {
    return translate(language, "server.settings.role.base", "Rol base del servidor");
  }

  if (role.is_owner_role || role.name === "Owner") {
    return translate(language, "server.settings.role.ownerRole", "Rol reservado del owner");
  }

  const permissionCount = extractRolePermissionKeys(role.permissions, language).length;
  if (permissionCount) {
    return replaceCount(copy.rolesPermissionsCount, permissionCount, `${permissionCount} permisos`);
  }

  return translate(
    language,
    "server.settings.role.memberCount",
    `${role.member_count || 0} miembros con este rol`
  ).replace("{count}", String(role.member_count || 0));
}

export function replaceCount(template, count, fallback) {
  return String(template || fallback).replace("{count}", String(count));
}

export function replaceName(template, name, fallback) {
  return String(template || fallback).replace("{name}", name || "Umbra");
}
