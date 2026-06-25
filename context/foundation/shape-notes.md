---
project: NotQueue
context_type: greenfield
created: 2026-05-30
updated: 2026-06-25
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: complete
  phases_completed: [1, 2, 3, 4, 5, 6, 7, 8]
  mvp_v1_shipped: 2026-06-12
  gray_areas_resolved:
    - topic: pain category
      decision: workflow friction
    - topic: primary persona scope
      decision: waiting guest (customer with QR) as MVP primary persona
    - topic: insight
      decision: self-service queue status via QR so guests do not interrupt staff
    - topic: cost today
      decision: guests crowd host stand / door; no self-service view of position
    - topic: guest access
      decision: access key via QR link/token; no guest account
    - topic: staff access
      decision: staff login; host and waiter share same FOH permissions for MVP
  frs_drafted: 14
  quality_check_status: accepted
---

## Seed idea (verbatim)

an app for managing restaurants queue. The waiter gives customer a QR code, which takes him to a page showing information about the queue (maybe additional information too).

## Vision & Problem Statement

Guests waiting for a table at a busy restaurant lack a clear view of queue status. They repeatedly ask staff or crowd the host stand and door, which interrupts service and creates friction on both sides—especially during peak hours.

NotQueue gives each party a waiter-issued QR that opens a self-service status page: guests check their place in line without stopping staff. The product insight is that wait transparency belongs on the guest's phone, not at the host podium.

## User & Persona

**Primary persona — Waiting guest**

- **Role:** Customer who has joined the restaurant's waitlist and is waiting for a table.
- **Context:** On their phone, often standing nearby or stepping away briefly; may be with a group.
- **Moment they reach for the product:** After the waiter hands them a QR code, while they wait—when they would otherwise walk back to the host stand or flag down staff to ask "how much longer?"

## Access Control

**Guest (waiting party)**

- Access via **QR-encoded link or token** — no account creation, no login.
- The token identifies one queue entry (party); the page is read-only queue status (and any optional info the restaurant exposes).

**Staff (front of house)**

- **Staff login** — Supabase email + password (shipped MVP v1).
- **Roles for MVP:** single FOH permission tier — host and waiter can perform the same queue operations (add party, advance queue, issue/reissue QR). No separate guest vs admin split beyond guest read-only vs staff manage.

**Separation**

- Guest: view status for their party only (scoped by token).
- Staff: manage the restaurant's live queue for that location.

## Success Criteria

### Primary

End-to-end MVP flow:

1. Staff member logs into the restaurant queue dashboard.
2. Staff adds a waiting party (e.g. name, party size).
3. Staff issues a QR code (or link) for that party.
4. Guest scans the QR on their phone.
5. Guest sees queue position, estimated wait, party confirmation, optional venue info, and live updates.
6. Staff advances the queue or marks the party's table ready.
7. Guest's page shows a clear **table ready** state (and updates without refreshing the host stand).

### Secondary

- Guest receives **SMS (or similar) notification** when their table is ready — nice-to-have; not required for the primary loop to count as success.

### Guardrails

- **Privacy:** Guest token/link exposes only that party's status — not a public list of other guests' names or details.
- **Accuracy:** If wait time or position is unknown, the UI says so — no misleading ETAs that erode trust.

## Functional Requirements

### Staff queue management

- FR-001: Staff member can log in to manage the queue for their restaurant. Priority: must-have
  > Socrates: Counter-argument considered: "PIN-only would ship faster than full login."
  > Resolution: kept staff login — chosen in access control; PIN remains a valid v2 simplification if login slows MVP.
- FR-002: Staff member can add a waiting party with party details (e.g. name, party size). Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-003: Staff member can issue a QR code or link scoped to one waiting party. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-004: Staff member can advance the queue (move parties forward in line). Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-005: Staff member can mark a party's table as ready. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-006: Staff member can set or adjust the estimated wait time shown to a party (manual entry for v1). Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-007: Staff member can configure optional information shown on guest status pages (e.g. menu link, policies). Priority: must-have
  > Socrates: No counter-argument; it stands as written.

### Guest status page

- FR-008: Guest can open their queue status page via QR or link without creating an account. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-009: Guest can see their current queue position. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-010: Guest can see the estimated wait time for their party. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-011: Guest can see confirmation of their party label and size. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-012: Guest can see venue-provided additional information on the status page. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-013: Guest can see a clear table-ready state on the status page when staff marks them ready. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

### Notifications

- FR-014: Guest can receive an SMS notification when their table is ready. Priority: nice-to-have
  > Socrates: No counter-argument; kept as nice-to-have secondary outcome.

## User Stories

### US-01: Guest checks wait after receiving QR

- **Given** a waiting party has been added by staff and a QR has been issued for that party
- **When** the guest scans the QR on their phone
- **Then** they see their party details, queue position, estimated wait, optional venue info, and live updates when staff changes queue state

#### Acceptance Criteria

- Page loads without guest login or account creation
- Position and ETA reflect staff actions; if ETA is not set, the page indicates wait is unknown rather than showing a false number
- When staff marks the table ready, the guest page shows a distinct ready state without the guest returning to the host stand

## Business Logic

**One-sentence rule:** NotQueue mirrors each staff queue action to the matching party's scoped guest view so guests always see authoritative wait status without asking staff.

Staff actions (add party, advance queue, set ETA, mark ready) are the source of truth. The guest page reflects the current state for that party only — position, ETA, ready flag, and configured venue info — derived from staff updates. Manual ETA in v1 means staff enter the estimate; the app does not invent wait times when none is set.

## Non-Functional Requirements

- **Guest-perceived responsiveness:** Status page loads and updates feel fast on mid-tier mobile devices on typical restaurant Wi‑Fi.
- **Privacy boundary:** A guest token exposes only that party's status — not other parties' names or details.
- **Staff operability under rush:** Common staff actions (add party, advance, mark ready) require only a few taps.
- **Browser support:** Guest status page works on current iOS and Android mobile browsers.

## Non-Goals

- **Avoid: full reservations / booking system** — NotQueue manages the walk-in waitlist only; not OpenTable-style reservations.
- **Avoid: multi-location chain / franchise admin** — MVP targets a single restaurant (or handful), not enterprise multi-site rollout.
- **Avoid: in-queue ordering or payments** — Guest page is status + venue info only; no menu ordering or checkout in v1.
