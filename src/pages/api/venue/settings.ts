import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonResponse, requireStaffUser } from "@/lib/api";
import { VenueNotFoundError } from "@/lib/services/parties";
import { getVenueSettings, upsertVenueSettings } from "@/lib/services/venueSettings";
import type { VenueSettingsResponse } from "@/types";

export const prerender = false;

const updateVenueSettingsSchema = z.object({
  menu_link: z.union([z.url(), z.literal(""), z.null()]),
  info_text: z.union([z.string().max(500), z.literal(""), z.null()]),
});

function normalizeNullableString(value: string | null): string | null {
  if (value === "") {
    return null;
  }
  return value;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireStaffUser(context);
  if ("error" in auth) {
    return auth.error;
  }

  try {
    const settings = await getVenueSettings(auth.supabase);
    const body: VenueSettingsResponse = { settings };
    return jsonResponse(200, body);
  } catch (err) {
    if (err instanceof VenueNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to load venue settings" });
  }
};

export const PATCH: APIRoute = async (context) => {
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

  const parsed = updateVenueSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, { error: "Validation failed", details: z.treeifyError(parsed.error) });
  }

  try {
    const settings = await upsertVenueSettings(auth.supabase, {
      menu_link: normalizeNullableString(parsed.data.menu_link),
      info_text: normalizeNullableString(parsed.data.info_text),
    });
    const response: VenueSettingsResponse = { settings };
    return jsonResponse(200, response);
  } catch (err) {
    if (err instanceof VenueNotFoundError) {
      return jsonResponse(404, { error: err.message });
    }
    return jsonResponse(500, { error: "Failed to update venue settings" });
  }
};
