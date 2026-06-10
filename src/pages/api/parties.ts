import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonResponse, requireStaffUser } from "@/lib/api";
import { VenueNotFoundError, createParty, getDefaultVenueId, listWaitingParties } from "@/lib/services/parties";
import type { CreatePartyResponse, PartyListResponse } from "@/types";

export const prerender = false;

const createPartySchema = z.object({
  display_name: z.string().trim().min(1).max(100),
  party_size: z.number().int().min(1).max(99),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireStaffUser(context);
  if ("error" in auth) {
    return auth.error;
  }

  try {
    const venueId = await getDefaultVenueId(auth.supabase);
    const parties = await listWaitingParties(auth.supabase, venueId);
    const body: PartyListResponse = { parties };
    return jsonResponse(200, body);
  } catch (err) {
    if (err instanceof VenueNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to list parties" });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireStaffUser(context);
  if ("error" in auth) {
    return auth.error;
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const parsed = createPartySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, { error: "Validation failed", details: z.treeifyError(parsed.error) });
  }

  try {
    const party = await createParty(auth.supabase, parsed.data);
    const response: CreatePartyResponse = { party };
    return jsonResponse(201, response);
  } catch (err) {
    if (err instanceof VenueNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to create party" });
  }
};
