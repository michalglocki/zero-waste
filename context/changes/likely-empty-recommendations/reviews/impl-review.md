<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Likely-Empty Recommendations

- **Plan**: `context/changes/likely-empty-recommendations/plan.md`
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Recompute helper granted EXECUTE to authenticated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `supabase/migrations/20260908220000_stock_utilization_frequency_recommendations.sql:137-141`
- **Detail**: Plan preferred an internal invoker helper and said not to expose unpaired client-driven recompute. Implementation grants `EXECUTE` to `authenticated` so PostgREST can call `recompute_stock_item_utilization` outside add/remove. Comment acknowledges this; SECURITY INVOKER still needs the grant for the RPC call chain under current ownership. Effect is mostly idempotent recompute from events (RLS-scoped), but the surface is wider than the plan preferred.
- **Fix A ⭐ Recommended**: Leave as-is for MVP; document as known debt alongside trusted-member harden (follow-up). Recompute remains correct via add/remove.
  - Strength: No migration churn; call chain already works; risk is low under trusted-member model.
  - Tradeoff: Client can still trigger unpaired recompute until a later harden.
  - Confidence: HIGH — matches how other invoker helpers are granted in this repo.
  - Blind spot: Whether DEFINER + REVOKE from authenticated is practical without breaking invoker RPC call chain.
- **Fix B**: New migration: SECURITY DEFINER helper owned by privileged role, REVOKE from authenticated, call only from add/remove RPCs.
  - Strength: Matches plan’s “do not expose” intent.
  - Tradeoff: Extra migration + careful ownership/search_path review.
  - Confidence: MEDIUM — need to verify DEFINER pattern used elsewhere for stock helpers.
  - Blind spot: Haven’t verified Supabase role ownership constraints in this project.
- **Decision**: FIXED via Fix A — leave grant for MVP; documented in `follow-ups/review-fixes.md`

### F2 — Zero or negative avg always treats row as overdue

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260909090000_stock_recommendations_list_ignore.sql:28-32`
- **Detail**: List predicate requires `util_avg_interval_seconds IS NOT NULL` but not `> 0`. If avg is `0` (identical `removed_at` timestamps, e.g. unpaired duplicate inserts) or negative (direct column write), `(now() - last) >= (avg * interval '1 second')` is true for any elapsed time, so qty-1 rows can appear on Recommendations incorrectly.
- **Fix**: Add `AND s.util_avg_interval_seconds > 0` to the list RPC (and optionally coerce `<= 0` to null in recompute).
- **Decision**: FIXED — added `util_avg_interval_seconds > 0` via migration `20260909134000_list_recommendations_positive_avg.sql`

### F3 — Members can forge util/ignore via PostgREST UPDATE

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260908220000_stock_utilization_frequency_recommendations.sql:51-61` (columns inherit existing `stock_items` UPDATE policy)
- **Detail**: Denormalized `util_*` / `recommendation_ignored_at` are writable by household members via direct UPDATE, bypassing add/remove/ignore RPCs. Same trusted-member model as unpaired event INSERT; plan deferred RLS harden.
- **Fix**: Defer to a later harden change (column privileges, trigger, or RPC-only writes). No code change required in this slice.
- **Decision**: FIXED — deferred to later harden; recorded in `follow-ups/review-fixes.md`

### F4 — Integration tests use 1.1s wall sleeps for distinct removed_at

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `__tests__/integration/db-utilization-frequency.test.ts:143`, `:175`, `:246`
- **Detail**: Distinct event timestamps are forced with `setTimeout(1100)`, slowing the suite and coupling correctness to wall time. Overdue forcing elsewhere already seeds timestamps via service role.
- **Fix**: Prefer service-role seed of `removed_at` instead of sleeps (follow-up / nice-to-have).
- **Decision**: FIXED — replaced wall sleeps with service-role `removed_at` backdate helper in `db-utilization-frequency.test.ts`

### F5 — No-code rename can orphan name_key event history

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260908220000_stock_utilization_frequency_recommendations.sql:125-132`
- **Detail**: Recompute keys no-code rows by `lower(trim(name))`. App identity update is barcode-focused, but RLS still allows updating `name`. A rename leaves events under the old `name_key`; next recompute can zero util columns. Already noted in plan Open Risks.
- **Fix**: When harden/rename work lands: immutable no-code name, or migrate `name_key` events on rename. Out of scope for this change.
- **Decision**: FIXED — deferred to rename/harden follow-up; recorded in `follow-ups/review-fixes.md`

## Success criteria evidence

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:integration` | PASS (5 suites / 22 tests; `.env.test.local` present) |
| Migrations + Recommendations route + `manual-verification.md` | Present |
| Progress Manual 1.5–3.10 | All `[x]` (human-confirmed; checklist + UI evidence in diff) |
