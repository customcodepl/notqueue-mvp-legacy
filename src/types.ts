export type PartyStatus = "waiting" | "ready" | "seated";

export interface Venue {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface VenueSettings {
  venue_id: string;
  menu_link: string | null;
  info_text: string | null;
  updated_at: string;
}

export interface Party {
  id: string;
  venue_id: string;
  display_name: string;
  party_size: number;
  position: number | null;
  eta_minutes: number | null;
  status: PartyStatus;
  created_at: string;
  updated_at: string;
}

export interface GuestToken {
  id: string;
  party_id: string;
  token: string;
  created_at: string;
  revoked_at: string | null;
}

export interface GuestPartyView {
  display_name: string;
  party_size: number;
  position: number | null;
  eta_minutes: number | null;
  status: PartyStatus;
  menu_link: string | null;
  info_text: string | null;
}

export interface CreatePartyInput {
  display_name: string;
  party_size: number;
}

export interface CreatePartyResponse {
  party: Party;
}

export interface PartyListResponse {
  parties: Party[];
}
