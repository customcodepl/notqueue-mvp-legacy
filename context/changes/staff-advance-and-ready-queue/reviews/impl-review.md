# Implementation Review: staff-advance-and-ready-queue (S-03)

**Reviewed:** 2026-06-11  
**Plan:** `context/changes/staff-advance-and-ready-queue/plan.md`  
**Commits:** `a23c918` (p1) · `3ec114f` (p2) · `c1baaa5` (p3) · `26ef79a` (epilogue)

## Verdict

**Pass with minor notes** — implementation matches the approved plan and PRD FR-004–006. All three phases delivered; manual verification confirmed by author. Safe to archive after roadmap status update.

## Plan conformance

| Requirement | Status | Notes |
|---|---|---|
| FR-004 Call next (seat front + renumber) | ✅ | `advanceQueue` + `POST /api/parties/advance` + header button |
| FR-005 Mark ready | ✅ | `markPartyReady` + per-row Ready + Ready section |
| FR-006 Manual ETA (nullable) | ✅ | `PATCH /api/parties/[id]` + inline blur save |
| Ready → Seat two-step lifecycle | ✅ | `seatParty` on ready parties only |
| `GET { waiting, ready }` | ✅ | Parallel fetch in `parties.ts` route |
| Hook mutations + refresh | ✅ | `useQueueParties` exposes all five actions |
| No new migrations | ✅ | App-layer renumber per plan decision |
| Out of scope (S-05 Realtime, S-04 venue UI) | ✅ | Not introduced |

## Strengths

- **Consistent API patterns:** `prerender = false`, zod validation, `requireStaffUser`, typed DTOs — matches S-01/S-02.
- **State guards:** `InvalidPartyStateError` on wrong status; `EmptyQueueError` → 409 for advance on empty queue.
- **Renumber invariant:** `repackWaitingPositions` called after advance and mark-ready; positions stay contiguous.
- **Dashboard UX:** Per-action loading spinners; `queueBusy` prevents double-taps; responsive row layout with `flex-wrap`.
- **Guest data path:** Mutations update `parties` rows consumed by existing `get_guest_party_view` RPC — unblocks S-05.

## Findings

### Low — acceptable for MVP

1. **Duplicate `PartyNotFoundError`** in `parties.ts` and `guestTokens.ts`. Harmless; consolidate in a future refactor.
2. **Invalid ETA input resets silently** on blur (`PartyEtaInput`) — no inline validation message. Plan allowed blur-only MVP; consider toast in S-05 polish pass.
3. **App-layer renumber race** (documented in plan-brief) — concurrent advance + add could briefly duplicate positions. Accepted risk.
4. **`Call next` seats directly** (`status → seated`) rather than `ready` first — matches planning decision (advance = seat front); distinct from per-row Ready flow.

### No action required

- `PartyNotFoundError` in `parties.ts` does not verify party belongs to default venue — same single-venue assumption as S-01/S-02.
- Ready section empty state hidden while `loading` — brief flash possible on first load; not reported in manual testing.

## Automated checks

- `npm run lint` — pass (review run 2026-06-11)
- `npm run build` — pass (Phase 3)

## Recommendation

1. Update `context/foundation/roadmap.md` S-03 status to `done`.
2. Archive with `/10x-archive staff-advance-and-ready-queue` when ready.
3. Next slice: **S-05 guest-live-wait-status** (consume `position`, `eta_minutes`, `status` + Realtime).
