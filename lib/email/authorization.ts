import "server-only";

import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Local/demo mode has no account system. Once Supabase is configured, email
 * delivery is restricted to the signed-in user so the SMTP routes cannot be
 * used as a public relay.
 */
export async function authorizeEmailDelivery(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return !error && Boolean(data.user);
}
