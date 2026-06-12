# Staff Configure Guest Venue Info Implementation Plan

## Overview

Deliver roadmap slice S-04 (FR-007, FR-012): authenticated staff can edit optional guest-page content — `menu_link` and `info_text` on `venue_settings` — from `/dashboard`. Guests already consume these fields via `get_guest_party_view` and `GuestStatus` (S-05); this slice adds the staff write path and UI only. No database migration.

## Current State Analysis

- **Schema (F-01):** `venue_settings` table with `venue_id` PK, nullable `menu_link` and `info_text` (`supabase/migrations/20260609120000_queue_schema.sql:12-17`). Seed has demo values (`supabase/seed.sql:4-9`).
- **RLS:** Staff `SELECT`, `INSERT`, `UPDATE` on `venue_settings` for authenticated users (`supabase/migrations/20260609120100_queue_rls.sql:22-39`). No staff DELETE policy — clearing fields uses `NULL` UPDATE.
- **Guest read path (S-05):** `get_guest_party_view` returns `menu_link` / `info_text` in JSON (`queue_rls.sql:172-173`). `GuestStatus` `VenueSection` renders when non-null (`src/components/guest/GuestStatus.tsx:26-49`). Polling every 30s picks up changes without guest code changes.
- **Staff patterns:** `requireStaffUser`, zod validation, `jsonResponse`, services in `src/lib/services/`, hooks in `src/components/hooks/`, dashboard React island (`QueueDashboard`).
- **Venue resolution:** `getDefaultVenueId()` in `parties.ts` — earliest `venues` row by `created_at` (single-venue MVP).

### Key Discoveries:

- `venue_settings` is **not** on the Realtime publication — only `parties` is (`queue_schema.sql:70`). Guest updates appear on next poll or SSR refresh; no S-04 change needed.
- Types `VenueSettings` already exist in `src/types.ts:10-15` but no request/response DTOs for PATCH.
- S-05 explicitly deferred staff editor to S-04 — guest rendering is complete.

## Desired End State

1. Staff on `/dashboard` see a **Guest page info** card above the queue with menu URL and info text fields and a **Save** button.
2. **GET** loads current settings for the default venue (empty strings in UI when `null`).
3. **PATCH** upserts `venue_settings` for the default venue with validated input; empty strings persist as `null`.
4. Guest `/guest/{token}` shows updated `menu_link` / `info_text` within ~30s (existing poll) or on reload.
5. `npm run lint` and `npm run build` pass.

## What We're NOT Doing

- Editing `venues.name` or adding new columns.
- Guest page / hook changes (S-05 complete).
- Supabase Realtime on `venue_settings`.
- Live guest preview, character counter, or `/settings` route.
- Multi-venue staff mapping or DELETE of settings rows.
- New migrations or DB triggers.

## Implementation Approach

Two phases mirroring S-01: API + service first (curl-verifiable), then dashboard UI. Upsert in service layer handles venues without a pre-existing settings row. Validation at API boundary with zod; business logic in `src/lib/services/venueSettings.ts`.

## Critical Implementation Details

**Upsert contract:** Resolve `venue_id` via `getDefaultVenueId`. `SELECT` settings by `venue_id`; if row exists `UPDATE`, else `INSERT` with that `venue_id`. Reuse `VenueNotFoundError` from `parties.ts` or import shared error — do not duplicate if avoidable.

**Empty vs null:** API accepts `menu_link: ""` or `null` → store `null`. Same for `info_text`. UI shows empty inputs for `null` values on load.

**Guest latency:** Staff save does not push to guests instantly. Manual verification should wait up to one poll interval or hard-refresh guest tab.

## Phase 1: Venue Settings API

### Overview

Service helpers and authenticated GET/PATCH routes for default-venue settings.

### Changes Required:

#### 1. Venue settings service

**File**: `src/lib/services/venueSettings.ts` (new)

**Intent**: Encapsulate read and upsert of `venue_settings` for the default venue.

**Contract**:
- `getVenueSettings(supabase)` → `VenueSettings` (or `{ menu_link, info_text, venue_id, updated_at }`). Uses `getDefaultVenueId`; if no row, return `{ venue_id, menu_link: null, info_text: null, updated_at: ... }` or fetch-after-upsert pattern — prefer returning null fields when row missing (no auto-insert on GET).
- `upsertVenueSettings(supabase, { menu_link, info_text })` → `VenueSettings`. Upsert as described above; propagate Supabase errors.

#### 2. DTO types

**File**: `src/types.ts`

**Intent**: Typed API contracts for venue settings endpoints.

**Contract**:
- `UpdateVenueSettingsInput`: `{ menu_link: string | null; info_text: string | null }`.
- `VenueSettingsResponse`: `{ settings: VenueSettings }` (or flat settings object — match parties pattern).

#### 3. API routes

**File**: `src/pages/api/venue/settings.ts` (new)

**Intent**: Staff-authenticated read and update of guest page venue info.

**Contract**:
- `export const prerender = false`.
- `GET`: `requireStaffUser` → `getVenueSettings` → `200` JSON.
- `PATCH`: zod body schema:
  - `menu_link`: `z.union([z.string().url(), z.literal(""), z.null()])` — normalize `""` → `null`; must be http/https when non-empty.
  - `info_text`: `z.union([z.string().max(500), z.literal(""), z.null()])` — normalize `""` → `null`.
- Map `VenueNotFoundError` → `404`; validation → `400`; other → `500`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `GET /api/venue/settings` (authenticated) returns seed `menu_link` and `info_text`
- `PATCH` with valid URL and text persists; re-GET matches
- `PATCH` with invalid URL returns `400`
- `PATCH` with empty strings clears fields (`null` in response)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard Editor

### Overview

React card on `/dashboard` for staff to view and save guest page info.

### Changes Required:

#### 1. useVenueSettings hook

**File**: `src/components/hooks/useVenueSettings.ts` (new)

**Intent**: Load settings on mount; expose `updateSettings` mutation and loading/error state.

**Contract**:
- `fetch` `GET /api/venue/settings` with credentials.
- `updateSettings(input)` → `PATCH` same path; on success update local state.
- Return `{ settings, loading, error, saving, updateSettings, refresh }`.

#### 2. VenueSettingsCard component

**File**: `src/components/queue/VenueSettingsCard.tsx` (new)

**Intent**: Staff-facing editor for guest page info.

**Contract**:
- Props: none (uses hook internally) or receive hook return from parent — prefer self-contained card.
- Section title: **Guest page info** with short helper copy (e.g. “Shown to guests on their wait status page”).
- Fields:
  - **Menu link** — `type="url"`, placeholder optional, controlled input.
  - **Info text** — `textarea`, max 500 enforced client-side + server zod.
- **Save** button — disabled while `saving`; show inline success (“Saved”) or `ServerError` on failure.
- Map `null` → `""` in inputs; on save trim strings and send `""` for cleared fields.
- Styling: glass card matching `QueueDashboard` / cosmic palette; `cn()` for classes.

#### 3. Dashboard integration

**File**: `src/components/queue/QueueDashboard.tsx`

**Intent**: Render venue settings card above the add-party form / queue list.

**Contract**:
- Import and render `<VenueSettingsCard />` at top of dashboard content (below any page-level chrome — card lives inside the island).
- No change to queue operations logic.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `/dashboard` shows Guest page info section with seed values pre-filled
- Save updated menu link and info text → success feedback
- Open `/guest/{active-token}` → guest `VenueSection` reflects changes within ~30s or on refresh
- Clear both fields and save → guest page hides venue section
- Invalid URL on save shows error without corrupting previous saved values

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change complete.

---

## Testing Strategy

### Unit Tests:

- No automated test suite in repo; lint + build per AGENTS.md.

### Integration Tests:

- Manual curl/fetch against API (Phase 1); two-browser staff dashboard + guest page (Phase 2).

### Manual Testing Steps:

1. `npx supabase db reset`; `npm run dev` with Supabase env vars set.
2. Sign in → `/dashboard` → verify seed values in Guest page info card.
3. Edit fields → Save → re-open dashboard confirms persistence.
4. Open guest QR link in second tab → verify venue section after poll/refresh.
5. Clear fields → Save → guest venue section disappears.
6. Submit `not-a-url` as menu link → validation error.

## Performance Considerations

- Single-row read/write per save — negligible.
- No change to guest poll frequency.

## Migration Notes

None. Existing seed and RLS sufficient.

## References

- Roadmap S-04: `context/foundation/roadmap.md`
- F-01 schema: `context/archive/2026-06-09-queue-schema-and-guest-tokens/plan-brief.md`
- S-05 guest display: `context/archive/2026-06-12-guest-live-wait-status/plan-brief.md`
- RLS SQL: `supabase/migrations/20260609120100_queue_rls.sql`
- Guest UI: `src/components/guest/GuestStatus.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Venue Settings API

#### Automated

- [x] 1.1 `npx astro sync && npm run lint` passes — ffb5c6d
- [x] 1.2 `npm run build` passes — ffb5c6d

#### Manual

- [x] 1.3 GET/PATCH /api/venue/settings verified (seed read, upsert, validation, clear) — ffb5c6d

### Phase 2: Dashboard Editor

#### Automated

- [x] 2.1 `npx astro sync && npm run lint` passes
- [x] 2.2 `npm run build` passes

#### Manual

- [x] 2.3 Dashboard save flow and guest page reflect settings (including clear and invalid URL)
