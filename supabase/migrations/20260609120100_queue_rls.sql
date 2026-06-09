-- NotQueue RLS and guest context (F-01 Phase 2)

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_tokens ENABLE ROW LEVEL SECURITY;

-- Staff (authenticated): manage queue for MVP single-venue setup
CREATE POLICY staff_select_venues
  ON venues
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY staff_update_venues
  ON venues
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY staff_select_venue_settings
  ON venue_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY staff_insert_venue_settings
  ON venue_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY staff_update_venue_settings
  ON venue_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY staff_select_parties
  ON parties
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY staff_insert_parties
  ON parties
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY staff_update_parties
  ON parties
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY staff_delete_parties
  ON parties
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY staff_select_guest_tokens
  ON guest_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY staff_insert_guest_tokens
  ON guest_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY staff_update_guest_tokens
  ON guest_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION guest_can_view_party(p_party_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM guest_tokens gt
    WHERE gt.party_id = p_party_id
      AND gt.token = current_setting('app.guest_token', true)
      AND gt.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION guest_can_view_venue_settings(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM parties p
    INNER JOIN guest_tokens gt ON gt.party_id = p.id
    WHERE p.venue_id = p_venue_id
      AND gt.token = current_setting('app.guest_token', true)
      AND gt.revoked_at IS NULL
  );
$$;

-- Guest (anon): read-only, scoped by active guest token in transaction context
CREATE POLICY guest_select_parties
  ON parties
  FOR SELECT
  TO anon
  USING (guest_can_view_party(id));

CREATE POLICY guest_select_venue_settings
  ON venue_settings
  FOR SELECT
  TO anon
  USING (guest_can_view_venue_settings(venue_id));

CREATE OR REPLACE FUNCTION set_guest_context(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'guest token is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM guest_tokens
    WHERE token = p_token
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid or revoked guest token';
  END IF;

  PERFORM set_config('app.guest_token', p_token, true);
END;
$$;

CREATE OR REPLACE FUNCTION get_guest_party_view(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  PERFORM set_guest_context(p_token);

  SELECT json_build_object(
    'display_name', p.display_name,
    'party_size', p.party_size,
    'position', p.position,
    'eta_minutes', p.eta_minutes,
    'status', p.status,
    'menu_link', vs.menu_link,
    'info_text', vs.info_text
  )
  INTO result
  FROM guest_tokens gt
  INNER JOIN parties p ON p.id = gt.party_id
  LEFT JOIN venue_settings vs ON vs.venue_id = p.venue_id
  WHERE gt.token = p_token
    AND gt.revoked_at IS NULL;

  RETURN result;
END;
$$;

REVOKE ALL ON TABLE venues FROM anon;
REVOKE ALL ON TABLE venue_settings FROM anon;
REVOKE ALL ON TABLE parties FROM anon;
REVOKE ALL ON TABLE guest_tokens FROM anon;

GRANT SELECT ON TABLE parties TO anon;
GRANT SELECT ON TABLE venue_settings TO anon;

GRANT EXECUTE ON FUNCTION guest_can_view_party(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION guest_can_view_venue_settings(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_guest_context(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_guest_party_view(text) TO anon, authenticated;
