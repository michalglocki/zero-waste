<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Barcode Open Food Facts Identify

- **Plan**: `context/changes/barcode-open-food-facts-identify/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-07
- **Verdict**: SOUND
- **Findings**: 1 critical, 3 warnings, 1 observation (all triaged)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Requirement Definition | PASS (after triage) |
| End-State Alignment | PASS (after F1/F2 fix) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (after F4) |
| Plan Completeness | PASS (after F5) |

## Grounding

8/8 paths ✓, symbols ✓, brief↔plan ✓; definitions complete after triage.

## Findings

### F1 — Confirm unmount vs “enrich during lookup” contradiction

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Detail**: Successful Confirm unmounts the sheet immediately; plan both required list enrichment when Confirm happens during in-flight OFF and forbade post-dismiss persist.
- **Decision**: FIXED — DB-first + background identity after delta≥1 Confirm (incl. after unmount); Cancel does not persist; 30m cache (2026-09-07)

### F2 — Delta-0 Confirm + existing-row persist gate undefined

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Detail**: Unclear whether delta-0 flushes identity and whether existing rows may UPDATE before Confirm.
- **Decision**: FIXED — delta 0 / Cancel = no identity DB write; diff-only updates; display DB-first (2026-09-07)

### F3 — “Clear audience signal” left to implementer comments

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Detail**: Audience allowlist deferred to code comments.
- **Decision**: FIXED via Fix A — `auxiliary_category` always null in S-02 (2026-09-07)

### F4 — In-flight OFF abort / mount gate not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Detail**: OFF path needed Cancel/generation gating so late results do not write incorrectly.
- **Decision**: FIXED — Critical Implementation Details require generation/Abort token; only delta≥1 Confirm enables post-unmount one-shot apply (2026-09-07)

### F5 — Locale source for product_name preference unspecified

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Detail**: “lc preference” unspecified.
- **Decision**: FIXED — device locale language subtag via `Intl` (or equivalent), fallback `en`; do not add `expo-localization` unless Phase 2 shows a gap (2026-09-07)

## Triage summary

```
Fixed:     F1, F2, F3 (a), F4, F5   (5)
Skipped:   —                        (0)
Accepted:  —                        (0)
Dismissed: —                        (0)

► Verdict after fixes: SOUND
```
