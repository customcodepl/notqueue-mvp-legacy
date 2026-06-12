import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultVenueId } from "@/lib/services/parties";
import type { UpdateVenueSettingsInput, VenueSettings } from "@/types";

const venueSettingsSelect = "venue_id, menu_link, info_text, updated_at";

export async function getVenueSettings(supabase: SupabaseClient): Promise<VenueSettings> {
  const venueId = await getDefaultVenueId(supabase);

  const response = await supabase
    .from("venue_settings")
    .select(venueSettingsSelect)
    .eq("venue_id", venueId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  if (response.data) {
    return response.data;
  }

  return {
    venue_id: venueId,
    menu_link: null,
    info_text: null,
    updated_at: new Date(0).toISOString(),
  };
}

export async function upsertVenueSettings(
  supabase: SupabaseClient,
  input: UpdateVenueSettingsInput,
): Promise<VenueSettings> {
  const venueId = await getDefaultVenueId(supabase);

  const existing = await supabase.from("venue_settings").select("venue_id").eq("venue_id", venueId).maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const payload = {
    menu_link: input.menu_link,
    info_text: input.info_text,
  };

  const response = existing.data
    ? await supabase.from("venue_settings").update(payload).eq("venue_id", venueId).select(venueSettingsSelect).single()
    : await supabase
        .from("venue_settings")
        .insert({ venue_id: venueId, ...payload })
        .select(venueSettingsSelect)
        .single();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}
