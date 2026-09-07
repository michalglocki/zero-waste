<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Stock List, Search & Barcode-Add

- **Plan**: context/changes/stock-list-search-barcode-add/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Double-confirm can apply delta twice

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/stock/stock-confirm-sheet.tsx:88
- **Detail**: `handleConfirm` only relies on `disabled={busy}`; there is no early `if (busy) return`. Two rapid taps before re-render can both call `addStockByBarcode` and each apply `+= delta`.
- **Fix**: Guard at the top of `handleConfirm` with `if (busy) return` (optionally also a ref lock); keep `disabled={busy}`.
- **Decision**: FIXED

### F2 — Hardware back dismisses sheet while save in flight

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/stock/stock-confirm-sheet.tsx:108
- **Detail**: Cancel is `disabled={busy}`, but `Modal` `onRequestClose={onDismiss}` is not gated. Android back can dismiss the sheet while the RPC continues; the write still lands though the user believes they cancelled.
- **Fix**: Use `onRequestClose={() => { if (!busy) onDismiss(); }}` (ignore back while busy).
- **Decision**: FIXED

### F3 — Dead `app-tabs.web.tsx` after Stack-over-tabs adaptation

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/app-tabs.web.tsx
- **Detail**: Web chrome moved to `(tabs)/_layout.web.tsx`. `app-tabs.web.tsx` still exists (Zero waste branding) but is unused — leftover from the justified NativeTabs → Stack-over-tabs fix needed so Scan navigates on device.
- **Fix**: Delete `src/components/app-tabs.web.tsx` if nothing imports it, or document that native-only AppTabs has no web sibling in use.
- **Decision**: FIXED

### F4 — Unused `searchStockByBarcodePrefix` export

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/services/stock.ts:25
- **Detail**: Plan allowed list or prefix query; UI loads full list and filters client-side. The service helper is exported but never called. Its `ilike` path also does not escape `%`/`_` (latent if used later).
- **Fix**: Remove the unused export until a server-side search is needed, or wire the list to call it and escape LIKE metacharacters.
- **Decision**: FIXED

### F5 — Confirm enabled after qty load failure

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/stock/stock-confirm-sheet.tsx:64
- **Detail**: On `getStockItemByBarcode` failure, UI falls back to current qty 0 and still allows Confirm. The upsert remains correct (`+=`), but the sheet can show a misleading “Current quantity: 0”.
- **Fix**: Disable Confirm while `qtyError` is set, or offer Retry for the qty fetch before allowing save.
- **Decision**: FIXED

## Success criteria verification

### Automated (re-run 2026-09-07)

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `manual-verification.md` exists | PASS |
| `expo-camera` in package.json + app.json `barcodeScannerEnabled` | PASS |
| `(app)/explore.tsx` deleted | PASS |

### Manual (Progress)

All Manual Progress rows for phases 1–4 are `[x]` with commit SHAs. Phase 4 run log records 2026-09-07 pass (camera + typed + shared list). No rubber-stamp flags beyond normal trust of operator confirmation.

## Notes (non-findings)

- Add-delta via RPC `add_stock_item_by_barcode` instead of client PostgREST upsert is within plan (“RPC optional”) and preserves atomic `quantity += delta`.
- Route move to `(app)/(tabs)/` + parent Stack is a justified adaptation so Scan is reachable under NativeTabs; intent of Stock home + Household tab + Scan CTA holds.
- NOT-DOING boundaries respected (no OFF, remove, Worker stock API, test runner, name/category edit).
