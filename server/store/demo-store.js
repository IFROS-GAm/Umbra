import path from "node:path";

import { demoStoreBaseMethods } from "./demo-store/base-methods.js";
import { demoStoreDmMethods } from "./demo-store/dm-methods.js";
import { demoStoreGuildChannelMethods } from "./demo-store/guild-channel-methods.js";
import { demoStoreGuildMembershipMethods } from "./demo-store/guild-membership-methods.js";
import { demoStoreMessageMethods } from "./demo-store/message-methods.js";
import { demoStoreSocialMethods } from "./demo-store/social-methods.js";

export class DemoStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.uploadDir = path.join(path.dirname(filePath), "uploads");
    this.db = null;
    this.dmLocks = new Map();
  }

  getMode() {
    return "demo";
  }
}

Object.assign(
  DemoStore.prototype,
  demoStoreBaseMethods,
  demoStoreMessageMethods,
  demoStoreGuildChannelMethods,
  demoStoreGuildMembershipMethods,
  demoStoreDmMethods,
  demoStoreSocialMethods
);
