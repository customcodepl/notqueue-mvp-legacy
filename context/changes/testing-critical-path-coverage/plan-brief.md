# Critical-path coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Stand up Vitest and lock three production-shaped failures: guest poll showing the wrong error (or clobbering SSR), a guest token reading someone else’s party, and anonymous callers mutating or listing the staff queue. Motivation is the test-plan Phase 1 risks #1, #2, #5 after a real prod env/1042 incident — cheapest tests with a real signal, not e2e.

## Starting Point

No runner, no `*.test.ts`, CI is lint+build. Guest path is SSR RPC + React poll; staff APIs use `requireStaffUser` (middleware does not cover `/api`). Privacy is `get_guest_party_view` + RLS; `rls_smoke.sql` is manual and unasserted.

## Desired End State

`npm test` proves hook error taxonomy, 401 on every staff parties/venue GET+POST+PATCH without a session, and (when local Supabase is up) anon cannot list parties and the seed token returns only that party. Cookbook in `test-plan.md` tells the next change where to add tests; Risk #1 wording splits unavailable vs invalid link.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Privacy tests | Live SQL + skip if no DB | Mocking RLS would fake #2 | Research / Plan |
| 401 surface | All staff GET+POST+PATCH | GET `/api/parties` would leak the waitlist | Research / Plan |
| Unauth mechanism | Stub `getUser` → null | Missing env is 503, not 401 | Research / Plan |
| File layout | Colocated `*.test.ts` | Next to the unit under test | Plan |
| Docs close | Cookbook + §2 backport | Skill requires §6; research corrected RPC vs unavailable | Research / Plan |
| CI | Not this change | Test-plan rollout Phase 3 | Test plan |

## Scope

**In scope:** Vitest bootstrap, hook unit tests, staff unauth table, RLS assertions + skip, cookbook + §2 cell.

**Out of scope:** Playwright, Cloudflare e2e, CI `npm test`, SMS, ETA (#6), QR reissue (#4), Container API for `.astro`, dashboard redirect tests.

## Architecture / Approach

Three in-process layers: mock the Supabase **client** for hooks and 401s; hit real Postgres for privacy. Never mock policies. jsdom for hooks, node for API routes, `getViteConfig()` for `@/`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Bootstrap Vitest | `npm test` + config | Alias/`astro:env` breaks the runner |
| 2. Hook classification | Risk #1 strings + SSR keep | Testing HEAD behavior instead of working tree |
| 3. Staff 401 table | Risk #5 + GET leak | Asserting 503 from unset env |
| 4. Privacy SQL | Risk #2 or explicit skip | Mocking RLS to stay green |
| 5. Cookbook + backport | §6 + §2 Risk #1 | Leaving TBD placeholders |

**Prerequisites:** Node 22; Docker only for Phase 4 non-skip path.
**Estimated effort:** ~2 sessions (setup+hook+401, then SQL+docs).

## Open Risks & Assumptions

- Working-tree guest env-pass-through stays the oracle; if reverted, Phase 2 cases must be updated.
- Phase 4 skip must remain visible so CI-without-Docker (later) does not silently drop #2.

## Success Criteria (Summary)

- `npm test` is green without Docker; with `supabase start` + reset, privacy tests run.
- A new staff API without `requireStaffUser` fails the unauth table.
- A contributor can follow §6 to add the next unit or 401 row.
