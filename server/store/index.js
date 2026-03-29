import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { DemoStore } from "./demo-store.js";
import { SupabaseStore } from "./supabase-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createStore() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceRoleKey) {
    const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const store = new SupabaseStore(client);
    await store.init();
    return store;
  }

  const demoPath =
    process.env.UMBRA_DEMO_STORE_PATH ||
    path.join(__dirname, "..", "data", "demo-store.json");
  const store = new DemoStore(demoPath);
  await store.init();
  return store;
}
