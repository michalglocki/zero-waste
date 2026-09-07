<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Remove Stock Item Implementation Plan

- **Plan**: `context/changes/remove-stock-item/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-07
- **Verdict**: SOUND (after triage fixes; was REVISE)
- **Findings**: 1 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Requirement Definition | PASS |
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS (F4 fixed) |
| Blind Spots | PASS (F2/F3 fixed) |
| Plan Completeness | PASS (F1 fixed) |

## Grounding

Grounding: 4/5 paths at review time (`app-tabs.web.tsx` missing — F1); 3/3 symbols ✓; brief↔plan ✓; definitions 10/10 user|product. Path list corrected in plan during triage.

## Findings

### F1 — Plan edits non-existent `app-tabs.web.tsx`

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Consume route + tabs
- **Detail**: Phase 3 listed `src/components/app-tabs.web.tsx`, which is not on disk. Web chrome is `_layout.web.tsx`.
- **Fix**: Drop `app-tabs.web.tsx`; require Consume in `app-tabs.tsx` + `_layout.web.tsx`.
- **Decision**: FIXED

### F2 — Deleted-row RPC null return underspecified for supabase-js

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 Contract + Phase 2
- **Detail**: Returning NULL `stock_items` collides with supabase-js null data and add-path cast pattern.
- **Fix A ⭐ Recommended**: Composite/json return `{ deleted, item? }` mapped in the client.
- **Fix B**: Keep RETURNS stock_items; treat `data === null` && !error as deleted.
- **Decision**: FIXED (Fix A)

### F3 — Consume empty state still vague enough to ship Scan CTA

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details + Phase 3
- **Detail**: Plan warned against Stock empty reuse but did not name Consume copy; `StockEmptyState` hard-codes Scan.
- **Fix**: Specify “Nothing to consume” + no Scan CTA; forbid raw `StockEmptyState` on Consume.
- **Decision**: FIXED

### F4 — `removed_by → auth.users` omits ON DELETE vs memberships

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — events table
- **Detail**: Default RESTRICT can block auth user deletion when events exist.
- **Fix**: `removed_by` nullable + `references auth.users (id) on delete set null`.
- **Decision**: FIXED (set null)
