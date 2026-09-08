<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Add Without Barcode

- **Plan**: context/changes/manual-add-without-barcode/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-09-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No table CHECK that no-code rows require a name

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260908085225_stock_manual_add_no_barcode.sql (schema section; contrast RPC ~93–95)
- **Detail**: Plan invariant “name required when barcode absent” is enforced in the manual-add RPC and UI only. `authenticated` still has direct INSERT on `stock_items`, so a client can insert `barcode IS NULL` with null/blank `name`. Those rows render as `"Untitled"` and fall outside name-merge / search assumptions.
- **Fix A ⭐ Recommended**: Add table CHECK `(barcode IS NOT NULL) OR (name IS NOT NULL AND char_length(trim(name)) > 0)`.
  - Strength: Closes the gap at the database boundary; matches how barcode null-or-nonempty is already CHECK-enforced.
  - Tradeoff: Small follow-up migration; existing bad rows (if any) would need cleanup first.
  - Confidence: HIGH — same pattern as `stock_items_barcode_null_or_nonempty`.
  - Blind spot: Have not scanned production for null-barcode rows with empty names.
- **Fix B**: Leave as-is; treat trusted-member + app-only writes as sufficient (same caveat as S-03 DELETE).
  - Strength: No schema churn; matches current trusted-member model.
  - Tradeoff: Invariant remains bypassable via PostgREST insert.
  - Confidence: MEDIUM — depends on whether clients ever write stock outside RPCs.
  - Blind spot: Other app paths that INSERT stock_items directly.
- **Decision**: FIXED via Fix A — migration `20260908101000_stock_nocode_name_constraints.sql`

### F2 — No-code name-merge uniqueness not DB-enforced

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260908085225_stock_manual_add_no_barcode.sql:101–128
- **Detail**: Merge uses advisory xact lock + `FOR UPDATE` on the RPC path (good). A concurrent direct INSERT of another null-barcode same-name row can still create duplicates; non-`STRICT` `SELECT … INTO` then updates only one match. Plan deferred a functional unique index as optional performance/follow-up, but INSERT grant makes duplicates reachable without an RPC bug.
- **Fix A ⭐ Recommended**: Add unique expression index `(household_id, lower(trim(name))) WHERE barcode IS NULL`.
  - Strength: Makes merge key a real uniqueness constraint; closes race with direct INSERT.
  - Tradeoff: Follow-up migration; need a cleanup if duplicate no-code names already exist.
  - Confidence: HIGH — plan already foreshadowed this index.
  - Blind spot: Whether any duplicate no-code rows exist in the live project DB.
- **Fix B**: Document “RPC-only writes for no-code” and accept trusted-member risk for MVP.
  - Strength: Zero migration cost; RPC path already serializes correctly.
  - Tradeoff: Duplicate “Apples” rows remain possible via non-RPC inserts.
  - Confidence: MEDIUM — matches other trusted-member caveats in the plan.
  - Blind spot: Future features that INSERT stock_items without going through RPCs.
- **Decision**: FIXED via Fix A — same migration adds `stock_items_household_nocode_name_unique`

### F3 — Merge lookup has no supporting functional index

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260908085225_stock_manual_add_no_barcode.sql:107–113
- **Detail**: Merge filters `household_id` + `barcode IS NULL` + `lower(trim(name))` without an index. Plan explicitly deferred this for small household lists.
- **Fix**: Optional later: add functional index (superseded if F2 Fix A lands).
- **Decision**: FIXED — superseded by F2 Fix A (`stock_items_household_nocode_name_unique`)

### F4 — `parseAddDelta` imported from confirm sheet sibling

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/stock/stock-manual-add-sheet.tsx:11,47
- **Detail**: Manual sheet imports `parseAddDelta` from `stock-confirm-sheet.tsx`, coupling two UI modules. Behavior is correct; a shared util would be cleaner.
- **Fix**: Move `parseAddDelta` to a small shared module (e.g. `stock-quantity.ts`).
- **Decision**: FIXED — extracted to `src/components/stock/stock-quantity.ts`

### F5 — Empty-stock copy still barcode-only

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/stock/stock-empty-state.tsx:31–32
- **Detail**: Search-miss copy correctly mentions barcode or name; empty-stock CTA still says only “Scan a barcode…”, omitting Scan’s **No barcode?** path. Plan required search/miss copy updates, not empty-stock hero copy.
- **Fix**: Soften empty-stock copy to mention Scan / manual add without implying barcode-only.
- **Decision**: FIXED — empty-stock copy mentions barcode or No barcode?

### F6 — `RemoveStockResult` JSDoc still barcode-only

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types/stock.ts:14–15
- **Detail**: JSDoc refers only to `remove_stock_item_by_barcode`; the type is now also used by `remove_stock_item_by_id`.
- **Fix**: Update the comment to cover both RPCs.
- **Decision**: FIXED — JSDoc covers remove-by-barcode and remove-by-id

## Success criteria verification

### Automated (re-run 2026-09-08)

- `npm run lint` — PASS
- `npm run typecheck` — PASS

### Manual (Progress)

- All Phase 1–4 Manual Progress rows are `[x]` with commit SHAs.
- Phase 4 checklist sign-off recorded in-session (“testing done, no issues found”).
- No rubber-stamp flag: Phase 4 automated re-run green; earlier phases have SHA-backed commits and prior manual gates.
