import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { GuestPartyView } from "@/types";

const execFileAsync = promisify(execFile);

const SEED_TOKEN = "demo-guest-token-local-only";
const URL_ENV = /^(?:API_URL|SUPABASE_URL)=(\S+)/m;
const ANON_ENV = /^(?:ANON_KEY|PUBLISHABLE_KEY|SUPABASE_ANON_KEY)=(\S+)/m;

function envValue(pattern: RegExp, text: string): string | undefined {
  const match = pattern.exec(text)?.[1];
  return match?.replaceAll(/^["']|["']$/g, "");
}

function isLoopbackSupabaseUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function credsFromProcessEnv(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !isLoopbackSupabaseUrl(url)) {
    return null;
  }
  return { url, anonKey };
}

async function probeLocalSupabase(): Promise<{ url: string; anonKey: string } | null> {
  const fromEnv = credsFromProcessEnv();
  if (fromEnv) {
    return fromEnv;
  }

  try {
    const { stdout } = await execFileAsync("npx", ["supabase", "status", "-o", "env"], {
      timeout: 15_000,
      env: process.env,
    });
    const url = envValue(URL_ENV, stdout);
    const anonKey = envValue(ANON_ENV, stdout);
    if (!url || !anonKey || !isLoopbackSupabaseUrl(url)) {
      return null;
    }
    return { url, anonKey };
  } catch {
    return null;
  }
}

const local = await probeLocalSupabase();

function requireLocal(): { url: string; anonKey: string } {
  if (local === null) {
    throw new Error("local supabase is required for this suite");
  }
  return local;
}

describe.skipIf(local === null)("guest privacy RLS", () => {
  it("does not let anon list parties", async () => {
    const creds = requireLocal();
    const supabase = createClient(creds.url, creds.anonKey);
    const response = await supabase.from("parties").select("id", { count: "exact", head: true });
    expect(response.error).toBeNull();
    expect(response.count).toBe(0);
  });

  it("returns only the seeded party for the demo guest token", async () => {
    const creds = requireLocal();
    const supabase = createClient(creds.url, creds.anonKey);
    const response = await supabase.rpc("get_guest_party_view", { p_token: SEED_TOKEN });
    expect(response.error).toBeNull();
    const view = response.data as GuestPartyView;
    expect(view).toEqual({
      display_name: "Smith",
      party_size: 4,
      position: 1,
      eta_minutes: 15,
      status: "waiting",
      menu_link: "https://demo-restaurant.example/menu",
      info_text: "Please remain nearby — we will notify you when your table is ready.",
    });
  });

  it("errors for a token that is not a party", async () => {
    const creds = requireLocal();
    const supabase = createClient(creds.url, creds.anonKey);
    const response = await supabase.rpc("get_guest_party_view", { p_token: "not-a-real-token" });
    expect(response.data).toBeNull();
    expect(response.error?.message).toMatch(/invalid or revoked guest token/i);
  });
});
