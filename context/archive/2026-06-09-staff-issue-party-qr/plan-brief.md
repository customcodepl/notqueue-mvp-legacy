# Staff Issue Party QR — Plan Brief

> Full plan: `context/changes/staff-issue-party-qr/plan.md`
> Research: `context/changes/queue-schema-and-guest-tokens/plan.md` (F-01 guest_tokens baseline)
> Prior slice: `context/changes/staff-add-party-to-queue/plan.md` (S-01 dashboard + parties API)

## What & Why

Staff must hand guests a QR or link scoped to one waiting party (FR-003) — the guest entry point for US-01. S-02 mints opaque tokens in `guest_tokens`, shows QR + copyable link on the dashboard, and ships a minimal public `/guest/[token]` stub so scans don't 404 before S-05 live status.

## Starting Point

F-01: `guest_tokens` table, staff INSERT/UPDATE/SELECT RLS, one-active-token partial unique index, `get_guest_party_view` RPC for anon reads. S-01: `/dashboard` waiting list, `GET`/`POST /api/parties`, no guest routes, no QR dependency. Seed Smith party has fixed dev token `demo-guest-token-local-only`.

## Desired End State

Staff clicks **QR** on a waiting party → modal shows QR image and guest URL (`/guest/[token]`). If no token exists, staff **Issue**; if active token exists, staff see current QR and can **Reissue** (old token revoked). Scanning the QR opens a public stub page confirming party name/size with placeholder for live status (S-05 replaces stub content).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Guest URL | `/guest/[token]` | Clean path for QR encoding and Astro dynamic route | Plan |
| QR rendering | `react-qr-code` client-side | No server image endpoint; Workers-friendly | Plan |
| Reissue UX | Show existing + explicit Reissue | Matches F-01 revocation model; avoids accidental invalidation | Plan |
| Dashboard UI | Per-row QR button → modal | Fits current list without cluttering rush screen | Plan |
| Token timing | Manual issue only | Host controls when guest gets link | Plan |
| Guest page | Minimal stub in S-02 | Proves URL contract; scan doesn't 404 | Plan |
| API shape | `GET`/`POST /api/parties/[partyId]/guest-token` | RESTful party scope; GET for view, POST for issue/reissue | Plan |

## Scope

**In scope:** `guestTokens` service; nested guest-token API; `react-qr-code`; dashboard QR modal; public `/guest/[token]` stub; DTO types.

**Out of scope:** Live guest status / Realtime (S-05); advance queue / ETA / ready (S-03); auto-issue on party add; SMS; new migrations; printable PDF QR.

## Architecture / Approach

```
Dashboard row "QR" → GET /api/parties/:id/guest-token (staff auth)
                  → POST (issue/reissue: revoke active + insert new)
                  → guest_url = origin + /guest/{token}
                  → modal renders QR from guest_url

Guest phone scan → GET /guest/[token] (public Astro SSR)
                  → supabase.rpc('get_guest_party_view', { p_token })
                  → stub UI (party name; status placeholder)
```

Token minted server-side via `crypto.getRandomValues` (base64url). Reissue: `UPDATE guest_tokens SET revoked_at = now()` then `INSERT` new row.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Token API & service | guestTokens helpers + GET/POST nested API | Party ID validation; reissue race (acceptable MVP) |
| 2. Dashboard QR modal | react-qr-code + modal UX on waiting list | Modal state + fetch error handling |
| 3. Guest stub page | Public `/guest/[token]` via RPC | Invalid/revoked token UX |

**Prerequisites:** S-01 deployed locally; `npx supabase db reset`; staff test account.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- `guest_url` origin comes from request URL — correct in prod behind custom domain; verify after deploy.
- Reissue read-then-write without DB transaction — rare duplicate active token if two staff reissue simultaneously (partial unique index would fail second insert).
- Stub page is not the north-star guest experience — S-05 replaces content, keeps URL shape.

## Success Criteria (Summary)

- Staff issues QR for a party; modal shows scannable code and copyable link.
- Reissue invalidates old token (`get_guest_party_view` fails for old token).
- `/guest/[token]` loads for valid token; revoked/invalid token shows friendly error.
- `npm run lint` and `npm run build` pass.
