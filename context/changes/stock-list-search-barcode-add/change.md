---
change_id: stock-list-search-barcode-add
title: View, search, and barcode-add household stock
status: impl_reviewed
created: 2026-09-04
updated: 2026-09-07
archived_at: null
---

## Notes

Roadmap S-01 (north star). Planned from `/10x-plan` against PRD US-01 / FR-001–003 / FR-007–008 and implemented F-01 auth.

Decisions: one row per `(household_id, barcode)`; re-scan opens confirm sheet (current qty + delta stepper default +1; Confirm at 0 = no write); search = case-insensitive barcode **prefix**; empty name → primary label = barcode; stock is `(app)` home; invite/join on Household tab; `expo-camera` + typed-barcode fallback when camera unavailable; unique + client upsert under RLS (INSERT/UPDATE grants; no DELETE); save errors stay on confirm with Retry; nullable name/category columns now (always NULL in S-01); list refetches on focus; delete Explore + lockstep web hrefs; verify with lint + typecheck + manual script (no new test runner).

Plan review: `reviews/plan-review.md` — all findings triaged; verdict SOUND after fixes.
