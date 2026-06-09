-- Manual RLS smoke checks (run after Phase 3 seed data exists)
-- Usage: npx supabase db query --file supabase/tests/rls_smoke.sql

-- (a) Anon cannot list parties without guest context
SET ROLE anon;
SELECT count(*) AS anon_party_count FROM parties;
RESET ROLE;

-- (b) Guest RPC returns seeded party (requires demo-guest-token-local-only from seed.sql)
SELECT get_guest_party_view('demo-guest-token-local-only');

-- (c) Revoked token should error
-- UPDATE guest_tokens SET revoked_at = now() WHERE token = 'demo-guest-token-local-only';
-- SELECT get_guest_party_view('demo-guest-token-local-only');
