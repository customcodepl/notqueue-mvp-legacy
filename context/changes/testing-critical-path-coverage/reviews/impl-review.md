<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-path coverage (test rollout Phase 1)

- **Plan**: context/changes/testing-critical-path-coverage/plan.md
- **Scope**: Phase 5 of 5 (full plan)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 4 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Hook tests prove uncommitted runtime, not HEAD

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/hooks/useGuestPartyView.test.ts:29-40 vs HEAD useGuestPartyView.ts
- **Detail**: The suite expects null client + SSR party A to keep data and not set unavailable. Committed `useGuestPartyView` always `setError(UNAVAILABLE_MESSAGE)` on a null client. That keep-SSR behavior exists only in the dirty working tree. `[token].astro` on HEAD already passes `supabaseUrl` / `supabaseAnonKey` into `GuestStatus`, but committed `GuestStatus` does not accept or forward those props. A clean checkout can typecheck/build-fail on excess props and would fail the SSR-keep hook test if the hook were committed as-is.
- **Fix A ⭐ Recommended**: Commit the working-tree GuestStatus + hook (and keep `[token].astro` as the island seam) so tests, page, and island agree.
  - Strength: Matches the plan's "hook oracle is working-tree behavior" and closes Risk #1 in product, not only in Vitest.
  - Tradeoff: That is product runtime, which this change said it would avoid except for an import seam.
  - Confidence: HIGH — dirty files already implement the contract the tests encode.
  - Blind spot: Need a typecheck/build on a clean tree without those props.
- **Fix B**: Revert `[token].astro` extra props and change the hook test to match HEAD (always unavailable on null client).
  - Strength: Keeps this change test-only.
  - Tradeoff: Leaves the known PUBLIC-env / first-paint clobber bug unfixed; cookbook §6.6 would be wrong.
  - Confidence: MEDIUM — contradicts Desired End State for Risk #1.
  - Blind spot: Prod guest page still depends on PUBLIC_* at build.
- **Decision**: FIXED via Fix A

### F2 — Guest page can serialize `SUPABASE_KEY` into the island

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/guest/[token].astro:11-12
- **Detail**: `PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_KEY` is passed toward a `client:load` island. `SUPABASE_KEY` is `context: "server", access: "secret"`. In this repo it is documented as the anon/publishable key, not `service_role`. If a Worker secret is ever the service role, every guest URL would leak it; once GuestStatus forwards the prop, the browser client would also use it.
- **Fix**: Keep the fallback only if ops guarantee `SUPABASE_KEY` is the anon key; otherwise pass only `PUBLIC_*` and treat missing public env as unavailable (SSR already does that when the server client is null).
  - Strength: Avoids hydrating a secret-classified env field into HTML.
  - Tradeoff: Guest poll still needs a publishable key in the client bundle; that is PUBLIC_* by design.
  - Confidence: HIGH — matches astro env schema split.
  - Blind spot: Current Cloudflare setup may only have `SUPABASE_KEY` (anon) and no PUBLIC_* at build.
- **Decision**: FIXED

### F3 — `rls_smoke.sql` resets role before RPC checks

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_smoke.sql:15-22
- **Detail**: Anon `count(*)` is under `SET ROLE anon`. `(b)`/`(c)` run after `RESET ROLE`, so SQL-only execution does not prove `GRANT EXECUTE … TO anon`. Token isolation still holds because `get_guest_party_view` is `SECURITY DEFINER`. Vitest uses the anon key and is the real execute proof.
- **Fix**: Keep `SET ROLE anon` through the RPC blocks (or run those blocks before `RESET ROLE`).
- **Decision**: FIXED

### F4 — Cookbook §4 still says there is no test runner

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md:83-87
- **Detail**: Phase 5 correctly filled §6 and Risk #1. Frozen §4 still says Vitest “none yet” and SQL smoke is “Manual; not wired to npm/CI”, which is false after Phase 4. §6.6 also describes GuestStatus PUBLIC_* wiring that is still uncommitted.
- **Fix**: On `/10x-test-plan --refresh` (or a small addendum), update §4 stack rows and trim §6.6 until GuestStatus is committed.
- **Decision**: FIXED

### F5 — Vitest `configFile: false` overlay

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: vitest.config.ts:16-23
- **Detail**: Plan asked for `getViteConfig({ test: { environmentMatchGlobs, include } })`. Implementation still uses `getViteConfig` plus `configFile: false` and a React integration so the Cloudflare adapter is not loaded (Astro/Vitest incompatibility). Required fields are present.
- **Fix**: Document the overlay in AGENTS.md or leave as a necessary adaptation.
- **Decision**: FIXED

### F6 — Localhost probe is a substring + `supabase status` only

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/guest-privacy.rls.test.ts:18-31
- **Detail**: Plan allowed `SUPABASE_URL` localhost **or** `supabase status`. Probe is status-only and `url.includes("localhost")`. Does not hit cloud env. Skip-if does not green-wash assertions.
- **Fix**: Optionally also accept `process.env.SUPABASE_URL` when it is loopback, and parse URL host instead of substring.
- **Decision**: FIXED
