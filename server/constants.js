export const CHANNEL_TYPES = Object.freeze({
  TEXT: "text",
  DM: "dm",
  GROUP_DM: "group_dm"
});

export const USER_STATUSES = Object.freeze([
  "online",
  "idle",
  "dnd",
  "invisible",
  "offline"
]);

export const PERMISSIONS = Object.freeze({
  READ_MESSAGES: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  MANAGE_MESSAGES: 1 << 13,
  MANAGE_CHANNELS: 1 << 4,
  MANAGE_GUILD: 1 << 5,
  MANAGE_ROLES: 1 << 28,
  ADMINISTRATOR: 1 << 3
});

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce(
  (sum, perm) => sum | perm,
  0
);

export const DEFAULT_REACTIONS = ["🔥", "👍", "✨", "🚀"];

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
    designShowcase: "bbbbbbb2-3000-4000-8000-bbbbbbbbbbb1",
    designResources: "bbbbbbb2-3000-4000-8000-bbbbbbbbbbb2",
    dmAnaBruno: "ddddddd1-3000-4000-8000-ddddddddddd1",
    dmGroup: "ddddddd1-3000-4000-8000-ddddddddddd2"
  }
});
