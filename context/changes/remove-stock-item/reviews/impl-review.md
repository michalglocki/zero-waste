<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Remove Stock Item

- **Plan**: context/changes/remove-stock-item/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

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

### F1 — Client can bypass atomic remove pairing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260907210000_stock_remove_utilization.sql:23-48
- **Detail**: RLS grants let a household member DELETE `stock_items` without a utilization event, and INSERT `stock_utilization_events` without changing stock. The RPC is the only path that pairs them. Matches the S-01 invoker+RLS style and the plan’s required DELETE grant; event INSERT is the same class of hole and can poison S-05 frequency if abused. UI-only discipline is not enforcement.
- **Fix A ⭐ Recommended**: Accept as trusted-member MVP tradeoff; document in plan Notes / lessons that remove must go through the RPC until S-05 hardening
  - Strength: Matches add-path architecture; no schema churn; plan already required DELETE for invoker RPC.
  - Tradeoff: Malicious or buggy clients can still skew history until tightened.
  - Confidence: HIGH — same pattern as S-01 add; household is trusted MVP surface.
  - Blind spot: No audit of whether any other client path already deletes stock.
- **Fix B**: Revoke client DELETE on `stock_items` and INSERT on events; route only through a narrower RPC (definer or trigger-gated)
  - Strength: Enforces pairing at the database.
  - Tradeoff: Breaks invoker+RLS symmetry with add; more migration/work; may need security definer.
  - Confidence: MEDIUM — needs careful RLS redesign.
  - Blind spot: Impact on future admin/tools that might need direct writes.
- **Decision**: FIXED via Fix A — documented trusted-member MVP tradeoff in change.md Notes; remove via RPC only until S-05 hardening

### F2 — Busy guard misses confirm window and double-tap race

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/(tabs)/consume.tsx:106-154
- **Detail**: `busyBarcode` is set only inside `applyRemove`. For qty===1, native Alert is async and other rows stay tappable; after Confirm there is no re-check of busy. For qty>1, two rapid taps can both pass `busyBarcode == null` before either setState lands, issuing two RPCs (two events / double decrement). Server `FOR UPDATE` keeps DB consistent; client intent and plan “disable − while in flight” / 3.11 double-tap criterion are weaker than claimed.
- **Fix**: Set a screen-level lock before confirm (and keep it through the RPC); re-check after confirm resolves; ignore presses while any remove is in flight
  - Blind spot: Haven't checked for callers.
- **Decision**: FIXED — sync lock via busyBarcodeRef before confirm through RPC; all − disabled while any remove in flight; re-check after confirm; Retry uses same lock

### F3 — Last-unit confirm uses stale list quantity

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/(tabs)/consume.tsx:146
- **Detail**: Confirm runs on local `item.quantity === 1`. Concurrent updates can show qty 2 while DB is 1 (delete without confirm) or show 1 while DB is 2 (confirm then only decrement).
- **Fix**: Accept for MVP (list + atomic RPC), or re-fetch qty before confirm if product wants stricter last-unit UX
- **Decision**: FIXED — accepted for MVP; documented in change.md Notes (list + atomic RPC as source of truth)

### F4 — Not-in-stock refetch uses full-list loading

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/(app)/(tabs)/consume.tsx:58-69,121-128
- **Detail**: On not-in-stock, `refetchList()` sets `loading=true`, replacing the list with a full ActivityIndicator so the “Not in stock” banner can flash away under a spinner.
- **Fix**: Refetch with a lighter refreshing flag so the error message stays visible
- **Decision**: FIXED — `refetchList({ quiet: true })` on not-in-stock; keeps action error visible without full-page loader

## Success criteria evidence

### Automated (re-run 2026-09-07)

- `npm run typecheck` — PASS
- `npm run lint` — PASS

### Manual (Progress)

- Phase 1.4–1.6 — `[x]` (committed with p1)
- Phase 2.3 — `[x]` (user waived throwaway; deferred to Phase 3 Consume path)
- Phase 3.5–3.12 — `[x]` (user confirmed “test completed”)

### Plan drift summary

- All Phase 1–3 Changes Required: MATCH
- Stock `index.tsx` has no `onRemove`: MATCH
- NOT Doing boundaries: respected
- Benign EXTRA: `context/foundation/roadmap.md` in-progress stamp (process, not feature scope)
