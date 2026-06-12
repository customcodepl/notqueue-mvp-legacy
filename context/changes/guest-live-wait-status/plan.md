# Guest Live Wait Status Implementation Plan

## Overview

Deliver roadmap slice S-05 (FR-008–FR-013, US-01): replace the guest stub at `/guest/[token]` with a full status experience that polls `get_guest_party_view` for live updates — position, ETA, venue info, distinct ready and seated states — without guest login. Uses browser Supabase client + React island; Supabase Realtime deferred (anon RLS incompatible without custom JWT per F-01).

## Current State Analysis

- **Guest read contract (F-01):** `get_guest_party_view(p_token)` returns `GuestPartyView` JSON in one transaction (`supabase/migrations/20260609120100_queue_rls.sql:155-184`). Typed in `src/types.ts:37-45`.
- **Staff writes (S-03):** `advanceQueue`, `markPartyReady`, `seatParty`, `updatePartyEta` UPDATE `parties`; `updated_at` trigger fires; table in Realtime publication (unused by app).
- **Guest page (S-02 stub):** `src/pages/guest/[token].astro` — SSR RPC on load; renders name, size, position when non-null; placeholder “coming soon” (lines 56-58). No `eta_minutes`, `status`, venue fields, or client refresh.
- **Supabase clients:** Server-only `createServerClient` in `src/lib/supabase.ts`; `astro.config.mjs:17-21` — `SUPABASE_URL` / `SUPABASE_KEY` are server secrets only.
- **No guest React components** under `src/components/guest/`.
- **S-04:** Not implemented — `menu_link` / `info_text` come from seed via RPC; guest can render when present.

### Key Discoveries:

- Guest RLS on `parties` uses `guest_can_view_party(id)` reading `current_setting('app.guest_token')` — set only inside RPC transaction. Direct anon Realtime `postgres_changes` will not receive rows without JWT or BFF (`context/archive/2026-06-09-queue-schema-and-guest-tokens/plan-brief.md:64`).
- `position === null` when `status` is `ready` or `seated` (S-03) — guest UI must not show queue number in those states.
- `eta_minutes === null` means unknown per PRD — never render a fabricated number.
- Infrastructure doc: guest live updates = browser WebSockets to Supabase if Realtime; polling avoids Workers long-lived connections (`context/foundation/infrastructure.md:17`).

## Desired End State

1. Guest opens `/guest/{token}` without login — invalid/revoked token shows friendly error.
2. **Waiting:** party name/size, queue position (when non-null), ETA in minutes or “Wait time unknown”, optional venue `info_text` and `menu_link`.
3. **Ready:** prominent hero — “Your table is ready!” — no position number (FR-013).
4. **Seated:** thank-you closing state — “You're seated. Enjoy your meal!”
5. Status refreshes every **30 seconds** via `get_guest_party_view`; polling **pauses** when tab hidden and runs immediately when tab becomes visible.
6. Staff actions from `/dashboard` visible within one poll cycle without manual refresh.
7. `npm run lint` and `npm run build` pass with client + server Supabase env configured.

## What We're NOT Doing

- Supabase Realtime `postgres_changes` or custom guest JWT migration.
- `GET /api/guest/[token]` BFF route (browser RPC chosen).
- S-04 staff venue settings editor (render RPC fields only).
- SMS notifications (FR-014).
- Revoking token on seated.
- Staff dashboard Realtime.
- Full-page meta-refresh SSR polling.
- Showing other parties’ data (privacy boundary unchanged).

## Implementation Approach

Three phases: client env + polling hook first (testable in isolation), GuestStatus UI component second, Astro page wiring third. SSR provides fast first paint; React island hydrates and owns polling. Match staff patterns: hooks in `src/components/hooks/`, UI in `src/components/guest/`, `cn()` for Tailwind.

## Critical Implementation Details

**Env duplication:** Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` with `context: "client"` in `astro.config.mjs`. Values are the same as server `SUPABASE_URL` / publishable anon `SUPABASE_KEY`. Update `.env.example` and document Cloudflare dashboard / `.dev.vars` for deploy.

**Poll lifecycle:** On mount, hook runs initial fetch (may duplicate SSR data — acceptable). `setInterval` 30_000 ms; `document.visibilitychange` clears interval when hidden, fetches once when visible. Clear interval on unmount. On RPC error (revoked token), set error state and stop polling.

**Ready transition:** When `status` flips from `waiting` to `ready`, replace queue card with hero — intentional layout shift per planning decision.

## Phase 1: Client Supabase & Guest Hook

### Overview

Expose publishable Supabase credentials to the browser, add a browser client factory, and implement `useGuestPartyView` with 30s polling and visibility-aware pause.

### Changes Required:

#### 1. Client env schema

**File**: `astro.config.mjs`

**Intent**: Allow guest island to call Supabase RPC from the browser.

**Contract**:
- `PUBLIC_SUPABASE_URL`: `envField.string({ context: "client", access: "public" })`
- `PUBLIC_SUPABASE_ANON_KEY`: `envField.string({ context: "client", access: "public" })`
- Keep existing server `SUPABASE_URL` / `SUPABASE_KEY` unchanged.

#### 2. Env documentation

**File**: `.env.example`

**Intent**: Document client vars for local dev (same values as server keys).

**Contract**: Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` lines mirroring `SUPABASE_URL` / `SUPABASE_KEY`.

#### 3. Browser Supabase client

**File**: `src/lib/supabase-browser.ts` (new)

**Intent**: Factory for anon browser client used only on guest page.

**Contract**:
- `createBrowserClient()` — uses `createBrowserClient` from `@supabase/ssr` with `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` from `astro:env/client`.
- Returns `null` when env missing (caller shows service unavailable).

#### 4. Guest party view hook

**File**: `src/components/hooks/useGuestPartyView.ts` (new)

**Intent**: Poll `get_guest_party_view` and expose loading/error/data state.

**Contract**:
- Input: `token: string`, optional `initialData: GuestPartyView | null` (from SSR to avoid flash).
- `fetchView()` — `supabase.rpc('get_guest_party_view', { p_token: token })`; map to `GuestPartyView`; on error set `error` and stop polling.
- `useEffect`: start 30s interval; subscribe `visibilitychange` — pause when `document.hidden`, poll immediately when visible.
- Return `{ data, loading, error, refresh }`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes with `SUPABASE_URL`, `SUPABASE_KEY`, `PUBLIC_SUPABASE_URL`, and `PUBLIC_SUPABASE_ANON_KEY` set

#### Manual Verification:

- Hook can be smoke-tested via temporary mount or Phase 3 page — RPC returns data for `demo-guest-token-local-only`
- Invalid token sets error without crash

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Guest Status UI

### Overview

Build the React island that renders all guest-visible states from `GuestPartyView`.

### Changes Required:

#### 1. GuestStatus component

**File**: `src/components/guest/GuestStatus.tsx` (new)

**Intent**: Full guest status UI with status-driven layout (FR-008–013).

**Contract**:
- Props: `token: string`, `initialView: GuestPartyView | null`, `initialError?: string | null`.
- Uses `useGuestPartyView(token, initialView)`.
- **Loading:** skeleton or subtle spinner on first client fetch if no initial data.
- **Error:** centered “Link unavailable” (match stub copy).
- **Waiting (`status === 'waiting'`):** header with name + party size; position card when `position !== null`; ETA row — `{eta_minutes} min` or “Wait time unknown”; venue section when `info_text` or `menu_link` present (link opens in new tab).
- **Ready (`status === 'ready'`):** full-width hero — green accent, “Your table is ready!”, subcopy to proceed to host; hide position; optional venue info below.
- **Seated (`status === 'seated'`):** thank-you message — “You're seated. Enjoy your meal!”
- Styling: reuse cosmic/glass card patterns from `src/pages/guest/[token].astro` and dashboard (`cn()`, white/purple palette).
- No staff actions; read-only.

### Success Criteria:

#### Automated Verification:

- [x] 2.1 `npx astro sync && npm run lint` passes
- [x] 2.2 `npm run build` passes

#### Manual Verification:

- [ ] 2.3 Component renders waiting state with seed data shape (can verify in Phase 3)
- [ ] 2.4 Ready and seated layouts visually distinct from waiting

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Astro Page Integration

### Overview

Wire SSR bootstrap and React island into `/guest/[token]`; remove S-02 placeholder.

### Changes Required:

#### 1. Guest page

**File**: `src/pages/guest/[token].astro`

**Intent**: SSR first paint + hydrate live polling island.

**Contract**:
- Keep `export const prerender = false`.
- SSR: existing `get_guest_party_view` via server `createClient` — unchanged error handling.
- Replace inline HTML stub with `<GuestStatus client:load token={token} initialView={guestView} initialError={errorMessage} />`.
- Remove “Live wait status is coming soon” placeholder.
- Pass `token` from route param (non-null when `guestView` path runs).
- Layout/title unchanged (`Your table`).

#### 2. Middleware check

**File**: `src/middleware.ts`

**Intent**: Confirm `/guest/*` remains public (no change expected).

**Contract**: No edit unless `PROTECTED_ROUTES` accidentally includes `/guest` — verify only.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Open `/guest/demo-guest-token-local-only` — see name, position, ETA (seed: 15 min), venue info from seed
- Staff changes ETA on dashboard → guest page updates within ~30s without refresh
- Staff marks party ready → guest sees ready hero within ~30s
- Staff seats party → guest sees thank-you state
- Staff clears ETA → guest shows “Wait time unknown”
- Reissue QR (revoke old token) → guest page shows link unavailable; polling stops
- Tab backgrounded 60s+ → visible again triggers immediate refresh
- S-02 regression: new QR links still resolve to `/guest/{token}`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change complete.

---

## Testing Strategy

### Unit Tests:

- No automated test suite in repo; lint + build per AGENTS.md.

### Integration Tests:

- Manual two-browser test: guest page + staff `/dashboard` side by side.

### Manual Testing Steps:

1. `npx supabase db reset`; `npm run dev` with all four Supabase env vars set.
2. Sign in as staff; add party; issue QR; open guest URL on phone or second tab.
3. Verify waiting UI: position, ETA, venue info from seed.
4. Change ETA; wait ≤30s — guest updates.
5. Mark ready — hero appears; position hidden.
6. Seat — thank-you appears.
7. Call next on another party — verify position renumber on guest tab for waiting party.
8. Background tab 1 min; foreground — immediate refresh.
9. Reissue token — old URL errors.

## Performance Considerations

- One RPC per guest tab per 30s (~2 req/min) — negligible at MVP scale.
- SSR + client initial fetch may duplicate first RPC — acceptable for simple MVP.
- Page Visibility pause reduces background load on locked phones.

## Migration Notes

No database migration. Deploy requires adding `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` to Cloudflare Worker secrets / `.dev.vars` (same values as existing Supabase URL and anon key).

## References

- Roadmap S-05: `context/foundation/roadmap.md`
- PRD US-01, FR-008–013: `context/foundation/prd.md`
- F-01 guest RPC: `context/archive/2026-06-09-queue-schema-and-guest-tokens/plan-brief.md`
- S-03 mutations: `context/archive/2026-06-10-staff-advance-and-ready-queue/plan-brief.md`
- Guest stub: `src/pages/guest/[token].astro`
- RPC SQL: `supabase/migrations/20260609120100_queue_rls.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Client Supabase & Guest Hook

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes — c8df6ab
- [x] 1.2 `npm run build` passes with client and server Supabase env vars set — c8df6ab

#### Manual

- [x] 1.3 RPC smoke via hook or guest page for valid and invalid tokens — c8df6ab

### Phase 2: Guest Status UI

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes
- [x] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 Waiting, ready, and seated layouts verified (static or Storybook-less manual)

### Phase 3: Astro Page Integration

#### Automated

- [x] 3.1 `npx astro sync && npm run lint` passes
- [x] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 End-to-end guest + staff flow: poll updates, ready hero, seated, visibility pause
- [ ] 3.4 Revoked token and venue info display verified
