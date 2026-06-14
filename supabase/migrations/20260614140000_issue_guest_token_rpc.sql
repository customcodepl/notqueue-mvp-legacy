-- Atomic guest token issue/reissue (S-02 review fix)

CREATE OR REPLACE FUNCTION issue_guest_token(p_party_id uuid, p_token text)
RETURNS guest_tokens
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_party_status party_status;
  v_result guest_tokens;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'guest token is required';
  END IF;

  SELECT status
  INTO v_party_status
  FROM parties
  WHERE id = p_party_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'party not found';
  END IF;

  IF v_party_status <> 'waiting' THEN
    RAISE EXCEPTION 'action not allowed for current party status';
  END IF;

  UPDATE guest_tokens
  SET revoked_at = now()
  WHERE party_id = p_party_id
    AND revoked_at IS NULL;

  INSERT INTO guest_tokens (party_id, token)
  VALUES (p_party_id, p_token)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION issue_guest_token(uuid, text) TO authenticated;
