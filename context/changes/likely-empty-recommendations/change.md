---
change_id: likely-empty-recommendations
title: Likely-empty recommendations from utilization frequency
status: impl_reviewed
created: 2026-09-08
updated: 2026-09-09
archived_at: null
---

## Notes

Roadmap S-05 / US-03 / FR-010 / FR-011. After S-03 utilization events, compute frequency on live `stock_items` inside add/remove RPCs; list qty=1 products overdue vs average interval (inclusive ≥); fourth Recommendations tab; Ignore until next add/remove; no-code events keyed by `lower(trim(name))`; no RLS harden (trusted-member debt remains).

Plan review: `reviews/plan-review.md` — F1–F4 FIXED; verdict SOUND after triage.
Impl review: `reviews/impl-review.md` — 0 critical, 2 warnings, 3 observations; verdict NEEDS ATTENTION.
