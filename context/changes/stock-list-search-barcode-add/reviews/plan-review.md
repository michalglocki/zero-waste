<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Stock List, Search & Barcode-Add Implementation Plan

- **Plan**: `context/changes/stock-list-search-barcode-add/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-04
- **Verdict**: SOUND
- **Findings**: 0 critical 5 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Requirement Definition | PASS (after F1/F5 fixes) |
| End-State Alignment | PASS (after F3 fix) |
| Lean Execution | PASS (after F7 fix) |
| Architectural Fitness | PASS (after F2 Fix B) |
| Blind Spots | PASS (after F6 fix) |
| Plan Completeness | PASS (after F4 fix) |

## Grounding

14/14 modify-targets ✓; helpers/symbols ✓; brief↔plan ✓; Progress↔Phase ✓; definitions 7/7 rows with user|product origin (refresh was plan-invented — addressed in F1); degenerate edges flagged in F5

## Findings

### F1 — “List refreshes on return” has no mechanism

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Requirement Definition
- **Location**: Definitions (Post-success UX); Phase 3; Testing Strategy step 2
- **Detail**: Definitions asserted list refresh without a user decision or implementation mechanism; pull-to-refresh cut; no useFocusEffect in codebase.
- **Fix A ⭐ Recommended**: Lock refetch-on-focus for the stock list; update Definitions
- **Fix B**: Mount-only reload; forbid modal overlay
- **Decision**: FIXED via Fix A

### F2 — Stock writes: RPC preference vs client INSERT/UPDATE

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 Migration Contract
- **Detail**: Plan preferred RPC but also allowed client INSERT/UPDATE; omitted F-01-style revoke/grant checklist.
- **Fix A ⭐ Recommended**: Lock SELECT-only + required add RPC
- **Fix B**: Allow client INSERT/UPDATE under RLS; document divergence; explicit GRANTs
- **Decision**: FIXED via Fix B

### F3 — Phase 2 Scan CTA before Phase 3 scan exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 stock empty state vs Phase 3 scan
- **Detail**: Phase 2 success requires Scan CTA before scan flow exists in Phase 3.
- **Fix**: Phase 2 empty state may show copy only / disabled Scan; wire working CTA in Phase 3
- **Decision**: FIXED

### F4 — Web Stack / NativeTabs rename under-specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 tabs; Phase 3 scan route
- **Detail**: Trigger name must match filename; web hrefs; orphan explore; scan Stack registration missing.
- **Fix A ⭐ Recommended**: Lockstep Trigger/href/Stack; delete explore; register scan on web
- **Fix B**: Rename explore→household only; document web updates
- **Decision**: FIXED via Fix A

### F5 — Typed barcode / delta input edges undefined

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: Definitions / Phase 3 Confirm sheet
- **Detail**: Whitespace, leading zeros, negative/non-numeric delta undecided.
- **Fix**: Trim barcode; preserve leading zeros as text; clamp delta to integers ≥ 0
- **Decision**: FIXED differently — barcode stored as string with leading zeros (trim ends; never coerce to number); delta clamp ≥ 0 as in recommended fix

### F6 — List sort order unspecified

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 list contract
- **Detail**: Default sort not specified after cutting multi-sort polish.
- **Fix**: Default sort `updated_at desc` in Phase 2 contract
- **Decision**: FIXED

### F7 — Web “Expo Starter” chrome left after product tabs

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: `app-tabs.web.tsx` brand text
- **Detail**: Starter branding clashes with stock-as-home.
- **Fix**: Optional Phase 2 rename/drop; skip if time-tight (16a)
- **Decision**: FIXED
