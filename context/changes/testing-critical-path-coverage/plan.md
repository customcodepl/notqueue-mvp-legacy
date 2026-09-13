# Critical-path coverage (test rollout Phase 1) Implementation Plan

## Overview

Bootstrap Vitest and prove three failure modes from `context/foundation/test-plan.md`: guest poll error classification (#1), guest-token privacy on real RLS (#2), and staff API 401 without a session (#5). This change adds a test suite, not product features.

## Current State Analysis

There is no test runner (`package.json` has no `test` script; zero `*.test.ts`). CI is lint + build only. Guest status is a dual client: SSR `get_guest_party_view` plus `useGuestPartyView` polling. Staff APIs are gated per-handler by `requireStaffUser` (`src/lib/api.ts:18-32`); middleware only protects `/dashboard` (`src/middleware.ts:4`). Guest privacy lives in `get_guest_party_view` (`supabase/migrations/20260609120100_queue_rls.sql:155-184`), not staff SELECT policies. Manual `supabase/tests/rls_smoke.sql` has no assertions. Working-tree guest files pass SSR env into the island and preserve `initialData` when the browser client is null — tests must match that behavior.

## Desired End State

`npm test` is the local suite. It fails closed on: (1) hook mapping null-client / RPC error / success to the real user strings and not clobbering SSR data on missing client; (2) every staff parties/venue GET+POST+PATCH returning 401 JSON without a session; (3) anon cannot list parties and a valid seed token returns only that party, when local Supabase is up (otherwise those tests skip, they never mock RLS). `context/foundation/test-plan.md` §6 documents how to add tests; §2 Risk #1 response no longer conflates RPC failure with unavailable.

### Key Discoveries:

- RPC error/null → `"This link is invalid or has expired."`; null browser client → `"Service is temporarily unavailable."` (`useGuestPartyView.ts:5-7, 51-68`). Plan guidance that said “bad env/RPC → unavailable” is wrong.
- Unset `SUPABASE_*` in `requireStaffUser` yields **503**, not 401. Unauth tests must stub a client whose `auth.getUser()` is null.
- Staff SELECT with `auth.uid() IS NOT NULL` sees the full waitlist — not a privacy proof (`queue_rls.sql:41-45`).
- Astro Vitest: `getViteConfig()` from `astro/config` so `@/` resolves. Hooks need jsdom; APIRoute tests can stay node.
- Cloudflare 1042 / `PUBLIC_*` build inlining stay smoke/ops, not this suite.

## What We're NOT Doing

- Playwright, visual diff, dashboard redirect-as-API-proof
- Mirroring `createBrowserClient` as the test oracle
- Mocking RLS or `get_guest_party_view` SQL to “cover” #2
- Wiring `npm test` into GitHub Actions (test-plan rollout Phase 3)
- SMS (`sms-table-ready`), ETA copy (Risk #6), reissue race (Risk #4)
- Rendering `[token].astro` via Container API
- Changing product runtime behavior except if a test cannot import a seam (prefer test-only mocks)

## Implementation Approach

Cost × signal: stand up Vitest once, then three independent proof layers (hook unit → APIRoute table → live SQL). Mock only at the Supabase **client** edge (`rpc` / `getUser`), never policies. Last phase updates the cookbook so `/10x-tdd` has a pattern.

## Critical Implementation Details

**401 vs 503.** Tests for Risk #5 must not rely on missing env. Stub `createClient` (or the module `requireStaffUser` uses) so `getUser()` returns `{ data: { user: null } }` and assert status 401 and body `{ error: "Unauthorized" }`.

**Hook oracle is working-tree behavior.** Null client + `initialData` → no unavailable error, data kept. Null client + no initial → unavailable. RPC `error` or `data === null` → invalid link **even if** `initialData` was set (`GuestStatus` prefers hook error).

**SQL skip, don’t mock.** If local Supabase is unreachable, RLS tests `describe.skip` / `it.skip` with a one-line reason. Never green-wash #2 with fixtures that skip Postgres.

**jsdom vs node.** `environmentMatchGlobs`: `src/components/**/*.test.ts` → jsdom; `src/pages/api/**/*.test.ts` → node.

---

## Phase 1: Bootstrap Vitest

### Overview

Install Vitest (and jsdom + Testing Library for later hook tests), add `vitest.config.ts` via `getViteConfig()`, `npm test` script. One trivial assertion so the runner is proven before risk tests.

### Changes Required:

#### 1. Runner config and scripts

**File**: `vitest.config.ts`, `package.json`, `AGENTS.md`

**Intent**: Vitest inherits Astro Vite config (`@/` alias). Document `npm test` so agents stop saying the repo has no suite.

**Contract**: `getViteConfig({ test: { environmentMatchGlobs, include: ['src/**/*.test.ts'] } })`. Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. DevDeps: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`. AGENTS.md “Build, Test, and Development”: add `npm test`; remove “No automated test suite”.

#### 2. Smoke test

**File**: `src/lib/api.test.ts` (temporary or keep as tiny `guestUrlFromRequest` check)

**Intent**: Prove the runner + alias work. Optional: `guestUrlFromRequest` origin + encode — not a Phase 1 risk, only a smoke if implementer wants a non-empty file; otherwise a one-line sanity test next to utils is enough.

**Contract**: `npm test` exits 0 with at least one passing test.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0
- `npx astro sync && npm run lint` exits 0
- `vitest.config.ts` uses `getViteConfig` from `astro/config`

#### Manual Verification:

- `npm test` runs on a clean clone after `npm ci` without Docker

**Implementation Note**: After this phase’s automated verification passes, pause for the human to confirm `npm test` locally before Phase 2.

---

## Phase 2: Guest poll classification (Risk #1)

### Overview

Unit-test `useGuestPartyView` against the two user-facing strings and SSR preservation. Mock `createBrowserClient` to return `{ rpc }` or `null`. Do not reimplement the helper; do not hit network.

### Changes Required:

#### 1. Hook tests

**File**: `src/components/hooks/useGuestPartyView.test.ts`

**Intent**: Prove the durable UI contract after hydration: missing client vs bad/empty RPC vs success DTO.

**Contract**: `renderHook` + `waitFor`. Cases:

| Setup | Assert |
|-------|--------|
| client null, `initialData` = party A | `error` null; `data` is party A; no unavailable |
| client null, `initialData` null | `error` === `"Service is temporarily unavailable."` |
| `rpc` → `{ error: {} }` or `{ data: null }`, even with `initialData` | `error` === `"This link is invalid or has expired."` |
| `rpc` → `{ data: party A }` | `error` null; `data` fields are party A only (fixture object, not live DB) |

Anti-pattern avoided: copying `createBrowserClient` source as expected value; asserting poll interval.

Research: `research.md` Risk #1. Regression: poll overwriting SSR on missing PUBLIC env (mitigated in working tree); RPC failures mislabeled if tests used the old “unavailable” wording.

### Success Criteria:

#### Automated Verification:

- `npm test` includes the four hook cases and passes
- `npm run lint` exits 0

#### Manual Verification:

- None beyond reading failing messages if a case is skipped

---

## Phase 3: Staff unauth table (Risk #5)

### Overview

Invoke every staff parties/venue `GET`/`POST`/`PATCH` handler with a Request that has no session. Assert 401 JSON. Include GET so `/api/parties` cannot leak the waitlist to anon.

### Changes Required:

#### 1. Shared invoke helper (test-only)

**File**: `src/pages/api/staff-unauth.test.ts` (or `src/pages/api/_unauth-context.ts` imported only by tests)

**Intent**: One table of handlers so a new route that forgets `requireStaffUser` fails this file.

**Contract**: Stub `@/lib/supabase` `createClient` → `{ auth: { getUser: async () => ({ data: { user: null } }) } }`. Minimal Astro `APIContext`: `request` without `Cookie`, `cookies` no-op, `params` as needed (`partyId` uuid for nested routes). Parse JSON body.

Routes (all must appear in the table):

- GET, POST `/api/parties`
- POST `/api/parties/advance`
- PATCH `/api/parties/[partyId]`
- POST `/api/parties/[partyId]/ready`
- POST `/api/parties/[partyId]/seat`
- GET, POST `/api/parties/[partyId]/guest-token`
- GET, PATCH `/api/venue/settings`

Do not call `/api/auth/*`. Do not test `middleware.ts` redirect.

Anti-pattern avoided: UI redirect-only; asserting 503 from missing env.

Research: `research.md` Risk #5.

### Success Criteria:

#### Automated Verification:

- `npm test` fails if any listed handler returns non-401 for the stubbed-unauth context
- `npm run lint` exits 0

#### Manual Verification:

- None

---

## Phase 4: Guest privacy SQL (Risk #2)

### Overview

Assert real RLS/RPC against local Supabase + seed. Vitest wraps the query so `npm test` either proves privacy or skips with an explicit reason.

### Changes Required:

#### 1. Assertive smoke SQL

**File**: `supabase/tests/rls_smoke.sql`

**Intent**: Replace eyeball SELECTs with checks a runner can fail.

**Contract**: Under `SET ROLE anon`: `count(*) FROM parties` = 0. `get_guest_party_view('demo-guest-token-local-only')` JSON `display_name` is the seed party only (`Smith`). Wrong token (`'not-a-real-token'`) errors. Uncomment/adapt revoke case **or** wrong-token exception — both prove “wrong token ≠ that party”. Optional: second party in the same script with rollback so token A cannot return party B. Do not mock.

#### 2. Vitest skip wrapper

**File**: `src/lib/guest-privacy.rls.test.ts` (colocation under `src/lib/` as the app-facing contract) **or** keep execution in `supabase/tests/` invoked from Vitest

**Intent**: `npm test` is one command. No Docker → skip, not fail the whole suite, not fake pass via mocks.

**Contract**: If `SUPABASE_URL` is localhost (or `npx supabase status` succeeds), run the SQL file / equivalent RPC via supabase-js **anon** key and assert. Else `it.skip`. Never `vi.mock` the SQL. Seed token remains local-only (`lessons.md` / `seed.sql`).

### Success Criteria:

#### Automated Verification:

- With Docker + `npx supabase start` + `db reset`, privacy tests run and pass
- Without DB, `npm test` still exits 0 and reports skipped RLS tests
- `npm run lint` exits 0

#### Manual Verification:

- Human confirms on a machine with Docker that the RLS cases **run** (not skip) after `npx supabase db reset`

---

## Phase 5: Cookbook and test-plan backport

### Overview

Fill `context/foundation/test-plan.md` §6 for shipped patterns; correct §2 Risk #1 response cell (RPC → invalid link). No file:line anchors in §2.

### Changes Required:

#### 1. Cookbook

**File**: `context/foundation/test-plan.md` §6.1, §6.2, §6.4, §6.5, §6.6

**Intent**: Next `/10x-tdd` can add a unit or API 401 or RLS check without rediscovering layout.

**Contract**:

- 6.1: colocation `*.test.ts`; reference `useGuestPartyView.test.ts`; `npm test`
- 6.2: API table + stub `getUser` null; mock only client edge; reference staff-unauth test
- 6.4: new staff endpoint must be added to the 401 table
- 6.5: real SQL / skip; never mock RLS; `rls_smoke.sql`
- 6.6: note 401 vs 503; working-tree null-client + `initialData`

#### 2. Risk #1 response backport

**File**: `context/foundation/test-plan.md` §2 Risk Response Guidance row #1 only

**Intent**: Stop telling later phases that RPC failure is “unavailable”.

**Contract**: What would prove protection: valid token → that party; **null client** → unavailable (and must not clobber SSR data); **RPC error/null** → invalid/expired, without other parties’ data. Leave Source column without file anchors. Do not rewrite §3 statuses.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check context/foundation/test-plan.md` (or `npm run format` on that file) succeeds
- §6 placeholders “TBD — see §3 Phase 1” for 6.1/6.2/6.4/6.5 are gone

#### Manual Verification:

- Skim §2 row #1 and §6: a new contributor would know where to put a hook test vs a 401 row vs SQL

---

## Testing Strategy

### Unit Tests:

- `useGuestPartyView` classification table (Phase 2)
- Optional `guestUrlFromRequest` only as runner smoke (Phase 1)

### Integration Tests:

- Staff APIRoute 401 table with stubbed `getUser` (Phase 3) — HTTP-shaped, no Playwright
- RLS/RPC against local Postgres (Phase 4)

### Manual Testing Steps:

1. `npm ci && npm test` without Docker — suite green, RLS skipped
2. `npx supabase start && npx supabase db reset && npm test` — RLS not skipped
3. Read cookbook §6 once

## Performance Considerations

Suite must stay fast: hook + API table are in-process. RLS hits local Postgres only when up. Do not boot Wrangler or Playwright.

## Migration Notes

No schema migration required unless Phase 4 adds a second seed party — prefer transactional test inserts over changing `seed.sql` if that would leak a second demo token to shared DBs.

## References

- Related research: `context/changes/testing-critical-path-coverage/research.md`
- Test plan: `context/foundation/test-plan.md`
- Astro Vitest: `getViteConfig` in `@withastro/docs` testing guide
- RLS: `supabase/migrations/20260609120100_queue_rls.sql`
- Gate: `src/lib/api.ts` `requireStaffUser`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Vitest

#### Automated

- [x] 1.1 `npm test` exits 0 — 3d76c2e
- [x] 1.2 `npx astro sync && npm run lint` exits 0 — 3d76c2e
- [x] 1.3 `vitest.config.ts` uses `getViteConfig` from `astro/config` — 3d76c2e

#### Manual

- [x] 1.4 `npm test` runs on a clean install after `npm ci` without Docker — 3d76c2e

### Phase 2: Guest poll classification (Risk #1)

#### Automated

- [x] 2.1 `npm test` includes the four hook cases and passes
- [x] 2.2 `npm run lint` exits 0

### Phase 3: Staff unauth table (Risk #5)

#### Automated

- [ ] 3.1 `npm test` fails if any listed handler returns non-401 for the stubbed-unauth context
- [ ] 3.2 `npm run lint` exits 0

### Phase 4: Guest privacy SQL (Risk #2)

#### Automated

- [ ] 4.1 With Docker + `npx supabase start` + `db reset`, privacy tests run and pass
- [ ] 4.2 Without DB, `npm test` still exits 0 and reports skipped RLS tests
- [ ] 4.3 `npm run lint` exits 0

#### Manual

- [ ] 4.4 On a machine with Docker, RLS cases run (not skip) after `npx supabase db reset`

### Phase 5: Cookbook and test-plan backport

#### Automated

- [ ] 5.1 Prettier/format check on `context/foundation/test-plan.md` succeeds
- [ ] 5.2 §6 TBD placeholders for 6.1/6.2/6.4/6.5 are gone

#### Manual

- [ ] 5.3 Skim §2 row #1 and §6 for contributor usability
