import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

import { createSeedData } from "../server/seed-data.js";
import { refreshChannelSummaries } from "../server/store/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable ${name}.`);
  }
  return value;
}

async function applySchema() {
  const schemaPath = path.join(rootDir, "supabase", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  const connectionString = requiredEnv("SUPABASE_DB_URL").replace(/\?.*$/, "");

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  await client.connect();
  try {
    await client.query(schema);
  } finally {
    await client.end();
  }
}

async function upsertInBatches(supabase, table, rows, onConflict) {
  const chunkSize = 100;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const slice = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(slice, {
      onConflict
    });

    if (error) {
      throw new Error(`Falló el upsert de ${table}: ${error.message}`);
    }
  }
}

async function seedData() {
  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  const seed = createSeedData();
  refreshChannelSummaries(seed);

  await upsertInBatches(supabase, "profiles", seed.profiles, "id");
  await upsertInBatches(supabase, "guilds", seed.guilds, "id");
  await upsertInBatches(supabase, "roles", seed.roles, "id");
  await upsertInBatches(supabase, "guild_members", seed.guild_members, "guild_id,user_id");
  await upsertInBatches(supabase, "channels", seed.channels, "id");
  await upsertInBatches(
    supabase,
    "channel_members",
    seed.channel_members,
    "channel_id,user_id"
  );
  await upsertInBatches(supabase, "messages", seed.messages, "id");
  await upsertInBatches(
    supabase,
    "message_reactions",
    seed.message_reactions,
    "message_id,user_id,emoji"
  );

  const { count, error } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`No pude validar el seed: ${error.message}`);
  }

  return count ?? 0;
}

async function main() {
  console.log("Aplicando schema de Supabase...");
  await applySchema();
  console.log("Schema listo.");

  console.log("Sembrando datos iniciales...");
  const profileCount = await seedData();
  console.log(`Seed completado. Profiles registradas: ${profileCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
