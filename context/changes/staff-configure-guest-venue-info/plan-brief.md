# Staff Configure Guest Venue Info — Plan Brief

> Full plan: `context/changes/staff-configure-guest-venue-info/plan.md`

## What & Why

Staff need to control what guests see beyond queue status — a menu link and short venue message (policies, “stay nearby”, etc.) on the public `/guest/[token]` page. This is S-04 (FR-007 / FR-012). The data model and guest read path already exist from F-01 and S-05; this slice adds the staff write path and dashboard UI.

## Starting Point

F-01 created `venue_settings` (`menu_link`, `info_text`) with staff SELECT/INSERT/UPDATE RLS. Seed populates demo values. `get_guest_party_view` joins settings into `GuestPartyView`; `GuestStatus` renders `VenueSection` when fields are non-null. Staff have no API or UI to edit settings — changes require SQL or seed edits.

## Desired End State

A signed-in staff member on `/dashboard` sees a “Guest page info” section above the queue, edits menu URL and info text, clicks Save, and guests see the updated content on their status page within the existing ~30s poll cycle (or on next SSR load). Empty fields save as `null` and hide the corresponding guest UI blocks.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| UI placement | Dashboard section above queue | One screen during service — queue-first like S-01–S-03 | Plan |
| Fields in scope | `menu_link` + `info_text` only | Matches FR-007/FR-012 and existing schema — no migration | Plan |
| Save UX | Explicit Save button | Clear intent; matches add-party form; avoids blur-save errors on URL | Plan |
| `menu_link` validation | Optional valid http/https URL or empty | Prevents broken guest links; empty clears field | Plan |
| `info_text` limit | Max 500 characters | Fits mobile guest card; single policy paragraph | Plan |
| Clear fields | Yes — empty → `null` | FR-012 is optional; guest hides empty sections | Plan |
| Missing settings row | Upsert on save | Works for venues beyond seed; RLS allows INSERT | Plan |
| Priority if tight | API + minimal form | Ship core FR-007; skip preview/char counter polish | Plan |

## Scope

**In scope:** `getVenueSettings` / `upsertVenueSettings` service; `GET` + `PATCH /api/venue/settings`; zod validation; DTOs in `src/types.ts`; `useVenueSettings` hook; dashboard card with two fields + Save.

**Out of scope:** `venues.name` edit; new DB columns; guest UI changes (S-05 done); Realtime; live guest preview; character counter UI; multi-venue staff mapping; `/settings` route.

## Architecture / Approach

```
Staff /dashboard → VenueSettingsCard (React)
        ↓ fetch
  GET/PATCH /api/venue/settings (auth + zod)
        ↓ Supabase SSR client (authenticated)
  venue_settings UPSERT for default venue (RLS staff_*)
        ↓ (guest read path unchanged)
  get_guest_party_view → GuestStatus VenueSection (30s poll)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Venue settings API | Service + GET/PATCH routes + types | Upsert edge case when row missing |
| 2. Dashboard editor | Hook + form card on dashboard | Validation UX without over-polish |

**Prerequisites:** F-01 schema/RLS; S-05 guest display (done).  
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Guest sees venue changes on next poll (~30s), not instantly — acceptable per S-05 polling design; `venue_settings` is not on Realtime publication.
- Single default venue (`getDefaultVenueId`) — same assumption as S-01–S-03.
- Deploy docs for `PUBLIC_SUPABASE_*` still outstanding from S-05 review — unrelated to S-04 but affects prod guest testing.

## Success Criteria (Summary)

- Staff can save menu link and info text from `/dashboard` without SQL.
- Invalid URLs are rejected with a clear error; cleared fields remove guest content.
- `npm run lint` and `npm run build` pass.
