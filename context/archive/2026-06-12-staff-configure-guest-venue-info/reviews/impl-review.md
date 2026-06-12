# Implementation Review: staff-configure-guest-venue-info (S-04)

**Reviewed:** 2026-06-12  
**Plan:** `context/changes/staff-configure-guest-venue-info/plan.md`  
**Commits:** `ffb5c6d` (p1) · `2295089` (p2) · `d2803d2` (epilogue)

## Verdict

**Pass** — implementation matches the approved plan and PRD FR-007 / FR-012. Both phases delivered; manual verification confirmed. Safe to archive.

## Plan conformance

| Requirement | Status | Notes |
|---|---|---|
| FR-007 Staff configure guest page info | ✅ | Dashboard card + PATCH API |
| FR-012 Guest sees venue info | ✅ | No guest changes; existing RPC + poll |
| `menu_link` + `info_text` only | ✅ | No schema migration |
| Optional URL validation | ✅ | `z.url()` + empty → `null` |
| Info text max 500 chars | ✅ | zod + `maxLength` on textarea |
| Clear fields → `null` | ✅ | API normalize + form sends `null` |
| Upsert when row missing | ✅ | `upsertVenueSettings` INSERT/UPDATE |
| Dashboard section above queue | ✅ | `VenueSettingsCard` first in `QueueDashboard` |
| Explicit Save button | ✅ | Form submit with feedback |
| No new migrations | ✅ | Uses F-01 RLS |

## Strengths

- **Thin slice:** Reuses `getDefaultVenueId`, `requireStaffUser`, and guest read path — no duplicate venue logic.
- **GET without side effects:** Missing settings row returns null fields without INSERT.
- **Form remount:** `key={settings.updated_at}` resets local state after save without `setState` in effects.
- **Consistent API style:** `prerender = false`, zod, typed `VenueSettingsResponse`, error mapping aligned with parties routes.

## Findings

### Low — acceptable for MVP

1. **Synthetic `updated_at` on GET when no row** — `new Date(0).toISOString()` for missing settings is a harmless placeholder; upsert creates a real row on first save.
2. **Guest latency** — venue changes visible on ~30s poll (documented in plan); not a regression.
3. **Generic validation error on bad URL** — API returns zod tree; UI shows `Validation failed` message from `error` field only — sufficient for MVP.

### No action required

- `refresh` exported from hook but unused — available for future polish.
- Load and save errors share `ServerError` in form — clear enough for two-field editor.

## Automated checks

- `npm run lint` — pass (review run 2026-06-12)
- `npm run build` — pass (Phase 2)

## Recommendation

1. Archive with `/10x-archive staff-configure-guest-venue-info` when ready.
2. Optional polish: deploy docs for `PUBLIC_SUPABASE_*` (carried from S-05 review).
