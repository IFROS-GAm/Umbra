import { resolveAssetUrl } from "../../api.js";
import { LANGUAGE_OPTIONS } from "../../i18n.js";
import { STATUS_OPTIONS } from "../../utils.js";

export const PROFILE_COLOR_PRESETS = [
  "#5865F2",
  "#7C3AED",
  "#EC4899",
  "#F97316",
  "#EAB308",
  "#10B981",
  "#06B6D4",
  "#64748B",
];

export const SOCIAL_PLATFORM_OPTIONS = [
  { value: "website", label: "Sitio web", placeholder: "https://tu-sitio.com" },
  { value: "instagram", label: "Instagram", placeholder: "https://instagram.com/tu_usuario" },
  { value: "youtube", label: "YouTube", placeholder: "https://youtube.com/@tu_canal" },
  { value: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/user/..." },
  { value: "twitch", label: "Twitch", placeholder: "https://twitch.tv/tu_canal" },
  { value: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@tu_usuario" },
  { value: "x", label: "X / Twitter", placeholder: "https://x.com/tu_usuario" },
  { value: "discord", label: "Discord", placeholder: "https://discord.gg/tu_invite" }
];

export const DEFAULT_PRIVACY_SETTINGS = {
  allowDirectMessages: true,
  showActivityStatus: true,
  showMemberSince: true,
  showSocialLinks: true
};

export const RECOVERY_PROVIDER_OPTIONS = [
  { value: "", label: "Sin cuenta de recuperacion", placeholder: "No configurada" },
  { value: "google", label: "Google", placeholder: "tu-cuenta@gmail.com" },
  { value: "outlook", label: "Microsoft / Outlook", placeholder: "tu-cuenta@outlook.com" },
  { value: "apple", label: "Apple", placeholder: "Apple ID o correo asociado" },
  { value: "discord", label: "Discord", placeholder: "usuario, enlace o handle" },
  { value: "other", label: "Otra", placeholder: "Correo, usuario o enlace de respaldo" }
];

export const SETTINGS_NAV_GROUPS = [
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
    items: [
      { id: "terms", icon: "help", label: "Terminos y condiciones", active: false },
      { id: "credits", icon: "community", label: "Creditos y demas", active: false }
    ]
  }
];

export function findStatusLabel(status) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || "Offline";
}

export function findLocalizedStatusLabel(status, locale) {
  const value = String(status || "").toLowerCase();
  return locale?.statuses?.[value] || findStatusLabel(status);
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

export function buildPanelStyle(color, imageUrl) {
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

export function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "Sin correo visible";
  }

  const [name, domain] = email.split("@");
  if (name.length <= 2) {
    return `${name[0] || "*"}***@${domain}`;
  }

  return `${name.slice(0, 2)}${"*".repeat(Math.max(4, name.length - 2))}@${domain}`;
}

export function isEmailAddress(candidate = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(candidate || "").trim());
}

export function ensureUrlProtocol(candidate = "") {
  const trimmed = String(candidate || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function normalizeSocialLinks(entries = []) {
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

export function buildSocialLinkDrafts(entries = []) {
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

export function normalizePrivacySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    ...DEFAULT_PRIVACY_SETTINGS,
    allowDirectMessages: source.allowDirectMessages !== false,
    showActivityStatus: source.showActivityStatus !== false,
    showMemberSince: source.showMemberSince !== false,
    showSocialLinks: source.showSocialLinks !== false
  };
}

export function normalizeRecoveryProvider(provider = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  return RECOVERY_PROVIDER_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : "";
}

export function normalizeRecoveryAccount(value = "") {
  return String(value || "").trim().slice(0, 160);
}

export function settingsPanelTitle(tab) {
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
    case "credits":
      return "Creditos y demas";
    case "status":
      return "Estado";
    default:
      return "Mi cuenta";
  }
}

export function getSettingsLocale(language) {
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
      },
      credits: {
        title: "Creditos y demas",
        subtitle: "Reconocimiento oficial al equipo y a la vision que sostiene a Umbra.",
        companyTitle: "Empresa",
        companyBody:
          "mia S.S impulsa Umbra como producto, identidad y base operativa para experiencias sociales, voz y comunidad.",
        companyTag: "Casa matriz",
        executiveTitle: "Direccion ejecutiva",
        leadershipTitle: "Liderazgo",
        adminTitle: "Administracion ejecutiva",
        engineeringTitle: "Programacion y sistemas",
        noteTitle: "Nota del proyecto",
        noteBody:
          "Umbra mezcla autoria humana, apoyo de IA y una direccion creativa propia para construir una plataforma con identidad.",
        people: {
          adminRole: "Administradora ejecutiva",
          adminName: "Ssanlings",
          ceoRole: "CEO",
          ceoName: "IFROS_GAm",
          engineerRole: "Programadores",
          engineerNames: "IFROS-GAm · IA-Lins"
        }
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
      },
      credits: {
        title: "Credits and more",
        subtitle: "Official recognition for the team and vision behind Umbra.",
        companyTitle: "Company",
        companyBody:
          "mia S.S powers Umbra as a product, identity and operational base for social, voice and community experiences.",
        companyTag: "Core company",
        executiveTitle: "Executive direction",
        leadershipTitle: "Leadership",
        adminTitle: "Executive administration",
        engineeringTitle: "Engineering and systems",
        noteTitle: "Project note",
        noteBody:
          "Umbra combines human authorship, AI support and a distinct creative direction to build a platform with its own identity.",
        people: {
          adminRole: "Executive administrator",
          adminName: "Ssanlings",
          ceoRole: "CEO",
          ceoName: "IFROS_GAm",
          engineerRole: "Developers",
          engineerNames: "IFROS-GAm · IA-Lins"
        }
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
      },
      credits: {
        title: "Credits et plus",
        subtitle: "Reconnaissance officielle de l'equipe et de la vision qui portent Umbra.",
        companyTitle: "Entreprise",
        companyBody:
          "mia S.S propulse Umbra comme produit, identite et base operationnelle pour les experiences sociales, vocales et communautaires.",
        companyTag: "Maison principale",
        executiveTitle: "Direction executive",
        leadershipTitle: "Leadership",
        adminTitle: "Administration executive",
        engineeringTitle: "Programmation et systemes",
        noteTitle: "Note du projet",
        noteBody:
          "Umbra melange creation humaine, soutien de l'IA et direction creative propre pour construire une plateforme avec identite.",
        people: {
          adminRole: "Administratrice executive",
          adminName: "Ssanlings",
          ceoRole: "PDG",
          ceoName: "IFROS_GAm",
          engineerRole: "Programmeurs",
          engineerNames: "IFROS-GAm · IA-Lins"
        }
      }
    }
  };

  return dictionaries[language] || dictionaries.es;
}

export function getLegalSections(language) {
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

export function getLocalizedSocialPlaceholder(language, platform) {
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

export function getLocalizedRecoveryPlaceholder(language, provider) {
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

