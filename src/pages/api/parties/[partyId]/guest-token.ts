import type { APIRoute } from "astro";
import { z } from "zod";
import { guestUrlFromRequest, jsonResponse, requireStaffUser } from "@/lib/api";
import { InvalidPartyStateError, PartyNotFoundError } from "@/lib/services/parties";
import { getActiveGuestToken, issueGuestToken } from "@/lib/services/guestTokens";
import type { GuestTokenResponse } from "@/types";

export const prerender = false;

const partyIdSchema = z.uuid();

function toGuestTokenResponse(request: Request, token: string): GuestTokenResponse {
  return {
    token,
    guest_url: guestUrlFromRequest(request, token),
  };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireStaffUser(context);
  if ("error" in auth) {
    return auth.error;
  }

  const parsedPartyId = partyIdSchema.safeParse(context.params.partyId);
  if (!parsedPartyId.success) {
    return jsonResponse(404, { error: "Party not found" });
  }

  try {
    const activeToken = await getActiveGuestToken(auth.supabase, parsedPartyId.data);
    if (!activeToken) {
      return jsonResponse(404, { error: "No active guest token" });
    }

    return jsonResponse(200, toGuestTokenResponse(context.request, activeToken.token));
  } catch (err) {
    if (err instanceof PartyNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to load guest token" });
  }
};

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
    const guestToken = await issueGuestToken(auth.supabase, parsedPartyId.data);
    return jsonResponse(201, toGuestTokenResponse(context.request, guestToken.token));
  } catch (err) {
    if (err instanceof PartyNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    if (err instanceof InvalidPartyStateError) {
      return jsonResponse(409, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to issue guest token" });
  }
};
