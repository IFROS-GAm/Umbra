import { supabaseStoreRuntimeCoreMethods } from "./supabase-store-runtime/core-methods.js";
import { supabaseStoreRuntimeGuildMethods } from "./supabase-store-runtime/guild-methods.js";
import { supabaseStoreRuntimeInviteDmMethods } from "./supabase-store-runtime/invite-dm-methods.js";
import { supabaseStoreRuntimeMessageMethods } from "./supabase-store-runtime/message-methods.js";
import { supabaseStoreRuntimeModerationMethods } from "./supabase-store-runtime/moderation-methods.js";
import { supabaseStoreRuntimeSocialMethods } from "./supabase-store-runtime/social-methods.js";

export const supabaseStoreRuntimeMethods = Object.assign(
  {},
  supabaseStoreRuntimeCoreMethods,
  supabaseStoreRuntimeMessageMethods,
  supabaseStoreRuntimeGuildMethods,
  supabaseStoreRuntimeInviteDmMethods,
  supabaseStoreRuntimeSocialMethods,
  supabaseStoreRuntimeModerationMethods
);
