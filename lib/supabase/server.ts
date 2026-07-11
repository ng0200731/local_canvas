import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env, supabasePublicKey } from "@/lib/env";

/**
 * Server-side Supabase client bound to the incoming request's cookies.
 * Use inside Server Components, Route Handlers, and Server Actions.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    supabasePublicKey as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Safe to ignore — the middleware refreshes the session.
          }
        },
      },
    },
  );
}
