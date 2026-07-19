import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env, isSupabaseConfigured, supabasePublicKey } from "@/lib/env";

/**
 * Server-side Supabase client bound to the incoming request's cookies.
 * Use inside Server Components, Route Handlers, and Server Actions.
 */
export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured || !env.NEXT_PUBLIC_SUPABASE_URL || !supabasePublicKey) {
    throw new Error("Supabase is not configured. Use local Postgres mode instead.");
  }

  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, supabasePublicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Safe to ignore — the middleware refreshes the session.
        }
      },
    },
  });
}
