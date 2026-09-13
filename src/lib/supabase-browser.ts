import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "astro:env/client";

export function createBrowserClient(options?: { url?: string; anonKey?: string }): SupabaseClient | null {
  const url = options?.url ?? PUBLIC_SUPABASE_URL;
  const anonKey = options?.anonKey ?? PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }

  return createSupabaseBrowserClient(url, anonKey);
}
