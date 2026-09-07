---
change_id: remove-stock-item
title: Decrement stock by 1 and store utilization events
status: impl_reviewed
created: 2026-09-07
updated: 2026-09-07
archived_at: null
---

## Notes

Roadmap S-03. After S-01 list/add, household members decrement listed stock by 1 (FR-004), each remove is stored as a utilization event (FR-009), and the row is hard-deleted when quantity would hit 0. FR-010/011 wait for S-05.

Decisions from `/10x-plan` (+ revision): events keyed by `(household_id, barcode)` + `removed_at` + nullable `removed_by` (ON DELETE SET NULL); dedicated **Consume** tab (Stock | Consume | Household) with current-stock list + `−` (not on Stock; not consume-by-scan); confirm only when qty === 1; missing row → **Not in stock** (no event, no write) + refetch; atomic `remove_stock_item_by_barcode` RPC returning composite `{ deleted, item? }`; inline error + Retry for retryable failures; Consume empty “Nothing to consume” (no Scan CTA); no undo/bulk/FR-010.

**Impl-review F1 (accepted):** Member RLS can DELETE `stock_items` without an event and INSERT `stock_utilization_events` without changing stock. App clients must call `remove_stock_item_by_barcode` only (no direct DELETE / event INSERT). Trusted-member MVP tradeoff, same invoker+RLS style as S-01 add; harden before relying on S-05 frequency if untrusted clients appear.

**Impl-review F3 (accepted):** Last-unit confirm uses local list `quantity === 1`. Concurrent updates may skip or falsely show confirm; atomic RPC + list refetch remain the source of truth for MVP.

Plan review: `reviews/plan-review.md` — all findings FIXED; verdict SOUND after triage.

Impl review: `reviews/impl-review.md` — verdict NEEDS ATTENTION; triage complete (F1–F4 decided).
