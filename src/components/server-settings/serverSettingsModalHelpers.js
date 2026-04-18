import { resolveAssetUrl } from "../../api.js";
import { translate } from "../../i18n.js";

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
    rolesLoading: t("server.settings.roles.loading", "Cargando roles..."),
    rolesSubtitle: t(
      "server.settings.roles.subtitle",
      "Jerarquia y acceso visual del servidor"
    ),
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

  if (role.name === "@everyone") {
    return translate(language, "server.settings.role.base", "Rol base del servidor");
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
