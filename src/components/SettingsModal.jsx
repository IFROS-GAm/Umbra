import React, { useEffect, useMemo, useRef, useState } from "react";

import { api, resolveAssetUrl } from "../api.js";
import { LANGUAGE_OPTIONS, translate } from "../i18n.js";
import { hasSupabaseBrowserConfig, supabase } from "../supabase-browser.js";
import { STATUS_OPTIONS, sanitizeUsername } from "../utils.js";
import { Avatar } from "./Avatar.jsx";
import { AvatarCropModal } from "./AvatarCropModal.jsx";
import { Icon } from "./Icon.jsx";

const PROFILE_COLOR_PRESETS = [
  "#5865F2",
  "#7C3AED",
  "#EC4899",
  "#F97316",
  "#EAB308",
  "#10B981",
  "#06B6D4",
  "#64748B",
];

const SOCIAL_PLATFORM_OPTIONS = [
  { value: "website", label: "Sitio web", placeholder: "https://tu-sitio.com" },
  { value: "instagram", label: "Instagram", placeholder: "https://instagram.com/tu_usuario" },
  { value: "youtube", label: "YouTube", placeholder: "https://youtube.com/@tu_canal" },
  { value: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/user/..." },
  { value: "twitch", label: "Twitch", placeholder: "https://twitch.tv/tu_canal" },
  { value: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@tu_usuario" },
  { value: "x", label: "X / Twitter", placeholder: "https://x.com/tu_usuario" },
  { value: "discord", label: "Discord", placeholder: "https://discord.gg/tu_invite" }
];

const DEFAULT_PRIVACY_SETTINGS = {
  allowDirectMessages: true,
  showActivityStatus: true,
  showMemberSince: true,
  showSocialLinks: true
};

const RECOVERY_PROVIDER_OPTIONS = [
  { value: "", label: "Sin cuenta de recuperacion", placeholder: "No configurada" },
  { value: "google", label: "Google", placeholder: "tu-cuenta@gmail.com" },
  { value: "outlook", label: "Microsoft / Outlook", placeholder: "tu-cuenta@outlook.com" },
  { value: "apple", label: "Apple", placeholder: "Apple ID o correo asociado" },
  { value: "discord", label: "Discord", placeholder: "usuario, enlace o handle" },
  { value: "other", label: "Otra", placeholder: "Correo, usuario o enlace de respaldo" }
];

const SETTINGS_NAV_GROUPS = [
  {
    title: "Ajustes de usuario",
    items: [
      { id: "security", icon: "profile", label: "Mi cuenta", active: true },
      { id: "social", icon: "sparkles", label: "Contenido y redes", active: false },
      { id: "privacy", icon: "help", label: "Datos y privacidad", active: false },
      { id: "devices", icon: "screenShare", label: "Dispositivos", active: false },
      { id: "connections", icon: "mail", label: "Conexiones", active: false },
    ]
  },
  {
    title: "Ajustes de la aplicacion",
    items: [
      { id: "status", icon: "mission", label: "Estado", active: false },
      { id: "language", icon: "globe", label: "Idiomas", active: false },
      { id: "theme", icon: "sparkles", label: "Tema", toggleTheme: true }
    ]
  },
  {
    title: "Legal",
    className: "settings-nav-group-legal",
    items: [{ id: "terms", icon: "help", label: "Terminos y condiciones", active: false }]
  }
];

function findStatusLabel(status) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || "Offline";
}

function findLocalizedStatusLabel(status, locale) {
  const value = String(status || "").toLowerCase();
  return locale?.statuses?.[value] || findStatusLabel(status);
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

function buildPanelStyle(color, imageUrl) {
  const base = normalizeColorInput(color);

  if (imageUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.62)), url("${resolveAssetUrl(imageUrl)}")`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    };
  }

  return {
    background: `linear-gradient(135deg, ${base}, rgba(15, 18, 24, 0.94))`
  };
}

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "Sin correo visible";
  }

  const [name, domain] = email.split("@");
  if (name.length <= 2) {
    return `${name[0] || "*"}***@${domain}`;
  }

  return `${name.slice(0, 2)}${"*".repeat(Math.max(4, name.length - 2))}@${domain}`;
}

function isEmailAddress(candidate = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(candidate || "").trim());
}

function ensureUrlProtocol(candidate = "") {
  const trimmed = String(candidate || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function normalizeSocialLinks(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .map((entry, index) => ({
      id: String(entry?.id || `social-${index}`),
      label: String(entry?.label || "").trim().slice(0, 48),
      platform: SOCIAL_PLATFORM_OPTIONS.some((option) => option.value === entry?.platform)
        ? entry.platform
        : "website",
      url: ensureUrlProtocol(entry?.url || "")
    }))
    .filter((entry) => entry.label || entry.url)
    .slice(0, 8);
}

function buildSocialLinkDrafts(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return source.slice(0, 8).map((entry, index) => ({
    id: String(entry?.id || `social-${index}`),
    label: String(entry?.label || "").trim().slice(0, 48),
    platform: SOCIAL_PLATFORM_OPTIONS.some((option) => option.value === entry?.platform)
      ? entry.platform
      : "website",
    url: String(entry?.url || "").trim().slice(0, 240)
  }));
}

function normalizePrivacySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    ...DEFAULT_PRIVACY_SETTINGS,
    allowDirectMessages: source.allowDirectMessages !== false,
    showActivityStatus: source.showActivityStatus !== false,
    showMemberSince: source.showMemberSince !== false,
    showSocialLinks: source.showSocialLinks !== false
  };
}

function normalizeRecoveryProvider(provider = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  return RECOVERY_PROVIDER_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : "";
}

function normalizeRecoveryAccount(value = "") {
  return String(value || "").trim().slice(0, 160);
}

function settingsPanelTitle(tab) {
  switch (tab) {
    case "social":
      return "Contenido y redes";
    case "privacy":
      return "Datos y privacidad";
    case "devices":
      return "Dispositivos";
    case "connections":
      return "Conexiones";
    case "language":
      return "Idiomas";
    case "terms":
      return "Terminos y condiciones";
    case "status":
      return "Estado";
    default:
      return "Mi cuenta";
  }
}

function getSettingsLocale(language) {
  const dictionaries = {
    es: {
      statuses: {
        online: "En linea",
        idle: "Inactivo",
        dnd: "No molestar",
        invisible: "Invisible",
        offline: "Offline"
      },
      socialPlatforms: {
        website: "Sitio web",
        instagram: "Instagram",
        youtube: "YouTube",
        spotify: "Spotify",
        twitch: "Twitch",
        tiktok: "TikTok",
        x: "X / Twitter",
        discord: "Discord"
      },
      recoveryProviders: {
        "": "Sin cuenta de recuperacion",
        google: "Google",
        outlook: "Microsoft / Outlook",
        apple: "Apple",
        discord: "Discord",
        other: "Otra"
      },
      security: {
        editProfileButton: "Editar perfil de usuario",
        closeEditorButton: "Cerrar editor",
        editButton: "Editar",
        editProfileTitle: "Editar perfil",
        editProfileSubtitle: "Elige avatar, panel, color y datos visibles de tu cuenta.",
        profilePanel: "Panel del perfil",
        uploadPanel: "Subir panel",
        changePanelImage: "Cambiar imagen del panel",
        removePanelImage: "Quitar imagen del panel",
        panelHelper: "Usa una imagen horizontal para que el header se vea mejor.",
        avatar: "Avatar",
        uploadPhoto: "Subir foto",
        removePhoto: "Quitar foto",
        avatarHelper: "PNG, JPG o WEBP. Aparece en mensajes, miembros y perfiles.",
        username: "Nombre de usuario",
        customStatus: "Estado personalizado",
        customStatusPlaceholder: "Que estas haciendo ahora",
        bio: "Bio",
        profileAccent: "Color de respaldo del panel",
        avatarTone: "Tono de respaldo del avatar",
        saveChanges: "Guardar cambios",
        saving: "Guardando...",
        back: "Volver",
        signOut: "Cerrar sesion",
        accountRows: {
          displayName: "Nombre para mostrar",
          username: "Nombre de usuario",
          email: "Correo electronico",
          panel: "Panel del perfil",
          emailAccent: "Mostrar",
          bannerConfigured: "Imagen de panel configurada",
          noUsername: "Sin usuario",
          defaultName: "Umbra user"
        }
      },
      social: {
        title: "Contenido y redes",
        subtitle: "Lo que publiques aqui aparecera en Ver perfil completo.",
        platform: "Plataforma",
        visibleLabel: "Etiqueta visible",
        visiblePlaceholder: "Tu nombre o handle",
        link: "Enlace",
        delete: "Eliminar red",
        emptyTitle: "Todavia no hay redes visibles.",
        emptyBody: "Agrega las conexiones que quieres que aparezcan en tu perfil completo.",
        add: "Anadir red",
        save: "Guardar redes",
        saving: "Guardando..."
      },
      privacy: {
        title: "Datos y privacidad",
        subtitle: "Controla que partes de tu perfil completo se muestran al resto.",
        socialTitle: "Mostrar redes y conexiones",
        socialBody: "Permite que Contenido y redes se vea dentro de tu perfil completo.",
        memberSinceTitle: "Mostrar fecha de miembro desde",
        memberSinceBody: "Usa la fecha de creacion de tu cuenta dentro del perfil completo.",
        activityTitle: "Mostrar estado de actividad",
        activityBody: "Deja visible tu estado personalizado y actividad en el perfil.",
        dmTitle: "Permitir mensajes directos desde perfil",
        dmBody: "Guarda tu preferencia para futuros accesos directos a DM.",
        save: "Guardar privacidad",
        saving: "Guardando..."
      },
      devices: {
        title: "Dispositivos",
        subtitle: "Lectura local de microfonos, salidas y camaras disponibles en este equipo.",
        refresh: "Actualizar lista",
        refreshing: "Actualizando...",
        microphones: "Microfonos",
        outputs: "Salidas de audio",
        cameras: "Camaras",
        detected: "detectados",
        systemDefault: "Predeterminado del sistema",
        detectedLocal: "Detectado localmente",
        emptyTitle: "Sin dispositivos visibles.",
        emptyBody: "Permite acceso a microfono o camara para ver etiquetas completas.",
        readError: "No se pudieron leer los dispositivos."
      },
      connections: {
        title: "Conexiones",
        subtitle:
          "Controla como recuperas tu cuenta, que correo recibe avisos y que enlaces quedan visibles dentro de Umbra.",
        provider: "Proveedor de acceso",
        connected: "Conectado",
        noEmail: "Sin correo",
        currentEmail: "Correo actual",
        confirmed: "Confirmado",
        unconfirmed: "Sin confirmar",
        emailConfirmation: "Confirmacion de correo",
        emailConfirmedBody:
          "Tu correo principal ya esta confirmado. Puedes mandar un correo de prueba si quieres revisar la entrega.",
        emailPendingBody:
          "Puedes reenviar el correo de verificacion al principal para comprobar que el flujo funciona.",
        send: "Enviar",
        sendTest: "Enviar prueba",
        sendConfirmation: "Enviar confirmacion",
        changePrimaryTitle: "Cambiar correo principal",
        changePrimarySubtitle:
          "Usa un nuevo correo y Umbra disparara el flujo de validacion correspondiente.",
        newEmail: "Nuevo correo",
        changeEmail: "Cambiar correo",
        reauthTitle: "Reautenticacion y clave",
        reauthSubtitle:
          "Envia un codigo de reautenticacion y luego actualiza tu contrasena desde Umbra.",
        sendReauth: "Enviar codigo de reautenticacion",
        reauthCode: "Codigo de reautenticacion",
        reauthPlaceholder: "Pegalo aqui si se solicita por correo",
        newPassword: "Nueva contrasena",
        newPasswordPlaceholder: "Minimo 8 caracteres",
        confirmPassword: "Confirmar contrasena",
        confirmPasswordPlaceholder: "Repite la nueva contrasena",
        updatePassword: "Actualizar contrasena",
        recoveryTitle: "Cuenta de recuperacion",
        recoverySubtitle:
          "Guarda una via de respaldo como Google u otro servicio para futuros flujos de recuperacion.",
        providerField: "Proveedor",
        accountField: "Cuenta o correo",
        backupNow: "Respaldo actual",
        backupNone: "Todavia no hay una cuenta de recuperacion guardada.",
        backupBody:
          "Puedes dejar un correo, usuario o enlace de una cuenta externa como referencia segura.",
        recoveryCheckTitle: "Comprobacion del respaldo",
        recoveryCheckBody:
          "Envia un correo de prueba al respaldo para validar que siga disponible.",
        recoveryNeedsEmail:
          "Si quieres probar el respaldo por correo, guardalo como un email valido.",
        visibleNetworksTitle: "Redes visibles ahora",
        visibleNetworksBody:
          "Esto es lo que la gente vera en tu perfil completo si tiene acceso a tus conexiones.",
        hiddenNetworksBody: "Las redes estan ocultas por tu configuracion de privacidad.",
        noPublicConnections: "No hay conexiones publicas configuradas.",
        noPublicConnectionsBody: "Usa Contenido y redes para agregar tus enlaces visibles.",
        inviteUmbraTitle: "Invitar a Umbra",
        inviteUmbraSubtitle: "Envia una invitacion por correo para crear una cuenta nueva en Umbra.",
        inviteEmail: "Correo a invitar",
        sendInvite: "Enviar invitacion",
        inviting: "Invitando...",
        saveBackup: "Guardar conexiones",
        saving: "Guardando...",
        summary: {
          primary: "Correo principal",
          primaryHelperReady: "Listo para recibir avisos",
          primaryHelperPending: "Pendiente de verificar",
          provider: "Acceso activo",
          providerReady: "Sesion validada",
          providerPending: "Requiere confirmacion",
          recovery: "Respaldo",
          recoveryReady: "Puede recibir prueba",
          recoveryPending: "Agrega una via de apoyo",
          public: "Perfil publico",
          publicVisible: "Visible en tu perfil",
          publicHidden: "Redes ocultas",
          hidden: "Oculto",
          noConfig: "No configurado",
          linkSingular: "enlace",
          linkPlural: "enlaces"
        }
      },
      statusPanel: {
        currentTitle: "Estado actual",
        currentSubtitle: "Presencia visible para el resto del workspace.",
        noCustomStatus: "Sin estado personalizado por ahora.",
        workspaceTitle: "Resumen del espacio",
        workspaceSubtitle: "Actividad actual dentro de Umbra.",
        guilds: "Servidores activos",
        dms: "DMs visibles",
        theme: "Modo visual"
      },
      terms: {
        title: "Terminos y condiciones de uso",
        subtitle:
          "Este panel resume las reglas base para usar Umbra con seguridad, respeto y responsabilidad.",
        summaryTitle: "Resumen Umbra",
        summaryBody:
          "Al usar Umbra aceptas una plataforma centrada en comunidad, identidad, privacidad, mensajeria, voz y servidores administrados por sus propias reglas.",
        lastReview: "Ultima revision",
        conditionsTitle: "Condiciones generales",
        conditionsSubtitle:
          "Estos puntos aplican al uso del cliente, la web, los servidores, los mensajes directos y cualquier integracion futura de Umbra.",
        acceptTitle: "Lo que aceptas al usar Umbra",
        acceptSubtitle: "Una version corta y clara de las reglas practicas del servicio.",
        supportTitle: "Soporte y contacto",
        supportSubtitle:
          "Si una norma de un servidor entra en conflicto con el uso seguro de Umbra, prevalece la seguridad del servicio y de las personas usuarias.",
        recommendation: "Recomendacion",
        recommendationBody:
          "Usa Conexiones para mantener tu correo principal y tu respaldo actualizados. Eso facilita confirmaciones, recuperacion de acceso y avisos de seguridad.",
        pills: ["Respeto y convivencia", "Privacidad", "Moderacion", "Uso responsable"],
        checklist: [
          "No usar Umbra para suplantar identidades ni enganar a otras personas.",
          "No automatizar invitaciones, DMs, menciones o llamadas de forma abusiva.",
          "No compartir contenido privado de terceros sin permiso.",
          "Respetar bloqueos, silencios, baneos y limites de moderacion.",
          "Cuidar tus accesos, dispositivos y metodos de recuperacion.",
          "Usar de forma responsable stickers, perfiles, servidores y conexiones visibles."
        ]
      }
    },
    en: {
      statuses: {
        online: "Online",
        idle: "Idle",
        dnd: "Do not disturb",
        invisible: "Invisible",
        offline: "Offline"
      },
      socialPlatforms: {
        website: "Website",
        instagram: "Instagram",
        youtube: "YouTube",
        spotify: "Spotify",
        twitch: "Twitch",
        tiktok: "TikTok",
        x: "X / Twitter",
        discord: "Discord"
      },
      recoveryProviders: {
        "": "No recovery account",
        google: "Google",
        outlook: "Microsoft / Outlook",
        apple: "Apple",
        discord: "Discord",
        other: "Other"
      },
      security: {
        editProfileButton: "Edit user profile",
        closeEditorButton: "Close editor",
        editButton: "Edit",
        editProfileTitle: "Edit profile",
        editProfileSubtitle: "Choose avatar, banner, color, and visible account details.",
        profilePanel: "Profile banner",
        uploadPanel: "Upload banner",
        changePanelImage: "Change banner image",
        removePanelImage: "Remove banner image",
        panelHelper: "Use a wide image so the header looks better.",
        avatar: "Avatar",
        uploadPhoto: "Upload photo",
        removePhoto: "Remove photo",
        avatarHelper: "PNG, JPG or WEBP. It appears in messages, members and profiles.",
        username: "Username",
        customStatus: "Custom status",
        customStatusPlaceholder: "What are you doing right now",
        bio: "Bio",
        profileAccent: "Panel accent color",
        avatarTone: "Avatar accent tone",
        saveChanges: "Save changes",
        saving: "Saving...",
        back: "Back",
        signOut: "Sign out",
        accountRows: {
          displayName: "Display name",
          username: "Username",
          email: "Email",
          panel: "Profile panel",
          emailAccent: "Show",
          bannerConfigured: "Banner image configured",
          noUsername: "No username",
          defaultName: "Umbra user"
        }
      },
      social: {
        title: "Content and social",
        subtitle: "What you publish here appears in View full profile.",
        platform: "Platform",
        visibleLabel: "Visible label",
        visiblePlaceholder: "Your name or handle",
        link: "Link",
        delete: "Remove social link",
        emptyTitle: "There are no visible socials yet.",
        emptyBody: "Add the connections you want to show on your full profile.",
        add: "Add social link",
        save: "Save socials",
        saving: "Saving..."
      },
      privacy: {
        title: "Privacy and data",
        subtitle: "Control which parts of your full profile are visible to others.",
        socialTitle: "Show socials and connections",
        socialBody: "Allows Content and social to appear in your full profile.",
        memberSinceTitle: "Show member since date",
        memberSinceBody: "Use your account creation date inside the full profile.",
        activityTitle: "Show activity status",
        activityBody: "Keep your custom status and activity visible on the profile.",
        dmTitle: "Allow direct messages from profile",
        dmBody: "Stores your preference for future profile-to-DM shortcuts.",
        save: "Save privacy",
        saving: "Saving..."
      },
      devices: {
        title: "Devices",
        subtitle: "Local readout of microphones, outputs and cameras available on this device.",
        refresh: "Refresh list",
        refreshing: "Refreshing...",
        microphones: "Microphones",
        outputs: "Audio outputs",
        cameras: "Cameras",
        detected: "detected",
        systemDefault: "System default",
        detectedLocal: "Detected locally",
        emptyTitle: "No visible devices.",
        emptyBody: "Allow microphone or camera access to see full labels.",
        readError: "Could not read devices."
      },
      connections: {
        title: "Connections",
        subtitle:
          "Control how you recover your account, which email receives notices, and which links remain visible inside Umbra.",
        provider: "Access provider",
        connected: "Connected",
        noEmail: "No email",
        currentEmail: "Current email",
        confirmed: "Confirmed",
        unconfirmed: "Unconfirmed",
        emailConfirmation: "Email confirmation",
        emailConfirmedBody:
          "Your primary email is already confirmed. You can send a test email if you want to verify delivery.",
        emailPendingBody:
          "You can resend the verification email to the primary address to validate the flow.",
        send: "Send",
        sendTest: "Send test",
        sendConfirmation: "Send confirmation",
        changePrimaryTitle: "Change primary email",
        changePrimarySubtitle: "Use a new email and Umbra will trigger the matching validation flow.",
        newEmail: "New email",
        changeEmail: "Change email",
        reauthTitle: "Reauthentication and password",
        reauthSubtitle: "Send a reauthentication code and then update your password from Umbra.",
        sendReauth: "Send reauthentication code",
        reauthCode: "Reauthentication code",
        reauthPlaceholder: "Paste it here if requested by email",
        newPassword: "New password",
        newPasswordPlaceholder: "Minimum 8 characters",
        confirmPassword: "Confirm password",
        confirmPasswordPlaceholder: "Repeat the new password",
        updatePassword: "Update password",
        recoveryTitle: "Recovery account",
        recoverySubtitle: "Save a backup path such as Google or another service for future recovery flows.",
        providerField: "Provider",
        accountField: "Account or email",
        backupNow: "Current backup",
        backupNone: "There is no saved recovery account yet.",
        backupBody: "You can save an email, username or link to an external account as a secure reference.",
        recoveryCheckTitle: "Backup check",
        recoveryCheckBody: "Send a test email to the backup to validate it is still available.",
        recoveryNeedsEmail: "If you want to test the backup by email, save it as a valid email address.",
        visibleNetworksTitle: "Visible connections now",
        visibleNetworksBody: "This is what people will see on your full profile if they can access your connections.",
        hiddenNetworksBody: "Connections are hidden by your privacy settings.",
        noPublicConnections: "There are no public connections configured.",
        noPublicConnectionsBody: "Use Content and social to add the links you want to show.",
        inviteUmbraTitle: "Invite to Umbra",
        inviteUmbraSubtitle: "Send an email invitation to create a new Umbra account.",
        inviteEmail: "Email to invite",
        sendInvite: "Send invitation",
        inviting: "Inviting...",
        saveBackup: "Save connections",
        saving: "Saving...",
        summary: {
          primary: "Primary email",
          primaryHelperReady: "Ready to receive notices",
          primaryHelperPending: "Pending verification",
          provider: "Active access",
          providerReady: "Validated session",
          providerPending: "Needs confirmation",
          recovery: "Backup",
          recoveryReady: "Can receive tests",
          recoveryPending: "Add a backup path",
          public: "Public profile",
          publicVisible: "Visible on your profile",
          publicHidden: "Hidden connections",
          hidden: "Hidden",
          noConfig: "Not configured",
          linkSingular: "link",
          linkPlural: "links"
        }
      },
      statusPanel: {
        currentTitle: "Current status",
        currentSubtitle: "Presence visible to the rest of the workspace.",
        noCustomStatus: "No custom status for now.",
        workspaceTitle: "Workspace summary",
        workspaceSubtitle: "Current activity inside Umbra.",
        guilds: "Active servers",
        dms: "Visible DMs",
        theme: "Visual mode"
      },
      terms: {
        title: "Terms and conditions",
        subtitle: "This panel summarizes the core rules for using Umbra safely, respectfully and responsibly.",
        summaryTitle: "Umbra summary",
        summaryBody:
          "By using Umbra you accept a platform focused on community, identity, privacy, messaging, voice and servers managed by their own rules.",
        lastReview: "Last review",
        conditionsTitle: "General conditions",
        conditionsSubtitle:
          "These points apply to the client, the web app, servers, direct messages and any future Umbra integrations.",
        acceptTitle: "What you accept when using Umbra",
        acceptSubtitle: "A short and clear version of the service's practical rules.",
        supportTitle: "Support and contact",
        supportSubtitle:
          "If a server rule conflicts with the safe use of Umbra, the safety of the service and its users prevails.",
        recommendation: "Recommendation",
        recommendationBody:
          "Use Connections to keep your primary email and backup current. That makes confirmations, account recovery and security notices easier.",
        pills: ["Respect and conduct", "Privacy", "Moderation", "Responsible use"],
        checklist: [
          "Do not use Umbra to impersonate identities or deceive other people.",
          "Do not automate invites, DMs, mentions or calls abusively.",
          "Do not share private third-party content without permission.",
          "Respect blocks, mutes, bans and moderation limits.",
          "Protect your access, devices and recovery methods.",
          "Use stickers, profiles, servers and visible connections responsibly."
        ]
      }
    },
    fr: {
      statuses: {
        online: "En ligne",
        idle: "Inactif",
        dnd: "Ne pas deranger",
        invisible: "Invisible",
        offline: "Hors ligne"
      },
      socialPlatforms: {
        website: "Site web",
        instagram: "Instagram",
        youtube: "YouTube",
        spotify: "Spotify",
        twitch: "Twitch",
        tiktok: "TikTok",
        x: "X / Twitter",
        discord: "Discord"
      },
      recoveryProviders: {
        "": "Aucun compte de recuperation",
        google: "Google",
        outlook: "Microsoft / Outlook",
        apple: "Apple",
        discord: "Discord",
        other: "Autre"
      },
      security: {
        editProfileButton: "Modifier le profil utilisateur",
        closeEditorButton: "Fermer l'editeur",
        editButton: "Modifier",
        editProfileTitle: "Modifier le profil",
        editProfileSubtitle: "Choisis l'avatar, la banniere, la couleur et les informations visibles.",
        profilePanel: "Banniere du profil",
        uploadPanel: "Importer une banniere",
        changePanelImage: "Changer l'image de la banniere",
        removePanelImage: "Retirer l'image de la banniere",
        panelHelper: "Utilise une image horizontale pour un meilleur rendu du header.",
        avatar: "Avatar",
        uploadPhoto: "Importer une photo",
        removePhoto: "Retirer la photo",
        avatarHelper: "PNG, JPG ou WEBP. Visible dans les messages, membres et profils.",
        username: "Nom d'utilisateur",
        customStatus: "Statut personnalise",
        customStatusPlaceholder: "Que fais-tu en ce moment",
        bio: "Bio",
        profileAccent: "Couleur d'accent du panneau",
        avatarTone: "Teinte d'accent de l'avatar",
        saveChanges: "Enregistrer",
        saving: "Enregistrement...",
        back: "Retour",
        signOut: "Se deconnecter",
        accountRows: {
          displayName: "Nom d'affichage",
          username: "Nom d'utilisateur",
          email: "Email",
          panel: "Panneau du profil",
          emailAccent: "Afficher",
          bannerConfigured: "Image du panneau configuree",
          noUsername: "Aucun nom d'utilisateur",
          defaultName: "Utilisateur Umbra"
        }
      },
      social: {
        title: "Contenu et reseaux",
        subtitle: "Ce que tu publies ici apparaitra dans Voir le profil complet.",
        platform: "Plateforme",
        visibleLabel: "Etiquette visible",
        visiblePlaceholder: "Ton nom ou ton identifiant",
        link: "Lien",
        delete: "Supprimer le lien",
        emptyTitle: "Aucun reseau visible pour l'instant.",
        emptyBody: "Ajoute les connexions que tu veux afficher sur ton profil complet.",
        add: "Ajouter un lien",
        save: "Enregistrer les reseaux",
        saving: "Enregistrement..."
      },
      privacy: {
        title: "Confidentialite et donnees",
        subtitle: "Controle quelles parties de ton profil complet sont visibles pour les autres.",
        socialTitle: "Afficher les reseaux et connexions",
        socialBody: "Permet a Contenu et reseaux d'apparaitre dans ton profil complet.",
        memberSinceTitle: "Afficher la date de membre depuis",
        memberSinceBody: "Utilise la date de creation du compte dans le profil complet.",
        activityTitle: "Afficher le statut d'activite",
        activityBody: "Garde ton statut personnalise et ton activite visibles sur le profil.",
        dmTitle: "Autoriser les messages directs depuis le profil",
        dmBody: "Enregistre ta preference pour les futurs raccourcis profil vers DM.",
        save: "Enregistrer la confidentialite",
        saving: "Enregistrement..."
      },
      devices: {
        title: "Appareils",
        subtitle: "Lecture locale des micros, sorties et cameras disponibles sur cet appareil.",
        refresh: "Actualiser la liste",
        refreshing: "Actualisation...",
        microphones: "Micros",
        outputs: "Sorties audio",
        cameras: "Cameras",
        detected: "detectes",
        systemDefault: "Par defaut du systeme",
        detectedLocal: "Detecte localement",
        emptyTitle: "Aucun appareil visible.",
        emptyBody: "Autorise l'acces au micro ou a la camera pour voir les libelles complets.",
        readError: "Impossible de lire les appareils."
      },
      connections: {
        title: "Connexions",
        subtitle:
          "Controle comment tu recuperes ton compte, quel email recoit les avis et quels liens restent visibles dans Umbra.",
        provider: "Fournisseur d'acces",
        connected: "Connecte",
        noEmail: "Aucun email",
        currentEmail: "Email actuel",
        confirmed: "Confirme",
        unconfirmed: "Non confirme",
        emailConfirmation: "Confirmation d'email",
        emailConfirmedBody:
          "Ton email principal est deja confirme. Tu peux envoyer un email de test pour verifier la distribution.",
        emailPendingBody:
          "Tu peux renvoyer l'email de verification au principal pour valider le flux.",
        send: "Envoyer",
        sendTest: "Envoyer un test",
        sendConfirmation: "Envoyer la confirmation",
        changePrimaryTitle: "Changer l'email principal",
        changePrimarySubtitle: "Utilise un nouvel email et Umbra lancera le flux de validation approprie.",
        newEmail: "Nouvel email",
        changeEmail: "Changer l'email",
        reauthTitle: "Reauthentification et mot de passe",
        reauthSubtitle: "Envoie un code de reauthentification puis mets a jour ton mot de passe depuis Umbra.",
        sendReauth: "Envoyer le code de reauthentification",
        reauthCode: "Code de reauthentification",
        reauthPlaceholder: "Colle-le ici si on te le demande par email",
        newPassword: "Nouveau mot de passe",
        newPasswordPlaceholder: "Minimum 8 caracteres",
        confirmPassword: "Confirmer le mot de passe",
        confirmPasswordPlaceholder: "Repete le nouveau mot de passe",
        updatePassword: "Mettre a jour le mot de passe",
        recoveryTitle: "Compte de recuperation",
        recoverySubtitle: "Enregistre une voie de secours comme Google ou un autre service pour de futurs flux de recuperation.",
        providerField: "Fournisseur",
        accountField: "Compte ou email",
        backupNow: "Secours actuel",
        backupNone: "Aucun compte de recuperation enregistre pour l'instant.",
        backupBody: "Tu peux enregistrer un email, un identifiant ou un lien de compte externe comme reference sure.",
        recoveryCheckTitle: "Verification du secours",
        recoveryCheckBody: "Envoie un email de test au secours pour verifier qu'il reste disponible.",
        recoveryNeedsEmail: "Si tu veux tester le secours par email, enregistre-le comme adresse valide.",
        visibleNetworksTitle: "Connexions visibles maintenant",
        visibleNetworksBody: "Voici ce que les autres verront sur ton profil complet s'ils peuvent acceder a tes connexions.",
        hiddenNetworksBody: "Les connexions sont masquees par tes parametres de confidentialite.",
        noPublicConnections: "Aucune connexion publique configuree.",
        noPublicConnectionsBody: "Utilise Contenu et reseaux pour ajouter les liens visibles.",
        inviteUmbraTitle: "Inviter sur Umbra",
        inviteUmbraSubtitle: "Envoie une invitation par email pour creer un nouveau compte Umbra.",
        inviteEmail: "Email a inviter",
        sendInvite: "Envoyer l'invitation",
        inviting: "Invitation en cours...",
        saveBackup: "Enregistrer les connexions",
        saving: "Enregistrement...",
        summary: {
          primary: "Email principal",
          primaryHelperReady: "Pret a recevoir les avis",
          primaryHelperPending: "Verification en attente",
          provider: "Acces actif",
          providerReady: "Session validee",
          providerPending: "Doit etre confirme",
          recovery: "Secours",
          recoveryReady: "Peut recevoir des tests",
          recoveryPending: "Ajoute une voie de secours",
          public: "Profil public",
          publicVisible: "Visible sur ton profil",
          publicHidden: "Connexions masquees",
          hidden: "Masque",
          noConfig: "Non configure",
          linkSingular: "lien",
          linkPlural: "liens"
        }
      },
      statusPanel: {
        currentTitle: "Statut actuel",
        currentSubtitle: "Presence visible pour le reste de l'espace.",
        noCustomStatus: "Aucun statut personnalise pour l'instant.",
        workspaceTitle: "Resume de l'espace",
        workspaceSubtitle: "Activite actuelle dans Umbra.",
        guilds: "Serveurs actifs",
        dms: "DM visibles",
        theme: "Mode visuel"
      },
      terms: {
        title: "Conditions d'utilisation",
        subtitle:
          "Ce panneau resume les regles de base pour utiliser Umbra en toute securite, avec respect et responsabilite.",
        summaryTitle: "Resume Umbra",
        summaryBody:
          "En utilisant Umbra, tu acceptes une plateforme centree sur la communaute, l'identite, la confidentialite, la messagerie, la voix et des serveurs geres par leurs propres regles.",
        lastReview: "Derniere revision",
        conditionsTitle: "Conditions generales",
        conditionsSubtitle:
          "Ces points s'appliquent au client, au web, aux serveurs, aux messages directs et a toute integration future d'Umbra.",
        acceptTitle: "Ce que tu acceptes en utilisant Umbra",
        acceptSubtitle: "Une version courte et claire des regles pratiques du service.",
        supportTitle: "Support et contact",
        supportSubtitle:
          "Si une regle de serveur entre en conflit avec l'usage sur d'Umbra, la securite du service et des utilisateurs prime.",
        recommendation: "Recommandation",
        recommendationBody:
          "Utilise Connexions pour garder ton email principal et ton secours a jour. Cela facilite les confirmations, la recuperation de compte et les avis de securite.",
        pills: ["Respect et conduite", "Confidentialite", "Moderation", "Usage responsable"],
        checklist: [
          "N'utilise pas Umbra pour usurper une identite ou tromper d'autres personnes.",
          "N'automatise pas les invitations, DMs, mentions ou appels de maniere abusive.",
          "Ne partage pas de contenu prive de tiers sans permission.",
          "Respecte les blocages, silences, bannissements et limites de moderation.",
          "Protege tes acces, tes appareils et tes moyens de recuperation.",
          "Utilise les stickers, profils, serveurs et connexions visibles de facon responsable."
        ]
      }
    }
  };

  return dictionaries[language] || dictionaries.es;
}

function getLegalSections(language) {
  const dictionaries = {
    es: [
      {
        id: "uso",
        title: "Uso aceptable",
        body:
          "Umbra esta pensada para conversaciones, servidores, mensajes directos, voz, video y comunidades privadas. No puedes usar la plataforma para spam, fraude, acoso, suplantacion, distribucion de malware o automatizacion abusiva."
      },
      {
        id: "cuenta",
        title: "Cuenta, acceso y seguridad",
        body:
          "Eres responsable de la seguridad de tu cuenta, de tus credenciales y de los dispositivos desde los que entras. Debes mantener tu correo principal actualizado y usar los canales de recuperacion disponibles para proteger el acceso."
      },
      {
        id: "contenido",
        title: "Contenido y convivencia",
        body:
          "Cada persona mantiene la responsabilidad sobre lo que publica, comparte, sube o transmite en Umbra. Tambien debe respetar la privacidad, autoria y normas internas de cada servidor, categoria, canal o grupo."
      },
      {
        id: "moderacion",
        title: "Servidores, moderacion y permisos",
        body:
          "Los duenos y administradores de servidores pueden definir estructura, roles, categorias, stickers, invitaciones y reglas de moderacion. Umbra puede limitar funciones o retirar acceso si detecta abuso, evasion de bloqueos o uso peligroso del servicio."
      },
      {
        id: "voz",
        title: "Llamadas, voz, camara y actividad",
        body:
          "Las funciones de microfono, camara, compartir pantalla y presencia solo deben usarse con consentimiento de las personas presentes. No debes grabar, retransmitir o capturar contenido privado sin autorizacion."
      },
      {
        id: "privacidad",
        title: "Privacidad y datos",
        body:
          "Umbra utiliza la informacion minima necesaria para darte acceso, mantener perfiles, conexiones, invitaciones, mensajes, presencia y configuraciones. Tus ajustes de privacidad controlan que partes de tu perfil y actividad se muestran a otros."
      },
      {
        id: "cambios",
        title: "Cambios, disponibilidad y soporte",
        body:
          "Podemos actualizar funciones, plantillas, limites, flujos de autenticacion, estructura del servicio y politicas para mejorar seguridad, rendimiento o experiencia. El uso continuado de Umbra implica aceptacion de estos cambios cuando entren en vigor."
      }
    ],
    en: [
      {
        id: "uso",
        title: "Acceptable use",
        body:
          "Umbra is built for conversations, servers, direct messages, voice, video and private communities. You may not use the platform for spam, fraud, harassment, impersonation, malware distribution or abusive automation."
      },
      {
        id: "cuenta",
        title: "Account, access and security",
        body:
          "You are responsible for the security of your account, your credentials and the devices you use to sign in. Keep your primary email updated and use the available recovery channels to protect your access."
      },
      {
        id: "contenido",
        title: "Content and conduct",
        body:
          "Each person remains responsible for what they publish, share, upload or broadcast on Umbra. They must also respect privacy, authorship and the internal rules of each server, category, channel or group."
      },
      {
        id: "moderacion",
        title: "Servers, moderation and permissions",
        body:
          "Server owners and admins may define structure, roles, categories, stickers, invites and moderation rules. Umbra may limit features or remove access if it detects abuse, ban evasion or dangerous use of the service."
      },
      {
        id: "voz",
        title: "Calls, voice, camera and activity",
        body:
          "Microphone, camera, screen share and presence features must only be used with the consent of the people involved. You must not record, rebroadcast or capture private content without authorization."
      },
      {
        id: "privacidad",
        title: "Privacy and data",
        body:
          "Umbra uses the minimum information needed to grant access, maintain profiles, connections, invites, messages, presence and settings. Your privacy settings control which parts of your profile and activity are shown to others."
      },
      {
        id: "cambios",
        title: "Changes, availability and support",
        body:
          "We may update features, templates, limits, authentication flows, service structure and policies to improve security, performance or experience. Continued use of Umbra implies acceptance of those changes when they take effect."
      }
    ],
    fr: [
      {
        id: "uso",
        title: "Utilisation acceptable",
        body:
          "Umbra est concu pour les conversations, les serveurs, les messages directs, la voix, la video et les communautes privees. Tu ne peux pas utiliser la plateforme pour le spam, la fraude, le harcelement, l'usurpation, la diffusion de malwares ou l'automatisation abusive."
      },
      {
        id: "cuenta",
        title: "Compte, acces et securite",
        body:
          "Tu es responsable de la securite de ton compte, de tes identifiants et des appareils avec lesquels tu te connectes. Garde ton email principal a jour et utilise les moyens de recuperation disponibles pour proteger ton acces."
      },
      {
        id: "contenido",
        title: "Contenu et conduite",
        body:
          "Chaque personne reste responsable de ce qu'elle publie, partage, importe ou diffuse sur Umbra. Elle doit aussi respecter la confidentialite, l'auteur et les regles internes de chaque serveur, categorie, canal ou groupe."
      },
      {
        id: "moderacion",
        title: "Serveurs, moderation et permissions",
        body:
          "Les proprietaires et administrateurs de serveurs peuvent definir la structure, les roles, les categories, les stickers, les invitations et les regles de moderation. Umbra peut limiter des fonctions ou retirer l'acces en cas d'abus, de contournement de blocage ou d'usage dangereux."
      },
      {
        id: "voz",
        title: "Appels, voix, camera et activite",
        body:
          "Les fonctions de microphone, camera, partage d'ecran et de presence ne doivent etre utilisees qu'avec le consentement des personnes concernees. Tu ne dois pas enregistrer, rediffuser ou capturer du contenu prive sans autorisation."
      },
      {
        id: "privacidad",
        title: "Confidentialite et donnees",
        body:
          "Umbra utilise le minimum d'informations necessaires pour donner l'acces, maintenir les profils, connexions, invitations, messages, presence et parametres. Tes reglages de confidentialite controlent ce que les autres voient."
      },
      {
        id: "cambios",
        title: "Changements, disponibilite et support",
        body:
          "Nous pouvons mettre a jour les fonctions, modeles, limites, flux d'authentification, structure du service et politiques pour ameliorer la securite, la performance ou l'experience. Continuer a utiliser Umbra implique l'acceptation de ces changements."
      }
    ]
  };

  return dictionaries[language] || dictionaries.es;
}

function getLocalizedSocialPlaceholder(language, platform) {
  const placeholders = {
    es: {
      website: "https://tu-sitio.com",
      instagram: "https://instagram.com/tu_usuario",
      youtube: "https://youtube.com/@tu_canal",
      spotify: "https://open.spotify.com/user/...",
      twitch: "https://twitch.tv/tu_canal",
      tiktok: "https://tiktok.com/@tu_usuario",
      x: "https://x.com/tu_usuario",
      discord: "https://discord.gg/tu_invite"
    },
    en: {
      website: "https://your-site.com",
      instagram: "https://instagram.com/your_handle",
      youtube: "https://youtube.com/@your_channel",
      spotify: "https://open.spotify.com/user/...",
      twitch: "https://twitch.tv/your_channel",
      tiktok: "https://tiktok.com/@your_handle",
      x: "https://x.com/your_handle",
      discord: "https://discord.gg/your_invite"
    },
    fr: {
      website: "https://ton-site.com",
      instagram: "https://instagram.com/ton_identifiant",
      youtube: "https://youtube.com/@ta_chaine",
      spotify: "https://open.spotify.com/user/...",
      twitch: "https://twitch.tv/ta_chaine",
      tiktok: "https://tiktok.com/@ton_identifiant",
      x: "https://x.com/ton_identifiant",
      discord: "https://discord.gg/ton_invite"
    }
  };

  return (
    placeholders[language]?.[platform] ||
    placeholders.es[platform] ||
    SOCIAL_PLATFORM_OPTIONS.find((option) => option.value === platform)?.placeholder ||
    ""
  );
}

function getLocalizedRecoveryPlaceholder(language, provider) {
  const placeholders = {
    es: {
      "": "No configurada",
      google: "tu-cuenta@gmail.com",
      outlook: "tu-cuenta@outlook.com",
      apple: "Apple ID o correo asociado",
      discord: "usuario, enlace o handle",
      other: "Correo, usuario o enlace de respaldo"
    },
    en: {
      "": "Not configured",
      google: "your-account@gmail.com",
      outlook: "your-account@outlook.com",
      apple: "Apple ID or linked email",
      discord: "username, link or handle",
      other: "Backup email, username or link"
    },
    fr: {
      "": "Non configure",
      google: "ton-compte@gmail.com",
      outlook: "ton-compte@outlook.com",
      apple: "Apple ID ou email associe",
      discord: "utilisateur, lien ou pseudo",
      other: "Email, utilisateur ou lien de secours"
    }
  };

  return (
    placeholders[language]?.[provider] ||
    placeholders.es[provider] ||
    RECOVERY_PROVIDER_OPTIONS.find((option) => option.value === provider)?.placeholder ||
    ""
  );
}

export function SettingsModal({
  dmCount,
  guildCount,
  language = "es",
  onClose,
  onChangeLanguage,
  onSignOut,
  onToggleTheme,
  onUpdateProfile,
  theme,
  user
}) {
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const t = (key, fallback = "") => translate(language, key, fallback);
  const locale = getSettingsLocale(language);
  const termsReviewDate = useMemo(
    () =>
      new Intl.DateTimeFormat(language || "es", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date("2026-04-08T00:00:00Z")),
    [language]
  );

  const [tab, setTab] = useState("security");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [search, setSearch] = useState("");
  const [connectionsBusy, setConnectionsBusy] = useState("");
  const [authEmailDraft, setAuthEmailDraft] = useState(user.email || "");
  const [inviteEmailDraft, setInviteEmailDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [reauthNonceDraft, setReauthNonceDraft] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [clearAvatar, setClearAvatar] = useState(false);

  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [clearBanner, setClearBanner] = useState(false);
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
  const [deviceState, setDeviceState] = useState({
    audioinput: [],
    audiooutput: [],
    error: "",
    loading: false,
    videoinput: []
  });
  const [avatarCropState, setAvatarCropState] = useState({
    file: null,
    imageUrl: "",
    open: false
  });

  const [form, setForm] = useState({
    avatarHue: user.avatar_hue || 220,
    bio: user.bio || "",
    customStatus: user.custom_status || "",
    profileColor: user.profile_color || "#5865F2",
    privacySettings: normalizePrivacySettings(user.privacy_settings),
    recoveryAccount: normalizeRecoveryAccount(user.recovery_account),
    recoveryProvider: normalizeRecoveryProvider(user.recovery_provider),
    socialLinks: buildSocialLinkDrafts(user.social_links),
    username: user.username || ""
  });

  useEffect(() => {
    setForm({
      avatarHue: user.avatar_hue || 220,
      bio: user.bio || "",
      customStatus: user.custom_status || "",
      profileColor: user.profile_color || "#5865F2",
      privacySettings: normalizePrivacySettings(user.privacy_settings),
      recoveryAccount: normalizeRecoveryAccount(user.recovery_account),
      recoveryProvider: normalizeRecoveryProvider(user.recovery_provider),
      socialLinks: buildSocialLinkDrafts(user.social_links),
      username: user.username || ""
    });
    setAvatarFile(null);
    setAvatarPreview("");
    setClearAvatar(false);
    setBannerFile(null);
    setBannerPreview("");
    setClearBanner(false);
    setAvatarCropState({
      file: null,
      imageUrl: "",
      open: false
    });
    setEditorOpen(false);
    setError("");
    setSaved("");
    setSaving(false);
    setConnectionsBusy("");
    setAuthEmailDraft(user.email || "");
    setInviteEmailDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setReauthNonceDraft("");
  }, [user]);

  useEffect(() => {
    if (error === "sanitizeUsername is not defined") {
      setError("");
    }
  }, [error]);

  useEffect(() => {
    if (tab !== "devices" || typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return undefined;
    }

    let cancelled = false;

    async function loadDevices() {
      setDeviceState((previous) => ({
        ...previous,
        error: "",
        loading: true
      }));

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) {
          return;
        }

        setDeviceState({
          audioinput: devices.filter((device) => device.kind === "audioinput"),
          audiooutput: devices.filter((device) => device.kind === "audiooutput"),
          error: "",
          loading: false,
          videoinput: devices.filter((device) => device.kind === "videoinput")
        });
      } catch (deviceError) {
        if (cancelled) {
          return;
        }

        setDeviceState({
          audioinput: [],
          audiooutput: [],
          error: deviceError.message || locale.devices.readError,
          loading: false,
          videoinput: []
        });
      }
    }

    loadDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", loadDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", loadDevices);
    };
  }, [deviceRefreshKey, tab]);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (bannerPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(bannerPreview);
      }
      if (avatarCropState.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarCropState.imageUrl);
      }
    };
  }, [avatarCropState.imageUrl, avatarPreview, bannerPreview]);

  const previewAvatarUrl = avatarPreview || (clearAvatar ? "" : user.avatar_url || "");
  const previewBannerUrl =
    bannerPreview || (clearBanner ? "" : user.profile_banner_url || "");
  const normalizedProfileColor = normalizeColorInput(
    form.profileColor,
    user.profile_color || "#5865F2"
  );
  const displayName = form.username || user.username || locale.security.accountRows.defaultName;
  const visibleError = error === "sanitizeUsername is not defined" ? "" : error;

  const accountRows = useMemo(
    () => [
      {
        label: locale.security.accountRows.displayName,
        value: displayName,
      },
      {
        label: locale.security.accountRows.username,
        value: user.username || locale.security.accountRows.noUsername,
      },
      {
        label: locale.security.accountRows.email,
        value: maskEmail(user.email),
        accent: user.email ? locale.security.accountRows.emailAccent : null
      },
      {
        label: locale.security.accountRows.panel,
        value: previewBannerUrl
          ? locale.security.accountRows.bannerConfigured
          : normalizedProfileColor,
      }
    ],
    [
      displayName,
      locale.security.accountRows.bannerConfigured,
      locale.security.accountRows.displayName,
      locale.security.accountRows.email,
      locale.security.accountRows.emailAccent,
      locale.security.accountRows.noUsername,
      locale.security.accountRows.panel,
      locale.security.accountRows.username,
      normalizedProfileColor,
      previewBannerUrl,
      user.email,
      user.username
    ]
  );

  const translatedNavGroups = useMemo(
    () =>
      SETTINGS_NAV_GROUPS.map((group) => ({
        ...group,
        title:
          group.title === "Ajustes de usuario"
            ? t("settings.group.user", group.title)
            : group.title === "Ajustes de la aplicacion"
              ? t("settings.group.app", group.title)
              : t("settings.group.legal", group.title),
        items: group.items.map((item) => ({
          ...item,
          label:
            item.id === "security"
              ? t("settings.nav.security", item.label)
              : item.id === "social"
                ? t("settings.nav.social", item.label)
                : item.id === "privacy"
                  ? t("settings.nav.privacy", item.label)
                  : item.id === "devices"
                    ? t("settings.nav.devices", item.label)
                    : item.id === "connections"
                      ? t("settings.nav.connections", item.label)
                      : item.id === "status"
                        ? t("settings.nav.status", item.label)
                        : item.id === "theme"
                          ? t("settings.nav.theme", item.label)
                          : item.id === "language"
                            ? t("settings.nav.language", item.label)
                            : t("settings.nav.terms", item.label)
        }))
      })),
    [t]
  );

  function updateForm(key, value) {
    if (error) {
      setError("");
    }
    if (saved) {
      setSaved("");
    }
    setForm((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  function rememberPreview(previousUrl, nextFile, setter, clearSetter) {
    setter((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(nextFile);
    });
    clearSetter(false);
  }

  function handleAvatarSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida para el avatar.");
      return;
    }

    setError("");
    setSaved("");
    setAvatarCropState((previous) => {
      if (previous.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previous.imageUrl);
      }
      return {
        file,
        imageUrl: URL.createObjectURL(file),
        open: true
      };
    });
  }

  function handleBannerSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida para el panel.");
      return;
    }

    setError("");
    setSaved("");
    setBannerFile(file);
    rememberPreview(bannerPreview, file, setBannerPreview, setClearBanner);
  }

  async function handleProfileSave(event) {
    event?.preventDefault?.();
    setSaving(true);
    setError("");
    setSaved("");

    try {
      const nextUsername = sanitizeUsername(form.username).trim();
      if (!nextUsername) {
        throw new Error("Ingresa un nombre de usuario valido.");
      }

      await onUpdateProfile({
        ...form,
        privacySettings: normalizePrivacySettings(form.privacySettings),
        recoveryAccount: normalizeRecoveryAccount(form.recoveryAccount),
        recoveryProvider: normalizeRecoveryProvider(form.recoveryProvider),
        socialLinks: normalizeSocialLinks(form.socialLinks),
        username: nextUsername,
        avatarFile,
        avatarUrl: clearAvatar ? "" : undefined,
        bannerFile,
        bannerImageUrl: clearBanner ? "" : undefined,
        clearAvatar,
        clearBanner
      });

      setAvatarFile(null);
      setAvatarPreview("");
      setClearAvatar(false);
      setBannerFile(null);
      setBannerPreview("");
      setClearBanner(false);
      setEditorOpen(false);
      setSaved("Perfil actualizado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function updatePrivacySetting(key, checked) {
    updateForm("privacySettings", {
      ...normalizePrivacySettings(form.privacySettings),
      [key]: checked
    });
  }

  function updateSocialLink(index, key, value) {
    const nextLinks = [...buildSocialLinkDrafts(form.socialLinks)];
    nextLinks[index] = {
      ...nextLinks[index],
      [key]: value
    };
    updateForm("socialLinks", nextLinks);
  }

  function addSocialLink() {
    updateForm("socialLinks", [
      ...buildSocialLinkDrafts(form.socialLinks),
      {
        id: `social-${Date.now()}`,
        label: "",
        platform: "website",
        url: ""
      }
    ]);
  }

  function removeSocialLink(index) {
    updateForm(
      "socialLinks",
      buildSocialLinkDrafts(form.socialLinks).filter((_, itemIndex) => itemIndex !== index)
    );
  }

  const visibleSocialLinks = buildSocialLinkDrafts(form.socialLinks);
  const publicSocialLinks = normalizeSocialLinks(form.socialLinks);
  const privacySettings = normalizePrivacySettings(form.privacySettings);
  const panelTitle =
    tab === "security"
      ? t("settings.panel.security", settingsPanelTitle(tab))
      : tab === "social"
        ? t("settings.panel.social", settingsPanelTitle(tab))
        : tab === "privacy"
          ? t("settings.panel.privacy", settingsPanelTitle(tab))
          : tab === "devices"
            ? t("settings.panel.devices", settingsPanelTitle(tab))
            : tab === "connections"
              ? t("settings.panel.connections", settingsPanelTitle(tab))
              : tab === "status"
                ? t("settings.panel.status", settingsPanelTitle(tab))
                : tab === "language"
                  ? t("settings.panel.language", settingsPanelTitle(tab))
                  : t("settings.panel.terms", settingsPanelTitle(tab));
  const recoveryProvider = normalizeRecoveryProvider(form.recoveryProvider);
  const recoveryProviderMeta =
    RECOVERY_PROVIDER_OPTIONS.find((option) => option.value === recoveryProvider) ||
    RECOVERY_PROVIDER_OPTIONS[0];
  const emailConfirmed = Boolean(user.email_confirmed_at);
  const recoveryAccount = normalizeRecoveryAccount(form.recoveryAccount);
  const recoveryLooksLikeEmail = isEmailAddress(recoveryAccount);
  const authProviderLabel = String(user.auth_provider || "email").toUpperCase();
  const connectionSummaryItems = useMemo(
    () => [
      {
        id: "primary-email",
        helper: emailConfirmed
          ? locale.connections.summary.primaryHelperReady
          : locale.connections.summary.primaryHelperPending,
        icon: "mail",
        label: locale.connections.summary.primary,
        value: user.email ? maskEmail(user.email) : locale.connections.noEmail
      },
      {
        id: "provider",
        helper: emailConfirmed
          ? locale.connections.summary.providerReady
          : locale.connections.summary.providerPending,
        icon: "settings",
        label: locale.connections.summary.provider,
        value: authProviderLabel
      },
      {
        id: "recovery",
        helper: recoveryLooksLikeEmail
          ? locale.connections.summary.recoveryReady
          : locale.connections.summary.recoveryPending,
        icon: "link",
        label: locale.connections.summary.recovery,
        value: recoveryProvider
          ? locale.recoveryProviders[recoveryProvider] || recoveryProviderMeta.label
          : locale.connections.summary.noConfig
      },
      {
        id: "links",
        helper: privacySettings.showSocialLinks
          ? locale.connections.summary.publicVisible
          : locale.connections.summary.publicHidden,
        icon: "sparkles",
        label: locale.connections.summary.public,
        value: privacySettings.showSocialLinks
          ? `${publicSocialLinks.length} ${
              publicSocialLinks.length === 1
                ? locale.connections.summary.linkSingular
                : locale.connections.summary.linkPlural
            }`
          : locale.connections.summary.hidden
      }
    ],
    [
      authProviderLabel,
      emailConfirmed,
      locale.connections.noEmail,
      locale.connections.summary.hidden,
      locale.connections.summary.linkPlural,
      locale.connections.summary.linkSingular,
      locale.connections.summary.noConfig,
      locale.connections.summary.primary,
      locale.connections.summary.primaryHelperPending,
      locale.connections.summary.primaryHelperReady,
      locale.connections.summary.provider,
      locale.connections.summary.providerPending,
      locale.connections.summary.providerReady,
      locale.connections.summary.public,
      locale.connections.summary.publicHidden,
      locale.connections.summary.publicVisible,
      locale.connections.summary.recovery,
      locale.connections.summary.recoveryPending,
      locale.connections.summary.recoveryReady,
      locale.recoveryProviders,
      privacySettings.showSocialLinks,
      publicSocialLinks.length,
      recoveryLooksLikeEmail,
      recoveryProvider,
      recoveryProviderMeta.label,
      user.email
    ]
  );

  async function handleSendPrimaryEmailCheck() {
    if (!user.email) {
      setError("No hay un correo principal asociado a esta cuenta.");
      return;
    }

    setConnectionsBusy("primary-email");
    setError("");
    setSaved("");

    try {
      const payload = await api.sendEmailCheck({
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        target: "primary"
      });

      setSaved(
        payload?.kind === "confirmation"
          ? "Correo de confirmacion enviado al principal."
          : "Correo de prueba enviado al principal."
      );
    } catch (sendError) {
      setError(sendError.message || "No se pudo enviar la comprobacion al correo principal.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleSendRecoveryEmailCheck() {
    if (!recoveryAccount) {
      setError("Configura primero una cuenta de respaldo.");
      return;
    }

    if (!recoveryLooksLikeEmail) {
      setError("El respaldo debe ser un correo valido para poder recibir una comprobacion.");
      return;
    }

    setConnectionsBusy("recovery-email");
    setError("");
    setSaved("");

    try {
      await api.sendEmailCheck({
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        target: "recovery"
      });

      setSaved("Correo de prueba enviado al respaldo.");
    } catch (sendError) {
      setError(sendError.message || "No se pudo enviar la comprobacion al correo de respaldo.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handlePrimaryEmailChange() {
    const nextEmail = String(authEmailDraft || "").trim().toLowerCase();
    if (!nextEmail) {
      setError("Ingresa el nuevo correo principal.");
      return;
    }

    if (!isEmailAddress(nextEmail)) {
      setError("Ingresa un correo principal valido.");
      return;
    }

    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    setConnectionsBusy("change-email");
    setError("");
    setSaved("");

    try {
      const { error: updateError } = await supabase.auth.updateUser(
        {
          email: nextEmail
        },
        {
          emailRedirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined
        }
      );

      if (updateError) {
        throw updateError;
      }

      setSaved(
        "Solicitud de cambio de correo enviada. Revisa tu correo actual y el nuevo para confirmar."
      );
    } catch (updateError) {
      setError(updateError.message || "No se pudo iniciar el cambio de correo.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleSendReauthentication() {
    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    setConnectionsBusy("reauth");
    setError("");
    setSaved("");

    try {
      const { error: reauthError } = await supabase.auth.reauthenticate();
      if (reauthError) {
        throw reauthError;
      }

      setSaved("Codigo de reautenticacion enviado al correo principal.");
    } catch (reauthError) {
      setError(reauthError.message || "No se pudo enviar el codigo de reautenticacion.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handlePasswordChange() {
    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    if (String(newPasswordDraft || "").length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }

    if (newPasswordDraft !== confirmPasswordDraft) {
      setError("Las contrasenas nuevas no coinciden.");
      return;
    }

    setConnectionsBusy("password");
    setError("");
    setSaved("");

    try {
      const payload = {
        password: newPasswordDraft
      };

      if (String(reauthNonceDraft || "").trim()) {
        payload.nonce = String(reauthNonceDraft).trim();
      }

      const { error: passwordError } = await supabase.auth.updateUser(payload);
      if (passwordError) {
        throw passwordError;
      }

      setNewPasswordDraft("");
      setConfirmPasswordDraft("");
      setReauthNonceDraft("");
      setSaved("Contrasena actualizada correctamente.");
    } catch (passwordError) {
      setError(passwordError.message || "No se pudo actualizar la contrasena.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleInviteUmbraByEmail() {
    const email = String(inviteEmailDraft || "").trim().toLowerCase();
    if (!email) {
      setError("Ingresa un correo para enviar la invitacion.");
      return;
    }

    if (!isEmailAddress(email)) {
      setError("Ingresa un correo valido para invitar a Umbra.");
      return;
    }

    setConnectionsBusy("invite-user");
    setError("");
    setSaved("");

    try {
      await api.inviteUmbraUser({
        email,
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
      });
      setInviteEmailDraft("");
      setSaved("Invitacion enviada. La otra persona recibira un acceso para crear su cuenta.");
    } catch (inviteError) {
      setError(inviteError.message || "No se pudo enviar la invitacion a Umbra.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleConnectionsSave() {
    setConnectionsBusy("recovery");
    setError("");
    setSaved("");

    try {
      await onUpdateProfile({
        avatarHue: form.avatarHue,
        bio: form.bio,
        customStatus: form.customStatus,
        privacySettings,
        profileColor: normalizedProfileColor,
        recoveryAccount: normalizeRecoveryAccount(form.recoveryAccount),
        recoveryProvider,
        socialLinks: publicSocialLinks,
        username: sanitizeUsername(form.username)
      });

      setSaved("Conexiones actualizadas.");
    } catch (saveError) {
      setError(saveError.message || "No se pudieron guardar las conexiones.");
    } finally {
      setConnectionsBusy("");
    }
  }

  const socialSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.social.title}</h3>
          <span>{locale.social.subtitle}</span>
        </div>

        <div className="settings-social-list">
          {visibleSocialLinks.map((link, index) => {
            return (
              <div className="settings-social-row" key={link.id}>
                <label className="settings-field">
                  <span>{locale.social.platform}</span>
                  <select
                    className="settings-inline-select"
                    onChange={(event) => updateSocialLink(index, "platform", event.target.value)}
                    value={link.platform}
                  >
                    {SOCIAL_PLATFORM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {locale.socialPlatforms[option.value] || option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-field">
                  <span>{locale.social.visibleLabel}</span>
                  <input
                    maxLength={48}
                    onChange={(event) => updateSocialLink(index, "label", event.target.value)}
                    placeholder={locale.social.visiblePlaceholder}
                    value={link.label}
                  />
                </label>

                <label className="settings-field">
                  <span>{locale.social.link}</span>
                  <input
                    onChange={(event) => updateSocialLink(index, "url", event.target.value)}
                    placeholder={getLocalizedSocialPlaceholder(language, link.platform)}
                    value={link.url}
                  />
                </label>

                <button
                  aria-label={locale.social.delete}
                  className="ghost-button icon-only"
                  onClick={() => removeSocialLink(index)}
                  type="button"
                >
                  <Icon name="trash" />
                </button>
              </div>
            );
          })}
        </div>

        {!visibleSocialLinks.length ? (
          <div className="settings-empty-state">
            <strong>{locale.social.emptyTitle}</strong>
            <span>{locale.social.emptyBody}</span>
          </div>
        ) : null}

        <div className="settings-form-actions inline">
          <button
            className="ghost-button"
            disabled={visibleSocialLinks.length >= 8}
            onClick={addSocialLink}
            type="button"
          >
            <Icon name="add" />
            <span>{locale.social.add}</span>
          </button>
          <button className="primary-button" disabled={saving} onClick={handleProfileSave} type="button">
            <Icon name="save" />
            <span>{saving ? locale.social.saving : locale.social.save}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );

  const privacySettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.privacy.title}</h3>
          <span>{locale.privacy.subtitle}</span>
        </div>

        <div className="settings-toggle-list">
          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>Mostrar redes y conexiones</strong>
                <p>{locale.privacy.socialBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.showSocialLinks}
              onChange={(event) => updatePrivacySetting("showSocialLinks", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.privacy.memberSinceTitle}</strong>
                <p>{locale.privacy.memberSinceBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.showMemberSince}
              onChange={(event) => updatePrivacySetting("showMemberSince", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.privacy.activityTitle}</strong>
                <p>{locale.privacy.activityBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.showActivityStatus}
              onChange={(event) => updatePrivacySetting("showActivityStatus", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="settings-action-row settings-toggle-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.privacy.dmTitle}</strong>
                <p>{locale.privacy.dmBody}</p>
              </div>
            </div>
            <input
              checked={privacySettings.allowDirectMessages}
              onChange={(event) => updatePrivacySetting("allowDirectMessages", event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>

        <div className="settings-form-actions inline">
          <button className="primary-button" disabled={saving} onClick={handleProfileSave} type="button">
            <Icon name="save" />
            <span>{saving ? locale.privacy.saving : locale.privacy.save}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );

  const deviceGroups = [
    {
      items: deviceState.audioinput,
      key: "audioinput",
      label: locale.devices.microphones
    },
    {
      items: deviceState.audiooutput,
      key: "audiooutput",
      label: locale.devices.outputs
    },
    {
      items: deviceState.videoinput,
      key: "videoinput",
      label: locale.devices.cameras
    }
  ];

  const devicesSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.devices.title}</h3>
          <span>{locale.devices.subtitle}</span>
        </div>

        <div className="settings-form-actions inline">
          <button
            className="ghost-button"
            onClick={() => setDeviceRefreshKey((previous) => previous + 1)}
            type="button"
          >
            <Icon name="refresh" />
            <span>{deviceState.loading ? locale.devices.refreshing : locale.devices.refresh}</span>
          </button>
        </div>

        {deviceState.error ? (
          <p className="form-error settings-form-error">{deviceState.error}</p>
        ) : null}

        <div className="settings-device-grid">
          {deviceGroups.map((group) => (
            <section className="settings-device-card" key={group.key}>
              <strong>{group.label}</strong>
              <span>{group.items.length} {locale.devices.detected}</span>
              <div className="settings-device-list">
                {group.items.length ? (
                  group.items.map((device, index) => (
                    <div
                      className="settings-device-item"
                      key={device.deviceId || `${group.key}-${index}`}
                    >
                      <Icon
                        name={
                          group.key === "videoinput"
                            ? "camera"
                            : group.key === "audiooutput"
                              ? "headphones"
                              : "mic"
                        }
                      />
                      <div>
                        <strong>{device.label || `${group.label} ${index + 1}`}</strong>
                        <small>
                          {device.deviceId === "default"
                            ? locale.devices.systemDefault
                            : locale.devices.detectedLocal}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="settings-empty-state compact">
                    <strong>{locale.devices.emptyTitle}</strong>
                    <span>{locale.devices.emptyBody}</span>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );

  const connectionsSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-title">
          <h3>{locale.connections.title}</h3>
          <span>{locale.connections.subtitle}</span>
        </div>

        <div className="settings-summary-grid settings-connections-summary">
          {connectionSummaryItems.map((item) => (
            <div className="summary-tile settings-connection-summary-tile" key={item.id}>
              <span className="settings-row-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <span>{item.helper}</span>
            </div>
          ))}
        </div>

        <div className="settings-grid settings-connections-overview">
          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.connections.provider}</strong>
                <p>{String(user.auth_provider || "email").toUpperCase()}</p>
              </div>
            </div>
            <span className="user-profile-chip muted">
              {user.email ? locale.connections.connected : locale.connections.noEmail}
            </span>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.connections.currentEmail}</strong>
                <p>{maskEmail(user.email)}</p>
              </div>
            </div>
            <span className={`user-profile-chip ${emailConfirmed ? "" : "muted"}`}>
              {emailConfirmed ? locale.connections.confirmed : locale.connections.unconfirmed}
            </span>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.connections.emailConfirmation}</strong>
                <p>
                  {emailConfirmed
                    ? locale.connections.emailConfirmedBody
                    : locale.connections.emailPendingBody}
                </p>
              </div>
            </div>
            <button
              className="ghost-button"
              disabled={connectionsBusy === "primary-email" || !user.email}
              onClick={handleSendPrimaryEmailCheck}
              type="button"
            >
              <Icon name="mail" />
              <span>
                {connectionsBusy === "primary-email"
                  ? locale.connections.send
                  : emailConfirmed
                    ? locale.connections.sendTest
                    : locale.connections.sendConfirmation}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card settings-connection-card-primary">
          <div className="settings-card-title">
            <h3>{locale.connections.changePrimaryTitle}</h3>
            <span>{locale.connections.changePrimarySubtitle}</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>{locale.connections.newEmail}</span>
              <input
                onChange={(event) => setAuthEmailDraft(event.target.value)}
                placeholder="nuevo@email.com"
                type="email"
                value={authEmailDraft}
              />
            </label>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="ghost-button"
              disabled={connectionsBusy === "change-email"}
              onClick={handlePrimaryEmailChange}
              type="button"
            >
              <Icon name="mail" />
              <span>{connectionsBusy === "change-email" ? locale.connections.send : locale.connections.changeEmail}</span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.reauthTitle}</h3>
            <span>{locale.connections.reauthSubtitle}</span>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="ghost-button"
              disabled={connectionsBusy === "reauth"}
              onClick={handleSendReauthentication}
              type="button"
            >
              <Icon name="mail" />
              <span>
                {connectionsBusy === "reauth" ? locale.connections.send : locale.connections.sendReauth}
              </span>
            </button>
          </div>

          <div className="settings-social-row settings-connection-security-grid">
            <label className="settings-field">
              <span>{locale.connections.reauthCode}</span>
              <input
                onChange={(event) => setReauthNonceDraft(event.target.value)}
                placeholder={locale.connections.reauthPlaceholder}
                value={reauthNonceDraft}
              />
            </label>
            <label className="settings-field">
              <span>{locale.connections.newPassword}</span>
              <input
                minLength={8}
                onChange={(event) => setNewPasswordDraft(event.target.value)}
                placeholder={locale.connections.newPasswordPlaceholder}
                type="password"
                value={newPasswordDraft}
              />
            </label>
            <label className="settings-field">
              <span>{locale.connections.confirmPassword}</span>
              <input
                minLength={8}
                onChange={(event) => setConfirmPasswordDraft(event.target.value)}
                placeholder={locale.connections.confirmPasswordPlaceholder}
                type="password"
                value={confirmPasswordDraft}
              />
            </label>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="primary-button"
              disabled={connectionsBusy === "password"}
              onClick={handlePasswordChange}
              type="button"
            >
              <Icon name="save" />
              <span>
                {connectionsBusy === "password" ? locale.connections.saving : locale.connections.updatePassword}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.recoveryTitle}</h3>
            <span>{locale.connections.recoverySubtitle}</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>{locale.connections.providerField}</span>
              <select
                className="settings-inline-select"
                onChange={(event) => updateForm("recoveryProvider", event.target.value)}
                value={recoveryProvider}
              >
                {RECOVERY_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {locale.recoveryProviders[option.value] || option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>{locale.connections.accountField}</span>
              <input
                onChange={(event) => updateForm("recoveryAccount", event.target.value)}
                placeholder={getLocalizedRecoveryPlaceholder(language, recoveryProvider)}
                value={form.recoveryAccount}
              />
            </label>
          </div>

          <div className="settings-empty-state compact settings-empty-state-solid">
            <strong>
              {recoveryProvider
                ? `${locale.connections.backupNow}: ${locale.recoveryProviders[recoveryProvider] || recoveryProviderMeta.label}`
                : locale.connections.backupNone}
            </strong>
            <span>
              {recoveryProvider && recoveryAccount
                ? recoveryAccount
                : locale.connections.backupBody}
            </span>
          </div>

          <div className="settings-row settings-connection-row">
            <div className="settings-row-copy">
              <div>
                <strong>{locale.connections.recoveryCheckTitle}</strong>
                <p>
                  {recoveryLooksLikeEmail
                    ? locale.connections.recoveryCheckBody
                    : locale.connections.recoveryNeedsEmail}
                </p>
              </div>
            </div>
            <button
              className="ghost-button"
              disabled={connectionsBusy === "recovery-email" || !recoveryLooksLikeEmail}
              onClick={handleSendRecoveryEmailCheck}
              type="button"
            >
              <Icon name="mail" />
              <span>{connectionsBusy === "recovery-email" ? locale.connections.send : locale.connections.sendTest}</span>
            </button>
          </div>
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.visibleNetworksTitle}</h3>
            <span>
              {privacySettings.showSocialLinks
                ? locale.connections.visibleNetworksBody
                : locale.connections.hiddenNetworksBody}
            </span>
          </div>
          {privacySettings.showSocialLinks && publicSocialLinks.length ? (
            <div className="profile-detail-connections">
              {publicSocialLinks.map((connection) => (
                <div className="profile-detail-connection" key={connection.id}>
                  <div className="profile-detail-connection-main">
                    <span className="profile-detail-connection-icon">
                      <Icon name="link" size={16} />
                    </span>
                    <div className="profile-detail-connection-copy">
                      <strong>{connection.label || connection.url}</strong>
                      <small>
                        {locale.socialPlatforms[connection.platform] ||
                          SOCIAL_PLATFORM_OPTIONS.find((item) => item.value === connection.platform)?.label ||
                          locale.social.link}
                      </small>
                    </div>
                  </div>
                  <Icon name="arrowRight" size={14} />
                </div>
              ))}
            </div>
          ) : (
            <div className="settings-empty-state settings-empty-state-solid">
              <strong>{locale.connections.noPublicConnections}</strong>
              <span>{locale.connections.noPublicConnectionsBody}</span>
            </div>
          )}
        </div>

        <div className="settings-connection-stack settings-connection-card">
          <div className="settings-card-title">
            <h3>{locale.connections.inviteUmbraTitle}</h3>
            <span>{locale.connections.inviteUmbraSubtitle}</span>
          </div>

          <div className="settings-social-row compact">
            <label className="settings-field">
              <span>{locale.connections.inviteEmail}</span>
              <input
                onChange={(event) => setInviteEmailDraft(event.target.value)}
                placeholder="alguien@email.com"
                type="email"
                value={inviteEmailDraft}
              />
            </label>
          </div>

          <div className="settings-form-actions inline">
            <button
              className="ghost-button"
              disabled={connectionsBusy === "invite-user"}
              onClick={handleInviteUmbraByEmail}
              type="button"
            >
              <Icon name="userAdd" />
              <span>
                {connectionsBusy === "invite-user" ? locale.connections.inviting : locale.connections.sendInvite}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-form-actions inline">
          <button
            className="primary-button"
            disabled={connectionsBusy === "recovery"}
            onClick={handleConnectionsSave}
            type="button"
          >
            <Icon name="save" />
            <span>{connectionsBusy === "recovery" ? locale.connections.saving : locale.connections.saveBackup}</span>
          </button>
        </div>

        {visibleError ? <p className="form-error settings-form-error">{visibleError}</p> : null}
        {saved ? <p className="settings-form-success">{saved}</p> : null}
      </section>
    </div>
  );

  const legalSections = useMemo(() => getLegalSections(language), [language]);

  const termsSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>{locale.terms.title}</h3>
          <span>{locale.terms.subtitle}</span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{locale.terms.summaryTitle}</strong>
            <p>{locale.terms.summaryBody}</p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{locale.terms.lastReview}</strong>
            <span>{termsReviewDate}</span>
          </div>
        </div>

        <div className="settings-legal-pill-row">
          {locale.terms.pills.map((pill) => (
            <span className="user-profile-chip" key={pill}>{pill}</span>
          ))}
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.conditionsTitle}</h3>
          <span>{locale.terms.conditionsSubtitle}</span>
        </div>

        <div className="settings-legal-section-list">
          {legalSections.map((section) => (
            <article className="settings-legal-section" key={section.id}>
              <div className="settings-legal-section-header">
                <span className="settings-row-icon">
                  <Icon name="help" size={16} />
                </span>
                <strong>{section.title}</strong>
              </div>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.acceptTitle}</h3>
          <span>{locale.terms.acceptSubtitle}</span>
        </div>

        <ul className="settings-legal-checklist">
          {locale.terms.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {false ? (
          <ul className="settings-legal-checklist">
          <li>No usar Umbra para suplantar identidades ni engañar a otras personas.</li>
          <li>No automatizar invitaciones, DMs, menciones o llamadas de forma abusiva.</li>
          <li>No compartir contenido privado de terceros sin permiso.</li>
          <li>Respetar bloqueos, silencios, baneos y limites de moderacion.</li>
          <li>Cuidar tus accesos, dispositivos y metodos de recuperacion.</li>
          <li>Usar de forma responsable stickers, perfiles, servidores y conexiones visibles.</li>
          </ul>
        ) : null}
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.supportTitle}</h3>
          <span>{locale.terms.supportSubtitle}</span>
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{locale.terms.recommendation}</strong>
          <span>{locale.terms.recommendationBody}</span>
        </div>
      </section>
    </div>
  );

  const activeLanguageOption =
    LANGUAGE_OPTIONS.find((option) => option.value === language) || LANGUAGE_OPTIONS[0];

  const languageSettingsContent = (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>{t("settings.language.title", "Idiomas")}</h3>
          <span>
            {t(
              "settings.language.subtitle",
              "Cambia el idioma visible de Umbra para esta app y este dispositivo."
            )}
          </span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{t("settings.language.current", "Idioma actual")}</strong>
            <p>
              {t(
                "settings.language.currentHelper",
                "El cambio se aplica al instante y Umbra lo recuerda para la proxima vez."
              )}
            </p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{activeLanguageOption.nativeLabel}</strong>
            <span>{t("settings.language.applyNow", "Aplicado al instante")}</span>
          </div>
        </div>
      </section>

      <section className="settings-card settings-language-grid-card">
        <div className="settings-card-title">
          <h3>{t("settings.language.preview", "Vista rapida")}</h3>
          <span>
            {t(
              "settings.language.previewBody",
              "Esta seleccion afecta primero a acceso, ajustes y rotulos principales de la interfaz."
            )}
          </span>
        </div>

        <div className="settings-language-grid">
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.value === language;
            return (
              <button
                className={`settings-language-option ${selected ? "active" : ""}`.trim()}
                key={option.value}
                onClick={() => onChangeLanguage?.(option.value)}
                type="button"
              >
                <div className="settings-language-option-copy">
                  <strong>{option.nativeLabel}</strong>
                  <span>{option.helper}</span>
                </div>
                <span className={`user-profile-chip ${selected ? "" : "muted"}`}>
                  {selected
                    ? t("settings.language.selected", "Seleccionado")
                    : option.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{t("settings.language.title", "Idiomas")}</strong>
          <span>
            {t(
              "settings.language.note",
              "Mas zonas de Umbra seguiran heredando este idioma a medida que se actualicen."
            )}
          </span>
        </div>
      </section>
    </div>
  );

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-shell discordish" onClick={(event) => event.stopPropagation()}>
        <aside className="settings-sidebar">
          <div className="settings-user-lockup large">
            <Avatar
              hue={user.avatar_hue}
              label={user.username}
              size={54}
              src={user.avatar_url}
              status={user.status}
            />
            <div className="settings-user-copy">
              <strong>{user.username}</strong>
              <span>{t("settings.editProfiles", "Editar perfiles")}</span>
            </div>
          </div>

          <label className="settings-search">
            <Icon name="search" />
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("settings.search", "Buscar")}
              type="text"
              value={search}
            />
          </label>

          <div className="settings-nav stacked">
            {translatedNavGroups.map((group) => (
              <div
                className={`settings-nav-group ${group.className || ""}`.trim()}
                key={group.title}
              >
                <p className="settings-nav-title">{group.title}</p>
                {group.items
                  .filter((item) =>
                    !search.trim()
                      ? true
                      : item.label.toLowerCase().includes(search.trim().toLowerCase())
                  )
                  .map((item) => (
                    <button
                      className={`settings-nav-item ${
                        (item.id === tab || (item.id === "theme" && false)) && !item.disabled
                          ? "active"
                          : ""
                      } ${item.disabled ? "muted" : ""}`}
                      disabled={item.disabled}
                      key={item.id}
                      onClick={() => {
                        if (item.toggleTheme) {
                          onToggleTheme();
                          return;
                        }
                        if (!item.disabled) {
                          setTab(item.id);
                        }
                      }}
                      type="button"
                    >
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </aside>

        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>{panelTitle}</h2>
            </div>
            <button className="ghost-button icon-only" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </div>

          {tab === "security" ? (
            <div className="settings-stack">
              <div className="settings-top-tabs">
                <button className="settings-top-tab active" type="button">
                  {t("settings.panel.security", "Mi cuenta")}
                </button>
                <button
                  className="settings-top-tab"
                  onClick={() => setTab("status")}
                  type="button"
                >
                  {t("settings.panel.status", "Estado")}
                </button>
              </div>

              <section className="settings-hero-card discordish">
                <div
                  className="settings-hero-banner"
                  style={buildPanelStyle(normalizedProfileColor, previewBannerUrl)}
                />
                <div className="settings-hero-body">
                  <Avatar
                    hue={form.avatarHue}
                    label={displayName}
                    size={84}
                    src={previewAvatarUrl}
                    status={user.status}
                  />
                  <div className="settings-hero-copy">
                    <h3>{displayName}</h3>
                    <p>{user.username}</p>
                  </div>
                          <button
                            className="primary-button"
                    onClick={() => {
                      setError("");
                      setSaved("");
                      setEditorOpen((previous) => !previous);
                    }}
                            type="button"
                          >
                    <span>
                      {editorOpen
                        ? locale.security.closeEditorButton
                        : locale.security.editProfileButton}
                    </span>
                  </button>
                </div>
              </section>

              {!editorOpen ? (
                <section className="settings-card account-overview-card">
                  <div className="settings-grid">
                    {accountRows.map((row) => (
                      <div className="settings-row account-row" key={row.label}>
                        <div className="settings-row-copy">
                          <div>
                            <strong>{row.label}</strong>
                            <p>
                              {row.value}
                              {row.accent ? <em>{row.accent}</em> : null}
                            </p>
                          </div>
                        </div>
                        <button
                          className="ghost-button small"
                          onClick={() => setEditorOpen(true)}
                          type="button"
                        >
                          {locale.security.editButton}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="settings-card profile-editor-card">
                  <div className="settings-card-title">
                    <h3>{locale.security.editProfileTitle}</h3>
                    <span>{locale.security.editProfileSubtitle}</span>
                  </div>

                  <input
                    accept="image/*"
                    className="hidden-file-input"
                    onChange={handleAvatarSelection}
                    ref={avatarInputRef}
                    type="file"
                  />
                  <input
                    accept="image/*"
                    className="hidden-file-input"
                    onChange={handleBannerSelection}
                    ref={bannerInputRef}
                    type="file"
                  />

                  <form className="settings-form-grid" onSubmit={handleProfileSave}>
                    <div className="settings-field full">
                      <span>{locale.security.profilePanel}</span>
                      <div className="settings-banner-editor">
                        <div
                          className="settings-banner-preview"
                          style={buildPanelStyle(normalizedProfileColor, previewBannerUrl)}
                        >
                          <button
                            className="settings-banner-upload"
                            onClick={() => bannerInputRef.current?.click()}
                            type="button"
                          >
                            <Icon name="camera" />
                            <span>{locale.security.uploadPanel}</span>
                          </button>
                        </div>
                        <div className="settings-avatar-actions">
                          <button
                            className="ghost-button"
                            onClick={() => bannerInputRef.current?.click()}
                            type="button"
                          >
                            <Icon name="upload" />
                            <span>{locale.security.changePanelImage}</span>
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
                            <span>{locale.security.removePanelImage}</span>
                          </button>
                          <small>{locale.security.panelHelper}</small>
                        </div>
                      </div>
                    </div>

                    <div className="settings-field full">
                      <span>{locale.security.avatar}</span>
                      <div className="settings-avatar-editor">
                        <Avatar
                          hue={form.avatarHue}
                          label={displayName}
                          size={72}
                          src={previewAvatarUrl}
                          status={user.status}
                        />
                        <div className="settings-avatar-actions">
                          <button
                            className="ghost-button"
                            onClick={() => avatarInputRef.current?.click()}
                            type="button"
                          >
                            <Icon name="upload" />
                            <span>{locale.security.uploadPhoto}</span>
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => {
                              setAvatarFile(null);
                              setAvatarPreview((previous) => {
                                if (previous?.startsWith("blob:")) {
                                  URL.revokeObjectURL(previous);
                                }
                                return "";
                              });
                              setClearAvatar(true);
                            }}
                            type="button"
                          >
                            <Icon name="close" />
                            <span>{locale.security.removePhoto}</span>
                          </button>
                          <small>{locale.security.avatarHelper}</small>
                        </div>
                      </div>
                    </div>

                    <label className="settings-field">
                      <span>{locale.security.username}</span>
                      <input
                        maxLength={24}
                        onChange={(event) => updateForm("username", sanitizeUsername(event.target.value))}
                        required
                        value={form.username}
                      />
                    </label>

                    <label className="settings-field">
                      <span>{locale.security.customStatus}</span>
                      <input
                        maxLength={80}
                        onChange={(event) => updateForm("customStatus", event.target.value)}
                        placeholder={locale.security.customStatusPlaceholder}
                        value={form.customStatus}
                      />
                    </label>

                    <label className="settings-field full">
                      <span>{locale.security.bio}</span>
                      <textarea
                        maxLength={240}
                        onChange={(event) => updateForm("bio", event.target.value)}
                        rows={4}
                        value={form.bio}
                      />
                    </label>

                    <div className="settings-field full">
                      <span>{locale.security.profileAccent}</span>
                      <div className="settings-color-editor">
                        <label className="settings-color-input">
                          <input
                            onChange={(event) => updateForm("profileColor", event.target.value)}
                            type="color"
                            value={normalizedProfileColor}
                          />
                          <span>{normalizedProfileColor}</span>
                        </label>

                        <input
                          maxLength={7}
                          onChange={(event) => updateForm("profileColor", event.target.value)}
                          placeholder="#5865F2"
                          value={form.profileColor}
                        />
                      </div>

                      <div className="settings-color-swatches">
                        {PROFILE_COLOR_PRESETS.map((color) => (
                          <button
                            aria-label={`Usar color ${color}`}
                            className={`settings-color-swatch ${
                              normalizedProfileColor === color ? "active" : ""
                            }`}
                            key={color}
                            onClick={() => updateForm("profileColor", color)}
                            style={{ background: color }}
                            type="button"
                          />
                        ))}
                      </div>
                    </div>

                    <label className="settings-field full">
                      <span>{locale.security.avatarTone}</span>
                      <div className="settings-range-row">
                        <input
                          max="360"
                          min="0"
                          onChange={(event) => updateForm("avatarHue", Number(event.target.value))}
                          type="range"
                          value={form.avatarHue}
                        />
                        <Avatar
                          hue={form.avatarHue}
                          label={displayName}
                          size={44}
                          src={previewAvatarUrl}
                          status={user.status}
                        />
                      </div>
                    </label>

                    {visibleError ? (
                      <p className="form-error settings-form-error">{visibleError}</p>
                    ) : null}
                    {saved ? <p className="settings-form-success">{saved}</p> : null}

                    <div className="settings-form-actions">
                      <button className="primary-button" disabled={saving} type="submit">
                        <Icon name="save" />
                        <span>{saving ? locale.security.saving : locale.security.saveChanges}</span>
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => setEditorOpen(false)}
                        type="button"
                      >
                        <Icon name="arrowRight" />
                        <span>{locale.security.back}</span>
                      </button>
                      <button className="ghost-button" onClick={onSignOut} type="button">
                        <Icon name="close" />
                        <span>{locale.security.signOut}</span>
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          ) : tab === "status" ? (
            <div className="settings-stack">
              <div className="settings-top-tabs">
                <button
                  className="settings-top-tab"
                  onClick={() => setTab("security")}
                  type="button"
                >
                  {t("settings.panel.security", "Mi cuenta")}
                </button>
                <button className="settings-top-tab active" type="button">
                  {t("settings.panel.status", "Estado")}
                </button>
              </div>

              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>{locale.statusPanel.currentTitle}</h3>
                  <span>{locale.statusPanel.currentSubtitle}</span>
                </div>

                <div className="settings-status-showcase">
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.username}
                    size={72}
                    src={user.avatar_url}
                    status={user.status}
                  />
                  <div>
                    <strong>{findLocalizedStatusLabel(user.status, locale)}</strong>
                    <p>{user.custom_status || locale.statusPanel.noCustomStatus}</p>
                  </div>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-title">
                  <h3>{locale.statusPanel.workspaceTitle}</h3>
                  <span>{locale.statusPanel.workspaceSubtitle}</span>
                </div>

                <div className="settings-summary-grid">
                  <div className="summary-tile">
                    <Icon name="community" />
                    <strong>{guildCount}</strong>
                    <span>{locale.statusPanel.guilds}</span>
                  </div>
                  <div className="summary-tile">
                    <Icon name="mail" />
                    <strong>{dmCount}</strong>
                    <span>{locale.statusPanel.dms}</span>
                  </div>
                  <div className="summary-tile">
                    <Icon name="sparkles" />
                    <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
                    <span>{locale.statusPanel.theme}</span>
                  </div>
                </div>
              </section>
            </div>
          ) : tab === "social" ? (
            socialSettingsContent
          ) : tab === "privacy" ? (
            privacySettingsContent
          ) : tab === "devices" ? (
            devicesSettingsContent
          ) : tab === "language" ? (
            languageSettingsContent
          ) : tab === "terms" ? (
            termsSettingsContent
          ) : (
            connectionsSettingsContent
          )}
        </section>
      </div>

      {avatarCropState.open ? (
        <AvatarCropModal
          file={avatarCropState.file}
          imageUrl={avatarCropState.imageUrl}
          onApply={(croppedFile) => {
            setAvatarFile(croppedFile);
            rememberPreview(avatarPreview, croppedFile, setAvatarPreview, setClearAvatar);
            setAvatarCropState((previous) => {
              if (previous.imageUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(previous.imageUrl);
              }
              return {
                file: null,
                imageUrl: "",
                open: false
              };
            });
          }}
          onClose={() =>
            setAvatarCropState((previous) => {
              if (previous.imageUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(previous.imageUrl);
              }
              return {
                file: null,
                imageUrl: "",
                open: false
              };
            })
          }
        />
      ) : null}
    </div>
  );
}
