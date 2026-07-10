import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * All third-party credentials are OPTIONAL so the app can run in a local/demo
 * mode with zero configuration. Capabilities switch on as their keys are added:
 *   - Supabase configured  → cloud auth, Postgres persistence, Storage uploads
 *   - Xiangsu configured    → AI image generation
 * Otherwise the app degrades gracefully (localStorage persistence, no auth, no AI).
 *
 * Treat empty string env entries as "not set" so a blank `.env` line never fails.
 */
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

const envSchema = z.object({
  // ── Supabase (optional) ──────────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  // Server-only — NEVER expose to the client.
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  // ── Xiangsu AI (optional, server-only) ──────────────────────────────
  XIANGSU_API_KEY: optionalString,

  // ── App ──────────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: optionalUrl.default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables. Check your .env file — see .env.example.");
  }
  return parsed.data;
}

export const env = loadEnv();

/** True when Supabase URL + anon key are present (auth + cloud persistence active). */
export const isSupabaseConfigured = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** True when a Xiangsu API key is present (AI image generation active). */
export const isXiangsuConfigured = Boolean(env.XIANGSU_API_KEY);
