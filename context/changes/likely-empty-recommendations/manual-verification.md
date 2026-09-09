# Manual verification — likely-empty-recommendations

Human checklist for FR-010 / FR-011, Ignore, no-code events, and tab lockstep (Phase 3).

Prerequisites: Phase 1–2 migrations applied to the project Supabase instance; app running against that project.

## Tabs (native + web)

1. Open the app on **native** and confirm tab order: **Stock | Consume | Recommendations | Household**.
2. Open the app on **web** and confirm the same four destinations in the header nav, same order.
3. Recommendations has **no Scan** control and **no −** control. Stock still browse/add (incl. Scan). Consume still owns **−**.

## Seed barcode history → overdue appears

1. Add a barcode product with quantity ≥ 3 (Stock / Scan).
2. From Consume, remove it **twice** (leave at least qty 1). Confirm util columns populate after the second surviving remove (or trust Phase 1 smoke).
3. Leave qty = 1. If not yet overdue, use the equality seed below (or wait / adjust `util_last_removed_at` via SQL).
4. Open **Recommendations** — the barcode product appears.
5. Confirm a qty > 1 row does **not** appear; a product with fewer than 2 removals does **not** appear; a non-overdue qty-1 row does **not** appear.

## Seed no-code history → overdue appears

1. Add a no-barcode product by name with quantity ≥ 3.
2. Remove twice via Consume (by id); leave qty = 1 and overdue (or seed equality).
3. Open Recommendations — the named product appears alongside (or instead of) barcode cases as expected.

## Equality boundary (≥) — seed recipe (plan 3.7)

1. Pick a qty=1 household row with `util_removal_count >= 2` and non-null `util_avg_interval_seconds` (or set util columns via SQL for a test row).
2. Run:

```sql
UPDATE stock_items
SET
  util_last_removed_at = now() - (util_avg_interval_seconds * interval '1 second'),
  recommendation_ignored_at = null
WHERE id = /* … */;
```

3. Call `list_likely_empty_recommendations` (or open Recommendations) — confirm the row **is included**.
4. Optional exclusion check: bump last removed one second later (`now() - … + interval '1 second'`) and confirm it drops when re-testing strict timing.

## Ignore lifecycle

1. On Recommendations, tap **Ignore** for an overdue row — it disappears from the list immediately.
2. Add one unit of that product (Stock) **or** remove once while qty > 1 (Consume) — ignore clears on the surviving/re-added row.
3. When predicates still hold (qty=1, overdue, count ≥ 2), the row can reappear on Recommendations after refetch/focus.

## Re-add restores util-based eligibility

1. Consume a qty-1 overdue product down to delete (hard-delete).
2. Re-add the same barcode or no-code name.
3. After enough history exists on events, leave qty=1 overdue — Recommendations can list it again (util restored from events on re-add).

## Empty state

1. With no eligible rows (empty stock, all ignored, none overdue, or insufficient history), Recommendations shows copy like **“No recommendations right now”** — not Stock’s Scan CTA and not Consume’s “Nothing to consume” verbatim.
2. Confirm no Scan button on that empty state.

## Sign-off

| Check | Native | Web |
| ----- | ------ | --- |
| Four tabs, correct order | | |
| Overdue qty-1 barcode appears; non-eligible do not | | |
| Overdue qty-1 no-code appears | | |
| Equality (≥) seed includes row | | |
| Ignore hides; add/remove restores eligibility | | |
| Ignore only on Recommendations; − on Consume; Scan on Stock | | |
| Empty copy specific, no Scan | | |
