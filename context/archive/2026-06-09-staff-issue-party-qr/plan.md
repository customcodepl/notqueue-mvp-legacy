# Staff Issue Party QR Implementation Plan

## Overview

Deliver roadmap slice S-02 (FR-003): authenticated staff can issue a QR code and copyable link scoped to one waiting party. Builds on F-01 `guest_tokens` (opaque token, one active per party, reissue via `revoked_at`) and S-01 dashboard waiting list. Adds nested guest-token API, QR modal UI, and a minimal public `/guest/[token]` stub page until S-05 ships live status.

## Current State Analysis

- **Database (F-01):** `guest_tokens` with `party_id`, `token` (unique), `revoked_at`; partial unique index one active per party. Staff policies: SELECT, INSERT, UPDATE on `guest_tokens`. `get_guest_party_view(p_token)` RPC for anon guest reads in one transaction.
- **S-01:** `QueueDashboard` lists waiting parties with position badge — no per-party actions (`src/components/queue/QueueDashboard.tsx:130-151`). `GET`/`POST /api/parties` with `requireStaffUser` pattern (`src/pages/api/parties.ts`).
- **Types:** `GuestToken`, `GuestPartyView` in `src/types.ts` — no issue/response DTOs yet.
- **Routes:** No `/guest/*` page; no guest API. `PROTECTED_ROUTES` only `/dashboard` — guest stub stays public.
- **Dependencies:** No QR library in `package.json`.

### Key Discoveries:

- `supabase/migrations/20260609120100_queue_rls.sql:72-83` — staff can INSERT/UPDATE guest_tokens; reissue is app-level revoke + insert.
- `context/changes/queue-schema-and-guest-tokens/plan.md:51` — reissue sets `revoked_at = now()` on old row before new INSERT.
- Seed token `demo-guest-token-local-only` proves RPC path; staff UI should mint cryptographically random tokens for new issues.
- `requireStaffUser` / `jsonResponse` duplicated only in `parties.ts` today — guest-token route should reuse via small shared helper.

## Desired End State

1. Each waiting-list row has a **QR** button opening a modal.
2. Modal fetches active token via `GET /api/parties/{partyId}/guest-token`; if none, staff click **Issue QR** (`POST`); if present, show QR + **Copy link** + **Reissue** (`POST`).
3. `guest_url` format: `{origin}/guest/{token}` (path param).
4. QR rendered client-side from `guest_url` using `react-qr-code`.
5. Public `GET /guest/{token}` stub: validates via `get_guest_party_view`, shows party name/size and placeholder for live status.
6. Reissued token invalidates prior QR (`get_guest_party_view` returns error for old token).
7. `npm run lint` and `npm run build` pass.

## What We're NOT Doing

- Live queue status, Realtime, or full guest UI (S-05).
- Auto-mint token on `POST /api/parties` (manual issue only).
- Advance queue, ETA, mark ready (S-03).
- New Supabase migrations (F-01 schema sufficient).
- SMS, multi-venue staff mapping.
- Server-side QR image endpoint or printable PDF.
- Guest login or account creation.

## Implementation Approach

Three phases: token API + service first (testable via curl), dashboard modal consuming API, then public guest stub. Extract shared API helpers (`jsonResponse`, `requireStaffUser`, `guestUrlFromRequest`) to avoid duplicating auth boilerplate. Token generation uses Web Crypto (`crypto.getRandomValues`) — Workers-safe, no `Math.random`.

## Critical Implementation Details

**Reissue transaction:** Revoke-then-insert should happen in service helper; if INSERT fails after revoke, party has no active token until staff re-issues. Acceptable for MVP; log error and return 500.

**Party scoping:** `GET`/`POST` must verify `partyId` exists and belongs to default venue (or at minimum exists in `parties`) before token operations — return `404` for unknown party.

**Guest stub auth:** Use anon Supabase SSR client and `.rpc('get_guest_party_view', { p_token: token })` in Astro frontmatter — do not use staff session. RPC already granted to `anon`.

## Phase 1: Token API & Service

### Overview

Add guest token service helpers, shared API utilities, DTO types, and authenticated `GET`/`POST /api/parties/[partyId]/guest-token`.

### Changes Required:

#### 1. Shared API helpers

**File**: `src/lib/api.ts`

**Intent**: Deduplicate JSON response and staff auth guard used by `parties.ts` and the new guest-token route.

**Contract**:
- `jsonResponse(status, body)` — `Content-Type: application/json`.
- `requireStaffUser(context)` — returns `{ supabase, user }` or `{ error: Response }` with 401/503 semantics matching `parties.ts`.
- `guestUrlFromRequest(request: Request, token: string)` — `${new URL(request.url).origin}/guest/${encodeURIComponent(token)}`.

Refactor `src/pages/api/parties.ts` to import these helpers (behavior unchanged).

#### 2. DTO types

**File**: `src/types.ts`

**Intent**: Type the guest-token API contracts.

**Contract**:
- `GuestTokenResponse`: `{ token: string; guest_url: string }` — returned by GET (active token) and POST (issue/reissue).
- Optional `issued_at` or full `GuestToken` on POST if useful for debugging; minimum is `token` + `guest_url`.

#### 3. Guest token service

**File**: `src/lib/services/guestTokens.ts`

**Intent**: Centralize token mint, lookup, and reissue against `guest_tokens`.

**Contract**:
- `generateGuestToken()` — cryptographically random opaque string (e.g. 32 bytes base64url, ~43 chars); not predictable.
- `getActiveGuestToken(supabase, partyId)` — SELECT from `guest_tokens` where `party_id = partyId` AND `revoked_at IS NULL`; returns `GuestToken | null`.
- `issueGuestToken(supabase, partyId)` — verify party exists; if active token, `UPDATE` set `revoked_at = now()`; `INSERT` new row; return new `GuestToken`.
- `PartyNotFoundError` (or reuse pattern from parties service) when party id invalid.

#### 4. Guest token API route

**File**: `src/pages/api/parties/[partyId]/guest-token.ts`

**Intent**: Staff-only endpoints for viewing and issuing party-scoped guest tokens.

**Contract**:
- `export const prerender = false`.
- Validate `partyId` param as UUID (zod).
- `GET`: auth required; return `200` + `GuestTokenResponse` if active token; `404` if party missing or no active token (distinguish in error message if helpful).
- `POST`: auth required; call `issueGuestToken`; return `201` + `GuestTokenResponse`.
- Map Supabase/unique constraint errors to safe `500` JSON.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set

#### Manual Verification:

- Unauthenticated `GET`/`POST` → `401`
- `POST` for valid party returns `guest_url` ending in `/guest/{token}`
- `GET` after issue returns same active token
- Second `POST` (reissue) returns new token; `get_guest_party_view(old_token)` fails in SQL/Studio
- Invalid `partyId` → `404`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard QR Modal

### Overview

Add `react-qr-code` dependency and per-party QR modal on the waiting list.

### Changes Required:

#### 1. QR dependency

**File**: `package.json`

**Intent**: Client-side QR rendering for staff modal.

**Contract**: Add `react-qr-code` (or equivalent maintained React 19-compatible package) to `dependencies`.

#### 2. Guest token fetch hook

**File**: `src/components/hooks/useGuestToken.ts`

**Intent**: Encapsulate GET/POST guest-token API calls for the modal.

**Contract**:
- `fetchActiveToken(partyId)` → `GET /api/parties/{partyId}/guest-token`; treat `404` as no token (not error).
- `issueToken(partyId)` → `POST`; returns `GuestTokenResponse`.
- Loading and error state for modal consumption.

#### 3. Party QR modal component

**File**: `src/components/queue/PartyQrModal.tsx`

**Intent**: Staff-facing QR/link display and issue/reissue actions.

**Contract**:
- Props: `partyId`, `partyName`, `open`, `onClose`.
- On open: fetch active token; show loading state.
- No token: **Issue QR** button → POST → show QR.
- Has token: render `QRCode` (from `react-qr-code`) with `value={guest_url}`; show URL text; **Copy link** button (`navigator.clipboard.writeText`); **Reissue** button → POST → refresh QR.
- Cosmic glass styling consistent with dashboard; accessible close control.

#### 4. Queue dashboard integration

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Wire QR action into waiting-list rows.

**Contract**:
- Per-row **QR** button (icon e.g. `QrCode` from lucide-react) beside position badge.
- Modal state: `selectedParty: Party | null`; open modal when QR clicked.
- Render `PartyQrModal` when `selectedParty` set.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Staff opens QR for Smith (seed may already have token — show or reissue)
- Issue QR for newly added party → modal shows scannable code
- Copy link works; pasted URL matches displayed `guest_url`
- Reissue changes token; old link stops working after reissue
- Modal closes cleanly; list unaffected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Guest Stub Page

### Overview

Public page at `/guest/[token]` so scanned QR resolves; validates token and shows minimal party confirmation until S-05.

### Changes Required:

#### 1. Guest status stub page

**File**: `src/pages/guest/[token].astro`

**Intent**: Public landing for guest QR scans — proves URL contract without building S-05 live status.

**Contract**:
- `export const prerender = false`.
- Read `token` from `Astro.params.token`; redirect to 404 or show error if missing.
- Server-side: create Supabase SSR client (no staff auth); call `.rpc('get_guest_party_view', { p_token: token })`.
- On RPC error / null: friendly message ("This link is invalid or has expired") — not raw stack trace.
- On success: show `display_name`, `party_size`, position if present; message that live wait status is coming soon (S-05 placeholder).
- Cosmic/guest-friendly mobile layout (readable on phone).
- Page must **not** be added to `PROTECTED_ROUTES`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Open `guest_url` from staff modal in phone browser or new tab — stub shows correct party name
- Seed token `http://localhost:4321/guest/demo-guest-token-local-only` shows Smith party
- Revoked/invalid token shows error state, not 500
- `/dashboard` still requires auth; guest page does not

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No automated test suite in repo; lint + build + manual verification per project conventions.

### Integration Tests:

- Staff session cookie + `GET`/`POST /api/parties/{id}/guest-token` via DevTools or curl.
- Scan QR or open `guest_url` in unauthenticated browser.

### Manual Testing Steps:

1. `npx supabase db reset`; sign in as staff.
2. Add party "Test" → Issue QR from modal → copy link.
3. Open link in incognito → stub shows "Test".
4. Reissue QR → old link fails, new link works.
5. `npm run lint && npm run build`.

## Performance Considerations

- QR modal loads token on demand (per click), not for entire list — avoids N+1 on queue load.
- Client QR generation is trivial for single modal instance.

## Migration Notes

- No new migrations. Requires F-01 applied locally and on remote before deploy.
- Deploy app after migrations; guest URLs use request origin — verify production domain after Cloudflare deploy.

## References

- F-01 plan: `context/changes/queue-schema-and-guest-tokens/plan.md`
- S-01 plan: `context/changes/staff-add-party-to-queue/plan.md`
- PRD FR-003: `context/foundation/prd.md`
- `guest_tokens` schema: `supabase/migrations/20260609120000_queue_schema.sql:31-43`
- Staff token policies: `supabase/migrations/20260609120100_queue_rls.sql:66-83`
- Guest RPC: `supabase/migrations/20260609120100_queue_rls.sql:155-184`
- Dashboard list: `src/components/queue/QueueDashboard.tsx:130-151`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Token API & Service

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes — 7e4e2f0
- [x] 1.2 `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set — 7e4e2f0

#### Manual

- [x] 1.3 Guest-token GET/POST behave per success criteria (auth, issue, reissue, revoke) — 7e4e2f0

### Phase 2: Dashboard QR Modal

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes — 6c921c9
- [x] 2.2 `npm run build` passes — 6c921c9

#### Manual

- [x] 2.3 Dashboard QR modal: issue, copy link, reissue end-to-end — 6c921c9

### Phase 3: Guest Stub Page

#### Automated

- [x] 3.1 `npx astro sync && npm run lint` passes — 6467ce6
- [x] 3.2 `npm run build` passes — 6467ce6

#### Manual

- [x] 3.3 Guest stub loads for valid token; invalid/revoked shows friendly error — 6467ce6
