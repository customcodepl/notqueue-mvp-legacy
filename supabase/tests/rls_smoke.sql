-- Assertive RLS smoke (run after seed: npx supabase db reset)
-- Usage: npx supabase db query --file supabase/tests/rls_smoke.sql

SET ROLE anon;

-- (a) Anon cannot list parties without guest context
DO $$
DECLARE
  party_count integer;
BEGIN
  SELECT count(*) INTO party_count FROM parties;
  IF party_count <> 0 THEN
    RAISE EXCEPTION 'anon party count expected 0, got %', party_count;
  END IF;
END $$;

-- (b) Guest RPC returns only the seeded party
DO $$
DECLARE
  view json;
BEGIN
  view := get_guest_party_view('demo-guest-token-local-only');
  IF view->>'display_name' IS DISTINCT FROM 'Smith' THEN
    RAISE EXCEPTION 'expected display_name Smith, got %', view;
  END IF;
  IF (view->>'party_size')::integer IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'expected party_size 4, got %', view;
  END IF;
END $$;

-- (c) Wrong token must not return a party
DO $$
BEGIN
  PERFORM get_guest_party_view('not-a-real-token');
  RAISE EXCEPTION 'expected invalid token to error';
EXCEPTION
  WHEN others THEN
    IF SQLERRM NOT LIKE '%invalid or revoked guest token%' THEN
      RAISE;
    END IF;
END $$;

RESET ROLE;
