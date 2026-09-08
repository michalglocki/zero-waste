<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Likely-Empty Recommendations

- **Plan**: `context/changes/likely-empty-recommendations/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-08
- **Verdict**: SOUND (after triage)
- **Findings**: 0 critical 2 warnings 2 observations (all FIXED)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
9/9 paths ✓, 4/4 RPCs + STOCK_SELECT ✓, brief↔plan ✓; Progress↔Phase consistent

## Findings

### F1 — No util backfill after migration

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots / End-State Alignment
- **Location**: Phase 1 — Migration; Desired End State
- **Detail**: util_* default to 0/null; recompute only on add/remove RPCs; existing events do not populate live rows until next activity — Recommendations can stay empty despite Consume history.
- **Fix A ⭐ Recommended**: One-shot backfill in the same migration after helper exists
  - Strength: Existing S-03 history lights up Recommendations immediately.
  - Tradeoff: Slightly heavier migration.
  - Confidence: HIGH — helper already defined; events index exists.
  - Blind spot: Very large households not load-tested.
- **Fix B**: Document cold-start until next add/remove (no backfill)
  - Strength: Smaller migration.
  - Tradeoff: Prior history invisible until activity resumes.
  - Confidence: HIGH if documented.
  - Blind spot: Users may think Recommendations is broken.
- **Decision**: FIXED via Fix A — backfill + Progress 1.7 + brief row

### F2 — “Filtered select using DB now()” is not a real alternative

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness / Plan Completeness
- **Location**: Phase 2 — List recommendations + ignore
- **Detail**: Overdue predicate is not expressible via PostgREST filters; “or filtered select” invites device-clock client filter. Mandate list RPC (or SQL view); pin ignore RPC to a migration phase.
- **Fix**: Mandate security-invoker list RPC (or SQL view); remove filtered-select peer option; pin ignoreRecommendation RPC to Phase 1 migration or explicit Phase 2 migration file.
  - Strength: Matches add/remove RPC style; eligibility uses DB now().
  - Tradeoff: One more RPC to grant/test.
  - Confidence: HIGH — verified against stock.ts.
  - Blind spot: None significant if view vs RPC chosen in plan edit.
- **Decision**: FIXED — mandate list + ignore RPCs (or SQL view for list); remove filtered-select peer option; Progress 2.3/2.6 + brief row

### F3 — Soft automated gate 2.3

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Automated Verification / Progress 2.4 (renumbered after F2)
- **Detail**: “if covered in Phase 1” made ignore+clear coverage optional.
- **Fix**: Require an integration assertion for ignore set + add clear — no “if covered”.
- **Decision**: FIXED — Progress 2.4 requires ignore hide + add clear vs list RPC

### F4 — Equality (≥) manual step underspecified

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 Manual 3.7
- **Detail**: Exact equality needs seeded util_* / removed_at; without a recipe manual verification skips the boundary.
- **Fix**: Add a 2–3 step seed recipe so equality holds at verification time.
- **Decision**: FIXED — seed recipe in Phase 3 Manual 3.7 + manual-verification contract + Progress 3.7 title

## Triage summary

- Fixed: F1 (Fix A), F2, F3, F4
- Skipped: —
- Accepted: —
- Dismissed: —
- **Verdict after fixes: SOUND**
