# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-13

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (user override). Git history in the last 30 days had insufficient signal (fewer than 5 commits); likelihood uses interview + roadmap/archive, not churn counts.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                   | Impact | Likelihood | Source (evidence — not anchor)                                     |
| --- | --------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------ |
| 1   | Guest with an issued QR cannot see their own status (dead link, unavailable, Worker 1042 instead of JSON) | High   | High       | interview Q1–Q3; archive guest-live-wait-status env; prod incident |
| 2   | Guest token/link exposes another party or the full waitlist                                               | High   | Medium     | PRD privacy / Access Control; interview Q1; F-01 RLS intent        |
| 3   | Staff advance/ready/ETA does not show on the guest page, or missing ETA is shown as a fake number         | High   | Medium     | PRD US-01, FR-010, FR-013; S-05; lessons (polling)                 |
| 4   | QR reissue leaves the old token valid, or a waiting party cannot get a new token                          | High   | Medium     | F-01 / S-02 plans; lessons (revoke + RPC)                          |
| 5   | Anonymous or unauthenticated caller can mutate the staff queue (add, advance, ready, issue QR)            | High   | Medium     | PRD Access Control; abuse lens (auth + user input)                 |
| 6   | Null ETA renders as a number or "0 min" instead of unknown                                                | Medium | Medium     | PRD Guardrails / FR-010                                            |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                    | Must challenge                                                                  | Context `/10x-research` must ground                                       | Likely cheapest layer                            | Anti-pattern to avoid                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| #1   | Valid token → that party; null client → unavailable (must not clobber SSR data); RPC error/null → invalid/expired, without other parties' data | "SSR first paint means prod guest path works"; "1042 is a JSON parse bug in UI" | Guest URL entry; SSR vs browser client; RPC error vs Cloudflare plaintext | unit + integration; env smoke as a gate, not e2e | Cloudflare e2e; implementation-mirror of the browser client helper |
| #2   | Guest response contains one party's fields only; wrong token ≠ that party                                                                      | "Staff SELECT is enough to prove guest privacy"                                 | Guest RPC/RLS vs staff role; anon without token                           | integration (RPC/SQL)                            | mocking RLS; happy-path staff only                                 |
| #3   | After ready/advance/ETA write, guest view matches; null ETA is unknown                                                                         | "Polling interval is the test"; "DB status equals UI"                           | Staff write → guest read order; waiting/ready/seated                      | integration                                      | copy-paste UI strings as oracle                                    |
| #4   | After reissue, old token is invalid; new token only for waiting                                                                                | "App-level revoke is atomic"                                                    | Issue RPC; status guard                                                   | integration                                      | two loose updates without the race contract                        |
| #5   | Staff mutations return 401 without a session                                                                                                   | "Dashboard middleware protects `/api`"                                          | Which routes; cookie vs anon                                              | integration HTTP                                 | UI redirect-only tests                                             |
| #6   | Missing ETA → unknown, never a number                                                                                                          | Oracle from PRD, not TSX copy                                                   | DTO `eta_minutes` + render branch                                         | unit                                             | full GuestStatus snapshot                                          |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name              | Goal (one line)                                                  | Risks covered | Test types         | Status        | Change folder                  |
| --- | ----------------------- | ---------------------------------------------------------------- | ------------- | ------------------ | ------------- | ------------------------------ |
| 1   | Critical-path coverage  | Bootstrap Vitest; prove guest status, token privacy, and API 401 | #1, #2, #5    | unit + integration | change opened | testing-critical-path-coverage |
| 2   | Staff-to-guest contract | Prove queue writes mirror to guest view, reissue, and honest ETA | #3, #4, #6    | integration + unit | not started   | —                              |
| 3   | Quality-gates wiring    | Run the suite in CI next to lint + build                         | cross-cutting | gates              | not started   | —                              |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

| Layer                | Tool                                          | Version                | Notes                                                                                          |
| -------------------- | --------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest                                        | none yet — see Phase 1 | Astro docs: `getViteConfig()` from `astro/config`; Vitest 4 needs Node ≥22.12 (project: 22.14) |
| API mocking          | none yet — see Phase 1                        | —                      | Mock only at the network edge (Supabase HTTP), never internal modules                          |
| e2e                  | none — deferred                               | —                      | Interview Q5: no full dashboard e2e/visual on this rollout                                     |
| accessibility        | none yet                                      | —                      | Not a named phase; do not gate on it                                                           |
| SQL smoke            | `supabase/tests/rls_smoke.sql`                | existing               | Manual; not wired to npm/CI                                                                    |
| (optional) AI-native | Playwright MCP / vision — checked: 2026-09-13 | n/a                    | Do not use: Q5 rejected visual e2e; browser MCP is session tooling, not a CI layer             |

**Stack grounding tools (current session):**

- Docs: Context7 — Vitest getting started + Astro testing `getViteConfig`; checked: 2026-09-13
- Search: Exa.ai — available, not used (official docs sufficient); checked: 2026-09-13
- Runtime/browser: cursor-ide-browser — possible manual verify, not a test runner; checked: 2026-09-13
- Provider/platform: GitHub/Cloudflare/Supabase MCP — not available in current session; CI gate uses GitHub Actions already in-repo; checked: 2026-09-13

Test-base profile at plan write: **`none`** (no runner config, zero `*.test.*` files).

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                    | Where                | Required?                 | Catches                                                            |
| --------------------------------------- | -------------------- | ------------------------- | ------------------------------------------------------------------ |
| lint + typecheck                        | local + CI           | required                  | syntactic / type drift                                             |
| unit + integration                      | local + CI           | required after §3 Phase 3 | logic regressions (suite exists after Phase 1; CI wire is Phase 3) |
| pre-prod smoke (guest URL + PUBLIC env) | between merge + prod | optional after §3 Phase 1 | Worker/env failures tests cannot see (1042, missing PUBLIC vars)   |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

Colocate as `*.test.ts` next to the module (hooks under `src/components/hooks/`).
Run with `npm test`. Guest poll classification lives in
`src/components/hooks/useGuestPartyView.test.ts`: mock
`createBrowserClient` at the module edge, then table SSR-keep, unavailable,
RPC error/null → invalid link, and a success DTO. Add ETA-unknown cases the
same way in a later rollout phase — do not snapshot `GuestStatus`.

### 6.2 Adding an integration test

Staff HTTP: add a row to the table in `src/pages/api/staff-unauth.test.ts`.
Stub `createClient` so `auth.getUser` resolves `{ user: null }`; call the
handler; expect `401` and `{ error: "Unauthorized" }`. Mock only that client
edge, never `requireStaffUser` internals. Guest privacy is SQL, not a mock
— see §6.5. Staff-write → guest-read and QR reissue wait for §3 Phase 2.

### 6.3 Adding an e2e test

TBD — not in this rollout (interview Q5). Re-evaluate on `--refresh` if a
single critical-path browser check becomes cheaper than more integration.

### 6.4 Adding a test for a new API endpoint

Every new staff route that uses `requireStaffUser` must get a row on the
unauth table in `src/pages/api/staff-unauth.test.ts` in the same change.
Missing-env / Worker failures are `503`, not `401` — do not fold them into
this table. Queue-state contracts (advance/ready/ETA mirroring) wait for
§3 Phase 2.

### 6.5 Adding a test for guest-token / RLS behaviour

Run real anon queries against local Postgres. Assertive SQL:
`supabase/tests/rls_smoke.sql`. Vitest wrapper:
`src/lib/guest-privacy.rls.test.ts` — probes `npx supabase status`, runs
when the API URL is localhost, otherwise `describe.skipIf`. Never
`vi.mock` RLS or the RPC. Seed token `demo-guest-token-local-only` is
local-only (`supabase/seed.sql`). Reissue/revoke races wait for §3 Phase 2.

### 6.6 Per-rollout-phase notes

- **401 vs 503.** Unauthenticated staff is `401`. Missing Supabase env or
  Worker plaintext is `503` / guest “unavailable”, not unauthorized.
- **Null client vs RPC.** A missing browser client must not clobber SSR
  `initialData`. RPC error or null data is invalid/expired, not
  unavailable. Hook tests already encode this; GuestStatus still has
  working-tree wiring to pass `PUBLIC_*` (or server fallback) into the
  island.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Marketing / landing chrome** — brittle snapshots, no product contract. Re-evaluate if the landing page becomes the guest entry. (Source: Phase 2 interview Q5.)
- **Stock shadcn/ui primitives** — not our business contract. Re-evaluate if we wrap them with queue-specific behaviour. (Source: Phase 2 interview Q5.)
- **SMS table-ready (FR-014)** — parked until the change ships. Re-evaluate when `sms-table-ready` is implemented. (Source: Phase 2 interview Q5.)
- **Full dashboard e2e + visual diff** — too expensive for this rollout vs integration on the guest/staff contract. Re-evaluate if integration misses Worker-only failures after Phase 3. (Source: Phase 2 interview Q5.)
- **Cloud seed / empty `venues` table** — ops/checklist, not a logic regression. (Source: Phase 3 challenger.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
