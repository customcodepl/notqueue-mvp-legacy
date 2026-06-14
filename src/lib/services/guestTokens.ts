import type { SupabaseClient } from "@supabase/supabase-js";
import { InvalidPartyStateError, PartyNotFoundError } from "@/lib/services/parties";
import type { GuestToken } from "@/types";

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

function mapIssueGuestTokenError(error: { message?: string }): never {
  const message = error.message ?? "";
  if (message.includes("party not found")) {
    throw new PartyNotFoundError();
  }
  if (message.includes("action not allowed")) {
    throw new InvalidPartyStateError();
  }
  throw new Error(message || "Failed to issue guest token");
}

export async function issueGuestToken(supabase: SupabaseClient, partyId: string): Promise<GuestToken> {
  const token = generateGuestToken();
  const response = await supabase.rpc("issue_guest_token", {
    p_party_id: partyId,
    p_token: token,
  });

  if (response.error) {
    mapIssueGuestTokenError(response.error);
  }

  if (!response.data) {
    throw new Error("issue_guest_token returned no data");
  }

  return response.data as GuestToken;
}
