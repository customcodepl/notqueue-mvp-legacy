# Implementation Review: guest-live-wait-status (S-05)

**Reviewed:** 2026-06-10  
**Plan:** `context/changes/guest-live-wait-status/plan.md`  
**Commits:** `c8df6ab` (p1) · `0a4b523` (p2–p3) · `2079da3` (epilogue)

## Verdict

**Pass with minor notes** — implementation matches the approved plan and PRD FR-008–013 / US-01. All three phases delivered; manual verification confirmed. Safe to archive after roadmap status update.

## Plan conformance

| Requirement | Status | Notes |
|---|---|---|
| FR-008 Guest status without login | ✅ | Public `/guest/[token]` + RPC |
| FR-009 Position when waiting | ✅ | Shown when `position !== null` |
| FR-010 ETA or unknown | ✅ | `{n} min` or “Wait time unknown” |
| FR-011 Venue info from RPC | ✅ | `VenueSection` for `info_text` / `menu_link` |
| FR-012 Live updates (30s poll) | ✅ | `useGuestPartyView` + visibility pause |
| FR-013 Distinct ready state | ✅ | Green hero; no queue number |
| Seated thank-you state | ✅ | `SeatedView` copy per plan |
| SSR bootstrap + React island | ✅ | `[token].astro` + `GuestStatus client:load` |
| `PUBLIC_SUPABASE_*` client env | ✅ | `astro.config.mjs`, `.env.example`, CI |
| Browser Supabase + RPC (no BFF) | ✅ | `supabase-browser.ts` |
| No Realtime / no new migrations | ✅ | Polling only |
| Out of scope (S-04 editor, SMS) | ✅ | Not introduced |

## Strengths

- **SSR + client pattern:** First paint from server RPC; hook avoids flash when `initialView` is present; `initialError` surfaces invalid links without waiting for client fetch.
- **Polling discipline:** 30s interval, stops on RPC error (revoked token), pauses on `document.hidden`, immediate refresh on focus — matches plan contract.
- **Status-driven UI:** Waiting / ready / seated layouts are visually distinct; ready hero omits position (S-03 sets `position = null` for ready/seated).
- **Consistent styling:** Glass card, cosmic layout, `cn()`, lucide icons — aligned with S-02 stub and staff dashboard.
- **CI parity:** GitHub Actions maps `PUBLIC_*` from existing Supabase secrets so client bundle builds in CI.

## Findings

### Low — acceptable for MVP

1. **`PUBLIC_SUPABASE_*` deploy docs** — `.env.example` and plan note Cloudflare secrets, but `README.md` / `docs/DEPLOY.md` do not yet list the two new public vars. Add before prod deploy to avoid “Service is temporarily unavailable” on client poll.
2. **Misconfigured client env** — If SSR succeeds but `PUBLIC_SUPABASE_*` are missing in the browser bundle, the hook replaces a valid first paint with unavailable error. Expected for misconfig; document in deploy checklist.
3. **Polling after seated** — Hook keeps polling while guest sees thank-you state. Harmless; could stop interval on `status === 'seated'` in a polish pass.
4. **`refresh` unused** — Exported from hook but not wired to UI. Plan did not require pull-to-refresh.

### No action required

- Ready view shows name in hero but not party size — plan copy focuses on “Your table is ready!”; acceptable.
- Invalid-token SSR still mounts island and runs one client RPC — redundant but consistent.
- `default` branch in status switch treats unknown status as waiting — only three enum values exist in schema.

## Automated checks

- `npm run lint` — pass (review run 2026-06-10)
- `npm run build` — pass (Phase 3)

## Recommendation

1. Document `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in deploy docs before next production release.
2. Archive with `/10x-archive guest-live-wait-status` when ready.
3. Next slice: **S-04 staff-configure-guest-venue-info** (staff editor for `menu_link` / `info_text`) or polish (Realtime investigation, faster poll on ready).
