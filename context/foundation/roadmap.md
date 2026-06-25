---
project: NotQueue
version: 1
status: active
created: 2026-05-31
updated: 2026-06-25
prd_version: 1
main_goal: speed
top_blocker: time
mvp_v1_status: complete
---

# Roadmap: NotQueue

> Derived from `context/foundation/prd.md` (v1) + codebase baseline.
> **MVP v1 complete** (2026-06-12) — all F-01 and S-01–S-05 slices archived. Use this doc for product context and v2 planning; active work starts with `/10x-new` + a new roadmap version when scope grows.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Guests at a restaurant cannot see where they are in the waitlist for a table — they keep returning to the host stand and interrupting service. NotQueue gives the waiter a QR for each party; the guest checks status on their phone without asking staff. The product core is **wait transparency on the guest's phone**, not at the host podium.

## North star

**S-05: guest-live-wait-status** — After scanning the QR, the guest sees position, ETA, party details, venue info, and **live** status changes (including table ready) without logging in.

> The **north star** is the smallest vertical slice whose delivery proves the core product hypothesis — here: US-01 and the success criterion "the guest sees authoritative status on their phone." Delivered 2026-06-12.

MVP v1 was sequenced for **speed to launch** (3 weeks, after-hours): data and staff operations required for US-01 first, without expanding observability or SMS.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | queue-schema-and-guest-tokens | (foundation) queue model, guest tokens, and RLS in Supabase | — | Business Logic, Access Control, NFR privacy | done |
| S-01 | staff-add-party-to-queue | sign in and add a party to the queue | F-01 | FR-001, FR-002, US-01 | done |
| S-02 | staff-issue-party-qr | issue a QR or link for one party | S-01 | FR-003, US-01 | done |
| S-03 | staff-advance-and-ready-queue | advance the queue, set ETA, mark table ready | S-01 | FR-004, FR-005, FR-006, US-01 | done |
| S-04 | staff-configure-guest-venue-info | configure optional info on the guest status page | F-01 | FR-007, FR-012 | done |
| S-05 | guest-live-wait-status | open the status page via QR and see live status + ready | F-01, S-01, S-02, S-03, S-04 | FR-008–FR-013, US-01 | done |

## Streams

MVP v1 sequencing (all streams complete).

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Queue core (staff → guest) | `F-01` → `S-01` → `S-02` → `S-03` → `S-05` | Path to north star — shipped |
| B | Venue configuration | `F-01` → `S-04` | Joined `S-05` (FR-012); parallel with `S-02`/`S-03` after `S-01` |

## Baseline

Codebase state as of **2026-06-25** (post–MVP v1).

- **Frontend:** present — Astro 6, React 19, Tailwind 4, shadcn (`src/components/`, queue + guest UI)
- **Backend / API:** present — auth (`src/pages/api/auth/*`) + queue (`src/pages/api/parties/*`, `src/pages/api/venue/settings.ts`)
- **Data:** present — `supabase/migrations/` (queue schema, RLS, guest-token RPC)
- **Auth:** present — Supabase SSR email/password, `src/lib/supabase.ts`, `src/middleware.ts`, `/auth/*`, protected `/dashboard`
- **Deploy / infra:** present — `@astrojs/cloudflare`, `wrangler.jsonc`, Workers Builds; prod: https://notqueue.notqueue.workers.dev
- **Observability:** partial — Wrangler `observability`; no Sentry/OTel in code

## Foundations

### F-01: Queue schema and guest tokens

- **Outcome:** (foundation) Supabase has queue tables (party, position, ETA, ready), venue settings, and guest tokens with RLS: staff manage; guests read only their party.
- **Change ID:** queue-schema-and-guest-tokens
- **PRD refs:** Business Logic, Access Control (guest token / staff login), NFR privacy boundary
- **Unlocks:** S-01, S-02, S-03, S-04, S-05
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Without this there are no vertical product slices; under `speed` we do not expand the model beyond must-have FRs.
- **Status:** done

## Slices

### S-01: Staff add party to queue

- **Outcome:** Staff can sign in and add a waiting party (e.g. name, party size) to the restaurant queue.
- **Change ID:** staff-add-party-to-queue
- **PRD refs:** FR-001, FR-002, US-01
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Login is in the baseline; this slice adds the first operational queue screen — without it there is nothing to show the guest.
- **Status:** done

### S-02: Staff issue party QR

- **Outcome:** Staff can generate a QR code or link scoped to one party.
- **Change ID:** staff-issue-party-qr
- **PRD refs:** FR-003, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-04 (after F-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** QR is the guest entry point for US-01; sequencing before a full staff panel aligns with `speed`.
- **Status:** done

### S-03: Staff advance and ready queue

- **Outcome:** Staff can advance the queue, manually set ETA, and mark a party as table ready.
- **Change ID:** staff-advance-and-ready-queue
- **PRD refs:** FR-004, FR-005, FR-006, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** US-01 requires live updates when staff act — this slice supplies events for guest polling.
- **Status:** done

### S-04: Staff configure guest venue info

- **Outcome:** Staff can set optional information shown on the guest status page (e.g. menu link, policies).
- **Change ID:** staff-configure-guest-venue-info
- **PRD refs:** FR-007, FR-012
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-03 (after S-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-012 can ship with empty defaults first; slice is small and parallel — does not block Stream A if the guest initially sees no venue info.
- **Status:** done

### S-05: Guest live wait status (north star)

- **Outcome:** Guest can open the status page via QR/link without an account and see position, ETA, party confirmation, venue info, and table-ready state, with live updates when staff change queue state.
- **Change ID:** guest-live-wait-status
- **PRD refs:** FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, US-01
- **Prerequisites:** F-01, S-01, S-02, S-03, S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This validates the product hypothesis; it depends on F-01 and a minimal staff path (S-01–S-03).
- **Status:** done

## MVP v1 archive index

All slices planned, implemented, and archived. Decisions captured in `context/foundation/lessons.md`.

| Roadmap ID | Change ID | Archive |
|---|---|---|
| F-01 | queue-schema-and-guest-tokens | `context/archive/2026-06-09-queue-schema-and-guest-tokens/` |
| S-01 | staff-add-party-to-queue | `context/archive/2026-06-09-staff-add-party-to-queue/` |
| S-02 | staff-issue-party-qr | `context/archive/2026-06-09-staff-issue-party-qr/` |
| S-03 | staff-advance-and-ready-queue | `context/archive/2026-06-10-staff-advance-and-ready-queue/` |
| S-04 | staff-configure-guest-venue-info | `context/archive/2026-06-12-staff-configure-guest-venue-info/` |
| S-05 | guest-live-wait-status | `context/archive/2026-06-12-guest-live-wait-status/` |

## Open Roadmap Questions

(none — MVP v1 scope fully delivered. See `lessons.md` for resolved design calls; `## Parked` for deferred v2 items.)

## Parked

- **FR-014 SMS on table ready** — Why parked: nice-to-have in PRD; outside primary success loop.
- **Multi-location / franchise admin** — Why parked: PRD §Non-Goals.
- **Reservations / booking** — Why parked: PRD §Non-Goals.
- **In-queue ordering and payments** — Why parked: PRD §Non-Goals.
- **Expanded observability (Sentry, alerts)** — Why parked: `speed` + partial baseline is enough for MVP; keep infra light.
- **Supabase Realtime for guest updates** — Why parked: MVP shipped with polling (`useGuestPartyView`); revisit if restaurant Wi‑Fi latency becomes a problem.

## Done

- **F-01: (foundation) Supabase has queue tables (party, position, ETA, ready), venue settings, and guest tokens with RLS: staff manage; guests read only their party.** — Archived 2026-06-10 → `context/archive/2026-06-09-queue-schema-and-guest-tokens/`. Lesson: guest token = opaque row in `guest_tokens`, not signed URL — see `lessons.md`.
- **S-01: Staff can sign in and add a waiting party (e.g. name, party size) to the restaurant queue.** — Archived 2026-06-10 → `context/archive/2026-06-09-staff-add-party-to-queue/`. Lesson: —.
- **S-02: Staff can generate a QR code or link scoped to one party.** — Archived 2026-06-10 → `context/archive/2026-06-09-staff-issue-party-qr/`. Lesson: atomic reissue via Postgres RPC — see `lessons.md`.
- **S-03: Staff can advance the queue, manually set ETA, and mark a party as table ready.** — Archived 2026-06-12 → `context/archive/2026-06-10-staff-advance-and-ready-queue/`. Lesson: —.
- **S-05: Guest can open the status page via QR/link without an account and see position, ETA, party confirmation, venue info, and table-ready state, with live updates when staff change queue state.** — Archived 2026-06-12 → `context/archive/2026-06-12-guest-live-wait-status/`. Lesson: polling over Realtime for MVP — see `lessons.md`.
- **S-04: Staff can set optional information shown on the guest status page (e.g. menu link, policies).** — Archived 2026-06-12 → `context/archive/2026-06-12-staff-configure-guest-venue-info/`. Lesson: —.

<!-- /10x-archive appends here when a Change ID is archived -->
