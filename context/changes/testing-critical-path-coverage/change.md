---
change_id: testing-critical-path-coverage
title: Bootstrap Vitest for guest QR status, token privacy, and API 401
status: impl_reviewed
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path coverage".
Risks covered: #1 Guest with an issued QR cannot see their own status (dead link, unavailable, Worker 1042 instead of JSON); #2 Guest token/link exposes another party or the full waitlist; #5 Anonymous or unauthenticated caller can mutate the staff queue (add, advance, ready, issue QR).
Test types planned: unit + integration.
Risk response intent:
- #1: prove valid token → that party's status and bad env/RPC → unavailable without other parties' data.
- #2: prove guest response contains one party's fields only; wrong token ≠ that party.
- #5: prove staff mutations return 401 without a session.
After creating the folder, follow the downstream continuation rule.
