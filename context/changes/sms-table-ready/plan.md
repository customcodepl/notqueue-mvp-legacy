# FR-014 SMS on Table Ready — Implementation Plan

## Overview

Deliver **FR-014**: when staff marks a party **Ready**, the guest receives a transactional SMS if they opted in on the guest status page. Builds on MVP v1 guest polling (FR-013) and the existing `POST /api/parties/[partyId]/ready` path. Guest provides phone + consent on `/guest/[token]`; Twilio sends from the Worker API route after DB success (best-effort, never blocks mark-ready).

## Current State Analysis

- **FR-014** is nice-to-have in PRD; parked in roadmap (`context/foundation/roadmap.md`). Primary loop is guest status page + 30s polling (`useGuestPartyView`).
- **Mark-ready:** `src/pages/api/parties/[partyId]/ready.ts` → `markPartyReady()` in `src/lib/services/parties.ts:214-239`. No side effects after UPDATE.
- **Schema:** `parties` has no phone or SMS columns (`supabase/migrations/20260609120000_queue_schema.sql:19-28`).
- **Guest read:** `get_guest_party_view(p_token)` returns status fields only — no phone (`queue_rls.sql:166-174`). Must stay that way.
- **Guest writes:** anon has no `UPDATE` on `parties`; guest mutations use `SECURITY DEFINER` RPCs (`set_guest_context` pattern, `queue_rls.sql:131-153`).
- **Guest UI:** `GuestStatus.tsx` — waiting/ready/seated views; no opt-in UI.
- **Secrets:** server-only `SUPABASE_*` via `astro:env/server` (`astro.config.mjs:17-21`). No Twilio env yet.
- **Supabase Auth SMS** in `config.toml` is OTP-only — not used for this feature.

### Key Discoveries:

- Research locked: guest opt-in (not staff), ready-only trigger (not `advanceQueue`), Poland/EU `+48` default, Twilio from Worker `fetch`.
- `advanceQueue` seats front waiting party directly — SMS does not apply (`parties.ts:171-212`).
- Seed `info_text` promises notification but is static copy — SMS opt-in makes it truthful for consenting guests.
- Lessons: guest token RPC pattern, atomic DB ops, Wrangler secrets for prod (`context/foundation/lessons.md`).

## Desired End State

1. Guest on **waiting** status page can optionally enter phone (default `+48` prefix UX) and check consent → saved via guest RPC.
2. `get_guest_party_view` returns `sms_opt_in: boolean` (never phone) so UI shows enabled/disabled state after poll.
3. Staff marks party **Ready** → if `sms_opt_in && phone_e164 && ready_sms_sent_at IS NULL` → Twilio SMS sent (Polish template) → `ready_sms_sent_at` set on success.
4. Mark-ready **always** returns 200 with updated party even when Twilio fails or SMS skipped.
5. `npm run lint` and `npm run build` pass with Supabase + Twilio env vars documented.

## What We're NOT Doing

- Staff-entered phone at add-party (research decision).
- SMS on `advanceQueue` / Call next (ready-only trigger).
- Supabase Auth SMS, Edge Functions, or DB webhook triggers.
- Supabase Realtime push (FR-013 polling unchanged).
- Separate `sms_notifications` audit table (v1 uses `ready_sms_sent_at` only).
- Phone edit / opt-out UI after save (v1: one-time opt-in while waiting).
- Staff dashboard display of guest phone numbers.
- Roadmap `S-06` formal unpark (optional doc note only).
- Multi-language SMS templates (Polish only for v1).

## Implementation Approach

Three phases: **data + RPC** first (migration, types, guest read/write contracts), **guest opt-in UI** second (hook + WaitingView panel), **Twilio send** third (env, service, ready route hook). Matches S-05 layering: schema → guest island → staff API integration.

## Critical Implementation Details

**Opt-in only while `waiting`:** `set_guest_sms_opt_in` must reject when `parties.status != 'waiting'` so guests cannot register after ready/seated.

**Phone never in guest RPC read:** Extend `get_guest_party_view` JSON with `sms_opt_in` boolean only. Phone stays server-side for send path.

**Send idempotency:** Set `ready_sms_sent_at` only after Twilio returns 2xx. On failure, log and leave null — no automatic retry in v1 (guest still sees ready via polling).

**Dev without Twilio:** `SMS_ENABLED` env (default skip when unset/false) — ready flow works locally without sends.

## Phase 1: Schema & Guest SMS RPC

### Overview

Add party SMS columns, extend guest read RPC with opt-in flag, add guest write RPC for opt-in.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_party_sms_opt_in.sql` (new)

**Intent**: Persist guest phone and consent on the party row; track successful send.

**Contract**:
- `ALTER TABLE parties ADD COLUMN phone_e164 text CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9]\d{1,14}$')`
- `ADD COLUMN sms_opt_in boolean NOT NULL DEFAULT false`
- `ADD COLUMN sms_opt_in_at timestamptz`
- `ADD COLUMN ready_sms_sent_at timestamptz`
- `CREATE OR REPLACE FUNCTION set_guest_sms_opt_in(p_token text, p_phone_e164 text, p_opt_in boolean) RETURNS json` — `SECURITY DEFINER`; validate active token; party must be `waiting`; when `p_opt_in` true require non-null E.164 phone; normalize trim; set `phone_e164`, `sms_opt_in`, `sms_opt_in_at = now()`; return `{ "ok": true, "sms_opt_in": true }` only (no phone in response)
- `CREATE OR REPLACE FUNCTION get_guest_party_view` — add `'sms_opt_in', p.sms_opt_in` to `json_build_object` (do not add phone)
- `GRANT EXECUTE ON FUNCTION set_guest_sms_opt_in(text, text, boolean) TO anon, authenticated`

#### 2. Shared types

**File**: `src/types.ts`

**Intent**: TypeScript matches new RPC shape.

**Contract**:
- `GuestPartyView` adds `sms_opt_in: boolean`
- `Party` adds optional `phone_e164`, `sms_opt_in`, `sms_opt_in_at`, `ready_sms_sent_at` for server-side use
- `GuestSmsOptInResponse` interface: `{ ok: true; sms_opt_in: boolean }`

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `supabase db reset` (or `supabase migration up` against local)
- `npx astro sync && npm run lint` passes
- `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set

#### Manual Verification:

- SQL: `set_guest_sms_opt_in` with seed demo token sets columns; invalid token raises
- `get_guest_party_view` returns `sms_opt_in` without phone field

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Guest Opt-In UI

### Overview

Waiting guests can save phone + consent from the status page using browser Supabase RPC (same client pattern as `useGuestPartyView`).

### Changes Required:

#### 1. Guest SMS opt-in hook

**File**: `src/components/hooks/useGuestSmsOptIn.ts` (new)

**Intent**: Submit opt-in and expose saving/error state.

**Contract**:
- `saveOptIn(token, phoneE164, optIn)` → `supabase.rpc('set_guest_sms_opt_in', { p_token, p_phone_e164, p_opt_in })`
- Normalize input: trim; if digits-only 9-char PL mobile, prefix `+48`
- Validate E.164 regex client-side before RPC (match DB check)
- Return `{ saving, error, saveOptIn }`
- AbortController on unmount (match `useGuestToken` pattern)

#### 2. Guest status UI — SMS panel

**File**: `src/components/guest/GuestStatus.tsx`

**Intent**: Opt-in UI only in waiting state; reflect `sms_opt_in` from polled view.

**Contract**:
- New `SmsOptInPanel` inside `WaitingView` when `!view.sms_opt_in`
- Phone input (type `tel`, placeholder `+48 …`), checkbox with PL consent copy (transactional SMS when table ready)
- Submit calls hook; on success polling picks up `sms_opt_in: true` → show compact “Powiadomienia SMS włączone” badge (no phone displayed)
- Hide panel when `view.sms_opt_in === true` or `view.status !== 'waiting'`
- Use `cn()`, shadcn `Button` / `Input` / `Checkbox` if already in project; match cosmic card styling

#### 3. SSR bootstrap

**File**: `src/pages/guest/[token].astro`

**Intent**: Initial `GuestPartyView` includes `sms_opt_in` from RPC after migration.

**Contract**: No structural change — typed cast still works once `GuestPartyView` extended.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` set

#### Manual Verification:

- Open `/guest/{token}` for waiting party → opt-in form visible
- Save valid `+48…` number + consent → badge shows; reload persists via RPC
- Invalid phone shows inline error; ready/seated parties do not show form

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Twilio Send on Mark Ready

### Overview

Wire Twilio transactional SMS after successful `markPartyReady`, with env schema and best-effort error handling.

### Changes Required:

#### 1. Server env schema

**File**: `astro.config.mjs`

**Intent**: Twilio credentials server-only.

**Contract**:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — `context: "server", access: "secret", optional: true`
- `SMS_ENABLED` — `envField.string({ context: "server", access: "secret", optional: true })` — send only when value is `"true"`

#### 2. Env documentation

**File**: `.env.example`

**Intent**: Document Twilio vars for local dev (commented placeholders).

**Contract**: Add commented `TWILIO_*` and `SMS_ENABLED=false` lines.

#### 3. SMS service

**File**: `src/lib/services/sms.ts` (new)

**Intent**: Encapsulate Twilio REST call and message body.

**Contract**:
- `sendTableReadySms({ toE164, displayName, venueName, guestUrl? })` → `Promise<{ sid: string } | null>`
- Skip and return `null` when `SMS_ENABLED !== 'true'` or any Twilio env missing
- `fetch` POST to `https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` with Basic auth
- Body (PL): `"{displayName}, Twój stolik w {venueName} jest gotowy!"` + optional newline + guest URL
- Throw or return error result on non-2xx — caller logs, does not propagate to HTTP 500

#### 4. Party SMS helper

**File**: `src/lib/services/parties.ts` (extend)

**Intent**: Load send prerequisites after mark-ready.

**Contract**:
- `markPartyReadySmsContext(supabase, partyId)` — fetch party SMS fields + venue name + active guest token (join `venues`, `guest_tokens`); return null when not eligible

#### 5. Ready API hook

**File**: `src/pages/api/parties/[partyId]/ready.ts`

**Intent**: Send SMS after DB mutation; update `ready_sms_sent_at` on success.

**Contract**:
- After `markPartyReady()` succeeds, call SMS helper
- If eligible, `sendTableReadySms()` with `guestUrlFromRequest(request, token)` when token exists
- On Twilio success: `UPDATE parties SET ready_sms_sent_at = now() WHERE id = ?`
- Catch/log SMS errors; always return `200 { party }` from mark-ready

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint` passes
- `npm run build` passes with all Supabase + Twilio env vars set (or `SMS_ENABLED=false` for compile-only)

#### Manual Verification:

- With `SMS_ENABLED=true` and Twilio test credentials: mark ready for opted-in party → SMS received (or Twilio debugger shows send)
- Mark ready without opt-in → no Twilio call
- Twilio failure (bad creds) → staff still sees party in Ready section
- Second mark-ready attempt on same party → 409 (unchanged); no duplicate SMS

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No automated test suite in repo — rely on lint + build + manual E2E.

### Integration Tests:

- Manual: guest opt-in RPC + mark-ready + Twilio test number.

### Manual Testing Steps:

1. Apply migration locally; seed waiting party with guest token.
2. Guest page → opt in with `+48` test number.
3. Staff dashboard → Ready → verify SMS and `ready_sms_sent_at` in DB.
4. Verify guest ready page still works (polling).
5. Verify party without opt-in → no SMS on ready.

## Performance Considerations

- One Twilio HTTP call per mark-ready for opted-in parties only; negligible vs staff action latency.
- Fire-and-forget in request path adds ~200–800ms when enabled — acceptable; do not block UI (staff hook already refreshes lists).

## Migration Notes

- Existing parties: `sms_opt_in = false`, `phone_e164 = null` — no backfill required.
- Deploy order: migration → app deploy with env secrets → enable `SMS_ENABLED=true` in prod when Twilio sender verified.

## References

- Research: `context/changes/sms-table-ready/research.md`
- PRD FR-014: `context/foundation/prd.md`
- Ready API: `src/pages/api/parties/[partyId]/ready.ts`
- Guest RPC pattern: `supabase/migrations/20260609120100_queue_rls.sql`
- Similar guest island plan: `context/archive/2026-06-12-guest-live-wait-status/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema & Guest SMS RPC

#### Automated

- [ ] 1.1 Migration applies cleanly: `supabase db reset` (or `supabase migration up` against local)
- [ ] 1.2 `npx astro sync && npm run lint` passes
- [ ] 1.3 `npm run build` passes with `SUPABASE_URL` and `SUPABASE_KEY` set

#### Manual

- [ ] 1.4 SQL: `set_guest_sms_opt_in` with seed demo token sets columns; invalid token raises
- [ ] 1.5 `get_guest_party_view` returns `sms_opt_in` without phone field

### Phase 2: Guest Opt-In UI

#### Automated

- [ ] 2.1 `npx astro sync && npm run lint` passes
- [ ] 2.2 `npm run build` passes with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` set

#### Manual

- [ ] 2.3 Open `/guest/{token}` for waiting party → opt-in form visible
- [ ] 2.4 Save valid `+48…` number + consent → badge shows; reload persists via RPC
- [ ] 2.5 Invalid phone shows inline error; ready/seated parties do not show form

### Phase 3: Twilio Send on Mark Ready

#### Automated

- [ ] 3.1 `npx astro sync && npm run lint` passes
- [ ] 3.2 `npm run build` passes with all Supabase + Twilio env vars set (or `SMS_ENABLED=false` for compile-only)

#### Manual

- [ ] 3.3 With `SMS_ENABLED=true` and Twilio test credentials: mark ready for opted-in party → SMS received (or Twilio debugger shows send)
- [ ] 3.4 Mark ready without opt-in → no Twilio call
- [ ] 3.5 Twilio failure (bad creds) → staff still sees party in Ready section
- [ ] 3.6 Second mark-ready attempt on same party → 409 (unchanged); no duplicate SMS
