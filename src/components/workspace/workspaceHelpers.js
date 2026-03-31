export const COMPOSER_SHORTCUTS = [
  {
    id: "upload",
    icon: "upload",
    label: "Subir un archivo",
    description: "Adjunta varias imagenes o archivos ligeros al mensaje actual."
  },
  {
    id: "thread",
    icon: "threads",
    label: "Crear hilo",
    description: "Hilos y vistas anidadas quedan para la siguiente capa del chat."
  },
  {
    id: "poll",
    icon: "mission",
    label: "Crear encuesta",
    description: "Las encuestas todavia no estan en backend."
  },
  {
    id: "apps",
    icon: "appGrid",
    label: "Usar aplicaciones",
    description: "Reserva visual para slash commands e integraciones."
  }
];

export const PICKER_CONTENT = {
  gif: {
    title: "GIFs",
    subtitle: "Atajos ligeros para insertar energia rapida en el composer.",
    items: ["Loop", "Wave", "Glow", "Pulse", "Orbit", "Drift"]
  },
  sticker: {
    title: "Stickers",
    subtitle: "Panel visual inspirado en Discord con respuestas rapidas.",
    items: ["Wave", "Nova", "Blink", "Pulse", "Ghost", "Echo"]
  },
  emoji: {
    title: "Emojis",
    subtitle: "Reacciones rapidas listas para insertar en un mensaje.",
    items: ["😀", "🔥", "❤️", "⚡", "🎯", "✨", "🚀", "👀", "👏", "🌙", "🫶", "🖤"]
  }
};

export const MESSAGE_TOOLBAR_REACTIONS = ["❤️", "✅", "🔞", "💀"];

export const HOME_LINKS = [
  {
    id: "home",
    icon: "friends",
    label: "Amigos",
    notice: null
  },
  {
    id: "requests",
    icon: "mail",
    label: "Solicitudes de mensajes",
    notice: null
  }
];

export function isVisibleStatus(status) {
  return status && status !== "offline" && status !== "invisible";
}

export function buildMemberGroups(members = []) {
  const online = members.filter((member) => isVisibleStatus(member.status));
  const offline = members.filter((member) => !isVisibleStatus(member.status));

  return [
    {
      id: "online",
      label: `En linea - ${online.length}`,
      members: online
    },
    {
      id: "offline",
      label: `Sin conexion - ${offline.length}`,
      members: offline
    }
  ].filter((group) => group.members.length > 0);
}

export function renderHeaderCopy(activeChannel, kind) {
  if (kind === "guild") {
    if (activeChannel?.is_voice) {
      return {
        eyebrow: "Canal de voz",
        title: activeChannel?.name || "Lounge",
        description: activeChannel?.topic || "Canal de voz listo para entrar con el equipo."
      };
    }

    return {
      eyebrow: "Canal",
      title: `# ${activeChannel?.name || "general"}`,
      description: activeChannel?.topic || "Sin descripcion todavia."
    };
  }

  return {
    eyebrow: "Conversacion",
    title: activeChannel?.display_name || "Mensajes directos",
    description: activeChannel?.topic || "Abre conversaciones 1 a 1 o grupos pequenos."
  };
}

export function getDmSummary(dm, currentUserId) {
  if (!dm) {
    return "Sin mensajes todavia";
  }

  if (dm.type === "group_dm") {
    return `${dm.participants?.length || 0} miembros`;
  }

  const other = dm.participants?.find((participant) => participant.id !== currentUserId);
  return other?.custom_status || dm.last_message_preview || "Sin mensajes todavia";
}

export function isImageAttachment(attachment) {
  return Boolean(attachment?.content_type?.startsWith("image/"));
}

export function attachmentKey(attachment) {
  return attachment.path || attachment.url || attachment.name;
}

export function formatVoiceCount(count) {
  return String(count).padStart(2, "0");
}

export function buildVoiceStageTone(hue = 220) {
  return {
    background: `radial-gradient(circle at 30% 20%, hsla(${hue} 38% 82% / 0.18), transparent 34%), linear-gradient(135deg, hsl(${(hue + 20) % 360} 16% 18%), hsl(${(hue + 56) % 360} 18% 11%))`
  };
}

export function fallbackDeviceLabel(kind, index) {
  switch (kind) {
    case "audioinput":
      return `Microfono ${index + 1}`;
    case "audiooutput":
      return `Altavoces ${index + 1}`;
    case "videoinput":
      return `Camara ${index + 1}`;
    default:
      return `Dispositivo ${index + 1}`;
  }
}

export function resolveGuildIcon(guild) {
  return guild?.icon_url || guild?.image_url || guild?.avatar_url || "";
}
