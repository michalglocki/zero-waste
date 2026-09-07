<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Barcode Open Food Facts Identify

- **Plan**: context/changes/barcode-open-food-facts-identify/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION → triage complete (all findings FIXED)
- **Findings**: 0 critical / 4 warnings / 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Confirm awaits identity flush before dismiss

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/stock/stock-confirm-sheet.tsx:225-230
- **Detail**: After `addStockByBarcode`, Confirm `await`s `flushEnrichIfReady` before `onSuccess`. When OFF identity is already ready, a slow/hung identity UPDATE keeps `busy=true` and blocks Cancel/`onRequestClose`. Plan allows apply “before or immediately after” qty write and fully async only when OFF is still in flight — so this is not hard plan drift, but qty-primary UX is weaker when flush is awaited.
- **Fix A ⭐ Recommended**: Fire-and-forget after mark confirmed (`void flushEnrichIfReady(...)` then `onSuccess()`); rely on module session for completion.
  - Strength: Matches “qty primary / identity background” when map is ready; sheet dismisses immediately after qty RPC.
  - Tradeoff: List may briefly show barcode-only until focus refetch after late flush.
  - Confidence: HIGH — late-OFF path already works this way.
  - Blind spot: Haven’t measured typical identity UPDATE latency on the project’s Supabase.
- **Fix B**: Keep await but add a short timeout / race so busy cannot strand indefinitely.
  - Strength: Still tries to flush before unmount when fast.
  - Tradeoff: More complexity; timeout still leaves soft-fail case (see F2).
  - Confidence: MEDIUM — timeout value is arbitrary.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F2 — Soft-failed identity flush has no post-dismiss retry

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/services/stock-identity-enrich.ts:81-92
- **Detail**: On UPDATE failure, `flushing` resets and `console.warn`s, but Confirm still dismisses. Session can remain `confirmed` with no mounted consumer and no automatic retry. Qty is saved; identity may stay null until a later scan+confirm.
- **Fix A ⭐ Recommended**: After failed flush, clear or reschedule one background retry; on success `sessions.delete(trimmed)`.
  - Strength: Preserves FR-008 soft-fail without stranding identity forever.
  - Tradeoff: Small retry policy to design (count/backoff).
  - Confidence: HIGH — soft-fail already intentional.
  - Blind spot: Multi-device concurrent enrich not covered.
- **Fix B**: Surface a non-blocking toast/banner on flush failure while sheet still open (and if already dismissed, skip).
  - Strength: User can Retry lookup while open.
  - Tradeoff: Does not help the post-unmount failure case.
  - Confidence: MEDIUM — toast pattern may not exist yet in app.
  - Blind spot: Whether a toast component exists.
- **Decision**: FIXED via Fix A

### F3 — OFF fetch has no AbortSignal / timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/services/open-food-facts.ts:282-285
- **Detail**: Plan Critical Details mention generation/Abort token; implementation uses generation only. Hung OFF leaves “Looking up…” until the platform gives up; Cancel does not abort the in-flight request (cache warm is allowed, unbounded wait is not).
- **Fix**: Add `AbortController` + ~10–15s timeout; abort on effect cleanup / generation bump; map abort → soft `error` outcome.
- **Decision**: FIXED

### F4 — Enrich sessions Map never pruned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/services/stock-identity-enrich.ts:18-30,78-84
- **Detail**: One session entry per unique barcode for the JS runtime. Successful flush clears `confirmed` but leaves the entry (`flushing: true`); Cancel leaves orphans. Long aisle sessions scanning many codes grow without bound (same pattern as OFF cache lazy TTL eviction — related but separate).
- **Fix**: `sessions.delete(trimmed)` after successful flush and on Cancel/delta-0 dismiss (or when beginning a new session for the same barcode after terminal complete).
- **Decision**: FIXED

### F5 — Manual verification run log empty while Progress 4.7 is checked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/barcode-open-food-facts-identify/manual-verification.md:116-122
- **Detail**: Progress marks 4.7 (full checklist completed) and user confirmed manual testing in-session, but the checklist run log table is still blank (no date/environment/overall). Weak durable evidence for archive/audit.
- **Fix**: Fill the run log row (and any Result lines desired) to match the completed manual gate.
- **Decision**: FIXED

### F6 — Unplanned web typed-route href fix

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/(app)/(tabs)/_layout.web.tsx:13
- **Detail**: Phase 4 commit includes `/(app)/(tabs)/index` → `/(app)/(tabs)` to satisfy regenerated typed routes. Not in plan Changes Required; benign unblocker for `npm run typecheck`.
- **Fix**: No code change required; optionally note in plan Migration Notes / Progress as a typecheck adaptation.
- **Decision**: FIXED (plan Migration Notes addendum)
