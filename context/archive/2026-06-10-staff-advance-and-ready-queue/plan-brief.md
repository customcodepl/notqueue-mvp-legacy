# Staff Advance and Ready Queue — Plan Brief

> Full plan: `context/changes/staff-advance-and-ready-queue/plan.md`

## What & Why

Staff need to operate the live waitlist during service: call the next party (advance the queue), tell guests how long to wait (manual ETA), notify them when a table is ready, and clear seated parties. This is S-03 — the staff operations slice that makes queue state authoritative for the guest page (S-05) and Realtime updates.

## Starting Point

F-01 schema is live: `parties` has `position`, `eta_minutes`, `status` (`waiting` → `ready` → `seated`), staff UPDATE RLS, and `parties` in the Realtime publication. S-01 delivers add-party + waiting list; S-02 adds per-row QR. `GET`/`POST /api/parties` and `QueueDashboard` list **waiting only**. No advance, ETA edit, mark-ready, or seat mutations exist. Guest stub at `/guest/[token]` shows position but not ETA or ready state (S-05).

## Desired End State

A signed-in host on `/dashboard` can tap **Call next** to seat the front waiting party and renumber the line; set or clear per-party ETA inline on each waiting row; mark any waiting party **Ready** (moves to a separate Ready section); and **Seat** ready parties when they are shown to their table. Mutations flow through action-specific API routes; `get_guest_party_view` reflects new `position`, `eta_minutes`, and `status` immediately.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Advance semantics | Seat front party + renumber | One-tap "call next" matches host-stand workflow | Plan |
| Ready vs seated | Ready first, seat later | Supports FR-013 guest ready state before party leaves queue | Plan |
| Ready on dashboard | Separate Ready section | Staff see who still needs to be shown to their table | Plan |
| ETA UX | Inline edit per row | Fewest taps during rush; nullable = unknown per PRD | Plan |
| Position reorder | App-layer (no migration) | Ships fast; acceptable for single-host MVP per S-01 precedent | Plan |
| Global advance | "Call next" in queue header | Clear separation from per-party Ready/ETA actions | Plan |
| API shape | Action-specific nested routes | Mirrors guest-token pattern; explicit per-FR contracts | Plan |
| ETA clear | Allow null (unknown) | Prevents stale misleading ETAs per PRD guardrail | Plan |

## Scope

**In scope:** Service helpers (`advanceQueue`, `markPartyReady`, `seatParty`, `updatePartyEta`, `listReadyParties`); `POST /api/parties/advance`, `PATCH /api/parties/[partyId]` (ETA), `POST .../ready`, `POST .../seat`; expanded `GET /api/parties` (`waiting` + `ready`); `useQueueParties` mutations; dashboard UI (Call next, inline ETA, Ready section).

**Out of scope:** Guest live status UI / Realtime subscriptions (S-05); venue settings (S-04); SMS; new Supabase migrations; skip/remove arbitrary waiting party without seating; auto-ETA; multi-venue staff mapping; editing party name/size.

## Architecture / Approach

```
/dashboard (React)
    ↓ fetch / mutate
GET /api/parties → { waiting, ready }
POST /api/parties/advance          → seat front, renumber waiting
PATCH /api/parties/[id] { eta }    → set/clear ETA (waiting only)
POST /api/parties/[id]/ready       → status=ready, renumber waiting
POST /api/parties/[id]/seat        → status=seated (from ready)
    ↓ Supabase SSR (authenticated, RLS staff_update_parties)
parties UPDATE → updated_at trigger → Realtime pub (for S-05)
```

Renumbering: after front party leaves waiting (seat or ready), decrement `position` by 1 for all remaining `waiting` parties with `position` greater than the removed party's former position. App-layer sequential updates (no DB RPC).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Queue service & mutation API | Service helpers + advance/ready/seat/ETA routes | Renumber must stay consistent if concurrent mutations |
| 2. List API & hook | `GET` returns waiting + ready; hook mutations + refresh | Breaking change to `PartyListResponse` shape |
| 3. Dashboard UI | Call next, inline ETA, Ready section, Seat | Crowded mobile row layout with QR + ETA + Ready |

**Prerequisites:** F-01 + S-01 applied locally; staff test account; seed or manual parties in queue.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- App-layer renumber without row locks may briefly produce duplicate positions under concurrent advance + add — acceptable for single-host MVP (same as S-01).
- `GET /api/parties` response shape changes from `{ parties }` to `{ waiting, ready }` — update hook and dashboard in same change.
- Ready parties keep `position = null`; guest page (S-05) will show ready state without queue number.
- API routes are not middleware-protected; handlers must call `requireStaffUser` explicitly.

## Success Criteria (Summary)

- Staff can call next, set/clear ETA, mark ready, and seat from `/dashboard` without page reload.
- Waiting list renumbers correctly after advance or mark-ready; ready parties appear in separate section.
- `get_guest_party_view` returns updated `position`, `eta_minutes`, and `status` after each action.
- `npm run lint` and `npm run build` pass.
