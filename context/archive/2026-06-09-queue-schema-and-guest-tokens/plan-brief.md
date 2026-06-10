# Queue Schema and Guest Tokens — Plan Brief

> Full plan: `context/changes/queue-schema-and-guest-tokens/plan.md`

## What & Why

NotQueue needs a database foundation before any staff or guest UI can ship. F-01 creates the Supabase schema for queue parties, venue settings, and opaque guest tokens, with RLS that enforces the PRD privacy boundary: staff manage the full queue; guests read only their own party — no account required.

## Starting Point

The repo has Supabase Auth wired (cookie SSR, `/api/auth/*`, `/dashboard`) but zero custom tables — no `supabase/migrations/`, no `src/types.ts`, no queue endpoints. Roadmap baseline (2026-05-31) confirmed data layer absent.

## Desired End State

A developer runs `npx supabase db reset` and gets four tables with RLS, two guest RPCs (`set_guest_context`, `get_guest_party_view`), TypeScript entity types, and seed data (demo venue + party + token). Downstream slices S-01–S-05 can build UI and APIs against typed, policy-protected tables.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Guest access model | `guest_tokens` table + opaque token | Supports reissue/revocation and RLS without service_role on Worker | Plan |
| Venue modeling | `venues` table, seed one row | Clean FK for settings; multi-venue later without rewrite | Plan |
| Queue position | Stored `position` integer on party | Staff actions are source of truth per PRD | Plan |
| Party lifecycle | `waiting` → `ready` → `seated` | Covers table-ready state and queue exit | Plan |
| Token reissue | Invalidate old token (`revoked_at`) | One active token per party; old QR stops working | Plan |
| Guest RLS enforcement | `set_guest_context` + RLS + combined read RPC | RLS for defense-in-depth; combined RPC solves transaction-scoped context | Plan |
| F-01 deliverables | Migrations + types + seed | Downstream slices get contracts and fixtures immediately | Plan |
| Migration split | 2 files: schema, then RLS/RPCs | Easier to debug policy failures | Plan |

## Scope

**In scope:** SQL migrations (tables, enums, indexes, triggers, Realtime pub), RLS policies, guest RPCs, `src/types.ts`, `supabase/seed.sql`, brief README note.

**Out of scope:** Staff/guest UI, API routes, Realtime subscription wiring (S-05), SMS, multi-location admin, `staff_venue_membership`.

## Architecture / Approach

```
venues ──< parties ──< guest_tokens
  │
  └── venue_settings (1:1)

Staff: authenticated → full CRUD via RLS (auth.uid())
Guest: anon → get_guest_party_view(token) → party + settings JSON
         (RLS blocks direct anon SELECT without token context)
```

Two migrations in order; seed provides `demo-guest-token-local-only` for manual smoke tests.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Core schema migration | Tables, enums, indexes, triggers, Realtime pub | First migration sets naming conventions for all slices |
| 2. RLS and guest context | Staff policies, guest RLS, RPCs | Transaction-scoped `set_config` — guest reads must use combined RPC |
| 3. Types and seed data | `src/types.ts` + `seed.sql` | Seed token must stay in sync with schema |

**Prerequisites:** Docker for local Supabase (`npx supabase start`); `.env` / `.dev.vars` with local anon key for build verification.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Supabase Realtime guest subscriptions may need custom JWT or server-mediated auth in S-05 — F-01 enables publication but does not solve browser subscription auth for anon users.
- MVP assumes any authenticated Supabase user is staff (single venue, single FOH tier) — no per-venue staff mapping until multi-location.
- Remote migration push is manual and irreversible via Wrangler rollback — test locally first.

## Success Criteria (Summary)

- `npx supabase db reset` applies schema + RLS + seed without errors.
- Anon cannot list parties; valid guest token returns exactly one party's data.
- `src/types.ts` and `npm run lint` / `npm run build` pass with new types.
