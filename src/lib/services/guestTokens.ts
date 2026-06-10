import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestToken } from "@/types";

export class PartyNotFoundError extends Error {
  constructor() {
    super("Party not found");
    this.name = "PartyNotFoundError";
  }
}

export function generateGuestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function assertPartyExists(supabase: SupabaseClient, partyId: string): Promise<void> {
  const response = await supabase.from("parties").select("id").eq("id", partyId).maybeSingle();

  if (response.error) {
    throw response.error;
  }

  if (!response.data?.id) {
    throw new PartyNotFoundError();
  }
}

export async function getActiveGuestToken(supabase: SupabaseClient, partyId: string): Promise<GuestToken | null> {
  await assertPartyExists(supabase, partyId);

  const response = await supabase
    .from("guest_tokens")
    .select()
    .eq("party_id", partyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  if (!response.data) {
    return null;
  }

  return response.data as GuestToken;
}

export async function issueGuestToken(supabase: SupabaseClient, partyId: string): Promise<GuestToken> {
  await assertPartyExists(supabase, partyId);

  const revokeResponse = await supabase
    .from("guest_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("party_id", partyId)
    .is("revoked_at", null);

  if (revokeResponse.error) {
    throw revokeResponse.error;
  }

  const token = generateGuestToken();
  const insertResponse = await supabase.from("guest_tokens").insert({ party_id: partyId, token }).select().single();

  if (insertResponse.error) {
    throw insertResponse.error;
  }

  return insertResponse.data as GuestToken;
}
