-- NotQueue queue schema (F-01 Phase 1)

CREATE TYPE party_status AS ENUM ('waiting', 'ready', 'seated');

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venue_settings (
  venue_id uuid PRIMARY KEY REFERENCES venues (id) ON DELETE CASCADE,
  menu_link text,
  info_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  party_size int NOT NULL CHECK (party_size > 0),
  position int,
  eta_minutes int,
  status party_status NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX guest_tokens_one_active_per_party ON guest_tokens (party_id) WHERE revoked_at IS NULL;

CREATE INDEX parties_venue_status_position_idx ON parties (venue_id, status, position);

CREATE INDEX guest_tokens_token_active_idx ON guest_tokens (token) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER venues_set_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER venue_settings_set_updated_at
  BEFORE UPDATE ON venue_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER parties_set_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE parties;
