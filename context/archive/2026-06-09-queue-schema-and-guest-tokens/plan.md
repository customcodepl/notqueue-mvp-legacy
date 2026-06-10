# Queue Schema and Guest Tokens Implementation Plan

## Overview

Establish the NotQueue data foundation (roadmap F-01): Supabase tables for venues, queue parties, venue settings, and guest tokens, with RLS that lets authenticated staff manage the queue and lets unauthenticated guests read only their own party. This change is migrations + types + seed only — no API routes or UI. It unblocks S-01 through S-05.

## Current State Analysis

- **Database:** `supabase/config.toml` exists; `supabase/migrations/` does not. No custom schema beyond Supabase Auth `auth.users`.
- **Application:** Cookie-based SSR auth via `src/lib/supabase.ts` and `src/middleware.ts`; only `/api/auth/*` endpoints. Worker uses anon key (not service_role).
- **Types:** `src/types.ts` referenced in AGENTS.md but not created yet.
- **Product spec:** PRD defines party-scoped guest tokens, staff-as-source-of-truth, manual nullable ETA, and privacy boundary. Roadmap marks guest-token design as the F-01 blocker for S-05.

## Desired End State

After F-01, a developer can run `npx supabase db reset` locally and get:

1. Four tables (`venues`, `venue_settings`, `parties`, `guest_tokens`) with enums, indexes, and `updated_at` triggers.
2. RLS enabled on all tables: staff (`authenticated`) can manage queue data; anon role cannot read queue data without a valid guest token context.
3. `set_guest_context(token)` RPC plus guest SELECT policies scoped by `app.guest_token`.
4. `get_guest_party_view(token)` RPC as the canonical single-transaction guest read path (party + venue settings).
5. `src/types.ts` with entity types matching the schema.
6. `supabase/seed.sql` with one demo venue, settings, waiting party, and active guest token.
7. `parties` added to `supabase_realtime` publication for downstream S-05 subscriptions.

### Key Discoveries:

- `src/lib/supabase.ts:5-24` — SSR client uses anon key; guest access must not require service_role on the Worker.
- `supabase/config.toml:65` — seed path `./seed.sql` is configured but the file is missing.
- Roadmap unknown (guest token table vs signed URL) is resolved: opaque token table with revocation on reissue.
- Supabase pooler uses transaction-scoped connections — `set_config(..., true)` does not persist across separate HTTP requests from the JS client.

## What We're NOT Doing

- Staff UI or API endpoints (S-01, S-02, S-03, S-04).
- Guest status page or Realtime subscription wiring (S-05).
- SMS notifications (FR-014, parked).
- Multi-location / franchise model (PRD non-goal).
- `staff_venue_membership` table — MVP assumes any authenticated user manages the single seeded venue.
- Custom JWT minting for guests (deferred to S-05 if Realtime requires it).
- README overhaul beyond a brief note that migrations are now required.

## Implementation Approach

Two ordered migrations (schema → RLS/RPCs), then TypeScript types and seed data. Staff access uses standard `auth.uid() IS NOT NULL` policies. Guest access uses a `guest_tokens` table with opaque random tokens; RLS policies match `current_setting('app.guest_token', true)` after `set_guest_context` is called. Because PostgREST requests are transaction-scoped, guest reads that need RLS context must use the combined `get_guest_party_view(token)` RPC (single transaction) — direct `from('parties').select()` after a separate `set_guest_context` call will not work.

## Critical Implementation Details

**Transaction-scoped guest context:** `set_config('app.guest_token', …, true)` is local to the current transaction. The Supabase JS client's `.rpc('set_guest_context')` followed by `.from('parties').select()` in a second call uses two HTTP requests and two transactions — the context is lost. F-01 ships `get_guest_party_view(p_token)` that validates the token, sets context, and returns the party row plus venue settings in one function. RLS policies remain as defense-in-depth; S-05 should call the combined RPC (or replicate the same single-transaction pattern).

**One active token per party:** Enforce via partial unique index `ON guest_tokens (party_id) WHERE revoked_at IS NULL`. Reissue sets `revoked_at = now()` on the old row and inserts a new token row.

## Phase 1: Core Schema Migration

### Overview

Create the queue data model: enums, tables, foreign keys, indexes, `updated_at` triggers, and Realtime publication on `parties`.

### Changes Required:

#### 1. Schema migration file

**File**: `supabase/migrations/20260609120000_queue_schema.sql`

**Intent**: Define the NotQueue domain tables and supporting database objects. This is the first migration in the repo and establishes naming conventions for all downstream slices.

**Contract**:
- Enum `party_status`: `waiting`, `ready`, `seated`.
- Table `venues`: `id` (uuid PK), `name` (text not null), `created_at`, `updated_at`.
- Table `venue_settings`: `venue_id` (uuid PK, FK → venues), `menu_link` (text nullable), `info_text` (text nullable), `updated_at`.
- Table `parties`: `id` (uuid PK), `venue_id` (FK → venues), `display_name` (text not null), `party_size` (int not null, check > 0), `position` (int nullable — null when `seated`), `eta_minutes` (int nullable — null means unknown per PRD), `status` (`party_status` not null default `waiting`), `created_at`, `updated_at`.
- Table `guest_tokens`: `id` (uuid PK), `party_id` (FK → parties on delete cascade), `token` (text not null unique), `created_at`, `revoked_at` (timestamptz nullable).
- Partial unique index: one active token per party (`party_id` WHERE `revoked_at IS NULL`).
- Indexes: `parties(venue_id, status, position)` for staff queue listing; `guest_tokens(token)` WHERE `revoked_at IS NULL` for token lookup.
- Reusable `updated_at` trigger function + `BEFORE UPDATE` triggers on `venues`, `venue_settings`, `parties`.
- `ALTER PUBLICATION supabase_realtime ADD TABLE parties` for downstream live updates.

#### 2. Config reference fix (optional, same phase)

**File**: `README.md` (Supabase Configuration section only)

**Intent**: Remove the stale statement that no migrations are required, so new contributors know F-01 schema is part of local setup.

**Contract**: One sentence noting `supabase/migrations/` and `npx supabase db reset` for local schema + seed.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` completes without SQL errors (requires local Supabase/Docker running)
- `\dt` in local psql shows `venues`, `venue_settings`, `parties`, `guest_tokens`
- `party_status` enum exists with three values

#### Manual Verification:

- Inspect migration SQL: all FKs have explicit `ON DELETE` behavior (`cascade` on guest_tokens → parties)
- Confirm `parties` appears in `supabase_realtime` publication via Studio or `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: RLS and Guest Context

### Overview

Enable row-level security, add staff management policies, guest token-scoped read policies, and SECURITY DEFINER RPCs for guest context and reads.

### Changes Required:

#### 1. RLS migration file

**File**: `supabase/migrations/20260609120100_queue_rls.sql`

**Intent**: Enforce PRD access control at the database layer — staff manage, guests read only their party, anon cannot enumerate the queue.

**Contract**:
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all four tables.
- **Staff policies** (role `authenticated`, `auth.uid() IS NOT NULL`):
  - `venues`: SELECT, UPDATE.
  - `venue_settings`: SELECT, INSERT, UPDATE.
  - `parties`: SELECT, INSERT, UPDATE, DELETE.
  - `guest_tokens`: SELECT, INSERT, UPDATE (for reissue revocation).
- **Anon policies**: default deny (no broad grants). Guest SELECT on `parties` and `venue_settings` only when an active `guest_tokens` row matches `current_setting('app.guest_token', true)` and joins to the party/venue.
- Function `set_guest_context(p_token text) RETURNS void`, `SECURITY DEFINER`, `SET search_path = public`: validates token exists and is not revoked; calls `set_config('app.guest_token', p_token, true)`.
- Function `get_guest_party_view(p_token text) RETURNS json`, `SECURITY DEFINER`, `SET search_path = public`: calls `set_guest_context`, then returns JSON with party fields (`display_name`, `party_size`, `position`, `eta_minutes`, `status`) and venue settings (`menu_link`, `info_text`). This is the canonical guest read contract.
- Grant `EXECUTE` on both functions to `anon` and `authenticated`.
- Revoke direct `INSERT`/`UPDATE`/`DELETE` on all tables from `anon`.

#### 2. RLS verification script (optional helper)

**File**: `supabase/tests/rls_smoke.sql` (or inline comments in migration)

**Intent**: Document manual SQL assertions implementers can run to verify policies without building S-05 UI.

**Contract**: SQL snippets that assert: (a) anon `SELECT` on `parties` returns 0 rows without context, (b) `get_guest_party_view(seed_token)` returns the seeded party, (c) revoked token returns error/empty.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies both migrations cleanly (schema + RLS)
- `npx supabase db lint` passes if available in CLI version

#### Manual Verification:

- As `anon` role: `SELECT * FROM parties` returns zero rows
- `SELECT get_guest_party_view('<seed-token>')` returns seeded party JSON with venue settings
- Same call with a revoked/invalid token fails or returns null
- As `authenticated` role (test user via Studio): `SELECT * FROM parties` returns all parties for the venue

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: TypeScript Types and Seed Data

### Overview

Expose typed contracts for downstream slices and provide local dev fixtures for manual RLS testing.

### Changes Required:

#### 1. Shared entity types

**File**: `src/types.ts`

**Intent**: Give S-01–S-05 a single source of truth for queue entity shapes, matching the database schema.

**Contract**:
- `PartyStatus` type: `'waiting' | 'ready' | 'seated'`.
- `Venue`, `VenueSettings`, `Party`, `GuestToken` interfaces with fields mirroring migration columns (uuid fields as `string`, timestamps as `string`, nullable fields marked optional or `| null`).
- `GuestPartyView` interface matching the JSON shape returned by `get_guest_party_view` (party fields + nested or flat venue settings).

#### 2. Seed data

**File**: `supabase/seed.sql`

**Intent**: Provide a reproducible local dataset so developers can test RLS and downstream slices without manually inserting rows.

**Contract**:
- Insert one venue: "Demo Restaurant".
- Insert `venue_settings` with sample `menu_link` and `info_text`.
- Insert one `waiting` party (e.g. "Smith", party_size 4, position 1, eta_minutes 15).
- Insert one active `guest_tokens` row with a fixed known token string (e.g. `demo-guest-token-local-only`) for manual `get_guest_party_view` testing.

#### 3. Lint integration

**File**: `src/types.ts` (no other files)

**Intent**: Ensure new types pass existing ESLint/TypeScript checks.

**Contract**: File exports only types/interfaces (no runtime code); compatible with `eslint.config.js` strict TypeScript rules.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` loads seed without errors
- `npx astro sync && npm run lint` passes
- `SUPABASE_URL=… SUPABASE_KEY=… npm run build` passes (types do not break build)

#### Manual Verification:

- `get_guest_party_view('demo-guest-token-local-only')` returns "Smith" party with position 1 after reset
- `src/types.ts` fields match `\d parties` / `\d guest_tokens` column list in local Studio

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No automated test suite in repo. Schema correctness is verified via migration apply + lint.

### Integration Tests:

- `npx supabase db reset` end-to-end: migrations → seed → RPC smoke queries.
- Manual RLS matrix: anon denied, guest token allowed, staff full access.

### Manual Testing Steps:

1. `npx supabase start` (if not running).
2. `npx supabase db reset` — confirm zero errors.
3. In Studio SQL editor (anon): `SELECT * FROM parties` → empty.
4. `SELECT get_guest_party_view('demo-guest-token-local-only')` → party JSON.
5. Create test staff user, sign in via app, confirm `authenticated` can `SELECT` parties via Studio with user JWT.
6. Revoke seed token (`UPDATE guest_tokens SET revoked_at = now()`), confirm guest RPC returns nothing.

## Performance Considerations

- Partial indexes on active tokens and queue listing keep lookups O(1) per token and O(n) per venue queue — acceptable for single-restaurant MVP (tens of parties, not thousands).
- `get_guest_party_view` is a single indexed lookup + join — sub-millisecond at MVP scale.
- Realtime publication on `parties` only; venue_settings changes are rare (S-04) and can use party-triggered refresh or separate subscription later.

## Migration Notes

- **Local:** `npx supabase db reset` applies migrations and seed. Requires Docker for `supabase start`.
- **Remote:** `npx supabase db push` when linking a cloud project — run once after review. Wrangler rollback does not revert Supabase migrations; keep migrations backward-compatible (additive only).
- **Ordering:** Phase 1 migration must land before Phase 2. Do not squash after push to remote.

## References

- PRD: `context/foundation/prd.md` — Business Logic, Access Control, NFR privacy
- Roadmap F-01: `context/foundation/roadmap.md`
- Auth client: `src/lib/supabase.ts`
- Repo migration conventions: `CLAUDE.md`, `AGENTS.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Core Schema Migration

#### Automated

- [x] 1.1 `npx supabase db reset` completes without SQL errors — 2d5443e
- [x] 1.2 Local psql shows venues, venue_settings, parties, guest_tokens tables — 2d5443e
- [x] 1.3 party_status enum exists with waiting, ready, seated values — 2d5443e

#### Manual

- [x] 1.4 FK ON DELETE behavior and supabase_realtime publication on parties verified — 2d5443e

### Phase 2: RLS and Guest Context

#### Automated

- [x] 2.1 `npx supabase db reset` applies both migrations cleanly — 1d8cb6c
- [x] 2.2 `npx supabase db lint` passes if available — 1d8cb6c

#### Manual

- [x] 2.3 Anon SELECT on parties returns zero rows without guest context — 1d8cb6c
- [x] 2.4 get_guest_party_view with seed token returns party JSON — 1d8cb6c
- [x] 2.5 Invalid/revoked token rejected; authenticated staff can SELECT all parties — 1d8cb6c

### Phase 3: TypeScript Types and Seed Data

#### Automated

- [x] 3.1 `npx supabase db reset` loads seed without errors — 01c3e7e
- [x] 3.2 `npx astro sync && npm run lint` passes — 01c3e7e
- [x] 3.3 `SUPABASE_URL=… SUPABASE_KEY=… npm run build` passes — 01c3e7e

#### Manual

- [x] 3.4 get_guest_party_view returns seeded Smith party after reset — 01c3e7e
- [x] 3.5 src/types.ts fields match Studio column list — 01c3e7e
