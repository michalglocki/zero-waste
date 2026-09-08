# Manual Add Without Barcode Implementation Plan

## Overview

Ship FR-005 so a household member can add stock without a scanned code: from Scan, **No barcode?** opens a form (optional barcode, name required when barcode absent, quantity as add-delta). No-code rows use `stock_items.id` as identity, merge by normalized name among other no-code rows, and remain consumable via remove-by-id. Barcoded add/confirm/OFF paths stay the aisle default.

## Current State Analysis

- S-01: `stock_items` requires nonempty `barcode`, `UNIQUE (household_id, barcode)`, and `add_stock_item_by_barcode` rejects blank (`supabase/migrations/20260907000000_stock_items.sql`). Scan typed entry is **scan fallback**, not manual-add (`src/app/(app)/scan.tsx`).
- S-02: OFF enrich runs after confirm for nonempty codes; identity columns nullable.
- S-03: Consume uses `removeStockByBarcode` → `remove_stock_item_by_barcode`; utilization events require nonempty barcode; busy/retry/patch keyed by barcode even though list keys by `id` (`src/app/(app)/(tabs)/consume.tsx`).
- List primary = `name ?? barcode`; search is barcode-prefix only on Stock and Consume (`index.tsx`, `consume.tsx`).
- Origin note: “barcode may be empty + quantity, no unit” is **product** (PRD OQ2 / roadmap S-04). “Many no-code rows”, “name required when no code”, “merge by trim+casefold name”, “Scan + No barcode?”, “confirm handoff for typed code”, “Consume by id”, “name+barcode search”, “inline errors” are **user** decisions from this planning session. Partial unique foreshadowed in S-01 plan (**code**/prior plan).

## Definitions

| Term | Decided meaning | Origin | On degenerate data (tie, duplicate, empty, boundary, legacy) | Verified by |
| ---- | --------------- | ------ | ------------------------------------------------------------ | ----------- |
| Manual add | Dedicated form from Scan **No barcode?** (not typed-fallback Continue) | user | Continue still requires nonempty barcode; empty Continue does nothing | Phase 3/4 |
| No-code row | Stock row with **no barcode** stored as `NULL` (UI “empty”) | user + plan | Never store `''`; trim-to-empty → treat as no barcode | Phase 1/4 |
| Name (manual) | Required when barcode absent; **not used** when barcode is nonempty (handoff discards it) | user | Whitespace-only name rejected on no-code path; stored trimmed on insert/merge | Phase 3/4 |
| Name merge key | Among no-code rows only: `lower(trim(name))` | user | `" Apples "` merges with `"apples"`; different names → separate rows; barcoded rows never merge by name | Phase 1/4 |
| Quantity (manual) | Add-delta ≥ 1 (same mental model as confirm sheet) | user | Delta &lt; 1 → no write + inline error; existing match → qty += delta | Phase 1/4 |
| Typed code on form | Nonempty barcode → dismiss manual form, open existing `StockConfirmSheet`; **discard any form name** (confirm/OFF owns identity) | user | Leading zeros preserved as text; hide or disable name field while barcode nonempty so discard is obvious; OFF/enrich unchanged | Phase 3/4 |
| Duplicate list labels | No-code and barcoded rows may share the same display name; search can return both | user | Sort remains `updated_at` desc (**code** tiebreak, not a product ranking rule) | Phase 2/4 |
| Consume identity | Remove by `stock_items.id` for all rows | user | Busy/retry/patch by `id`; barcode RPC may remain unused by UI | Phase 2/4 |
| Utilization on no-code remove | **No** event when barcode is null; barcoded removes still insert `(household_id, barcode)` events | user | Preserves S-05 for codes; no shared `''` history bucket | Phase 1/4 |
| Search | Case-insensitive **prefix** on barcode **or** name | user | No-code rows match name prefix; empty query shows all | Phase 2/4 |
| Duplicate names | Allowed only as separate rows when merge key differs; same key merges | user | Two “Apples” no-code → one row after second add | Phase 4 |

## Desired End State

From Scan, the user can add produce/bulk without a code: enter a name and quantity (and optionally a barcode). If they supply a barcode, they land on the familiar confirm sheet. If not, a no-code row is created or merged by normalized name, shows that name on Stock/Consume, is findable by name search, and can be decremented on Consume by id. Barcoded scan/typed Continue behavior is unchanged. No-code removes do not invent utilization history.

### Key Discoveries:

- S-01 already called for a **partial unique index** when empty barcodes arrive (`context/changes/stock-list-search-barcode-add/plan.md`).
- Do **not** reuse `StockConfirmSheet` / `openConfirm('')` for no-code — sheet assumes nonempty barcode + OFF (`stock-confirm-sheet.tsx` props).
- Consume already `keyExtractor`s by `id` but locks on barcode — multi no-code rows collide until Phase 2.
- Skip utilization insert for null barcode (C1) — no events schema change required for MVP S-05.
- No unit/e2e runner — `npm run lint`, `npm run typecheck`, manual script (same as prior slices).

## What We're NOT Doing

- Units of measure
- Client edit of name/category after save (beyond what this form sets on insert/merge)
- Forcing OFF lookup on no-code rows
- Synthetic/sentinel barcodes for uniqueness
- Writing utilization events with empty barcode
- Changing barcode-add **quantity** semantics for nonempty codes (delta upsert stays); only the `ON CONFLICT` arbiter is rewritten for the partial unique index (see Phase 1)
- Recommendations / FR-010 (S-05)
- New test runner
- Soft-delete; undo; bulk add
- Locale-aware case folding beyond JS/SQL `lower` on trimmed text
- Migrating historical rows (none can be no-code today)

## Implementation Approach

1. Migration: allow null barcodes; partial unique on nonempty barcodes; RPC to add/merge no-code by normalized name; RPC `remove_stock_item_by_id` (event only if barcode present).
2. Client services + Consume/Stock search + Consume remove-by-id.
3. Scan UI: **No barcode?** → manual form; validation; handoff to confirm when barcode filled.
4. Manual verification checklist.

## Critical Implementation Details

### State sequencing

No-code add must be **atomic** in one RPC: lock/find merge candidate by `(household_id, barcode IS NULL, lower(trim(name)))`, then UPDATE quantity += delta or INSERT. Do not do find-then-insert from the client (race → duplicate “Apples”).

### User experience spec

Manual form stays mounted with inline errors on validation/network failure (Retry). After successful no-code add, dismiss form and stay on Scan (mirror confirm success). When handing off to confirm, clear/close the manual form so only one modal is active.

---

## Phase 1: Schema + add/merge + remove-by-id RPCs

### Overview

Make no-code rows legal in Postgres and provide atomic write paths for add/merge and Consume-by-id.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_stock_manual_add_no_barcode.sql` (new)

**Intent**: Support FR-005 empty barcode and id-based consume without breaking one-row-per-nonempty-barcode or S-05 barcoded history.

**Contract**:
- Drop `stock_items_barcode_nonempty` and `stock_items_household_barcode_unique`.
- Alter `barcode` to **nullable**; treat absent barcode as `NULL` only (reject/normalize `''` in RPCs).
- Add partial unique index: `UNIQUE (household_id, barcode) WHERE barcode IS NOT NULL` (equivalent expression OK).
- `CREATE OR REPLACE` `add_stock_item_by_barcode`: keep blank rejection and delta ≥ 1 checks; rewrite conflict target to match the partial unique index — `ON CONFLICT (household_id, barcode) WHERE barcode IS NOT NULL DO UPDATE …` (quantity += excluded). Bare `ON CONFLICT (household_id, barcode)` will fail with `42P10` after the full unique is dropped.
- New RPC e.g. `add_stock_item_manual_no_barcode(p_name text, p_delta integer)` → `security invoker`: resolve household; trim name; reject blank name; reject delta &lt; 1; find existing row where `barcode IS NULL` and `lower(trim(name)) = lower(trim(p_name))` (`FOR UPDATE` if practical); if found, `quantity = quantity + p_delta` and return row; else INSERT `(household_id, barcode NULL, quantity, name trimmed)` with other identity null; return row. Grant `EXECUTE` to `authenticated` only.
- New RPC `remove_stock_item_by_id(p_id uuid)` mirroring remove-by-barcode: household check; `SELECT … FOR UPDATE` by id + household; missing → same `stock item not found` style error **before** any event; if `barcode IS NOT NULL` and nonempty after trim, insert utilization event with that barcode; then delete or decrement as today; return same `{ deleted, item? }` shape. Grant to `authenticated`. Leave `remove_stock_item_by_barcode` in place (unused by UI after Phase 2 is fine).
- Do not weaken F-01 helpers. Do not change events table constraints.

#### 2. Types

**File**: `src/types/stock.ts`

**Intent**: Reflect nullable barcode on `StockItem`.

**Contract**: `barcode: string | null` (call sites null-safe).

### Success Criteria:

#### Automated Verification:

- Migration file exists with nullable barcode, partial unique, manual no-barcode add RPC, and `remove_stock_item_by_id`
- `npm run typecheck` passes after type tweak (or phase notes deferred to Phase 2 if types land with services)
- `npm run lint` passes

#### Manual Verification:

- Migration applied on project Supabase
- SQL/RPC: two adds same name `"Apples"` / `" apples "` → one null-barcode row with summed qty; different name → second row
- `add_stock_item_by_barcode` still rejects blank; nonempty upsert still works under partial unique (`ON CONFLICT … WHERE barcode IS NOT NULL`)
- `remove_stock_item_by_id` on barcoded row writes event; on no-code row decrements/deletes with **zero** new events; missing id → not-found, no event

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Client services, Consume-by-id, shared search

### Overview

Wire app services and lists so no-code rows are searchable and consumable without barcode collisions.

### Changes Required:

#### 1. Stock service

**File**: `src/services/stock.ts`

**Intent**: Expose manual no-code add and remove-by-id; keep barcode add for confirm sheet.

**Contract**:
- `addStockManualNoBarcode(name, delta)` → RPC; throw on error; return `StockItem`.
- `removeStockById(id)` → RPC; map not-found to `STOCK_NOT_IN_STOCK_MESSAGE` like barcode remove.
- Null-safe any helpers that assumed `barcode: string` (get/add/identity remain barcode-nonempty).

#### 2. Consume tab

**File**: `src/app/(app)/(tabs)/consume.tsx`

**Intent**: Remove concurrency and writes key off `id` so multiple no-code rows work.

**Contract**: `busyId` / retry payload / list patch use `item.id`; call `removeStockById`; last-unit confirm label uses `name ?? barcode ??` fallback only if needed (name required for no-code, so name should exist). Filter: prefix match on `barcode` **or** `name` (null-safe, case-insensitive startsWith).

#### 3. Stock home search + copy

**Files**:
- `src/app/(app)/(tabs)/index.tsx`
- `src/components/stock/stock-search-field.tsx`
- `src/components/stock/stock-empty-state.tsx`
- `src/components/stock/consume-empty-state.tsx`

**Intent**: Same prefix semantics as Consume so produce is findable; copy must not claim barcode-only search.

**Contract**: Filter `barcode` or `name` prefix (null-safe). Update search a11y/placeholder and both empty-miss strings from “barcode” wording to barcode **or** name (Consume miss copy has no Scan CTA — keep that).

#### 4. List row safety

**File**: `src/components/stock/stock-list-row.tsx` (if needed)

**Intent**: Never render a blank primary for valid no-code rows.

**Contract**: Primary = `name ?? barcode ?? 'Untitled'` (Untitled is defensive only; no-code inserts always set name).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Consume − on a barcoded row still decrements/deletes and records an event (spot-check)
- Two no-code rows with different names: − on one does not busy-lock the other
- Stock and Consume search `"app"` finds name `Apples` with null barcode

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Scan “No barcode?” UI

### Overview

Add the manual entry surface and wire it to confirm handoff or the no-code RPC.

### Changes Required:

#### 1. Manual add sheet/form

**File**: new under `src/components/stock/` (e.g. `stock-manual-add-sheet.tsx`) + `src/app/(app)/scan.tsx`

**Intent**: Let the user add without a code without overloading `StockConfirmSheet`.

**Contract**:
- Scan: CTA **No barcode?** after Continue (disabled while any sheet open).
- Form fields: optional barcode, name, quantity (delta default 1, ±/− or input consistent with confirm patterns).
- Validation: if barcode trim empty → name required (trim nonempty); delta ≥ 1; inline errors; Retry on save failure; stay on form.
- If barcode trim nonempty → **discard form name** (do not pass it to confirm or write it); hide or disable the name field while barcode is nonempty; close manual sheet and open `StockConfirmSheet` with that barcode only (existing OFF/confirm path); do not call no-code RPC.
- If barcode empty → `addStockManualNoBarcode`; on success dismiss and stay on Scan (clear fields).
- Pause camera while manual or confirm sheet open (extend existing `confirmOpen` pause).

#### 2. Copy / a11y

**Intent**: Distinguish scan fallback from manual no-code.

**Contract**: Labels make clear name is required without a barcode; Continue remains “use typed barcode.”

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- No barcode? → name `Bananas`, delta 2 → list shows Bananas qty 2; second add `bananas` delta 1 → qty 3 single row
- Form with barcode filled → confirm sheet opens; confirm increases barcoded row; OFF preview still soft
- Missing name / delta 0 → inline error, no write
- Save failure (e.g. offline) → message + Retry, fields retained
- Web: path works without camera

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Manual verification script

### Overview

End-to-end checklist across add, search, consume, and regression of scan.

### Changes Required:

#### 1. Checklist only (no code unless fixes)

**Intent**: Prove FR-005 without a test runner.

**Contract**: Run the Manual Testing Steps below on a shared household (two members if practical).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run typecheck` passes

#### Manual Verification:

- Full checklist in Testing Strategy completed
- Scan camera/typed Continue regression: nonempty add still works
- No-code Consume last-unit confirm deletes row with no utilization event
- Second household member sees merged no-code row

**Implementation Note**: Pause for human sign-off that the checklist passed; then mark Progress items done.

---

## Testing Strategy

### Unit Tests:

- None — no runner configured (`AGENTS.md`).

### Integration Tests:

- None automated; use SQL/RPC spot-checks in Phase 1 and UI checklist below.

### Manual Testing Steps:

1. Scan → No barcode? → add `Apples` qty 2 → appears on Stock with name primary.
2. Add again ` apples ` qty 1 → same row qty 3 (merge).
3. Add `Bananas` qty 1 → second no-code row.
4. Search `ban` on Stock and Consume → only Bananas.
5. Consume − on Bananas (qty 1) → confirm → row gone; no new utilization event for that remove.
6. Consume − on a barcoded item → event still written.
7. Manual form with a real barcode → confirm sheet → delta add + optional OFF; stay on Scan after success.
8. Typed Continue on Scan (nonempty) unchanged; empty Continue still no-ops.
9. Second member same household sees Apples qty 3.

## Performance Considerations

Household lists stay small; client-side prefix filter on name|barcode is enough. Merge lookup is indexed by household + partial barcode uniqueness; if name merge scans become hot later, add a functional index on `(household_id, lower(trim(name))) WHERE barcode IS NULL` — optional in this slice if Phase 1 RPC is clear.

## Migration Notes

- Additive/dev-safe: nullable barcode + new RPCs; existing rows all have nonempty barcodes.
- Rollback: drop new RPCs/index; restore NOT NULL + full unique only if no null barcodes exist.
- App clients must use remove-by-id after Phase 2 (avoid direct DELETE skipping events on barcoded rows — same trusted-member caveat as S-03).

## References

- Roadmap S-04: `context/foundation/roadmap.md`
- PRD: `context/foundation/prd.md` (FR-005, FR-007, FR-008, OQ2)
- S-01 plan (partial unique foreshadow): `context/changes/stock-list-search-barcode-add/plan.md`
- S-03 remove/events: `context/changes/remove-stock-item/plan.md`
- Schema: `supabase/migrations/20260907000000_stock_items.sql`, `…/20260907210000_stock_remove_utilization.sql`
- Scan / confirm: `src/app/(app)/scan.tsx`, `src/components/stock/stock-confirm-sheet.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema + add/merge + remove-by-id RPCs

#### Automated

- [x] 1.1 Migration file exists with nullable barcode, partial unique, manual no-barcode add RPC, and `remove_stock_item_by_id` — 9c366da
- [x] 1.2 `npm run typecheck` passes after type tweak (or phase notes deferred to Phase 2 if types land with services) — 9c366da
- [x] 1.3 `npm run lint` passes — 9c366da

#### Manual

- [x] 1.4 Migration applied on project Supabase — 9c366da
- [x] 1.5 SQL/RPC: two adds same name `"Apples"` / `" apples "` → one null-barcode row with summed qty; different name → second row — 9c366da
- [x] 1.6 `add_stock_item_by_barcode` still rejects blank; nonempty upsert still works under partial unique (`ON CONFLICT … WHERE barcode IS NOT NULL`) — 9c366da
- [x] 1.7 `remove_stock_item_by_id` on barcoded row writes event; on no-code row decrements/deletes with **zero** new events; missing id → not-found, no event — 9c366da

### Phase 2: Client services, Consume-by-id, shared search

#### Automated

- [x] 2.1 `npm run typecheck` passes
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 Consume − on a barcoded row still decrements/deletes and records an event (spot-check)
- [x] 2.4 Two no-code rows with different names: − on one does not busy-lock the other
- [x] 2.5 Stock and Consume search `"app"` finds name `Apples` with null barcode

### Phase 3: Scan “No barcode?” UI

#### Automated

- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run lint` passes

#### Manual

- [ ] 3.3 No barcode? → name `Bananas`, delta 2 → list shows Bananas qty 2; second add `bananas` delta 1 → qty 3 single row
- [ ] 3.4 Form with barcode filled → confirm sheet opens; confirm increases barcoded row; OFF preview still soft
- [ ] 3.5 Missing name / delta 0 → inline error, no write
- [ ] 3.6 Save failure (e.g. offline) → message + Retry, fields retained
- [ ] 3.7 Web: path works without camera

### Phase 4: Manual verification script

#### Automated

- [ ] 4.1 `npm run lint` passes
- [ ] 4.2 `npm run typecheck` passes

#### Manual

- [ ] 4.3 Full checklist in Testing Strategy completed
- [ ] 4.4 Scan camera/typed Continue regression: nonempty add still works
- [ ] 4.5 No-code Consume last-unit confirm deletes row with no utilization event
- [ ] 4.6 Second household member sees merged no-code row
