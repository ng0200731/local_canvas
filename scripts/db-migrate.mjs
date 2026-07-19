#!/usr/bin/env node
/**
 * Apply db/local-init.sql to DATABASE_URL and seed the fixed local profile.
 * Usage: pnpm db:migrate
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(name) {
  try {
    const raw = readFileSync(join(root, name), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://canvas:canvas@localhost:15432/canvas_dev";
const localUserId =
  process.env.LOCAL_USER_ID ?? "00000000-0000-4000-8000-000000000001";

const sqlPath = join(root, "db", "local-init.sql");
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  console.log(`Connected to ${databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
  await client.query(sql);
  await client.query(
    `INSERT INTO public.profiles (id, display_name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [localUserId, "Local Developer"],
  );
  console.log(`Seeded profile ${localUserId}`);
  console.log("Migration complete.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
