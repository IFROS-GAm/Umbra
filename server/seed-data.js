import {
  CHANNEL_TYPES,
  DEMO_IDS,
  PERMISSIONS
} from "./constants.js";

const base = new Date("2026-03-29T15:00:00.000Z").getTime();

function isoMinutesAgo(minutes) {
  return new Date(base - minutes * 60 * 1000).toISOString();
}

function isoMinutesAfter(minutes) {
  return new Date(base + minutes * 60 * 1000).toISOString();
}

export function createSeedData() {
  const profiles = [
    {
      id: DEMO_IDS.users.ana,
      username: "Ana",
      discriminator: "1001",
      avatar_hue: 244,
      bio: "Construyendo el hub de IFROS.",
      status: "online",
      custom_status: "Afinando el roadmap",
      theme: "dark",
      created_at: isoMinutesAgo(4000),
      updated_at: isoMinutesAgo(15)
    },
    {
      id: DEMO_IDS.users.bruno,
      username: "Bruno",
      discriminator: "2048",
      avatar_hue: 18,
      bio: "Diseño, motion y sistemas visuales.",
      status: "idle",
      custom_status: "Revisando feedback",
      theme: "dark",
      created_at: isoMinutesAgo(3900),
      updated_at: isoMinutesAgo(25)
    },
    {
      id: DEMO_IDS.users.carla,
      username: "Carla",
      discriminator: "4512",
      avatar_hue: 142,
      bio: "Soporte y comunidad.",
      status: "dnd",
      custom_status: "Atendiendo incidencias",
      theme: "light",
      created_at: isoMinutesAgo(3700),
      updated_at: isoMinutesAgo(10)
    },
    {
      id: DEMO_IDS.users.diego,
      username: "Diego",
      discriminator: "8791",
      avatar_hue: 328,
      bio: "Frontend y documentación.",
      status: "offline",
      custom_status: "",
      theme: "dark",
      created_at: isoMinutesAgo(3500),
      updated_at: isoMinutesAgo(240)
    }
  ];

  const guilds = [
    {
      id: DEMO_IDS.guilds.ifros,
      name: "IFROS Hub",
      description: "Servidor base del mini Discord para coordinar producto, soporte y feedback.",
      icon_text: "IF",
      banner_color: "#5865F2",
      owner_id: DEMO_IDS.users.ana,
      created_at: isoMinutesAgo(2400),
      updated_at: isoMinutesAgo(20)
    },
    {
      id: DEMO_IDS.guilds.design,
      name: "Design Lab",
      description: "Referencias visuales, motion y experimentos del equipo creativo.",
      icon_text: "DL",
      banner_color: "#F97316",
      owner_id: DEMO_IDS.users.bruno,
      created_at: isoMinutesAgo(2200),
      updated_at: isoMinutesAgo(35)
    }
  ];

  const everyonePerms = PERMISSIONS.READ_MESSAGES | PERMISSIONS.SEND_MESSAGES;
  const modPerms =
    everyonePerms |
    PERMISSIONS.MANAGE_MESSAGES |
    PERMISSIONS.MANAGE_CHANNELS |
    PERMISSIONS.MANAGE_GUILD;
  const adminPerms = modPerms | PERMISSIONS.MANAGE_ROLES | PERMISSIONS.ADMINISTRATOR;

  const roles = [
    {
      id: DEMO_IDS.roles.ifrosEveryone,
      guild_id: DEMO_IDS.guilds.ifros,
      name: "@everyone",
      color: "#9AA4B2",
      position: 0,
      permissions: everyonePerms,
      hoist: false,
      mentionable: false,
      created_at: isoMinutesAgo(2400)
    },
    {
      id: DEMO_IDS.roles.ifrosMod,
      guild_id: DEMO_IDS.guilds.ifros,
      name: "Moderación",
      color: "#60A5FA",
      position: 2,
      permissions: modPerms,
      hoist: true,
      mentionable: true,
      created_at: isoMinutesAgo(2300)
    },
    {
      id: DEMO_IDS.roles.designEveryone,
      guild_id: DEMO_IDS.guilds.design,
      name: "@everyone",
      color: "#A1A1AA",
      position: 0,
      permissions: everyonePerms,
      hoist: false,
      mentionable: false,
      created_at: isoMinutesAgo(2200)
    },
    {
      id: DEMO_IDS.roles.designAdmin,
      guild_id: DEMO_IDS.guilds.design,
      name: "Lead Visual",
      color: "#F97316",
      position: 2,
      permissions: adminPerms,
      hoist: true,
      mentionable: true,
      created_at: isoMinutesAgo(2100)
    }
  ];

  const guild_members = [
    {
      guild_id: DEMO_IDS.guilds.ifros,
      user_id: DEMO_IDS.users.ana,
      role_ids: [DEMO_IDS.roles.ifrosEveryone, DEMO_IDS.roles.ifrosMod],
      nickname: "Ana / Owner",
      joined_at: isoMinutesAgo(2380)
    },
    {
      guild_id: DEMO_IDS.guilds.ifros,
      user_id: DEMO_IDS.users.bruno,
      role_ids: [DEMO_IDS.roles.ifrosEveryone],
      nickname: "Bruno",
      joined_at: isoMinutesAgo(2000)
    },
    {
      guild_id: DEMO_IDS.guilds.ifros,
      user_id: DEMO_IDS.users.carla,
      role_ids: [DEMO_IDS.roles.ifrosEveryone],
      nickname: "Carla Support",
      joined_at: isoMinutesAgo(1990)
    },
    {
      guild_id: DEMO_IDS.guilds.ifros,
      user_id: DEMO_IDS.users.diego,
      role_ids: [DEMO_IDS.roles.ifrosEveryone],
      nickname: "Diego",
      joined_at: isoMinutesAgo(1980)
    },
    {
      guild_id: DEMO_IDS.guilds.design,
      user_id: DEMO_IDS.users.bruno,
      role_ids: [DEMO_IDS.roles.designEveryone, DEMO_IDS.roles.designAdmin],
      nickname: "Bruno Lead",
      joined_at: isoMinutesAgo(2180)
    },
    {
      guild_id: DEMO_IDS.guilds.design,
      user_id: DEMO_IDS.users.ana,
      role_ids: [DEMO_IDS.roles.designEveryone],
      nickname: "Ana",
      joined_at: isoMinutesAgo(2100)
    },
    {
      guild_id: DEMO_IDS.guilds.design,
      user_id: DEMO_IDS.users.diego,
      role_ids: [DEMO_IDS.roles.designEveryone],
      nickname: "Diego",
      joined_at: isoMinutesAgo(2080)
    }
  ];

  const channels = [
    {
      id: DEMO_IDS.channels.ifrosGeneral,
      guild_id: DEMO_IDS.guilds.ifros,
      type: CHANNEL_TYPES.TEXT,
      name: "general",
      topic: "Punto de encuentro del equipo.",
      position: 0,
      parent_id: null,
      created_by: DEMO_IDS.users.ana,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: isoMinutesAgo(2380),
      updated_at: isoMinutesAgo(12)
    },
    {
      id: DEMO_IDS.channels.ifrosRoadmap,
      guild_id: DEMO_IDS.guilds.ifros,
      type: CHANNEL_TYPES.TEXT,
      name: "roadmap",
      topic: "Plan de entregas y decisiones de producto.",
      position: 1,
      parent_id: null,
      created_by: DEMO_IDS.users.ana,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: isoMinutesAgo(2370),
      updated_at: isoMinutesAgo(40)
    },
    {
      id: DEMO_IDS.channels.ifrosSupport,
      guild_id: DEMO_IDS.guilds.ifros,
      type: CHANNEL_TYPES.TEXT,
      name: "soporte",
      topic: "Ayuda, bugs y dudas rápidas.",
      position: 2,
      parent_id: null,
      created_by: DEMO_IDS.users.carla,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: isoMinutesAgo(2360),
      updated_at: isoMinutesAgo(80)
    },
    {
      id: DEMO_IDS.channels.designShowcase,
      guild_id: DEMO_IDS.guilds.design,
      type: CHANNEL_TYPES.TEXT,
      name: "showcase",
      topic: "Exploraciones visuales y mockups.",
      position: 0,
      parent_id: null,
      created_by: DEMO_IDS.users.bruno,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: isoMinutesAgo(2180),
      updated_at: isoMinutesAgo(55)
    },
    {
      id: DEMO_IDS.channels.designResources,
      guild_id: DEMO_IDS.guilds.design,
      type: CHANNEL_TYPES.TEXT,
      name: "recursos",
      topic: "Fuentes, referencias y snippets.",
      position: 1,
      parent_id: null,
      created_by: DEMO_IDS.users.diego,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: isoMinutesAgo(2175),
      updated_at: isoMinutesAgo(180)
    },
    {
      id: DEMO_IDS.channels.dmAnaBruno,
      guild_id: null,
      type: CHANNEL_TYPES.DM,
      name: "",
      topic: "DM directo",
      position: 0,
      parent_id: null,
      created_by: DEMO_IDS.users.ana,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: isoMinutesAgo(300),
      updated_at: isoMinutesAgo(7)
    },
    {
      id: DEMO_IDS.channels.dmGroup,
      guild_id: null,
      type: CHANNEL_TYPES.GROUP_DM,
      name: "Squad Sync",
      topic: "Mini grupo para resolver pendientes rápidos.",
      position: 1,
      parent_id: null,
      created_by: DEMO_IDS.users.ana,
      last_message_id: null,
      last_message_author_id: null,
      last_message_preview: "",
      last_message_at: null,
      created_at: isoMinutesAgo(260),
      updated_at: isoMinutesAgo(18)
    }
  ];

  const messages = [
    {
      id: "50000000-0000-4000-8000-000000000001",
      channel_id: DEMO_IDS.channels.ifrosGeneral,
      guild_id: DEMO_IDS.guilds.ifros,
      author_id: DEMO_IDS.users.ana,
      content: "Bienvenidos al mini Discord de IFROS. Arranquemos por **general** para coordinar el día.",
      reply_to: null,
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(190)
    },
    {
      id: "50000000-0000-4000-8000-000000000002",
      channel_id: DEMO_IDS.channels.ifrosGeneral,
      guild_id: DEMO_IDS.guilds.ifros,
      author_id: DEMO_IDS.users.bruno,
      content: "Dejo aquí una referencia para el layout de 3 columnas. @Ana luego lo vemos con calma.",
      reply_to: null,
      attachments: [],
      mention_user_ids: [DEMO_IDS.users.ana],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(180)
    },
    {
      id: "50000000-0000-4000-8000-000000000003",
      channel_id: DEMO_IDS.channels.ifrosGeneral,
      guild_id: DEMO_IDS.guilds.ifros,
      author_id: DEMO_IDS.users.carla,
      content: "Anotado. También necesitamos un indicador de `typing` y el flujo de mensajes editados.",
      reply_to: "50000000-0000-4000-8000-000000000002",
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(176)
    },
    {
      id: "50000000-0000-4000-8000-000000000004",
      channel_id: DEMO_IDS.channels.ifrosRoadmap,
      guild_id: DEMO_IDS.guilds.ifros,
      author_id: DEMO_IDS.users.ana,
      content: "Roadmap del sprint:\n- chat en tiempo real\n- replies\n- reacciones\n- sidebar de servidores",
      reply_to: null,
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(140)
    },
    {
      id: "50000000-0000-4000-8000-000000000005",
      channel_id: DEMO_IDS.channels.ifrosRoadmap,
      guild_id: DEMO_IDS.guilds.ifros,
      author_id: DEMO_IDS.users.diego,
      content: "Me encargo del pulido visual. Quiero algo más expresivo que un clon gris genérico.",
      reply_to: "50000000-0000-4000-8000-000000000004",
      attachments: [],
      mention_user_ids: [],
      edited_at: isoMinutesAgo(120),
      deleted_at: null,
      created_at: isoMinutesAgo(128)
    },
    {
      id: "50000000-0000-4000-8000-000000000006",
      channel_id: DEMO_IDS.channels.ifrosSupport,
      guild_id: DEMO_IDS.guilds.ifros,
      author_id: DEMO_IDS.users.carla,
      content: "Si encuentran bugs, respondan este mensaje con el detalle y el canal afectado.",
      reply_to: null,
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(105)
    },
    {
      id: "50000000-0000-4000-8000-000000000007",
      channel_id: DEMO_IDS.channels.designShowcase,
      guild_id: DEMO_IDS.guilds.design,
      author_id: DEMO_IDS.users.bruno,
      content: "Estoy mezclando la vibra del mockup clásico con una paleta más cálida y tipografía **Space Grotesk**.",
      reply_to: null,
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(95)
    },
    {
      id: "50000000-0000-4000-8000-000000000008",
      channel_id: DEMO_IDS.channels.designResources,
      guild_id: DEMO_IDS.guilds.design,
      author_id: DEMO_IDS.users.diego,
      content: "Snippet útil:\n```css\nmin-height: 0;\noverflow: auto;\n```",
      reply_to: null,
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(82)
    },
    {
      id: "50000000-0000-4000-8000-000000000009",
      channel_id: DEMO_IDS.channels.dmAnaBruno,
      guild_id: null,
      author_id: DEMO_IDS.users.ana,
      content: "Te pasé la guía completa. ¿Puedes convertir lo esencial a MVP hoy?",
      reply_to: null,
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(16)
    },
    {
      id: "50000000-0000-4000-8000-000000000010",
      channel_id: DEMO_IDS.channels.dmAnaBruno,
      guild_id: null,
      author_id: DEMO_IDS.users.bruno,
      content: "Sí. Empezaré por estructura, luego realtime y al final los detalles bloqueados por accesos.",
      reply_to: "50000000-0000-4000-8000-000000000009",
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(7)
    },
    {
      id: "50000000-0000-4000-8000-000000000011",
      channel_id: DEMO_IDS.channels.dmGroup,
      guild_id: null,
      author_id: DEMO_IDS.users.ana,
      content: "Equipo, si algo no se puede automatizar por credenciales externas, dejémoslo documentado en un `.md`.",
      reply_to: null,
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(24)
    },
    {
      id: "50000000-0000-4000-8000-000000000012",
      channel_id: DEMO_IDS.channels.dmGroup,
      guild_id: null,
      author_id: DEMO_IDS.users.carla,
      content: "Perfecto. Así el siguiente paso queda clarísimo para continuar luego.",
      reply_to: "50000000-0000-4000-8000-000000000011",
      attachments: [],
      mention_user_ids: [],
      edited_at: null,
      deleted_at: null,
      created_at: isoMinutesAgo(18)
    }
  ];

  const message_reactions = [
    {
      message_id: "50000000-0000-4000-8000-000000000002",
      user_id: DEMO_IDS.users.ana,
      emoji: "🔥",
      created_at: isoMinutesAgo(179)
    },
    {
      message_id: "50000000-0000-4000-8000-000000000004",
      user_id: DEMO_IDS.users.bruno,
      emoji: "🚀",
      created_at: isoMinutesAgo(130)
    },
    {
      message_id: "50000000-0000-4000-8000-000000000007",
      user_id: DEMO_IDS.users.diego,
      emoji: "✨",
      created_at: isoMinutesAgo(90)
    }
  ];

  const channel_members = [
    {
      channel_id: DEMO_IDS.channels.ifrosGeneral,
      user_id: DEMO_IDS.users.ana,
      last_read_message_id: "50000000-0000-4000-8000-000000000003",
      last_read_at: isoMinutesAgo(170),
      hidden: false,
      joined_at: isoMinutesAgo(2380)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosGeneral,
      user_id: DEMO_IDS.users.bruno,
      last_read_message_id: "50000000-0000-4000-8000-000000000002",
      last_read_at: isoMinutesAgo(178),
      hidden: false,
      joined_at: isoMinutesAgo(2000)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosGeneral,
      user_id: DEMO_IDS.users.carla,
      last_read_message_id: "50000000-0000-4000-8000-000000000003",
      last_read_at: isoMinutesAgo(176),
      hidden: false,
      joined_at: isoMinutesAgo(1990)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosGeneral,
      user_id: DEMO_IDS.users.diego,
      last_read_message_id: "50000000-0000-4000-8000-000000000001",
      last_read_at: isoMinutesAgo(188),
      hidden: false,
      joined_at: isoMinutesAgo(1980)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosRoadmap,
      user_id: DEMO_IDS.users.ana,
      last_read_message_id: "50000000-0000-4000-8000-000000000005",
      last_read_at: isoMinutesAgo(125),
      hidden: false,
      joined_at: isoMinutesAgo(2380)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosRoadmap,
      user_id: DEMO_IDS.users.bruno,
      last_read_message_id: "50000000-0000-4000-8000-000000000004",
      last_read_at: isoMinutesAgo(139),
      hidden: false,
      joined_at: isoMinutesAgo(2000)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosRoadmap,
      user_id: DEMO_IDS.users.carla,
      last_read_message_id: "50000000-0000-4000-8000-000000000004",
      last_read_at: isoMinutesAgo(139),
      hidden: false,
      joined_at: isoMinutesAgo(1990)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosRoadmap,
      user_id: DEMO_IDS.users.diego,
      last_read_message_id: "50000000-0000-4000-8000-000000000005",
      last_read_at: isoMinutesAgo(126),
      hidden: false,
      joined_at: isoMinutesAgo(1980)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosSupport,
      user_id: DEMO_IDS.users.ana,
      last_read_message_id: null,
      last_read_at: null,
      hidden: false,
      joined_at: isoMinutesAgo(2380)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosSupport,
      user_id: DEMO_IDS.users.bruno,
      last_read_message_id: null,
      last_read_at: null,
      hidden: false,
      joined_at: isoMinutesAgo(2000)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosSupport,
      user_id: DEMO_IDS.users.carla,
      last_read_message_id: "50000000-0000-4000-8000-000000000006",
      last_read_at: isoMinutesAgo(104),
      hidden: false,
      joined_at: isoMinutesAgo(1990)
    },
    {
      channel_id: DEMO_IDS.channels.ifrosSupport,
      user_id: DEMO_IDS.users.diego,
      last_read_message_id: null,
      last_read_at: null,
      hidden: false,
      joined_at: isoMinutesAgo(1980)
    },
    {
      channel_id: DEMO_IDS.channels.designShowcase,
      user_id: DEMO_IDS.users.bruno,
      last_read_message_id: "50000000-0000-4000-8000-000000000007",
      last_read_at: isoMinutesAgo(95),
      hidden: false,
      joined_at: isoMinutesAgo(2180)
    },
    {
      channel_id: DEMO_IDS.channels.designShowcase,
      user_id: DEMO_IDS.users.ana,
      last_read_message_id: null,
      last_read_at: null,
      hidden: false,
      joined_at: isoMinutesAgo(2100)
    },
    {
      channel_id: DEMO_IDS.channels.designShowcase,
      user_id: DEMO_IDS.users.diego,
      last_read_message_id: "50000000-0000-4000-8000-000000000007",
      last_read_at: isoMinutesAgo(94),
      hidden: false,
      joined_at: isoMinutesAgo(2080)
    },
    {
      channel_id: DEMO_IDS.channels.designResources,
      user_id: DEMO_IDS.users.bruno,
      last_read_message_id: "50000000-0000-4000-8000-000000000008",
      last_read_at: isoMinutesAgo(80),
      hidden: false,
      joined_at: isoMinutesAgo(2180)
    },
    {
      channel_id: DEMO_IDS.channels.designResources,
      user_id: DEMO_IDS.users.ana,
      last_read_message_id: null,
      last_read_at: null,
      hidden: false,
      joined_at: isoMinutesAgo(2100)
    },
    {
      channel_id: DEMO_IDS.channels.designResources,
      user_id: DEMO_IDS.users.diego,
      last_read_message_id: "50000000-0000-4000-8000-000000000008",
      last_read_at: isoMinutesAgo(82),
      hidden: false,
      joined_at: isoMinutesAgo(2080)
    },
    {
      channel_id: DEMO_IDS.channels.dmAnaBruno,
      user_id: DEMO_IDS.users.ana,
      last_read_message_id: "50000000-0000-4000-8000-000000000010",
      last_read_at: isoMinutesAgo(7),
      hidden: false,
      joined_at: isoMinutesAgo(300)
    },
    {
      channel_id: DEMO_IDS.channels.dmAnaBruno,
      user_id: DEMO_IDS.users.bruno,
      last_read_message_id: "50000000-0000-4000-8000-000000000010",
      last_read_at: isoMinutesAgo(7),
      hidden: false,
      joined_at: isoMinutesAgo(300)
    },
    {
      channel_id: DEMO_IDS.channels.dmGroup,
      user_id: DEMO_IDS.users.ana,
      last_read_message_id: "50000000-0000-4000-8000-000000000012",
      last_read_at: isoMinutesAgo(18),
      hidden: false,
      joined_at: isoMinutesAgo(260)
    },
    {
      channel_id: DEMO_IDS.channels.dmGroup,
      user_id: DEMO_IDS.users.carla,
      last_read_message_id: "50000000-0000-4000-8000-000000000012",
      last_read_at: isoMinutesAgo(18),
      hidden: false,
      joined_at: isoMinutesAgo(260)
    },
    {
      channel_id: DEMO_IDS.channels.dmGroup,
      user_id: DEMO_IDS.users.diego,
      last_read_message_id: "50000000-0000-4000-8000-000000000011",
      last_read_at: isoMinutesAgo(23),
      hidden: false,
      joined_at: isoMinutesAgo(260)
    }
  ];

  return {
    profiles,
    guilds,
    roles,
    guild_members,
    channels,
    channel_members,
    messages,
    message_reactions,
    metadata: {
      created_at: isoMinutesAfter(0)
    }
  };
}
