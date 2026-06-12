# Staff Advance and Ready Queue Implementation Plan

## Overview

Deliver roadmap slice S-03 (FR-004, FR-005, FR-006): authenticated staff can advance the queue (seat the front waiting party), manually set or clear per-party ETA, mark a waiting party as table ready, and seat ready parties — all from `/dashboard`. Builds on F-01 `parties` schema and S-01/S-02 dashboard patterns. No new migrations; staff UPDATE RLS and Realtime publication already exist.

## Current State Analysis

- **Database (F-01):** `parties` with `position` (integer, nullable when not waiting), `eta_minutes` (nullable = unknown), `status` enum `waiting | ready | seated`. Index `(venue_id, status, position)`. `parties` in `supabase_realtime` publication. Staff `UPDATE` policy on `parties` (`supabase/migrations/20260609120100_queue_rls.sql:53-58`).
- **S-01:** `createParty` appends `position = MAX(waiting) + 1`, `eta_minutes = null`, `status = waiting`. `listWaitingParties` returns `status = 'waiting'` ordered by position (`src/lib/services/parties.ts:49-87`). `GET`/`POST /api/parties` with zod + `requireStaffUser`.
- **S-02:** Per-row QR button on `QueueDashboard`; nested route `/api/parties/[partyId]/guest-token.ts` establishes action-route pattern.
- **Guest read path:** `get_guest_party_view` RPC already returns `position`, `eta_minutes`, `status` — mutations in S-03 are immediately visible to guests via RPC (live UI in S-05).
- **Missing:** No `updateParty`, advance, ready, or seat logic. Dashboard shows position badge only — no ETA display/edit, no Call next, no Ready section.

### Key Discoveries:

- `src/types.ts:17-27` — `Party` type already includes `eta_minutes` and `PartyStatus`; extend with mutation DTOs only.
- `src/components/hooks/useQueueParties.ts:55-70` — `addParty` POST then re-fetch pattern is the template for new mutations.
- `src/pages/guest/[token].astro:49-58` — guest stub shows position; ETA/status placeholders until S-05 — S-03 only needs to write correct DB state.
- S-01 plan noted position race on concurrent adds; deferred fix to S-03 if needed — planning session chose app-layer renumber without DB RPC (acceptable MVP).

## Desired End State

1. **Call next** (header button): seats the front `waiting` party (`status → seated`, `position → null`), renumbers remaining waiting parties so positions are contiguous starting at 1.
2. **Inline ETA** on each waiting row: staff can set minutes (1–999) or clear to unknown (`null`).
3. **Mark ready** per waiting row: party moves to `status = ready`, `position → null`, waiting line renumbers behind them.
4. **Ready section** below waiting list: shows ready parties with **Seat** action (`status → seated`).
5. `GET /api/parties` returns `{ waiting: Party[], ready: Party[] }` ordered appropriately (waiting by position, ready by `updated_at` desc).
6. Unauthenticated mutation requests return `401`; invalid party/state returns `404`/`409` with safe JSON errors.
7. `npm run lint` and `npm run build` pass.

## What We're NOT Doing

- Guest live status page, Realtime subscriptions, or polling (S-05).
- Venue settings configuration UI (S-04).
- New Supabase migrations or Postgres RPC for atomic reorder.
- Skip/remove arbitrary waiting party without seating (no-show handling).
- Auto-calculated ETA or SMS notifications.
- Edit party name/size from dashboard.
- Multi-venue staff mapping.
- Showing `seated` parties on dashboard.

## Implementation Approach

Three phases: mutation service + API routes first (testable via curl), then expand list endpoint + hook, then dashboard UI. Extend `src/lib/services/parties.ts` (S-01 explicitly designed for S-03 reuse). Use action-specific nested routes mirroring `guest-token.ts`. Renumber waiting positions in application code after any party leaves the waiting list.

## Critical Implementation Details

**Renumber invariant:** After a waiting party at position `P` leaves waiting (seated via advance, or marked ready), all remaining `waiting` parties with `position > P` get `position - 1`. Implement as `repackWaitingPositions(supabase, venueId, removedPosition)` called after the status update.

**State guards:** `markPartyReady` requires `status = waiting`. `seatParty` requires `status = ready`. `updatePartyEta` requires `status = waiting`. `advanceQueue` requires at least one waiting party — return `409` with `{ error: "Queue is empty" }` if none.

**Ready position:** Ready parties have `position = null` — they are out of the ordered waitlist but still visible in the Ready section until seated.

## Phase 1: Queue Service & Mutation API

### Overview

Add queue mutation helpers to the parties service and expose them via authenticated action routes.

### Changes Required:

#### 1. Domain errors

**File**: `src/lib/services/parties.ts`

**Intent**: Add typed errors for empty queue and invalid state transitions so API routes map to correct HTTP status codes.

**Contract**:
- `EmptyQueueError` — no waiting parties for advance.
- `InvalidPartyStateError` — action not allowed for current `status` (e.g. seat on `waiting`).
- Reuse or align with existing `PartyNotFoundError` pattern from `guestTokens.ts`.

#### 2. Renumber helper

**File**: `src/lib/services/parties.ts`

**Intent**: Keep waiting positions contiguous after a party leaves the waiting list.

**Contract**:
- `repackWaitingPositions(supabase, venueId, removedPosition: number)` — SELECT all `waiting` parties for venue with `position > removedPosition`; UPDATE each to `position - 1`. Call after advance or mark-ready.

#### 3. Mutation service functions

**File**: `src/lib/services/parties.ts`

**Intent**: Implement FR-004, FR-005, FR-006 business logic as reusable service functions.

**Contract**:
- `advanceQueue(supabase)` — resolve default venue; fetch lowest-position `waiting` party; if none, throw `EmptyQueueError`; UPDATE that party to `status = 'seated'`, `position = null`; call `repackWaitingPositions` with removed position; return updated party.
- `markPartyReady(supabase, partyId)` — verify party exists, `status = 'waiting'`; capture current `position`; UPDATE to `status = 'ready'`, `position = null`; repack if position was non-null; return updated party.
- `seatParty(supabase, partyId)` — verify party exists, `status = 'ready'`; UPDATE to `status = 'seated'`; return updated party.
- `updatePartyEta(supabase, partyId, etaMinutes: number | null)` — verify party exists, `status = 'waiting'`; UPDATE `eta_minutes`; return updated party.

#### 4. DTO types

**File**: `src/types.ts`

**Intent**: Type mutation request/response bodies.

**Contract**:
- `UpdatePartyEtaInput`: `{ eta_minutes: number | null }`.
- `PartyMutationResponse`: `{ party: Party }`.
- `AdvanceQueueResponse`: `{ party: Party }` (the seated party).

#### 5. Advance API route

**File**: `src/pages/api/parties/advance.ts`

**Intent**: Staff-only global "call next" endpoint (FR-004).

**Contract**:
- `export const prerender = false`.
- `POST` only; `requireStaffUser`; no request body.
- Success `200` + `AdvanceQueueResponse`.
- `EmptyQueueError` → `409`; `VenueNotFoundError` → `404`; other → `500`.

#### 6. ETA API route

**File**: `src/pages/api/parties/[partyId].ts`

**Intent**: Staff-only per-party ETA update (FR-006).

**Contract**:
- `PATCH` only; validate `partyId` as UUID (zod).
- Body schema: `eta_minutes` — `z.number().int().min(1).max(999).nullable()` (null clears ETA).
- Success `200` + `PartyMutationResponse`.
- `PartyNotFoundError` → `404`; `InvalidPartyStateError` → `409`.

#### 7. Ready API route

**File**: `src/pages/api/parties/[partyId]/ready.ts`

**Intent**: Staff-only mark table ready (FR-005).

**Contract**:
- `POST` only; validate `partyId` UUID.
- Success `200` + `PartyMutationResponse`.
- `PartyNotFoundError` → `404`; `InvalidPartyStateError` → `409` (not waiting).

#### 8. Seat API route

**File**: `src/pages/api/parties/[partyId]/seat.ts`

**Intent**: Staff-only clear ready party after they are shown to table.

**Contract**:
- `POST` only; validate `partyId` UUID.
- Success `200` + `PartyMutationResponse`.
- `PartyNotFoundError` → `404`; `InvalidPartyStateError` → `409` (not ready).

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set

#### Manual Verification:

- Unauthenticated `POST /api/parties/advance` → `401`
- With seed data: `POST /api/parties/advance` seats Smith (position 1), next party becomes position 1
- `PATCH /api/parties/{id}` with `{ "eta_minutes": 20 }` updates row; `{ "eta_minutes": null }` clears
- `POST /api/parties/{id}/ready` on waiting party → `status = ready`; waiting positions repack
- `POST /api/parties/{id}/seat` on ready party → `status = seated`
- `POST /api/parties/advance` on empty queue → `409`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: List API & Hook

### Overview

Expand the list endpoint to return both waiting and ready parties; extend `useQueueParties` with mutation methods and unified refresh.

### Changes Required:

#### 1. List ready parties service

**File**: `src/lib/services/parties.ts`

**Intent**: Query ready parties for the Ready dashboard section.

**Contract**:
- `listReadyParties(supabase, venueId)` — SELECT `status = 'ready'` for venue, order by `updated_at` descending.

#### 2. Expand list response type

**File**: `src/types.ts`

**Intent**: Replace single-list shape with waiting + ready sections.

**Contract**:
- `PartyListResponse`: `{ waiting: Party[]; ready: Party[] }` (replaces `{ parties: Party[] }`).

#### 3. Update GET /api/parties

**File**: `src/pages/api/parties.ts`

**Intent**: Return both queue sections in one request for dashboard mount.

**Contract**:
- `GET` handler calls `listWaitingParties` and `listReadyParties` for default venue.
- Response body `{ waiting, ready }`.
- `POST` handler unchanged (still creates waiting party).

#### 4. Extend useQueueParties hook

**File**: `src/components/hooks/useQueueParties.ts`

**Intent**: Expose queue state and all staff mutations with in-place refresh.

**Contract**:
- State: `waiting` and `ready` arrays (replace single `parties`).
- `refresh()` — fetches `GET /api/parties`, sets both arrays.
- `advanceQueue()` — `POST /api/parties/advance`, then refresh.
- `updateEta(partyId, etaMinutes)` — `PATCH /api/parties/{partyId}`, then refresh.
- `markReady(partyId)` — `POST /api/parties/{partyId}/ready`, then refresh.
- `seatParty(partyId)` — `POST /api/parties/{partyId}/seat`, then refresh.
- `addParty` — update to refresh both sections after POST.
- Preserve existing loading/error/abort patterns.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `GET /api/parties` returns `{ waiting: [...], ready: [...] }` with correct partitioning
- After mark-ready via API, party moves from `waiting` to `ready` in GET response
- Hook consumers compile (dashboard updated in Phase 3)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard UI

### Overview

Wire staff queue operations into `QueueDashboard`: Call next header, inline ETA, per-row Ready, and Ready section with Seat.

### Changes Required:

#### 1. Waiting queue header — Call next

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Global advance action (FR-004) visible above the waiting list.

**Contract**:
- Button in "Waiting queue" section header: **Call next**.
- Disabled when `waiting.length === 0` or while mutation in flight.
- Calls `advanceQueue()` from hook; surfaces errors via `ServerError`.
- Optional confirmation not required (single tap per NFR).

#### 2. Waiting row — inline ETA

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Manual ETA entry per waiting party (FR-006) without leaving the list.

**Contract**:
- Compact number input or text field showing current `eta_minutes` (empty when null).
- On blur or explicit save (choose one pattern; blur is acceptable for MVP), call `updateEta(partyId, value)`.
- Validate 1–999 client-side; empty input sends `null` (unknown).
- Display "—" or "Unknown" when `eta_minutes` is null.
- Debounce not required for MVP; disable input during submit.

#### 3. Waiting row — Mark ready

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Per-party table-ready action (FR-005).

**Contract**:
- **Ready** button beside existing QR button on each waiting row.
- Calls `markReady(partyId)`; row disappears from waiting list and appears in Ready section after refresh.

#### 4. Ready section

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Staff visibility of parties awaiting seating (planning decision: separate section).

**Contract**:
- New section below waiting list: **Ready for table**.
- List `ready` parties: display name, party size.
- **Seat** button per row calls `seatParty(partyId)`; row removed after refresh.
- Empty state: "No parties ready." when `ready.length === 0`.
- Hide entire section or show empty state — empty state preferred for discoverability.

#### 5. Layout & rush UX

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Keep row actions usable on mobile during rush.

**Contract**:
- Reuse `cn()` for Tailwind; match existing card/row styling from S-01/S-02.
- Row actions order suggestion: name/size | ETA | QR | Ready | position badge.
- Loading states on buttons during mutations; do not block entire dashboard.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Add 3 parties; set ETAs; Call next seats #1 and renumbers #2→1, #3→2
- Mark party #2 ready; waiting list shows correct positions; party appears in Ready section
- Seat ready party; disappears from Ready section; `get_guest_party_view` shows `status = seated`
- Clear ETA shows unknown/null in DB
- QR button still works on waiting rows (S-02 regression)
- Sign-in → `/dashboard` flow unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change complete.

---

## Testing Strategy

### Unit Tests:

- No automated test suite in repo; rely on lint + build + manual verification per AGENTS.md.

### Integration Tests:

- Manual curl or browser devtools against API routes with staff session cookie.
- Verify `get_guest_party_view` RPC after each mutation type.

### Manual Testing Steps:

1. Reset local DB (`npx supabase db reset`); sign in as staff.
2. Add parties A, B, C — verify positions 1, 2, 3.
3. Set ETA on B to 15 min; clear ETA on A.
4. Call next — A seated, B=#1, C=#2.
5. Mark B ready — C=#1, B in Ready section.
6. Seat B — Ready section empty, B `status = seated` in DB.
7. Call next on empty queue — error message in UI.
8. Run `npm run lint` and `npm run build`.

## Performance Considerations

- Renumber issues N-1 UPDATEs in worst case when front party leaves — acceptable for MVP queue sizes (tens of parties).
- Dashboard refresh re-fetches full list after each mutation — same pattern as S-01 `addParty`; Realtime batching deferred to S-05.

## Migration Notes

No database migration required. F-01 schema and RLS are sufficient. Deploy is code-only after local verification.

## References

- Roadmap S-03: `context/foundation/roadmap.md`
- PRD FR-004–006: `context/foundation/prd.md`
- F-01 schema: `context/archive/2026-06-09-queue-schema-and-guest-tokens/plan-brief.md`
- S-01 patterns: `context/archive/2026-06-09-staff-add-party-to-queue/plan.md`
- S-02 nested routes: `context/archive/2026-06-09-staff-issue-party-qr/plan.md`
- Party service: `src/lib/services/parties.ts`
- Dashboard: `src/components/queue/QueueDashboard.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Queue Service & Mutation API

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes — a23c918
- [x] 1.2 `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set — a23c918

#### Manual

- [x] 1.3 Unauthenticated and empty-queue API error cases verified — a23c918
- [x] 1.4 Advance, ETA, ready, and seat mutations verified via API — a23c918

### Phase 2: List API & Hook

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes — 3ec114f
- [x] 2.2 `npm run build` passes — 3ec114f

#### Manual

- [x] 2.3 `GET /api/parties` returns waiting and ready sections correctly — 3ec114f
- [x] 2.4 Hook refresh reflects party movement between sections — 3ec114f

### Phase 3: Dashboard UI

#### Automated

- [x] 3.1 `npx astro sync && npm run lint` passes
- [x] 3.2 `npm run build` passes

#### Manual

- [x] 3.3 Call next, inline ETA, mark ready, and seat work end-to-end on dashboard
- [x] 3.4 S-02 QR regression and guest RPC state verified
