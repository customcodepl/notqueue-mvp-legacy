# Staff Add Party to Queue — Plan Brief

> Full plan: `context/changes/staff-add-party-to-queue/plan.md`
> Research: `context/changes/queue-schema-and-guest-tokens/plan.md` (F-01 schema baseline)

## What & Why

Staff need an operational queue screen after sign-in: add a waiting party (name, party size) and see it in the live waiting list. This is S-01 — the first staff-facing vertical slice on the F-01 schema, unblocking S-02 (QR issue) and S-03 (advance/ready/ETA).

## Starting Point

F-01 is implemented: `parties`, `venues`, RLS staff INSERT policies, `src/types.ts`, and seed data (`Demo Restaurant`, Smith party at position 1). Auth works (cookie SSR, `/dashboard` protected) but the dashboard is a placeholder welcome screen. No queue API routes, no `zod` runtime dependency, no `src/lib/services/`.

## Desired End State

A signed-in staff member lands on `/dashboard`, enters party name and size, submits, and sees the new party appended at the end of the waiting queue list — without page reload. `POST /api/parties` and `GET /api/parties` establish the canonical queue API pattern (SSR, zod, JSON, auth guard). Sign-in redirects to `/dashboard` instead of `/`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Position on add | Append (max + 1) | New walk-ins go to the back — matches host-stand workflow | Plan |
| Dashboard scope | Add form + waiting list | Immediate confirmation; foundation for S-02/S-03 | Plan |
| API style | JSON fetch + zod API routes | Establishes canonical queue API per repo rules | Plan |
| Post-login redirect | `/dashboard` | Staff go straight to queue ops (FR-001) | Plan |
| Venue resolution | Fetch first venue at runtime | No hardcoded UUIDs; works with seed and future venues | Plan |
| ETA on add | Defer to S-03 | Keep add form minimal (name + size only per FR-002) | Plan |
| Success UX | Clear form + refresh list in place | Fast repeat adds during rush without reload | Plan |

## Scope

**In scope:** `zod` dependency; `POST`/`GET /api/parties`; party service helpers (venue lookup, position append); React dashboard with add form + waiting list; sign-in redirect to `/dashboard`.

**Out of scope:** Guest tokens / QR (S-02); advance queue, ETA edit, mark ready (S-03); venue settings UI (S-04); Realtime subscriptions (S-05); SMS; multi-venue staff mapping; editing or removing parties from UI.

## Architecture / Approach

```
Staff browser → /dashboard (React island)
                    ↓ fetch
              GET/POST /api/parties (auth + zod)
                    ↓ Supabase SSR client (authenticated)
              parties INSERT (RLS staff_insert_parties)
              position = MAX(waiting) + 1 for venue
```

Single-venue MVP: API resolves venue via `SELECT id FROM venues ORDER BY created_at LIMIT 1`. List endpoint returns `status = 'waiting'` parties ordered by `position`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API foundation | zod, party service, GET/POST `/api/parties` | Concurrent adds may briefly share position (acceptable MVP) |
| 2. Dashboard UI | Add form + waiting list React island | First non-auth React feature — reuse FormField patterns |
| 3. Auth redirect | Sign-in → `/dashboard` | Small auth-route touch |

**Prerequisites:** F-01 applied locally (`npx supabase db reset`); staff test account; `.env` / `.dev.vars` with Supabase keys.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Position append uses read-then-write without DB locking — two simultaneous adds could get the same position; acceptable for single-host MVP, fix in S-03 if needed.
- `fetch_first` venue breaks if multiple venues exist without staff-venue mapping — deferred per F-01 non-goals.
- API routes are not middleware-protected; handlers must enforce auth explicitly.

## Success Criteria (Summary)

- Signed-in staff adds a party from `/dashboard` and sees it at the end of the waiting list.
- `npm run lint` and `npm run build` pass; `POST /api/parties` returns 401 when unauthenticated.
- Sign-in lands on `/dashboard`; seed party (Smith) still visible alongside new additions.
