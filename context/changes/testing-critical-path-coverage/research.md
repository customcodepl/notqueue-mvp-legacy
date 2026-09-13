---
date: 2026-09-13T21:51:58+02:00
researcher: 10x-research
git_commit: 07f5942ef0084d2653d093d62143b4bbd3691866
branch: main
repository: notqueue
topic: "Ground rollout Phase 1 of context/foundation/test-plan.md (risks #1, #2, #5)"
tags: [research, codebase, guest-status, rls, staff-api, vitest]
status: complete
last_updated: 2026-09-13
last_updated_by: 10x-research
---

# Research: Ground rollout Phase 1 (risks #1, #2, #5)

**Date**: 2026-09-13T21:51:58+02:00
**Researcher**: 10x-research
**Git Commit**: 07f5942ef0084d2653d093d62143b4bbd3691866
**Branch**: main
**Repository**: notqueue

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`.

Risks to verify: #1, #2, #5.

Risk response guidance to verify, not blindly accept:

- #1: prove valid token → that party's status; bad env/RPC → unavailable without other parties' data; challenge "SSR first paint means prod works"; avoid Cloudflare e2e and mirroring the browser client helper.
- #2: prove guest response contains one party's fields only; wrong token ≠ that party; challenge "staff SELECT proves guest privacy"; avoid mocking RLS.
- #5: prove staff mutations return 401 without a session; challenge "dashboard middleware protects /api"; avoid UI-redirect-only tests.

Hot-spot directories: `src/` (likelihood evidence, not anchors). Stack: none yet — Vitest via Astro `getViteConfig()`; mock at Supabase HTTP edge.

## Summary

Phase 1 is **not speculative**. The three risks map to real, separate surfaces:

| Risk | Real failure path | Cheapest useful layer | Guidance verdict |
|------|-------------------|----------------------|------------------|
| #1 | Dual client (SSR `createClient` + browser poll). RPC fail → **"invalid/expired"**, not unavailable. Null browser client → unavailable. Working-tree WIP preserves SSR when poll has no client. Cloudflare **1042 is not** a GuestStatus JSON bug. | Unit: classify `useGuestPartyView` outcomes given mocked RPC / null client (oracle = the two user-facing strings and "do not clobber a good `initialData`"). Integration: `get_guest_party_view` with real token. Env/`PUBLIC_*` = smoke gate, not Vitest. | Accept challenges. **Correct** the plan's "bad env/RPC → unavailable" — RPC errors are labeled expired link. Reject Cloudflare e2e and client-helper mirrors. |
| #2 | Privacy is `get_guest_party_view` `WHERE token = p_token` (SECURITY DEFINER) plus anon RLS. App guest path **only** calls that RPC. Staff `auth.uid() IS NOT NULL` SELECT sees the **full waitlist** and does **not** prove guest privacy. | SQL/RPC against live local Postgres with RLS (`rls_smoke.sql` extended with assertions). Do not mock RLS. | Accept. Existing smoke file is manual and incomplete (revoke commented; no expected counts). |
| #5 | `PROTECTED_ROUTES` is only `/dashboard` (HTML redirect). Every staff parties/venue handler calls `requireStaffUser` → **401** JSON without session, **503** if Supabase env missing. | Vitest: invoke each `APIRoute` with a `Request` that has no Cookie; assert 401. Optional: stub `getUser` at the auth HTTP edge. Do not test only the dashboard redirect. | Accept. Challenge is correct. |

Test base is **`none`**: no Vitest config, no `*.test.ts`. Bootstrap `getViteConfig()` from `astro/config`, keep `@/` alias, Node environment (not workerd). `sms-table-ready` does not change this auth surface.

**Working tree (uncommitted, 2026-09-13):** `src/pages/guest/[token].astro`, `GuestStatus.tsx`, `useGuestPartyView.ts`, `supabase-browser.ts` pass SSR `SUPABASE_*` into the island when `PUBLIC_*` is empty, and skip setting unavailable if `initialData` exists. Research and Phase 1 tests must target **this** behavior, not an older "always overwrite SSR" HEAD-only story.

## Detailed Findings

### Risk #1 — Guest QR / status availability

**Entry.** Staff issue API builds `guest_url` as `{origin}/guest/{encodeURIComponent(token)}` (`src/lib/api.ts:13-16`, used in `src/pages/api/parties/[partyId]/guest-token.ts:12-16`). `/guest/*` is not in `PROTECTED_ROUTES`.

**SSR.** `src/pages/guest/[token].astro` (`prerender = false`): empty token → invalid link; `createClient` null → `"Service is temporarily unavailable."`; `get_guest_party_view` error or `data === null` → `"This link is invalid or has expired."`; else `guestView` (`[token].astro:18-30`).

**Browser poll.** `useGuestPartyView` (`src/components/hooks/useGuestPartyView.ts`) always `rpc("get_guest_party_view")` after `createBrowserClient`. Constants: invalid = expired string (`:5-6`); unavailable (`:7`).

Working tree:

- `createBrowserClient({ url, anonKey })` (`src/lib/supabase-browser.ts:5-10`).
- Null client: stop poll; set unavailable **only if `!initialData`** (`useGuestPartyView.ts:51-59`).
- Astro passes `PUBLIC_SUPABASE_* || SUPABASE_*` into island props (`[token].astro:11-12, 39-45`).
- `GuestStatus` prefers hook `error` over a live view (`GuestStatus.tsx:176-180`). RPC error/null still **overwrites a successful SSR paint** with the expired-link string (`useGuestPartyView.ts:64-68`).

**1042.** Guest page does not `response.json()`. Staff QR modal does (`useGuestToken.ts`) — that is the issue-QR UI, not the guest status page. Cloudflare 1042 is Worker-to-Worker / same-zone fetch (often `SUPABASE_URL` pointed at `*.workers.dev`). Treat as **deploy/env smoke**, not a unit-tested JSON parser.

**What unit tests can prove:** given `initialData` vs null, null client vs RPC `{ error }` vs `{ data: party }` vs `{ data: null }`, the hook sets the **documented user strings** and whether `initialData` survives. Oracle is PRD/UX copy already used in SSR (`unavailable` vs `invalid`), not a reimplementation of `createBrowserClient`.

**What they cannot prove:** Vite inlining of `PUBLIC_*` on Workers Builds; real 1042 pages.

**Must challenge (confirmed):** "SSR first paint means prod works" — poll still owns durable errors on RPC failure. "1042 is a JSON parse bug in GuestStatus" — false for the guest page.

### Risk #2 — Guest token privacy

**RPC contract.** `get_guest_party_view` in `supabase/migrations/20260609120100_queue_rls.sql:155-184`: `SECURITY DEFINER`; `set_guest_context` then single `json_build_object` for **one** token join. Invalid token → exception in `set_guest_context` (`:138-148`). Isolation is `WHERE gt.token = p_token AND revoked_at IS NULL`, not staff RLS. Token column is UNIQUE (`20260609120000_queue_schema.sql` `guest_tokens.token`).

**App.** Guest SSR and poll **only** call this RPC (`[token].astro:25`, `useGuestPartyView.ts:62`). No `.from("parties")` on the guest page.

**Staff SELECT does not prove privacy.** `staff_select_parties` (`queue_rls.sql:41-45`) is `USING (auth.uid() IS NOT NULL)` — any authenticated user can read **all** parties. Same pattern on `guest_tokens` and `venue_settings`.

**Anon without context.** `GRANT SELECT` on `parties` / `venue_settings` only (`:186-192`); policies require `app.guest_token`. Direct PostgREST select after a separate `set_guest_context` RPC **does not** keep GUC across HTTP requests (F-01 lesson / archive plan). Guest app correctly uses the combined RPC.

**Existing smoke.** `supabase/tests/rls_smoke.sql`: (a) `SET ROLE anon; SELECT count(*) FROM parties` with **no assertion**; (b) eyeball `get_guest_party_view('demo-guest-token-local-only')`; (c) revoke **commented out**. Runner: `npx supabase db query --file …`, not Vitest.

**Seed token** `demo-guest-token-local-only` (`supabase/seed.sql:22-23`) is a local fixture, not a cross-party leak. Production tokens use `crypto.getRandomValues` (`src/lib/services/guestTokens.ts:5-9`).

**Cheapest layer:** execute SQL/RPC on local Supabase with RLS + seed: anon count = 0; valid token → Smith fields only; wrong token errors; optional second party so token A ≠ party B. Vitest may **shell** that query; it must not mock policies.

### Risk #5 — Unauthenticated staff mutations

**Middleware does not cover `/api`.** `src/middleware.ts:4, 18-21` — only `/dashboard`, redirect to `/auth/signin`. Handlers ignore `locals.user` and re-check via `requireStaffUser`.

**Gate.** `src/lib/api.ts:18-32`: no client → 503 `{ error: "Supabase is not configured" }`; `getUser()` null → 401 `{ error: "Unauthorized" }`. Cookies from the request (`src/lib/supabase.ts`).

**Every staff parties/venue export calls `requireStaffUser` first:**

| Method | Path | File |
|--------|------|------|
| GET, POST | `/api/parties` | `src/pages/api/parties.ts` |
| POST | `/api/parties/advance` | `advance.ts` |
| PATCH | `/api/parties/[partyId]` | `[partyId].ts` |
| POST | `/api/parties/[partyId]/ready` | `ready.ts` |
| POST | `/api/parties/[partyId]/seat` | `seat.ts` |
| GET, POST | `/api/parties/[partyId]/guest-token` | `guest-token.ts` |
| GET, PATCH | `/api/venue/settings` | `venue/settings.ts` |

No DELETE routes. Auth `signin`/`signup`/`signout` are public by design. GET staff routes are also gated (no anonymous waitlist JSON).

**RLS defense in depth:** anon has no INSERT/UPDATE on `parties`. API 401 is still the client contract to test.

**Cheapest layer:** table-driven Vitest invoking each mutation `POST`/`PATCH` (and ideally the three GETs) with empty Cookie; assert 401 JSON. Stub `auth.getUser` at the Supabase client edge if a live project is undesirable for Phase 1. **Do not** treat dashboard redirect as proof.

**Residual (out of Phase 1 map):** any logged-in user can manage the single MVP venue (`auth.uid() IS NOT NULL`). Not Risk #5 (anon).

### Test infrastructure

- No Vitest/Jest/Playwright; `package.json` has no `test` script; CI is lint + build (`.github/workflows/ci.yml`).
- Astro testing docs: `getViteConfig()` from `astro/config` so `@/*` works.
- `astro:env` imports are real; optional schema in `astro.config.mjs`. Tests that import `supabase.ts` need env or must stay above that import.
- Vitest runs in **Node**, not Cloudflare `workerd` — 1042 / asset 404-page self-fetch stay outside the suite.
- Container API for `.astro` needs `environment: 'node'` if used; Phase 1 can skip rendering `[token].astro` if the hook + RPC + APIRoute table cover the risks cheaper.

## Code References

- `src/pages/guest/[token].astro:11-45` — SSR RPC, env fallback into island (working tree)
- `src/components/hooks/useGuestPartyView.ts:5-74` — poll, null client, RPC error classification
- `src/components/guest/GuestStatus.tsx:167-180` — hook error wins over view
- `src/lib/supabase-browser.ts:5-12` — optional url/anonKey
- `src/lib/supabase.ts` — server client null if secrets missing
- `src/lib/api.ts:13-32` — `guestUrlFromRequest`, `requireStaffUser`
- `src/middleware.ts:4-21` — `/dashboard` only
- `src/pages/api/parties.ts` and nested party/venue routes — `requireStaffUser`
- `supabase/migrations/20260609120100_queue_rls.sql:41-45, 155-197` — staff SELECT vs guest RPC
- `supabase/tests/rls_smoke.sql` — manual, incomplete
- `supabase/seed.sql:22-23` — demo token
- `astro.config.mjs` — optional `PUBLIC_SUPABASE_*`
- `package.json` — no test runner

Committed permalinks (HEAD; guest files may differ in the working tree):

- https://github.com/customcodepl/notqueue/blob/07f5942ef0084d2653d093d62143b4bbd3691866/src/middleware.ts#L4
- https://github.com/customcodepl/notqueue/blob/07f5942ef0084d2653d093d62143b4bbd3691866/src/lib/api.ts#L18-L32
- https://github.com/customcodepl/notqueue/blob/07f5942ef0084d2653d093d62143b4bbd3691866/supabase/migrations/20260609120100_queue_rls.sql#L155-L184
- https://github.com/customcodepl/notqueue/blob/07f5942ef0084d2653d093d62143b4bbd3691866/supabase/tests/rls_smoke.sql

## Architecture Insights

- Guest reads are **token RPC in one DB transaction**; staff writes are **cookie SSR client + RLS authenticated**.
- UI error taxonomy is two strings only. Infra (null client, missing env) vs token (RPC error/null) must not be collapsed in tests the way the test-plan one-liner collapsed them.
- Auth is **defense in depth**: middleware (HTML), `requireStaffUser` (JSON 401), RLS (anon cannot write). Phase 1 tests the JSON contract; RLS write denial is extra, not a substitute for 401.
- Polling interval (30s in code vs ~5s in `lessons.md`) is irrelevant to Phase 1 risks; do not test the timer.

## Historical Context (from prior changes)

- `context/archive/2026-06-09-queue-schema-and-guest-tokens/plan.md` — combined guest RPC because GUC does not survive two PostgREST calls; introduced `rls_smoke.sql`.
- `context/archive/2026-06-09-staff-issue-party-qr/plan.md` — guest-token API + `requireStaffUser`; testing was curl, not automated.
- `context/archive/2026-06-12-guest-live-wait-status/plan.md` and `reviews/impl-review.md` — `PUBLIC_SUPABASE_*`; missing client env replaces first paint with unavailable (the defect the working tree now softens).
- `context/foundation/lessons.md` — opaque tokens, RPC issue/reissue, polling not Realtime.
- `context/changes/sms-table-ready/` — planned SMS; **ignore for Phase 1 auth/guest RPC tests**.

## Related Research

- None under `context/changes/*/research.md` except this file.
- Archive slice `plan.md` files above; no prior `research.md` for this change-id.

## Open Questions

- Whether Phase 1 should **require** local `npx supabase` for RLS SQL, or ship Vitest API/hook tests first and keep SQL as a documented manual gate until a job can assume Docker. Cost × signal: hook + APIRoute 401 do not need Docker; **privacy (#2) does** if we refuse to mock RLS.
- Whether to assert GET staff 401 in the same table as mutations (recommended: yes, cheap, prevents waitlist leak via `/api/parties`).
- Backport to `test-plan.md` §2 Risk #1 response cell: split env/unavailable vs RPC/invalid; do not add file anchors. Defer to `/10x-test-plan` or `--refresh` unless the user asks to edit §2 now.

## Recommended Phase 1 test slices (for `/10x-plan`)

1. **Bootstrap Vitest** with `getViteConfig()`, `npm test`, Node env, `@/` alias.
2. **Unit** `useGuestPartyView`: null client + `initialData` keeps view / no unavailable; null client + no initial → unavailable; RPC error/null → invalid string (even if initial existed); success payload is that party's DTO fields only (fixture, not live DB).
3. **Integration HTTP** staff `POST`/`PATCH` without Cookie → 401 on every mutation route listed above.
4. **SQL against real RLS** (if Docker/local Supabase is an acceptable Phase 1 dependency): anon `count(*) = 0`; valid seed token view; wrong token errors. If Docker is out of scope, say so in the plan and keep #2 as a blocked sub-phase rather than mocking RLS.
5. **Do not:** Playwright, Cloudflare e2e, `createBrowserClient` source mirror, dashboard redirect-only, SMS, ETA copy (Risk #6 is Phase 2).
