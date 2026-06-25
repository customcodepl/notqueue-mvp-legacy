<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Staff Issue Party QR (S-02)

- **Plan**: `context/archive/2026-06-09-staff-issue-party-qr/plan.md`
- **Scope**: All 3 phases (retro-review)
- **Date**: 2026-06-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned auth form changes in p3 commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/auth/SignInForm.tsx, SignUpForm.tsx, SubmitButton.tsx
- **Detail**: Commit 6467ce6 (Guest stub page p3) also modified three auth components — an SSR crash fix unrelated to S-02 scope.
- **Fix**: Document in plan epilogue or leave as incidental fix.
- **Decision**: SKIPPED

### F2 — Guest-token API lacks party status guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: src/lib/services/guestTokens.ts
- **Detail**: POST /api/parties/{id}/guest-token worked for any existing party UUID; UI only exposes QR for waiting parties.
- **Fix**: Add status check in issueGuestToken — only allow waiting parties (Fix A).
- **Decision**: FIXED via Fix A — `issue_guest_token` RPC + service mapping; 409 on invalid state

### F3 — Concurrent reissue race returns 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/guestTokens.ts
- **Detail**: Simultaneous POST reissues could race on revoke+insert; plan accepted MVP non-atomic risk.
- **Fix A ⭐**: Postgres RPC wrapping revoke+insert in a transaction with `FOR UPDATE` party lock.
- **Decision**: FIXED via Fix A — `supabase/migrations/20260614140000_issue_guest_token_rpc.sql`

### F4 — useGuestToken missing AbortController

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useGuestToken.ts
- **Detail**: Fetches lacked AbortController; closing modal mid-request could setState after unmount.
- **Fix**: Mirror useQueueParties abort cleanup pattern.
- **Decision**: FIXED

### F5 — Reissue one-click with no confirmation

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (UX)
- **Location**: src/components/queue/PartyQrModal.tsx
- **Detail**: Reissue immediately revokes old QR/link with no confirmation.
- **Fix**: Add confirm dialog before reissue.
- **Decision**: SKIPPED

## Post-triage code changes

- `src/lib/services/guestTokens.ts` — RPC-based atomic issue; shared `PartyNotFoundError`
- `src/pages/api/parties/[partyId]/guest-token.ts` — 409 for invalid party state
- `supabase/migrations/20260614140000_issue_guest_token_rpc.sql` — new migration
- `src/components/hooks/useGuestToken.ts` — AbortController cleanup
- `src/components/queue/PartyQrModal.tsx` — removed duplicate fetch effect

## Automated verification (2026-06-14)

- `npx astro sync && npm run lint` — PASS
- `npm run build` — PASS
