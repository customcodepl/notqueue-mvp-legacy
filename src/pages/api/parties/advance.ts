import type { APIRoute } from "astro";
import { jsonResponse, requireStaffUser } from "@/lib/api";
import { EmptyQueueError, VenueNotFoundError, advanceQueue } from "@/lib/services/parties";
import type { AdvanceQueueResponse } from "@/types";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireStaffUser(context);
  if ("error" in auth) {
    return auth.error;
  }

  try {
    const party = await advanceQueue(auth.supabase);
    const body: AdvanceQueueResponse = { party };
    return jsonResponse(200, body);
  } catch (err) {
    if (err instanceof EmptyQueueError) {
      return jsonResponse(409, { error: err.message });
    }
    if (err instanceof VenueNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to advance queue" });
  }
};
