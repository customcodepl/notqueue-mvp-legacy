# Lessons

Recurring decisions and patterns from NotQueue MVP v1. Agents should read this before planning v2 changes.

## Guest access

- **Guest token shape:** opaque UUID in `guest_tokens` table (one active token per party; reissue revokes prior). Not signed URLs.
- **Guest read path:** RLS + token lookup; guests never list other parties.

## Guest live updates

- **MVP choice:** client-side polling in `useGuestPartyView` (~5s interval). Supabase Realtime deferred — simpler on weak restaurant Wi‑Fi and fewer moving parts for v1.
- **Revisit when:** guests report stale status or polling load becomes measurable.

## Staff auth

- **MVP choice:** Supabase email + password (`/auth/signin`, `/auth/signup`). Passwordless deferred.
- **Roles:** single FOH tier — host and waiter share queue operations.

## Data integrity

- **Guest token reissue:** use Postgres RPC (`issue_guest_token`) with `FOR UPDATE` on party — avoids concurrent reissue races. See `supabase/migrations/20260614140000_issue_guest_token_rpc.sql`.
- **Token issue guard:** only `waiting` parties can receive tokens (409 otherwise).

## Deploy

- **Production:** Cloudflare Workers Builds on `main` (not GitHub Actions deploy). Secrets: `SUPABASE_URL`, `SUPABASE_KEY` via Wrangler.
- **Ops reference:** `context/archive/2026-05-30-initial-deployment/deployment-plan.md`
