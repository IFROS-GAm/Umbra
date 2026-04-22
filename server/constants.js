export const CHANNEL_TYPES = Object.freeze({
  CATEGORY: "category",
  TEXT: "text",
  VOICE: "voice",
  DM: "dm",
  GROUP_DM: "group_dm"
});

export const GUILD_CHANNEL_KINDS = Object.freeze({
  CATEGORY: "category",
  TEXT: "text",
  VOICE: "voice"
});

export const USER_STATUSES = Object.freeze([
  "online",
  "idle",
  "dnd",
  "invisible",
  "offline"
]);

export const PERMISSIONS = Object.freeze({
  CREATE_INVITE: 1 << 0,
  READ_MESSAGES: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  MANAGE_MESSAGES: 1 << 13,
  MANAGE_CHANNELS: 1 << 4,
  MANAGE_GUILD: 1 << 5,
  MANAGE_ROLES: 1 << 28,
  ADMINISTRATOR: 1 << 3
});

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce(
  (sum, permission) => sum | permission,
  0
);

export const SYSTEM_REACTIONS = Object.freeze({
  PIN: "__umbra_pin__"
});

export const MESSAGE_CONTENT_MAX_LENGTH = 1500;

export const DEFAULT_REACTIONS = Object.freeze([
  "\uD83D\uDD25",
  "\uD83D\uDC4D",
  "\u2728",
  "\uD83D\uDE80"
]);

export const DEFAULT_GUILD_STICKERS = Object.freeze([
  {
    key: "wave",
    name: "Wave",
    emoji: "\uD83D\uDC4B"
  },
  {
    key: "nova",
    name: "Nova",
    emoji: "\u2728"
  },
  {
    key: "blink",
    name: "Blink",
    emoji: "\uD83D\uDC40"
  },
  {
    key: "pulse",
    name: "Pulse",
    emoji: "\uD83D\uDC9C"
  },
  {
    key: "ghost",
    name: "Ghost",
    emoji: "\uD83D\uDC7B"
  },
  {
    key: "echo",
    name: "Echo",
    emoji: "\uD83C\uDF19"
  }
]);

export const GUILD_TEMPLATES = Object.freeze({
  games: {
    description: "Raids, squads y noches de party.",
    textChannels: ["general", "clips", "buscando-grupo"],
    voiceChannels: ["lobby", "squad-1", "squad-2"]
  },
  friends: {
    description: "Servidor social pequeno y directo.",
    textChannels: ["general", "memes", "planes"],
    voiceChannels: ["lounge"]
  },
  study: {
    description: "Clases, tareas y seguimiento.",
    textChannels: ["general", "tareas", "recursos"],
    voiceChannels: ["sala-de-estudio-1", "sala-de-estudio-2"]
  },
  community: {
    description: "Eventos, anuncios y equipo.",
    textChannels: ["anuncios", "general", "soporte"],
    voiceChannels: ["town-hall", "lounge"]
  },
  default: {
    description: "Canales iniciales de Umbra.",
    textChannels: ["general"],
    voiceChannels: ["lounge"]
  }
});

export const DEMO_IDS = Object.freeze({
  users: {
    ana: "11111111-1111-4111-8111-111111111111",
    bruno: "22222222-2222-4222-8222-222222222222",
    carla: "33333333-3333-4333-8333-333333333333",
    diego: "44444444-4444-4444-8444-444444444444"
  },
  guilds: {
    ifros: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    design: "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2"
  },
  roles: {
    ifrosEveryone: "aaaaaaa1-1000-4000-8000-aaaaaaaaaaa1",
    ifrosMod: "aaaaaaa1-2000-4000-8000-aaaaaaaaaaa2",
    designEveryone: "bbbbbbb2-1000-4000-8000-bbbbbbbbbbb1",
    designAdmin: "bbbbbbb2-2000-4000-8000-bbbbbbbbbbb2"
  },
  channels: {
    ifrosGeneral: "aaaaaaa1-3000-4000-8000-aaaaaaaaaaa1",
    ifrosRoadmap: "aaaaaaa1-3000-4000-8000-aaaaaaaaaaa2",
    ifrosSupport: "aaaaaaa1-3000-4000-8000-aaaaaaaaaaa3",
    ifrosLounge: "aaaaaaa1-3000-4000-8000-aaaaaaaaaaa4",
    ifrosStudyOne: "aaaaaaa1-3000-4000-8000-aaaaaaaaaaa5",
    ifrosStudyTwo: "aaaaaaa1-3000-4000-8000-aaaaaaaaaaa6",
    designShowcase: "bbbbbbb2-3000-4000-8000-bbbbbbbbbbb1",
    designResources: "bbbbbbb2-3000-4000-8000-bbbbbbbbbbb2",
    dmAnaBruno: "ddddddd1-3000-4000-8000-ddddddddddd1",
    dmGroup: "ddddddd1-3000-4000-8000-ddddddddddd2"
  }
});
