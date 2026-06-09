import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatePartyInput, Party } from "@/types";

export class VenueNotFoundError extends Error {
  constructor() {
    super("No venue configured");
    this.name = "VenueNotFoundError";
  }
}

export async function getDefaultVenueId(supabase: SupabaseClient): Promise<string> {
  const response = await supabase
    .from("venues")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  const row = response.data;
  if (!row?.id || typeof row.id !== "string") {
    throw new VenueNotFoundError();
  }
  return row.id;
}

export async function getNextPosition(supabase: SupabaseClient, venueId: string): Promise<number> {
  const response = await supabase
    .from("parties")
    .select("position")
    .eq("venue_id", venueId)
    .eq("status", "waiting")
    .order("position", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  const row = response.data;
  const maxPosition = typeof row?.position === "number" ? row.position : 0;
  return maxPosition + 1;
}

export async function createParty(supabase: SupabaseClient, input: CreatePartyInput): Promise<Party> {
  const venueId = await getDefaultVenueId(supabase);
  const position = await getNextPosition(supabase, venueId);

  const response = await supabase
    .from("parties")
    .insert({
      venue_id: venueId,
      display_name: input.display_name,
      party_size: input.party_size,
      position,
      status: "waiting",
      eta_minutes: null,
    })
    .select()
    .single();

  if (response.error) {
    throw response.error;
  }

  return response.data as Party;
}

export async function listWaitingParties(supabase: SupabaseClient, venueId: string): Promise<Party[]> {
  const response = await supabase
    .from("parties")
    .select()
    .eq("venue_id", venueId)
    .eq("status", "waiting")
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (response.error) {
    throw response.error;
  }

  return response.data as Party[];
}
