# Remove Stock Item Implementation Plan

## Overview

Ship FR-004 and FR-009: a household member can decrease a listed product’s quantity by 1 from a dedicated **Consume** tab (not from Stock); each remove is stored as a utilization event keyed by `(household_id, barcode)`; when quantity would become 0, the row is hard-deleted. If the product is not in the DB, the UI shows **Not in stock** and writes nothing. Frequency/recommendations (FR-010/011) remain S-05.

## Current State Analysis

- S-01 landed `stock_items` with `quantity >= 1`, unique `(household_id, barcode)`, RLS SELECT/INSERT/UPDATE only — **no DELETE grant or policy** (`supabase/migrations/20260907000000_stock_items.sql`). Add path is atomic RPC `add_stock_item_by_barcode` (`security invoker`).
- Tabs today: **Stock** (`index`) + **Household** (`src/components/app-tabs.tsx`). Stock home lists rows via `listStockItems` + focus refetch; `StockListRow` is display-only. Confirm-sheet − adjusts **add delta**, not stock.
- No utilization/events table exists. S-05 needs remove history that **survives** row delete and barcode re-add.
- Origin note: “always −1”, “hard delete at 0”, and “store each remove” are **product** (PRD / roadmap). **Consume tab**, event identity `(household_id, barcode)`, list-with-`−` on Consume, and **Not in stock** (no write) are **user** decisions from this planning session. “No DELETE in S-01” was a **code**/prior-plan deferral, not a permanent product ban.

## Definitions

| Term | Decided meaning | Origin | On degenerate data (tie, duplicate, empty, boundary, legacy) | Verified by |
| ---- | --------------- | ------ | ------------------------------------------------------------ | ----------- |
| Remove / consume | Decrease quantity by exactly 1 | product (FR-004) | Never −N in one action; no absolute set | Phase 3 manual |
| Consume surface | Dedicated **Consume** tab listing current household stock with `−` | user | Stock tab has no remove controls — avoids confusing browse/add with consume | Phase 3 manual |
| List row removed | Hard DELETE of `stock_items` when post-remove qty would be 0 | product (FR-004) | Never UPDATE to 0 (CHECK forbids); soft-delete out of scope | Phase 1/3 |
| Utilization event | One append-only row per remove: household + barcode + timestamp + actor (`removed_by`, nullable after user delete) | product (FR-009) + user | Survives stock row delete; re-add of same barcode keeps prior events; actor FK is ON DELETE SET NULL | Phase 1/3 |
| Event identity | `(household_id, barcode)` — no FK to `stock_items.id` | user | Empty barcode cannot appear on S-01 rows; S-04 empty-barcode later may need revisit | Phase 1 |
| Remove trigger | `−` on each row of the **Consume** list (current stock only) | user | One tap = one remove (after optional last-unit confirm); no consume-by-scan in this slice | Phase 3 manual |
| Last unit | When `quantity === 1`, confirm before remove | user | Cancel → no write; Confirm → delete + event | Phase 3 manual |
| Not in stock | Target barcode/row missing in DB at remove time | user | Show **Not in stock**; **no** utilization event; **no** qty write; refetch Consume list to drop stale rows | Phase 1/3 |
| Concurrent last unit | Atomic RPC; loser hits not-in-stock path; list refetches | user | At most one event for the last physical unit | Phase 1/3 |
| FR-010 frequency | Out of this change | product (roadmap S-05) + user | No interval columns or async jobs here | N/A (out of scope) |

## Desired End State

Tabs are **Stock | Consume | Household**. Stock stays browse/search + Scan-to-add. Consume shows the same household stock list with a `−` per row. Tapping `−` (after confirm when qty is 1) atomically records a utilization event and either decrements quantity or deletes the row. If the row is already gone, the user sees **Not in stock** and nothing is written. Failures leave quantity unchanged and offer Retry where retryable. History for a barcode remains queryable after the row is gone so S-05 can compute intervals later.

### Key Discoveries:

- Mirror add: `security invoker` RPC + RLS grants — not F-01 `security definer` membership helpers (`supabase/migrations/20260907000000_stock_items.sql`).
- DELETE grant + `FOR DELETE` policy are required for invoker RPC to remove rows; S-01 explicitly deferred this.
- Last-unit confirm can reuse `Alert` / `window.confirm` from `src/components/household/join-household-form.tsx`.
- Native + web tab chrome must stay in lockstep (S-01 lesson): native `app-tabs.tsx` + web `(tabs)/_layout.web.tsx` (`WebHeaderNav` / Stack). Do not assume `app-tabs.web.tsx` exists.
- No unit/e2e runner — verify with `npm run lint`, `npm run typecheck`, and a manual script (same as S-01/S-02).

## What We're NOT Doing

- FR-010 async utilization frequency / columns on `stock_items`
- FR-011 recommendations UI (S-05)
- Undo / snackbar rewind of a remove
- Bulk or multi-qty remove in one action; swipe-to-delete; remove confirm sheet for every tap
- Soft-delete / archive of stock rows
- **`−` on the Stock tab** (Stock remains view/search/add only)
- **Consume-by-scan / typed barcode remove** (this slice is Consume list + `−` only)
- Offering “add instead” when not in stock
- Changing add/confirm-sheet or OFF enrich paths
- Manual-add without barcode (S-04)
- Adding a unit/e2e test runner
- Client direct INSERT into events from UI (RPC-only write path)

## Implementation Approach

1. Migration: append-only `stock_utilization_events` + DELETE privilege/policy on `stock_items` + atomic `remove_stock_item_by_barcode` RPC (insert event → decrement or delete; missing row → error, no event).
2. Client: `removeStockByBarcode` in `src/services/stock.ts`, throw-on-error, map missing-row to a stable not-in-stock signal for UI.
3. UI: new **Consume** tab (native + web), list current stock with `−`, last-unit confirm, Not in stock / Retry; leave Stock row display-only.

## Critical Implementation Details

### State sequencing

Do **not** UPDATE `quantity` to 0. Inside the RPC: if current qty is 1, DELETE the row after inserting the event; if qty > 1, `quantity = quantity - 1`. Client must never attempt a qty-0 write. On missing row, raise **before** inserting an event.

### Timing & lifecycle

Disable the row’s `−` while that row’s remove is in flight (guards double-tap). Last-unit confirm must run **before** the RPC call; Cancel skips the write entirely.

### User experience spec

Stock and Consume both list household stock, but only Consume can mutate quantity downward. **Empty Consume** must not mount Stock’s `StockEmptyState` as-is (it hard-codes a Scan CTA and “scan to add” copy). Use a Consume-specific empty (new component, or a `kind` that never links to Scan): title **“Nothing to consume”**, supporting line that stock is empty and adds happen on **Stock** (e.g. via Scan there) — no Scan button on Consume. Search-miss empty on Consume may reuse “no matching” wording without a Scan CTA.

---

## Phase 1: Schema, DELETE grants, remove RPC

### Overview

Land utilization storage and an atomic remove path that matches the add RPC style.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_stock_remove_utilization.sql` (new)

**Intent**: Persist each remove and allow hard-delete at zero under the same household RLS model as S-01.

**Contract**:
- Table `stock_utilization_events` with at least: `id` (uuid PK), `household_id` → `households` ON DELETE CASCADE, `barcode` text (non-empty check), `removed_at` timestamptz default `now()`, `removed_by` uuid **nullable** `references auth.users (id) on delete set null` (set at insert from `auth.uid()`; survives actor account deletion without blocking user delete or wiping household history). **No FK to `stock_items`.** Index on `(household_id, barcode, removed_at)` for S-05.
- RLS enabled; `revoke all` then `grant select, insert` to `authenticated` (no update/delete — append-only). Policies: SELECT/INSERT when `is_household_member(household_id)` / `household_id = current_household_id()`.
- On `stock_items`: `grant delete` to `authenticated`; add `FOR DELETE` policy using `is_household_member(household_id)` (mirror UPDATE’s membership check). Keep existing SELECT/INSERT/UPDATE.
- RPC `remove_stock_item_by_barcode(p_barcode text)` → `security invoker`, `search_path = public`: resolve `current_household_id()`; trim barcode; reject blank; select the household row (lock if practical in plpgsql); **if missing, raise a clear exception usable as Not in stock — do not insert an event**; otherwise insert one utilization event (`removed_by = auth.uid()`); if `quantity = 1` then DELETE and set result `deleted = true` (no item payload); else UPDATE `quantity - 1` and set `deleted = false` plus the updated row fields. **Do not** `RETURNS public.stock_items` with SQL NULL for delete — that collides with supabase-js `{ data: null, error: null }` and the add-path cast pattern. Prefer a small composite/json return (at least `deleted boolean` + optional item fields matching `STOCK_SELECT`). Grant `EXECUTE` to `authenticated` only. Do not alter F-01 helpers or the add RPC.

#### 2. Types for remove result

**File**: `src/types/stock.ts` (extend) and/or local type next to the service

**Intent**: Make the deleted vs decremented branch impossible to confuse with a missing error.

**Contract**: A typed remove result such as `{ deleted: true } | { deleted: false; item: StockItem }` mapped from the RPC composite — never cast a null RPC `data` as `StockItem`.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with events table, DELETE grant/policy on `stock_items`, and `remove_stock_item_by_barcode`
- `npm run typecheck` passes (no broken imports if types touched)
- `npm run lint` passes

#### Manual Verification:

- Migration applied to the project Supabase instance
- Via SQL or RPC: qty 2 → remove → qty 1 + one event; qty 1 → remove → row gone + second event; remove on missing barcode fails with not-found style error and **zero** new events for that attempt
- Second household cannot remove or read the first household’s events/rows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Client remove service

### Overview

Expose remove behind the same throw-on-error stock service as add/list.

### Changes Required:

#### 1. Stock service

**File**: `src/services/stock.ts`

**Intent**: Call the remove RPC from the app without duplicating decrement/delete logic on the client.

**Contract**: Add something like `removeStockByBarcode(barcode: string)`: trim; reject blank; `supabase.rpc('remove_stock_item_by_barcode', …)`; on success map the composite to `{ deleted: true } | { deleted: false; item: StockItem }` (never `data as StockItem` when delete can yield null). On missing-row / not-found map to a stable error the UI can show as **Not in stock** (message or typed flag). Do not read-modify-write quantity in JS. Do not insert into `stock_utilization_events` from the client.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes with the new export compiling
- `npm run lint` passes

#### Manual Verification:

- Throwaway call or temporary screen hook: remove on qty≥2 returns updated item; remove on qty 1 returns deleted; repeat remove on same barcode after delete surfaces not-in-stock / not-found with no new event

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Consume tab, list −, last-unit confirm, Not in stock

### Overview

Add a Consume activity surface and keep Stock free of remove controls.

### Changes Required:

#### 1. Consume route + tabs (native + web)

**Files**: `src/app/(app)/(tabs)/consume.tsx` (new); `src/components/app-tabs.tsx`; `src/app/(app)/(tabs)/_layout.web.tsx` (web header nav + Stack screens that hard-code Stock | Household). There is **no** `app-tabs.web.tsx` on disk — do not recreate one; web tab chrome is `_layout.web.tsx` only. Optionally update the comment in `src/app/(app)/(tabs)/_layout.tsx` (Stock + Household → include Consume).

**Intent**: Make consume a first-class tab so browse/add and consume are not confused.

**Contract**: Tab order **Stock | Consume | Household**. Native: `NativeTabs.Trigger` `name` matches route filename `consume` in `app-tabs.tsx`. Web: extend `WebHeaderNav` `active` union and links; add `Stack.Screen` for `consume` with matching `headerRight` — same lockstep footgun as S-01 Explore→Household. Reuse an existing tab icon asset or a minimal additional asset — do not leave a broken trigger. Consume screen: `useFocusEffect` list refetch like Stock; barcode-prefix search optional but recommended for parity; **no Scan CTA required** on Consume (add stays on Stock).

#### 2. List row with optional −

**File**: `src/components/stock/stock-list-row.tsx` (extend) and/or a thin Consume wrapper

**Intent**: Invoke −1 only where Consume mounts the control.

**Contract**: Accessible `−` (min ~44px). Props for `onRemove`, `busy`, disabled. Stock home continues to render the row **without** `onRemove`. Do not reuse add-delta stepper.

#### 3. Consume screen orchestration

**File**: `src/app/(app)/(tabs)/consume.tsx`

**Intent**: Confirm, RPC, list update, Not in stock, and Retry.

**Contract**:
- On `−`: if `item.quantity === 1`, `Alert` / `window.confirm` (“Remove last — item leaves the list?” or consume-worded equivalent); Cancel → no-op.
- Call `removeStockByBarcode`; while in flight, busy that row’s `−`.
- Success with updated item → replace in local `items`; success deleted → remove from local `items`.
- **Not in stock** (missing row): show that copy; **no Retry-as-remove** that would invent stock; refetch list so a stale row disappears. Other failures (network): inline error + Retry; **quantity unchanged** until success.
- Stock `index.tsx` stays without remove handlers.
- Empty household on Consume: **“Nothing to consume”** (+ point to Stock for adds); do **not** render `StockEmptyState`’s Scan CTA on this tab.

#### 4. Manual verification script

**File**: `context/changes/remove-stock-item/manual-verification.md` (new)

**Intent**: Checklist for FR-004/009 + Consume UX without a test runner.

**Contract**: Steps covering Consume tab presence, Stock has no `−`, qty>1 decrement, last-unit confirm cancel/confirm, Not in stock (stale/concurrent), event persistence after delete, re-add via Stock/Scan, double-tap busy, error+Retry. Mirror tone of sibling change checklists if present.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `manual-verification.md` exists in this change folder
- Consume route and tab triggers exist on native and web entry points

#### Manual Verification:

- Tabs show Stock | Consume | Household; Stock rows have no `−`; Consume rows do
- Empty Consume shows “Nothing to consume” (no Scan CTA); Stock empty still offers Scan
- Qty 3 on Consume → tap − → qty 2; no confirm dialog
- Qty 1 → Cancel confirm → row remains; Confirm → row gone from Consume (and Stock on next focus)
- After another member/device deleted the row (or forced missing RPC): UI shows **Not in stock**; no new utilization event; list refetches
- After delete, event exists for that barcode; re-add via Stock Scan creates a new stock row
- Double-tap − does not double-apply while busy
- Forced network failure shows error + Retry; qty unchanged until success

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before treating the change as implementation-complete.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in repo (AGENTS.md / prior slices). Do not add one in this change.

### Integration Tests:

- None automated. Phase 1 SQL/RPC checks + Phase 3 manual script cover the acceptance path.

### Manual Testing Steps:

1. Sign in; confirm three tabs; open Consume with qty ≥ 2 and qty 1 rows.
2. Decrement on Consume; confirm Stock still has no `−` but shows updated qty after focus.
3. Exercise last-unit Cancel then Confirm; confirm event insert.
4. Simulate not-in-stock (second remove after delete / stale row); confirm message and no event.
5. Re-add via Stock Scan; confirm new row.
6. Simulate network failure and Retry; confirm no silent qty drift.

## Performance Considerations

Single-row RPC per tap; list is already household-scoped and refetch-on-focus. Event index on `(household_id, barcode, removed_at)` is for S-05 reads — no client fan-out in this slice. Two list screens (Stock + Consume) both refetch on focus — acceptable for MVP household sizes.

## Migration Notes

- Additive migration only; existing `stock_items` rows unchanged.
- Rollback = revert migration (drop RPC, revoke DELETE, drop events table) before relying on remove in production data.
- After apply, clients without the new UI simply leave DELETE unused; old clients cannot call the new RPC until shipped.

## References

- PRD: `context/foundation/prd.md` (FR-004, FR-009; resolved Q3)
- Roadmap: `context/foundation/roadmap.md` (S-03, S-05 dependency)
- Prior slice: `context/changes/stock-list-search-barcode-add/plan.md` (qty ≥ 1, no DELETE in S-01; tab lockstep)
- Add RPC pattern: `supabase/migrations/20260907000000_stock_items.sql`
- Confirm pattern: `src/components/household/join-household-form.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema, DELETE grants, remove RPC

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` with events table, DELETE grant/policy on `stock_items`, and `remove_stock_item_by_barcode` — 523da87
- [x] 1.2 `npm run typecheck` passes (no broken imports if types touched) — 523da87
- [x] 1.3 `npm run lint` passes — 523da87

#### Manual

- [x] 1.4 Migration applied to the project Supabase instance — 523da87
- [x] 1.5 Via SQL or RPC: qty 2 → remove → qty 1 + one event; qty 1 → remove → row gone + second event; remove on missing barcode fails with not-found style error and zero new events for that attempt — 523da87
- [x] 1.6 Second household cannot remove or read the first household’s events/rows — 523da87

### Phase 2: Client remove service

#### Automated

- [x] 2.1 `npm run typecheck` passes with the new export compiling
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 Throwaway call or temporary screen hook: remove on qty≥2 returns updated item; remove on qty 1 returns deleted; repeat remove on same barcode after delete surfaces not-in-stock / not-found with no new event

### Phase 3: Consume tab, list −, last-unit confirm, Not in stock

#### Automated

- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `manual-verification.md` exists in this change folder
- [ ] 3.4 Consume route and tab triggers exist on native and web entry points

#### Manual

- [ ] 3.5 Tabs show Stock | Consume | Household; Stock rows have no `−`; Consume rows do
- [ ] 3.6 Empty Consume shows “Nothing to consume” (or equivalent) with no Scan CTA; Stock empty still offers Scan
- [ ] 3.7 Qty 3 on Consume → tap − → qty 2; no confirm dialog
- [ ] 3.8 Qty 1 → Cancel confirm → row remains; Confirm → row gone from Consume (and Stock on next focus)
- [ ] 3.9 After another member/device deleted the row (or forced missing RPC): UI shows Not in stock; no new utilization event; list refetches
- [ ] 3.10 After delete, event exists for that barcode; re-add via Stock Scan creates a new stock row
- [ ] 3.11 Double-tap − does not double-apply while busy
- [ ] 3.12 Forced network failure shows error + Retry; qty unchanged until success
