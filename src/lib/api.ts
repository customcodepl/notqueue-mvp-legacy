import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

type ApiContext = Parameters<APIRoute>[0];

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function guestUrlFromRequest(request: Request, token: string): string {
  const origin = new URL(request.url).origin;
  return `${origin}/guest/${encodeURIComponent(token)}`;
}

export async function requireStaffUser(context: ApiContext) {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return { error: jsonResponse(503, { error: "Supabase is not configured" }) } as const;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonResponse(401, { error: "Unauthorized" }) } as const;
  }

  return { supabase, user } as const;
}
