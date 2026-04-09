export const LANGUAGE_OPTIONS = [
  {
    value: "es",
    label: "Español",
    nativeLabel: "Español",
    helper: "Idioma base de Umbra."
  },
  {
    value: "en",
    label: "Ingles",
    nativeLabel: "English",
    helper: "For a cleaner English interface."
  },
  {
    value: "fr",
    label: "Frances",
    nativeLabel: "Français",
    helper: "Pour utiliser Umbra en français."
  }
];

export const DEFAULT_LANGUAGE = "es";

const STORAGE_KEY = "umbra-language";

const MESSAGES = {
  es: {
    "auth.brand.eyebrow": "Umbra",
    "auth.brand.tagline": "Arriba como abajo",
    "auth.hero.title": "Chat with shadows.",
    "auth.hero.copy":
      "Arriba como abajo. Umbra entra con auth real, backend protegido, flujo desktop y una base lista para despliegue.",
    "auth.highlight.realtime.title": "Realtime",
    "auth.highlight.realtime.body": "Socket.IO, presencia, replies, reacciones y lectura por canal.",
    "auth.highlight.access.title": "Acceso moderno",
    "auth.highlight.access.body": "Email, OTP por codigo y soporte preparado para Google OAuth.",
    "auth.highlight.desktop.title": "Desktop-ready",
    "auth.highlight.desktop.body": "Electron levanta Umbra como app instalable con backend embebido.",
    "auth.tab.signup": "Crear cuenta",
    "auth.tab.login": "Entrar",
    "auth.tab.otp": "Codigo / link",
    "auth.google": "Continuar con Google",
    "auth.user": "Usuario",
    "auth.email": "Email",
    "auth.password": "Contrasena",
    "auth.newPassword": "Nueva contrasena",
    "auth.confirmPassword": "Confirmar contrasena",
    "auth.initialUser": "Usuario inicial",
    "auth.receivedCode": "Codigo recibido",
    "auth.placeholder.user": "umbra_user",
    "auth.placeholder.email": "tu@email.com",
    "auth.placeholder.password": "Minimo 8 caracteres",
    "auth.placeholder.loginPassword": "Tu contrasena",
    "auth.placeholder.resetConfirm": "Repite la contrasena",
    "auth.placeholder.code": "123456",
    "auth.placeholder.initialUser": "Solo para usuarios nuevos",
    "auth.submit.signup": "Crear cuenta",
    "auth.submit.login": "Entrar en Umbra",
    "auth.submit.processing": "Procesando...",
    "auth.submit.verifyCode": "Verificar codigo",
    "auth.submit.sendOtp": "Enviar codigo o magic link",
    "auth.submit.sendRecovery": "Enviar enlace de recuperacion",
    "auth.submit.savePassword": "Actualizar contrasena",
    "auth.busy.creating": "Creando...",
    "auth.busy.entering": "Entrando...",
    "auth.busy.sending": "Enviando...",
    "auth.busy.saving": "Guardando...",
    "auth.recover": "Olvide mi contrasena",
    "auth.backToLogin": "Volver a entrar",

    "settings.group.user": "Ajustes de usuario",
    "settings.group.app": "Ajustes de la aplicacion",
    "settings.group.legal": "Legal",
    "settings.nav.security": "Mi cuenta",
    "settings.nav.social": "Contenido y redes",
    "settings.nav.privacy": "Datos y privacidad",
    "settings.nav.devices": "Dispositivos",
    "settings.nav.connections": "Conexiones",
    "settings.nav.status": "Estado",
    "settings.nav.theme": "Tema",
    "settings.nav.language": "Idiomas",
    "settings.nav.terms": "Terminos y condiciones",
    "settings.panel.security": "Mi cuenta",
    "settings.panel.social": "Contenido y redes",
    "settings.panel.privacy": "Datos y privacidad",
    "settings.panel.devices": "Dispositivos",
    "settings.panel.connections": "Conexiones",
    "settings.panel.status": "Estado",
    "settings.panel.language": "Idiomas",
    "settings.panel.terms": "Terminos y condiciones",
    "settings.search": "Buscar",
    "settings.editProfiles": "Editar perfiles",
    "settings.language.title": "Idiomas",
    "settings.language.subtitle":
      "Cambia el idioma visible de Umbra para esta app y este dispositivo.",
    "settings.language.current": "Idioma actual",
    "settings.language.currentHelper":
      "El cambio se aplica al instante y Umbra lo recuerda para la proxima vez.",
    "settings.language.preview": "Vista rapida",
    "settings.language.previewBody":
      "Esta seleccion afecta primero a acceso, ajustes y rotulos principales de la interfaz.",
    "settings.language.note":
      "Mas zonas de Umbra seguiran heredando este idioma a medida que se actualicen.",
    "settings.language.selected": "Seleccionado",
    "settings.language.applyNow": "Aplicado al instante"
  },
  en: {
    "auth.brand.eyebrow": "Umbra",
    "auth.brand.tagline": "As above, so below",
    "auth.hero.title": "Chat with shadows.",
    "auth.hero.copy":
      "As above, so below. Umbra ships with real auth, a protected backend, desktop flow and a base ready for deployment.",
    "auth.highlight.realtime.title": "Realtime",
    "auth.highlight.realtime.body": "Socket.IO, presence, replies, reactions and per-channel read state.",
    "auth.highlight.access.title": "Modern access",
    "auth.highlight.access.body": "Email, OTP codes and Google OAuth-ready support.",
    "auth.highlight.desktop.title": "Desktop-ready",
    "auth.highlight.desktop.body": "Electron runs Umbra as an installable app with embedded backend.",
    "auth.tab.signup": "Create account",
    "auth.tab.login": "Sign in",
    "auth.tab.otp": "Code / link",
    "auth.google": "Continue with Google",
    "auth.user": "Username",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.newPassword": "New password",
    "auth.confirmPassword": "Confirm password",
    "auth.initialUser": "Initial username",
    "auth.receivedCode": "Received code",
    "auth.placeholder.user": "umbra_user",
    "auth.placeholder.email": "you@email.com",
    "auth.placeholder.password": "Minimum 8 characters",
    "auth.placeholder.loginPassword": "Your password",
    "auth.placeholder.resetConfirm": "Repeat the password",
    "auth.placeholder.code": "123456",
    "auth.placeholder.initialUser": "Only for new users",
    "auth.submit.signup": "Create account",
    "auth.submit.login": "Enter Umbra",
    "auth.submit.processing": "Processing...",
    "auth.submit.verifyCode": "Verify code",
    "auth.submit.sendOtp": "Send code or magic link",
    "auth.submit.sendRecovery": "Send recovery link",
    "auth.submit.savePassword": "Update password",
    "auth.busy.creating": "Creating...",
    "auth.busy.entering": "Signing in...",
    "auth.busy.sending": "Sending...",
    "auth.busy.saving": "Saving...",
    "auth.recover": "Forgot my password",
    "auth.backToLogin": "Back to sign in",

    "settings.group.user": "User settings",
    "settings.group.app": "App settings",
    "settings.group.legal": "Legal",
    "settings.nav.security": "My account",
    "settings.nav.social": "Content and social",
    "settings.nav.privacy": "Privacy and data",
    "settings.nav.devices": "Devices",
    "settings.nav.connections": "Connections",
    "settings.nav.status": "Status",
    "settings.nav.theme": "Theme",
    "settings.nav.language": "Languages",
    "settings.nav.terms": "Terms and conditions",
    "settings.panel.security": "My account",
    "settings.panel.social": "Content and social",
    "settings.panel.privacy": "Privacy and data",
    "settings.panel.devices": "Devices",
    "settings.panel.connections": "Connections",
    "settings.panel.status": "Status",
    "settings.panel.language": "Languages",
    "settings.panel.terms": "Terms and conditions",
    "settings.search": "Search",
    "settings.editProfiles": "Edit profiles",
    "settings.language.title": "Languages",
    "settings.language.subtitle":
      "Change Umbra's visible language for this app and this device.",
    "settings.language.current": "Current language",
    "settings.language.currentHelper":
      "The change applies instantly and Umbra remembers it next time.",
    "settings.language.preview": "Quick preview",
    "settings.language.previewBody":
      "This selection updates auth, settings and the main interface labels first.",
    "settings.language.note":
      "More Umbra areas will gradually inherit this language as they are updated.",
    "settings.language.selected": "Selected",
    "settings.language.applyNow": "Applied instantly"
  },
  fr: {
    "auth.brand.eyebrow": "Umbra",
    "auth.brand.tagline": "Comme en haut, ainsi en bas",
    "auth.hero.title": "Chat with shadows.",
    "auth.hero.copy":
      "Comme en haut, ainsi en bas. Umbra arrive avec une vraie authentification, un backend protege, un flux desktop et une base prete pour le deploiement.",
    "auth.highlight.realtime.title": "Temps reel",
    "auth.highlight.realtime.body": "Socket.IO, presence, reponses, reactions et lecture par canal.",
    "auth.highlight.access.title": "Acces moderne",
    "auth.highlight.access.body": "Email, OTP par code et prise en charge de Google OAuth.",
    "auth.highlight.desktop.title": "Pret pour desktop",
    "auth.highlight.desktop.body": "Electron lance Umbra comme application installable avec backend embarque.",
    "auth.tab.signup": "Creer un compte",
    "auth.tab.login": "Se connecter",
    "auth.tab.otp": "Code / lien",
    "auth.google": "Continuer avec Google",
    "auth.user": "Nom d'utilisateur",
    "auth.email": "Email",
    "auth.password": "Mot de passe",
    "auth.newPassword": "Nouveau mot de passe",
    "auth.confirmPassword": "Confirmer le mot de passe",
    "auth.initialUser": "Nom initial",
    "auth.receivedCode": "Code recu",
    "auth.placeholder.user": "umbra_user",
    "auth.placeholder.email": "vous@email.com",
    "auth.placeholder.password": "Minimum 8 caracteres",
    "auth.placeholder.loginPassword": "Votre mot de passe",
    "auth.placeholder.resetConfirm": "Repetez le mot de passe",
    "auth.placeholder.code": "123456",
    "auth.placeholder.initialUser": "Seulement pour les nouveaux utilisateurs",
    "auth.submit.signup": "Creer un compte",
    "auth.submit.login": "Entrer dans Umbra",
    "auth.submit.processing": "Traitement...",
    "auth.submit.verifyCode": "Verifier le code",
    "auth.submit.sendOtp": "Envoyer un code ou un magic link",
    "auth.submit.sendRecovery": "Envoyer le lien de recuperation",
    "auth.submit.savePassword": "Mettre a jour le mot de passe",
    "auth.busy.creating": "Creation...",
    "auth.busy.entering": "Connexion...",
    "auth.busy.sending": "Envoi...",
    "auth.busy.saving": "Enregistrement...",
    "auth.recover": "J'ai oublie mon mot de passe",
    "auth.backToLogin": "Retour a la connexion",

    "settings.group.user": "Parametres utilisateur",
    "settings.group.app": "Parametres de l'application",
    "settings.group.legal": "Legal",
    "settings.nav.security": "Mon compte",
    "settings.nav.social": "Contenu et reseaux",
    "settings.nav.privacy": "Confidentialite et donnees",
    "settings.nav.devices": "Appareils",
    "settings.nav.connections": "Connexions",
    "settings.nav.status": "Statut",
    "settings.nav.theme": "Theme",
    "settings.nav.language": "Langues",
    "settings.nav.terms": "Conditions d'utilisation",
    "settings.panel.security": "Mon compte",
    "settings.panel.social": "Contenu et reseaux",
    "settings.panel.privacy": "Confidentialite et donnees",
    "settings.panel.devices": "Appareils",
    "settings.panel.connections": "Connexions",
    "settings.panel.status": "Statut",
    "settings.panel.language": "Langues",
    "settings.panel.terms": "Conditions d'utilisation",
    "settings.search": "Rechercher",
    "settings.editProfiles": "Modifier les profils",
    "settings.language.title": "Langues",
    "settings.language.subtitle":
      "Change la langue visible d'Umbra pour cette application et cet appareil.",
    "settings.language.current": "Langue actuelle",
    "settings.language.currentHelper":
      "Le changement s'applique immediatement et Umbra le memorise pour la prochaine fois.",
    "settings.language.preview": "Apercu rapide",
    "settings.language.previewBody":
      "Cette selection met d'abord a jour l'acces, les parametres et les principaux libelles de l'interface.",
    "settings.language.note":
      "D'autres zones d'Umbra adopteront progressivement cette langue lors des prochaines mises a jour.",
    "settings.language.selected": "Selectionne",
    "settings.language.applyNow": "Applique immediatement"
  }
};

export function getStoredLanguage() {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  return LANGUAGE_OPTIONS.some((option) => option.value === saved) ? saved : DEFAULT_LANGUAGE;
}

export function persistLanguage(language) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, language);
}

export function applyLanguageToDocument(language) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = language || DEFAULT_LANGUAGE;
}

export function translate(language, key, fallback = "") {
  const lang = MESSAGES[language] ? language : DEFAULT_LANGUAGE;
  return MESSAGES[lang]?.[key] || MESSAGES[DEFAULT_LANGUAGE]?.[key] || fallback || key;
}
