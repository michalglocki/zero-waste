<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Manual Add Without Barcode

- **Plan**: `context/changes/manual-add-without-barcode/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-08
- **Verdict**: REVISE → SOUND (after F1–F3 fixes; F4 optional)
- **Findings**: 1 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Requirement Definition | WARNING |
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | FAIL |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

Grounding: 10/10 paths ✓, symbols ✓, brief↔plan ✓, Progress↔Phase ✓. Definitions 10/10 rows; handoff name under-specified (F2).

## Findings

### F1 — Partial unique breaks existing add `ON CONFLICT`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Migration contract
- **Detail**: Dropping full unique for partial unique invalidates bare `ON CONFLICT (household_id, barcode)` on `add_stock_item_by_barcode`; needs matching `WHERE barcode IS NOT NULL` or scan upsert fails (`42P10`).
- **Fix A ⭐ Recommended**: Same migration `CREATE OR REPLACE` add RPC with `ON CONFLICT (household_id, barcode) WHERE barcode IS NOT NULL`.
- **Fix B**: Sentinel barcodes (rejected — out of scope).
- **Decision**: FIXED via Fix A

### F2 — Name discarded when manual form also has a barcode

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: Definitions / Phase 3 handoff
- **Detail**: Form allows name + barcode; handoff opens confirm with barcode only — name fate undefined.
- **Fix A ⭐ Recommended**: Define handoff as barcode-only; discard form name; hide/disable name while barcode nonempty.
- **Fix B**: Soft-update name after confirm if still null.
- **Decision**: FIXED via Fix A

### F3 — Search/empty copy files under-specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Stock home search
- **Detail**: Name search can ship with barcode-only copy in `stock-search-field.tsx`, `stock-empty-state.tsx`, `consume-empty-state.tsx`.
- **Fix**: Explicitly list those three files in Phase 2.
- **Decision**: FIXED (applied with F1/F2 while editing Phase 2)

### F4 — Two list rows can share the same visible name

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: Definitions / search
- **Detail**: No-code and barcoded “Kale” can both match; order is `updated_at` desc (code).
- **Fix**: Optional Definitions one-liner for sort tiebreak.
- **Decision**: FIXED (Definitions row added)
