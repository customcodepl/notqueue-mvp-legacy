# FR-014 SMS on Table Ready — Plan Brief

> Full plan: `context/changes/sms-table-ready/plan.md`
> Research: `context/changes/sms-table-ready/research.md`

## What & Why

Guests who opted in on their status page should receive an SMS when staff marks their table ready — so they can step away without missing the call. FR-014 is a nice-to-have complement to FR-013 (on-page ready state via polling); it does not replace the guest status page.

## Starting Point

MVP v1 delivers table-ready on `/guest/[token]` via 30s polling. Staff mark-ready updates `parties.status` through `POST /api/parties/[partyId]/ready` with no notification side effects. No phone columns, no Twilio integration, no guest opt-in UI.

## Desired End State

A waiting guest can enter a Polish mobile number (+48) and consent on the status page. When staff taps Ready, Twilio sends a Polish transactional SMS (best-effort). Mark-ready always succeeds; `ready_sms_sent_at` prevents duplicate sends. Phone never appears in guest read RPC.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Phone capture | Guest on status page | Clear consent; staff form unchanged | Research |
| Send trigger | Ready only | Matches FR-014 semantics; `advanceQueue` unchanged | Research |
| Market | Poland / EU, +48 default | Product locale; E.164 validation | Research |
| Provider | Twilio via Worker `fetch` | Matches Astro SSR + Wrangler secrets pattern | Research |
| Guest write path | `set_guest_sms_opt_in` RPC | Same browser client pattern as S-05; anon cannot UPDATE | Plan |
| Guest read path | Add `sms_opt_in` boolean only | Privacy — phone never in `get_guest_party_view` | Research |
| Sender config | `TWILIO_FROM_NUMBER` env | Simpler than Messaging Service for solo MVP | Plan |
| Failure mode | Best-effort; ready always 200 | SMS is ancillary; staff ops must not break | Research |
| Audit | `ready_sms_sent_at` on `parties` | Idempotency without new table | Plan |
| Dev mode | `SMS_ENABLED=false` skips send | Local dev without Twilio account | Plan |

## Scope

**In scope:** migration (phone, opt-in, sent timestamp); guest RPCs; `GuestPartyView.sms_opt_in`; opt-in UI in waiting state; `src/lib/services/sms.ts`; Twilio env in `astro.config.mjs`; hook in `ready.ts`; `.env.example` docs.

**Out of scope:** staff phone entry; SMS on Call next; Edge Functions; Auth SMS; opt-out / edit phone; staff UI showing numbers; roadmap S-06 unpark; non-PL templates.

## Architecture / Approach

```
Guest (waiting) → rpc('set_guest_sms_opt_in') → parties.phone_e164 + sms_opt_in
Staff Ready → POST /ready → markPartyReady() → sendTableReadySms() → Twilio
Guest (any) → poll get_guest_party_view → sees ready on page (FR-013 unchanged)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & guest RPC | Columns + `set_guest_sms_opt_in` + extended read RPC | E.164 validation mismatch client vs DB |
| 2. Guest opt-in UI | Hook + WaitingView panel + PL copy | UX clutter on small mobile card |
| 3. Twilio on ready | Env, sms service, ready route hook | Twilio creds / sender verification in prod |

**Prerequisites:** Local Supabase; Twilio account with verified PL sender (for prod SMS); existing staff + guest paths from MVP v1.

**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Twilio sender must be provisioned and verified before prod `SMS_ENABLED=true`.
- TCPA/EU consent: checkbox copy must state transactional purpose (implementer uses PL legal copy in UI).
- Token reissue does not clear phone — same party row keeps opt-in (acceptable v1).
- No SMS retry if Twilio fails at mark-ready — guest still informed via polling.

## Success Criteria (Summary)

- Opted-in guest receives Polish SMS when staff marks Ready.
- Non-opted-in guests and failed Twilio calls do not block staff workflow.
- `npm run lint` and `npm run build` pass; phone never exposed via guest RPC.
