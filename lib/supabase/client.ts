import { createBrowserClient } from "@supabase/ssr";

import { env, supabasePublicKey } from "@/lib/env";

/**
 * Browser-side Supabase client (singleton).
 * Only call from client components, and only when `isSupabaseConfigured` is true.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;
  client = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    supabasePublicKey as string,
  );
  return client;
}
