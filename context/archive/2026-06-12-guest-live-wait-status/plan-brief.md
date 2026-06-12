# Guest Live Wait Status — Plan Brief

> Full plan: `context/changes/guest-live-wait-status/plan.md`

## What & Why

Guests who scanned their QR need to see authoritative wait status on their phone — position, ETA, venue info, and a clear table-ready state — updating when staff act, without creating an account. This is S-05, the roadmap north star: it proves the product hypothesis that wait transparency belongs on the guest's phone.

## Starting Point

F-01 delivers `get_guest_party_view(token)` returning `display_name`, `party_size`, `position`, `eta_minutes`, `status`, `menu_link`, `info_text`. S-03 staff mutations keep `parties` authoritative and on the Realtime publication. The guest page at `/guest/[token]` is an S-02 SSR stub: name, size, position only, plus a “coming soon” placeholder. No client Supabase, no React island, no polling.

## Desired End State

A guest opens `/guest/{token}` on mobile, sees full status (waiting with position + ETA or “Wait time unknown”, ready hero, or seated thank-you), optional venue info when present in RPC, and the view refreshes automatically every 30 seconds (pausing when the tab is hidden). Staff actions from `/dashboard` appear within one poll cycle without manual refresh.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Live updates | Poll `get_guest_party_view` every 30s | Works with current RLS/RPC; no migration or custom JWT | Plan |
| Guest client | Browser Supabase + RPC | Matches F-01 combined read contract | Plan |
| S-04 dependency | Render venue fields; S-04 parallel | Unblocks north star; seed/demo values suffice until staff UI | Plan |
| Ready UX | Full-screen ready hero | Unmistakable FR-013 distinct state | Plan |
| Seated UX | Thank you / enjoy your meal | Clear terminal state without fake “expired” error | Plan |
| Polling visibility | Pause when hidden; refresh on focus | Saves battery; fresh data when guest looks back | Plan |
| ETA unknown | “Wait time unknown” copy | PRD guardrail — no misleading ETAs | Plan |
| Realtime | Deferred | Anon WebSocket cannot set `app.guest_token` per F-01 | Research |

## Scope

**In scope:** `PUBLIC_SUPABASE_*` client env; browser Supabase client; `useGuestPartyView` hook; `GuestStatus` React island; Astro SSR bootstrap + hydration; waiting/ready/seated UI; venue info display; 30s polling with visibility pause.

**Out of scope:** Supabase Realtime subscriptions; custom guest JWT migration; `GET /api/guest/[token]` BFF; S-04 staff venue settings UI; SMS (FR-014); staff dashboard Realtime; seated token revocation.

## Architecture / Approach

```
/guest/[token].astro (SSR)
    ↓ initial get_guest_party_view (server anon client)
    ↓ pass GuestPartyView + token to island
GuestStatus (React, client:load)
    ↓ createBrowserClient (PUBLIC anon key)
    ↓ rpc('get_guest_party_view', { p_token }) every 30s
    ↓ pause interval when document.hidden; poll on visible
```

No new API routes or migrations. Invalid/revoked token → error UI; stop polling.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Client Supabase & guest hook | Env schema, browser client, polling hook | Client env must be set in `.dev.vars` + Cloudflare for prod |
| 2. Guest status UI | GuestStatus component (all status states) | Ready hero layout shift on status flip |
| 3. Astro integration | Wire island, remove stub placeholder | SSR + client duplicate fetch on mount (acceptable) |

**Prerequisites:** Local Supabase with seed token `demo-guest-token-local-only`; staff path S-01–S-03 for manual E2E.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` duplicate server secrets in deploy config — same values as `SUPABASE_URL` / `SUPABASE_KEY` (publishable anon key).
- 30s poll means up to ~30s delay after staff “Ready” — acceptable for MVP; Realtime is follow-up.
- `venue_settings` changes require poll to pick up (not Realtime) — rare until S-04.
- Reissued guest token invalidates old link — existing S-02 behavior; poll shows error.

## Success Criteria (Summary)

- Guest sees position, ETA (or unknown), ready hero, seated thank-you, and venue info without login.
- Status updates within ~30s of staff actions without manual page refresh.
- `npm run lint` and `npm run build` pass with client + server Supabase env vars set.
