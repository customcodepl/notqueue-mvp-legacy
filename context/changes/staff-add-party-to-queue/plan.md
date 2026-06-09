# Staff Add Party to Queue Implementation Plan

## Overview

Deliver roadmap slice S-01: authenticated staff can add a waiting party (display name, party size) to the restaurant queue and see the waiting list on `/dashboard`. Builds on F-01 (`parties` table, staff RLS INSERT, `src/types.ts`, seed data). Establishes the first queue API routes and the staff operational UI that S-02 and S-03 extend.

## Current State Analysis

- **Database (F-01):** `parties` table with `display_name`, `party_size`, `position` (nullable int), `status` (default `waiting`), `venue_id` FK. Staff INSERT policy: `auth.uid() IS NOT NULL`. No DB trigger assigns position — application responsibility.
- **Seed:** One venue (`Demo Restaurant`), one waiting party (`Smith`, position 1, party_size 4) at `supabase/seed.sql`.
- **Auth:** `src/middleware.ts` protects `/dashboard` prefix; sets `context.locals.user`. Sign-in API redirects to `/` (`src/pages/api/auth/signin.ts:19`).
- **Dashboard:** Placeholder welcome + sign-out (`src/pages/dashboard.astro`) — no queue UI.
- **API:** Only `src/pages/api/auth/*`. No `zod` in `package.json` dependencies. Auth routes omit `prerender = false` and zod (legacy); queue routes must follow `CLAUDE.md` conventions.
- **UI patterns:** Auth uses React islands with `FormField`, `SubmitButton`, `ServerError`, manual `useState` validation (`src/components/auth/SignInForm.tsx`). shadcn `Button` only; cosmic glass Tailwind styling.

### Key Discoveries:

- `src/types.ts:17-27` — `Party` interface ready; no request/response DTOs yet.
- `supabase/migrations/20260609120100_queue_rls.sql:47-51` — authenticated staff can INSERT parties without venue membership check (MVP single-venue).
- `src/lib/` has only `supabase.ts`, `utils.ts`, `config-status.ts` — no services layer yet.
- Middleware does **not** protect `/api/*` — queue handlers must verify auth in-handler.

## Desired End State

1. Staff signs in and lands on `/dashboard`.
2. Dashboard shows an add-party form (name + size) and a list of waiting parties ordered by position.
3. Submitting the form calls `POST /api/parties` (JSON, zod-validated, auth-required); server appends position (`max + 1`), inserts row with `status = 'waiting'`, `eta_minutes = null`.
4. On success, form clears and list refreshes via `GET /api/parties` without full page reload.
5. `npm run lint` and `npm run build` pass with `zod` added as a runtime dependency.

## What We're NOT Doing

- Issuing guest tokens or QR codes (S-02).
- Advancing queue, setting ETA, marking ready, or editing/removing parties (S-03).
- Venue settings configuration UI (S-04).
- Supabase Realtime subscriptions on the dashboard (S-05).
- `staff_venue_membership` or multi-venue picker.
- Required ETA on add; optional ETA field.
- Database migration changes (F-01 schema is sufficient).
- Retrofitting auth routes to zod/JSON (out of S-01 scope).

## Implementation Approach

Three incremental phases: API + service layer first (testable via curl/fetch), then dashboard React island consuming the API, then sign-in redirect polish. Position assignment lives in a small `src/lib/services/parties.ts` helper used by the POST handler. Venue resolved at runtime by selecting the earliest-created venue row. List endpoint filters `status = 'waiting'` and orders by `position ASC NULLS LAST`.

## Critical Implementation Details

**API auth is handler-enforced:** `PROTECTED_ROUTES` in middleware covers pages only. Every `/api/parties` handler must call `supabase.auth.getUser()` (or read `context.locals.user` set by middleware on the same request) and return `401` JSON if absent.

**Position append race:** Two concurrent POSTs may read the same `MAX(position)` and insert duplicate positions. Acceptable for single-host MVP; S-03 may add reorder logic or a DB constraint if this surfaces.

## Phase 1: API Foundation

### Overview

Add `zod`, party service helpers, and authenticated `GET`/`POST /api/parties` endpoints with validation and append-position logic.

### Changes Required:

#### 1. Runtime dependency

**File**: `package.json`

**Intent**: Add `zod` as a direct runtime dependency so queue API routes can validate request bodies per repo rules.

**Contract**: `"zod"` in `dependencies`; lockfile updated via `npm install`.

#### 2. Request/response DTO types

**File**: `src/types.ts`

**Intent**: Extend shared types with the API contracts S-01 exposes, keeping entity types unchanged.

**Contract**:
- `CreatePartyInput`: `{ display_name: string; party_size: number }`.
- `CreatePartyResponse`: `{ party: Party }` (or equivalent single-party payload).
- `PartyListResponse`: `{ parties: Party[] }` — list items are full `Party` rows or a slim `PartyListItem` if the implementer prefers fewer fields (must include `id`, `display_name`, `party_size`, `position`, `status`).

#### 3. Party service helpers

**File**: `src/lib/services/parties.ts`

**Intent**: Centralize venue resolution, position calculation, and Supabase mutations so the API route stays thin and S-03 can reuse helpers.

**Contract**:
- `getDefaultVenueId(supabase)`: `SELECT id FROM venues ORDER BY created_at ASC LIMIT 1`; throws or returns error type if zero rows.
- `getNextPosition(supabase, venueId)`: `MAX(position)` over `parties` where `venue_id = venueId` AND `status = 'waiting'`; returns `(max ?? 0) + 1`.
- `createParty(supabase, input)`: resolves venue, computes position, inserts `{ venue_id, display_name, party_size, position, status: 'waiting', eta_minutes: null }`, returns inserted `Party`.
- `listWaitingParties(supabase, venueId)`: selects parties where `venue_id = venueId` AND `status = 'waiting'`, ordered by `position ASC NULLS LAST`, `created_at ASC`.

#### 4. Parties API route

**File**: `src/pages/api/parties.ts`

**Intent**: Establish the canonical queue API pattern for all downstream slices.

**Contract**:
- `export const prerender = false`.
- Shared helper `requireStaffUser(context)` → `{ supabase, user }` or `401` JSON `{ error: string }`.
- `POST`: parse JSON body with zod (`display_name`: trim, min 1, max 100; `party_size`: int, min 1, max 99 or similar); call `createParty`; return `201` + `CreatePartyResponse`; map validation errors to `400`, missing venue to `404` or `503`, Supabase errors to `500` with safe message.
- `GET`: call `listWaitingParties` for default venue; return `200` + `PartyListResponse`.
- Content-Type `application/json` on all responses.

### Success Criteria:

#### Automated Verification:

- `npm install` completes; `package-lock.json` includes `zod`
- `npx astro sync && npm run lint` passes
- `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set

#### Manual Verification:

- Unauthenticated `POST /api/parties` returns `401`
- Authenticated `POST` with `{ "display_name": "Jones", "party_size": 2 }` inserts row with `position = 2` (after seed Smith at 1) and `eta_minutes = null`
- Authenticated `GET /api/parties` returns waiting parties ordered by position
- Invalid body (empty name, party_size 0) returns `400`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard Queue UI

### Overview

Replace the dashboard placeholder with a React island: add-party form (fetch + JSON) and waiting-party list that loads on mount and refreshes after each successful add.

### Changes Required:

#### 1. Queue dashboard React component

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Staff-facing operational UI for S-01 — add party and view waiting queue.

**Contract**:
- On mount: `GET /api/parties` with credentials; show loading and error states.
- Form fields: `display_name` (text), `party_size` (number input, min 1).
- Client validation mirrors server rules (required name, party_size ≥ 1) using the same pattern as `SignInForm` (`useState` + `validate()` + `FormField` + `SubmitButton`).
- Submit: `POST /api/parties` with `Content-Type: application/json`, `credentials: 'include'`; on success clear form and re-fetch list; on error show inline message (reuse or adapt `ServerError`).
- List: render each waiting party with position, display name, party size (and status badge optional). Empty state when no parties.
- Styling: cosmic glass / purple accents consistent with auth pages and current dashboard.

#### 2. Optional fetch hook

**File**: `src/components/hooks/useQueueParties.ts`

**Intent**: Extract list fetch + refresh logic if the dashboard component grows; optional — inline fetch in `QueueDashboard` is acceptable if under ~150 lines.

**Contract**: Returns `{ parties, loading, error, refresh, addParty }` or equivalent; uses `fetch` with credentials against `/api/parties`.

#### 3. Dashboard page wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Mount the queue UI for authenticated staff; keep layout shell and sign-out affordance.

**Contract**:
- Import `QueueDashboard`; render with `client:load`.
- Pass `user` email in header/welcome line above the island (existing pattern).
- Page remains protected by middleware (no change to `PROTECTED_ROUTES` needed).

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Signed-in staff opens `/dashboard`, sees seed party (Smith) in waiting list
- Adding "Jones" / 2 appends at position 2; form clears; list updates without full reload
- Validation errors show inline without network call when fields invalid
- Sign-out still works from dashboard

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Auth Redirect Polish

### Overview

Send staff to the queue dashboard immediately after sign-in.

### Changes Required:

#### 1. Sign-in redirect target

**File**: `src/pages/api/auth/signin.ts`

**Intent**: After successful password sign-in, land staff on `/dashboard` instead of marketing home.

**Contract**: Change success redirect from `/` to `/dashboard` (line ~19). Error redirects unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes

#### Manual Verification:

- Staff signs in from `/auth/signin` and arrives on `/dashboard` with queue UI visible
- Unauthenticated access to `/dashboard` still redirects to sign-in

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No automated test suite in repo; S-01 relies on lint + build + manual API/UI verification per project conventions.

### Integration Tests:

- Manual authenticated `GET`/`POST /api/parties` via browser DevTools or curl with session cookie after sign-in.

### Manual Testing Steps:

1. `npx supabase db reset` — confirm seed Smith party exists.
2. Create staff user (or use existing), sign in → lands on `/dashboard`.
3. Verify list shows Smith at position 1.
4. Add party "Test" size 3 → appears at position 2, form cleared.
5. Sign out; attempt `POST /api/parties` → 401.
6. `npm run lint && npm run build` in CI-equivalent env.

## Performance Considerations

- List + add are small datasets (single venue, dozens of parties). No pagination in S-01.
- Two round-trips on add (POST + GET refresh) acceptable; Realtime (S-05) not needed on staff dashboard yet.

## Migration Notes

- No new migrations. Requires F-01 applied (`npx supabase db reset` locally; push migrations to remote before deploy).
- Deploy order: migrations (if not already on remote) → app deploy with new API/UI.

## References

- F-01 plan: `context/changes/queue-schema-and-guest-tokens/plan.md`
- PRD FR-001, FR-002: `context/foundation/prd.md`
- Roadmap S-01: `context/foundation/roadmap.md`
- Party schema: `supabase/migrations/20260609120000_queue_schema.sql:19-29`
- Staff INSERT policy: `supabase/migrations/20260609120100_queue_rls.sql:47-51`
- Auth middleware: `src/middleware.ts:4-24`
- Form patterns: `src/components/auth/SignInForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API Foundation

#### Automated

- [x] 1.1 `npm install` completes; `package-lock.json` includes `zod` — 9f036e6
- [x] 1.2 `npx astro sync && npm run lint` passes — 9f036e6
- [x] 1.3 `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set — 9f036e6

#### Manual

- [x] 1.4 Unauthenticated POST returns 401; authenticated POST/GET behave per success criteria — 9f036e6

### Phase 2: Dashboard Queue UI

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes — f86bdb7
- [x] 2.2 `npm run build` passes — f86bdb7

#### Manual

- [x] 2.3 Dashboard add form + waiting list works end-to-end without full page reload — f86bdb7

### Phase 3: Auth Redirect Polish

#### Automated

- [x] 3.1 `npm run lint` passes

#### Manual

- [x] 3.2 Sign-in lands on `/dashboard`; unauthenticated dashboard access still gated
