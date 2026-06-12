import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonResponse, requireStaffUser } from "@/lib/api";
import { InvalidPartyStateError, PartyNotFoundError, updatePartyEta } from "@/lib/services/parties";
import type { PartyMutationResponse } from "@/types";

export const prerender = false;

const partyIdSchema = z.uuid();

const updatePartyEtaSchema = z.object({
  eta_minutes: z.number().int().min(1).max(999).nullable(),
});

export const PATCH: APIRoute = async (context) => {
  const auth = await requireStaffUser(context);
  if ("error" in auth) {
    return auth.error;
  }

  const parsedPartyId = partyIdSchema.safeParse(context.params.partyId);
  if (!parsedPartyId.success) {
    return jsonResponse(404, { error: "Party not found" });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const parsed = updatePartyEtaSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, { error: "Validation failed", details: z.treeifyError(parsed.error) });
  }

  try {
    const party = await updatePartyEta(auth.supabase, parsedPartyId.data, parsed.data.eta_minutes);
    const response: PartyMutationResponse = { party };
    return jsonResponse(200, response);
  } catch (err) {
    if (err instanceof PartyNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    if (err instanceof InvalidPartyStateError) {
      return jsonResponse(409, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to update party ETA" });
  }
};
