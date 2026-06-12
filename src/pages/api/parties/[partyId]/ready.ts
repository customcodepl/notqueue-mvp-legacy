import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonResponse, requireStaffUser } from "@/lib/api";
import { InvalidPartyStateError, PartyNotFoundError, markPartyReady } from "@/lib/services/parties";
import type { PartyMutationResponse } from "@/types";

export const prerender = false;

const partyIdSchema = z.uuid();

export const POST: APIRoute = async (context) => {
  const auth = await requireStaffUser(context);
  if ("error" in auth) {
    return auth.error;
  }

  const parsedPartyId = partyIdSchema.safeParse(context.params.partyId);
  if (!parsedPartyId.success) {
    return jsonResponse(404, { error: "Party not found" });
  }

  try {
    const party = await markPartyReady(auth.supabase, parsedPartyId.data);
    const response: PartyMutationResponse = { party };
    return jsonResponse(200, response);
  } catch (err) {
    if (err instanceof PartyNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    if (err instanceof InvalidPartyStateError) {
      return jsonResponse(409, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to mark party ready" });
  }
};
