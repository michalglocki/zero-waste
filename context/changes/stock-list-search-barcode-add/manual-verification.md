# Manual verification: stock list, search & barcode-add (S-01)

End-to-end aisle loop for viewing household stock, searching by barcode prefix, and adding (or increasing) items via camera or typed fallback. No automated e2e runner — run this against a configured Supabase project. Camera path needs a real device (or a build that supports `expo-camera`); typed fallback can use web/simulator.

## Prerequisites

- [ ] F-01 is working (sign-in, membership, invite/join). Prefer two accounts that already share a household when checking the shared-list step.
- [ ] Migration `supabase/migrations/20260907000000_stock_items.sql` is applied to the project behind `.env.local`.
- [ ] `.env.local` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or publishable key). **Never** put the service role key in the app env.
- [ ] App starts: `npm start` (plus platform target / dev client as needed for camera).
- [ ] Automated gate green: `npm run lint` and `npm run typecheck`.

## Script

Use one primary signed-in household member for most steps. For the shared-list check, use a second member of the **same** household (sign-out / second device / private session).

### 1. Empty state + Scan CTA

1. Sign in as a member of a household with **no** `stock_items` rows (or clear that household’s stock in SQL for a clean run).
2. Land on the Stock home tab (not Household / invite).
3. See empty-state copy (“No stock yet”) and a **Scan** CTA.
4. Header **Scan** affordance is also available.
5. Tap Scan → open the scan screen.

**Result:** ☐ pass / ☐ fail — notes:

### 2. Camera add → list shows row

1. On a real device with camera permission granted, scan a real product barcode.
2. Confirm sheet opens with current qty **0** (new code) and delta default **1**.
3. Tap **Confirm** → sheet dismisses; stay on the scanner (ready for another scan).
4. Leave Scan and return to Stock → list refetches on focus.
5. Row primary label is the full barcode string; quantity is **1** beside it. Newest-updated ordering puts this row at the top when it is the latest write.

**Result:** ☐ pass / ☐ fail — notes:

### 3. Prefix search hit / miss

1. On Stock, type a case-insensitive **prefix** of the barcode just added → matching row appears.
2. Clear and type an unrelated prefix → empty results (“No matching stock” / no barcodes start with that prefix). No Scan CTA on search-miss empty (only on no-stock).

**Result:** ☐ pass / ☐ fail — notes:

### 4. Re-scan same code → confirm + increment

1. Open Scan again; scan the **same** barcode.
2. Confirm sheet shows **current** qty (e.g. 1), not 0.
3. Add a delta (e.g. +2) → Confirm.
4. Return to Stock → **one** row for that barcode; quantity increased by the delta (e.g. 3). No duplicate rows.

**Result:** ☐ pass / ☐ fail — notes:

### 5. Typed fallback (camera denied / web)

1. Deny camera permission, use web, or otherwise use the typed-barcode path.
2. Enter a non-empty code (trim ends only). Blank/whitespace-only cannot open Confirm.
3. Prefer a code with **leading zeros** (e.g. `073852000123`) — never coerce to number.
4. Confirm +1 → upsert succeeds; return to Stock → row label and later prefix search match that **exact** string (zeros preserved).

**Result:** ☐ pass / ☐ fail — notes:

### 6. Delta 0 no-op

1. Scan or type a known barcode → confirm sheet opens.
2. Set delta to **0** (stepper and/or numeric input).
3. Confirm → no DB write (qty unchanged when you return to Stock). Sheet dismisses / no upsert.

**Result:** ☐ pass / ☐ fail — notes:

### 7. Save error + Retry

1. With a barcode on the confirm sheet, kill network or otherwise force the upsert to fail.
2. Sheet stays open with an error and a **Retry** action; scanned code (including leading zeros) is preserved.
3. Restore network → Retry once → success; dismiss sheet; one write (qty increased once, not doubled by a silent prior success).

**Result:** ☐ pass / ☐ fail — notes:

### 8. Cancel confirm → scanner re-arms

1. Scan or type a code → open confirm.
2. Cancel / dismiss without Confirm.
3. No write. Scanner (or typed field) can be used again for the next code.

**Result:** ☐ pass / ☐ fail — notes:

### 9. Household tab still works

1. Open the Household tab.
2. Invite code still visible; join entry and sign-out still work (smoke only — full F-01 path is in that change’s checklist).
3. Stock home is unchanged by visiting Household.

**Result:** ☐ pass / ☐ fail — notes:

### 10. Shared list (second household member)

1. As User A, ensure at least one stock row exists (from steps above).
2. Sign in as User B on the **same** household (via invite/join if needed).
3. B’s Stock list shows the same barcode + quantity as A.
4. Optional negative check: a member of a **different** household does **not** see A’s rows.

**Result:** ☐ pass / ☐ fail — notes:

## Run log

| Date       | Environment (device / sim / web) | Path exercised              | Operator | Overall   |
| ---------- | -------------------------------- | --------------------------- | -------- | --------- |
| 2026-09-07 | real device + typed fallback     | camera + typed (required)   | human    | ☑ pass    |

**Overall notes:** End-to-end checklist confirmed pass (Phase 4 manual gate), including Scan navigation on native after Stack-over-tabs fix and shared stock for two household members.
