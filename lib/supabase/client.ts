import { createBrowserClient } from "@supabase/ssr";

import { env, isSupabaseConfigured, supabasePublicKey } from "@/lib/env";

/**
 * Browser-side Supabase client (singleton).
 * Only call from client components, and only when `isSupabaseConfigured` is true.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;
  if (!isSupabaseConfigured || !env.NEXT_PUBLIC_SUPABASE_URL || !supabasePublicKey) {
    throw new Error("Supabase is not configured. Use the active local store instead.");
  }
  client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, supabasePublicKey);
  return client;
}
