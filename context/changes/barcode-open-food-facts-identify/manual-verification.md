# Manual verification: barcode Open Food Facts identify (S-02)

End-to-end aisle enrichment: scan/type a barcode, soft OFF lookup on the confirm sheet, qty Confirm without waiting, background diff-only identity persist, and list/search display. No automated e2e runner — run against a configured Supabase project + live Open Food Facts. Camera path needs a real device (or a build that supports `expo-camera`); typed fallback can use web/simulator.

## Prerequisites

- [ ] S-01 aisle loop works (stock list, barcode-prefix search, scan/typed Confirm). Prefer the S-01 checklist green first.
- [ ] Migrations applied to the project behind `.env.local`:
  - `supabase/migrations/20260907000000_stock_items.sql`
  - `supabase/migrations/20260907190000_stock_items_pack_size.sql`
- [ ] `.env.local` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or publishable key). **Never** put the service role key in the app env.
- [ ] Optional: `EXPO_PUBLIC_OPEN_FOOD_FACTS_BASE_URL` (defaults to `https://world.openfoodfacts.org`).
- [ ] App starts: `npm start` (plus platform target / dev client as needed for camera).
- [ ] Automated gate green: `npm run lint` and `npm run typecheck`.

## Script

Use one primary signed-in household member. Pick a **known in-catalog** barcode (common EAN with OFF `product_name` / categories / quantity text) and a **nonsense** code that OFF will not find.

### 1. Known hit — soft lookup + list identity

1. Scan or type a known in-catalog barcode.
2. Confirm sheet: soft “Looking up…” then preview name (and category/pack when OFF provides them). Confirm stays enabled the whole time.
3. Confirm +1 → sheet dismisses; qty write succeeds without waiting on OFF if still in flight.
4. Return to Stock (focus refetch). Row **primary** = product name (not barcode). **Secondary** line shows `main_category` and/or `pack_size` when present (e.g. `Dairy · 400 g`). Quantity beside the row.

**Result:** ☐ pass / ☐ fail — notes:

### 2. Miss — not found, barcode-only row

1. Scan or type a nonsense barcode.
2. Confirm sheet shows “Not found” (soft status + Retry available). Confirm still enabled.
3. Confirm +1 → row appears on Stock with **barcode as primary**; no secondary line.

**Result:** ☐ pass / ☐ fail — notes:

### 3. Network failure soft status

1. With an existing enriched row (from step 1), open Confirm for that barcode while offline / network blocked.
2. Soft error (“Couldn't look up”) + Retry; Confirm still works.
3. Confirm +1 → qty increases; existing DB identity unchanged on list after refetch.
4. Restore network → Retry (while sheet still open) can refresh preview; does not undo qty.

**Result:** ☐ pass / ☐ fail — notes:

### 4. Confirm during lookup — background enrich

1. Clear or use a **new** in-catalog barcode not yet in household stock (or one with null identity).
2. Open Confirm and tap Confirm +1 while status is still “Looking up…”.
3. Qty saves immediately; sheet may unmount.
4. After OFF completes in background, return to Stock (or wait and focus) → identity fields appear (name primary; secondary when mapped).

**Result:** ☐ pass / ☐ fail — notes:

### 5. DB-first re-scan

1. Open Confirm again for the enriched barcode from step 1.
2. Sheet shows **DB name immediately** (before any network). Soft lookup may still run unless cache hit.
3. Confirm +1 works; if OFF returns identical fields, no pointless rewrite of unchanged columns (qty still increments).

**Result:** ☐ pass / ☐ fail — notes:

### 6. Cache TTL hit (30 min)

1. Immediately re-scan the same barcode after a successful OFF lookup (within 30 minutes).
2. Confirm preview uses cache; no duplicate OFF network round-trip (observable via logs, mock, or offline after first hit with cache warm).
3. Explicit **Retry** on the sheet bypasses cache and re-fetches.

**Result:** ☐ pass / ☐ fail — notes:

### 7. Delta 0 dismiss

1. Open Confirm for any barcode; set delta to **0**.
2. Confirm → dismiss only; qty unchanged; no forced identity write.

**Result:** ☐ pass / ☐ fail — notes:

### 8. Cancel without persist

1. For a **new** barcode (not yet in stock), open Confirm, wait until OFF preview shows (or cache warms), then **Cancel** without Confirm.
2. No stock row created; no identity DB write for that barcode.
3. Cache may still retain the OFF result for a later scan.

**Result:** ☐ pass / ☐ fail — notes:

### 9. Diff-only update (OFF omit does not clear DB)

1. Ensure a row has a non-null `name` (and ideally category/pack) in DB.
2. Trigger an enrich path where OFF omits one of those fields (or simulate via a product that lacks pack quantity).
3. After enrich, the previously filled DB field remains; only fields whose new mapped value **differs** are updated. OFF omission must not null-out existing identity.

**Result:** ☐ pass / ☐ fail — notes:

### 10. List primary / secondary + unenriched

1. Enriched row: name primary; secondary = category and/or pack when present.
2. Unenriched / miss row: barcode primary; no secondary line.
3. `pack_size` appears in the secondary line when OFF provided quantity text and enrich applied it.

**Result:** ☐ pass / ☐ fail — notes:

### 11. Search still barcode-prefix only

1. On Stock, type a case-insensitive **prefix of the barcode** for an enriched row → row still appears (even though primary label is the product name).
2. Clear and type a distinctive **product name** substring that is **not** a barcode prefix → row does **not** filter in (explicit non-goal for S-02).

**Result:** ☐ pass / ☐ fail — notes:

### 12. Web User-Agent note (optional)

1. On web, confirm lookup still works for a known barcode (browsers may override `User-Agent`; app still identifies via OFF-recommended means where applicable).
2. Note any UA-related quirks for future BFF consideration — do not treat as a blocker if lookup succeeds.

**Result:** ☐ pass / ☐ fail / ☐ skipped — notes:

## Run log

| Date | Environment (device / sim / web) | Path exercised | Operator | Overall |
| ---- | -------------------------------- | -------------- | -------- | ------- |
|      |                                  |                |          | ☐ pass / ☐ fail |

**Overall notes:**
