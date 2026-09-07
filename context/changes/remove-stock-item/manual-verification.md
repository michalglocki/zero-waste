# Manual verification: remove stock item / Consume (S-03)

End-to-end checks for FR-004 / FR-009: decrement stock by 1 from the **Consume** tab, persist utilization events, hard-delete at qty 0, and show **Not in stock** when the row is already gone. No automated e2e runner — run against a configured Supabase project.

## Prerequisites

- [ ] F-01 and S-01 working (sign-in, household membership, Stock list/add via Scan).
- [ ] Migrations through `supabase/migrations/20260907210000_stock_remove_utilization.sql` applied (events table, DELETE on `stock_items`, `remove_stock_item_by_barcode`).
- [ ] `.env.local` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. **Never** put the service role key in the app env.
- [ ] App starts: `npm start` (web and/or native).
- [ ] Automated gate green: `npm run lint` and `npm run typecheck`.

## Script

Use one primary signed-in household member. For concurrent / second-device steps, use another member of the **same** household when noted.

### 1. Tabs + Stock has no −

1. Sign in and open the app.
2. Confirm tabs / header nav: **Stock | Consume | Household**.
3. On **Stock**, rows show quantity but **no** `−` control.
4. On **Consume**, the same household stock appears with a `−` per row.

**Result:** ☐ pass / ☐ fail — notes:

### 2. Empty Consume vs empty Stock

1. Use (or clear to) a household with **no** `stock_items`.
2. Open **Consume** → see **“Nothing to consume”** and copy pointing adds to **Stock**. **No** Scan button on Consume.
3. Open **Stock** → empty still offers **Scan**.

**Result:** ☐ pass / ☐ fail — notes:

### 3. Decrement qty > 1 (no confirm)

1. Ensure a row with quantity **≥ 3** (add via Stock Scan if needed).
2. On Consume, tap `−` once.
3. No confirm dialog; quantity decreases by 1 (e.g. 3 → 2).
4. Focus Stock → updated quantity visible after refetch.

**Result:** ☐ pass / ☐ fail — notes:

### 4. Last-unit Cancel then Confirm

1. Ensure a row with quantity **1**.
2. On Consume, tap `−` → confirm appears (“Remove last…” / equivalent).
3. **Cancel** → row remains; no new utilization event for this attempt.
4. Tap `−` again → **Confirm** → row disappears from Consume.
5. Focus Stock → row gone.
6. In SQL (or dashboard): one utilization event exists for that `(household_id, barcode)`.

**Result:** ☐ pass / ☐ fail — notes:

### 5. Not in stock (stale / concurrent)

1. With a visible Consume row, delete it from another device/member **or** call remove until deleted, then keep a stale list if possible (or force a second remove on the same barcode after delete).
2. Tap `−` (or Retry path that hits missing row) → UI shows **Not in stock**.
3. List refetches; stale row is gone.
4. Confirm **no** new utilization event was written for the failed attempt.

**Result:** ☐ pass / ☐ fail — notes:

### 6. Re-add after delete

1. After a row was deleted via Consume, open **Stock → Scan** and add the **same** barcode again.
2. New stock row appears (qty 1+).
3. Prior utilization events for that barcode still exist (history survives re-add).

**Result:** ☐ pass / ☐ fail — notes:

### 7. Double-tap busy

1. On Consume with qty ≥ 2, double-tap `−` quickly.
2. While in flight, that row’s `−` is busy/disabled; quantity decreases by **1** only (not 2).

**Result:** ☐ pass / ☐ fail — notes:

### 8. Network failure + Retry

1. Simulate offline / block the RPC (dev tools, airplane mode mid-tap, etc.).
2. Tap `−` → inline error + **Retry**; quantity unchanged on the list.
3. Restore network → **Retry** → remove succeeds; quantity updates (or row deleted if last unit).

**Result:** ☐ pass / ☐ fail — notes:

## Sign-off

- [ ] All scripted steps above pass (or failures noted with follow-up).
- Date / tester:
