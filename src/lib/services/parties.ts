import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatePartyInput, Party } from "@/types";

export class VenueNotFoundError extends Error {
  constructor() {
    super("No venue configured");
    this.name = "VenueNotFoundError";
  }
}

export class PartyNotFoundError extends Error {
  constructor() {
    super("Party not found");
    this.name = "PartyNotFoundError";
  }
}

export class EmptyQueueError extends Error {
  constructor() {
    super("Queue is empty");
    this.name = "EmptyQueueError";
  }
}

export class InvalidPartyStateError extends Error {
  constructor(message = "Action not allowed for current party status") {
    super(message);
    this.name = "InvalidPartyStateError";
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

async function getPartyById(supabase: SupabaseClient, partyId: string): Promise<Party> {
  const response = await supabase.from("parties").select().eq("id", partyId).maybeSingle();

  if (response.error) {
    throw response.error;
  }

  if (!response.data) {
    throw new PartyNotFoundError();
  }

  return response.data as Party;
}

export async function repackWaitingPositions(
  supabase: SupabaseClient,
  venueId: string,
  removedPosition: number,
): Promise<void> {
  const response = await supabase
    .from("parties")
    .select("id, position")
    .eq("venue_id", venueId)
    .eq("status", "waiting")
    .gt("position", removedPosition);

  if (response.error) {
    throw response.error;
  }

  for (const row of response.data) {
    if (typeof row.position !== "number") {
      continue;
    }

    const update = await supabase
      .from("parties")
      .update({ position: row.position - 1 })
      .eq("id", row.id);

    if (update.error) {
      throw update.error;
    }
  }
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

export async function advanceQueue(supabase: SupabaseClient): Promise<Party> {
  const venueId = await getDefaultVenueId(supabase);

  const response = await supabase
    .from("parties")
    .select()
    .eq("venue_id", venueId)
    .eq("status", "waiting")
    .order("position", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  if (!response.data) {
    throw new EmptyQueueError();
  }

  const frontParty = response.data as Party;
  if (frontParty.position === null) {
    throw new InvalidPartyStateError("Waiting party has no position");
  }

  const removedPosition = frontParty.position;

  const update = await supabase
    .from("parties")
    .update({ status: "seated", position: null })
    .eq("id", frontParty.id)
    .select()
    .single();

  if (update.error) {
    throw update.error;
  }

  await repackWaitingPositions(supabase, venueId, removedPosition);

  return update.data as Party;
}

export async function markPartyReady(supabase: SupabaseClient, partyId: string): Promise<Party> {
  const party = await getPartyById(supabase, partyId);

  if (party.status !== "waiting") {
    throw new InvalidPartyStateError();
  }

  const removedPosition = party.position;

  const update = await supabase
    .from("parties")
    .update({ status: "ready", position: null })
    .eq("id", partyId)
    .select()
    .single();

  if (update.error) {
    throw update.error;
  }

  if (removedPosition !== null) {
    await repackWaitingPositions(supabase, party.venue_id, removedPosition);
  }

  return update.data as Party;
}

export async function seatParty(supabase: SupabaseClient, partyId: string): Promise<Party> {
  const party = await getPartyById(supabase, partyId);

  if (party.status !== "ready") {
    throw new InvalidPartyStateError();
  }

  const update = await supabase.from("parties").update({ status: "seated" }).eq("id", partyId).select().single();

  if (update.error) {
    throw update.error;
  }

  return update.data as Party;
}

export async function updatePartyEta(
  supabase: SupabaseClient,
  partyId: string,
  etaMinutes: number | null,
): Promise<Party> {
  const party = await getPartyById(supabase, partyId);

  if (party.status !== "waiting") {
    throw new InvalidPartyStateError();
  }

  const update = await supabase.from("parties").update({ eta_minutes: etaMinutes }).eq("id", partyId).select().single();

  if (update.error) {
    throw update.error;
  }

  return update.data as Party;
}
