---
change_id: guest-live-wait-status
title: Guest live wait status (S-05)
status: impl_reviewed
created: 2026-06-12
updated: 2026-06-10
---

## Notes

S-05 (north star) from `context/foundation/roadmap.md`. Prerequisites: F-01 (done), S-01–S-03 (done). S-04 (`staff-configure-guest-venue-info`) not required — guest renders `menu_link` / `info_text` from RPC when present; staff edit UI deferred to S-04.

PRD refs: FR-008–FR-013, US-01. Live updates via polling `get_guest_party_view` every 30s (Page Visibility pause). Supabase Realtime deferred — anon RLS incompatible without custom JWT (F-01).
