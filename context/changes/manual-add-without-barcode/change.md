---
change_id: manual-add-without-barcode
title: Manual add without barcode
status: implemented
created: 2026-09-08
updated: 2026-09-08
archived_at: null
---

## Notes

Roadmap S-04 / FR-005: add stock by hand when no barcode exists (produce/bulk). Planning settled: Scan + “No barcode?” form; name required when barcode absent; many no-code rows with case-insensitive name merge (trim + fold, add-delta); typed nonempty barcode hands off to existing confirm sheet (**discard form name**); Consume removes by `stock_items.id` (utilization events only when barcode present); Stock/Consume search matches barcode or name prefix; inline form errors + Retry.

Plan review: `reviews/plan-review.md` — F1–F4 triaged FIXED; verdict SOUND after fixes.
