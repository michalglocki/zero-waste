# Barcode Open Food Facts Identify Implementation Plan

## Overview

After a household member scans (or types) a barcode, the app looks up that code in Open Food Facts, previews available identity on the confirm sheet, and persists optional name, main category, and pack-size text when present (`auxiliary_category` stays null in S-02) — without ever blocking quantity add when OFF is slow, missing, or offline (US-02 / FR-006–008).

## Current State Analysis

- S-01 landed `stock_items` with nullable `name` / `main_category` / `auxiliary_category`, unique `(household_id, barcode)`, RLS SELECT/INSERT/UPDATE, and `add_stock_item_by_barcode` that writes **quantity only** (`supabase/migrations/20260907000000_stock_items.sql`).
- Client path: scan/typed → `StockConfirmSheet` → `addStockByBarcode` RPC; list shows barcode as primary label; search is client-side barcode **prefix** only (`src/services/stock.ts`, `stock-confirm-sheet.tsx`, `stock-list-row.tsx`, stock home).
- No OFF client, no identity UPDATE helper, no pack-size column. Worker remains hello-world; infra default is Expo → Supabase directly.
- Origin note: lookup timing, DB-first display, cache TTL, diff-only overwrite, and background post-Confirm enrich are **user** decisions (incl. plan-review triage); FR-008 empty-fields fallback is **product**; “qty RPC stays identity-blind” is a **code** pattern this plan preserves deliberately.

## Definitions

| Term | Decided meaning | Origin | On degenerate data (tie, duplicate, empty, boundary, legacy) | Verified by |
| ---- | --------------- | ------ | ------------------------------------------------------------ | ----------- |
| Lookup start | OFF fetch begins as soon as barcode is known (sheet mount), in parallel with confirm UI — unless a valid in-memory cache entry exists for that barcode | user | Cancel before Confirm → no identity DB write; cache may still store the OFF result for a later scan | Phase 3 manual |
| Display source | **DB-first:** if a household row exists and has any filled identity fields, show those immediately on the sheet; OFF runs async to check for updates. If row missing or all identity null, show barcode (+ soft lookup status) until cache/OFF provides a preview | user | Legacy S-01 null identity → behaves like new until first successful enrich | Phase 3/4 manual |
| Confirm vs OFF | Confirm never waits on OFF; **qty DB write is primary**. Identity fill/update may complete in the background after Confirm (including after sheet dismiss) | user / product (FR-008) | Timeout/error → soft status; Confirm still enabled; background enrich may still land later | Phase 3 manual |
| In-memory OFF cache | Session/runtime cache keyed by barcode; TTL **30 minutes**; stores last successful mapped identity to skip repeat OFF calls when adding multiple units of the same code | user | Expired/missing → fetch OFF again; cache does not replace DB as source of truth for list | Phase 3 manual |
| `name` | Localized product title: prefer OFF name for device language (`lc` / `product_name_<lang>`), then `product_name_en`, then any non-empty `product_name`; else null. Device language = primary subtag of runtime locale (`Intl` or equivalent); fallback language `en` | user | OFF hit with empty name fields → null; list falls back to barcode | Phase 2/4 manual |
| `main_category` | Free-text from OFF categories (prefer human English label from tags; else raw tag); no closed enum | user | No categories → null; multiple tags → prefer leaf / most specific available label | Phase 2 manual |
| `auxiliary_category` | **Always null in S-02** — column remains; no OFF audience mapping in this slice (no Beauty Facts, no tag allowlist) | user | All rows leave auxiliary null until a later change defines mapping | Phase 2 automated (mapper returns null) |
| `pack_size` | New nullable free-text column; store OFF pack quantity string (e.g. `"400 g"`); display-only, not stock math | user | Missing/blank → null; do not parse into amount+unit | Phase 1/4 manual |
| Overwrite policy | After a successful OFF map, **UPDATE only fields whose new value differs** from the current DB (or from empty). Unchanged fields are left alone; do not wipe a non-null DB value just because OFF omitted it | user | OFF omits name but DB has name → keep DB name; OFF changes name → UPDATE that field | Phase 3 manual |
| Confirm delta 0 | Dismiss only — no qty write, no identity flush forced by Confirm | user | Same as S-01; opening the sheet may still warm cache / run OFF for preview | Phase 3 manual |
| Cancel without Confirm | No identity DB write for a barcode that has no successful qty Confirm this open; cache may retain OFF result | user | New barcode cancelled → no row; existing row unchanged | Phase 3 manual |
| List primary label | `name` when non-null, else full barcode | user | Pre-enrich / miss rows still show barcode | Phase 4 manual |
| List secondary | `main_category` and/or `pack_size` when present (compact secondary line) | user | Both null → no secondary line | Phase 4 manual |
| Search | Unchanged: case-insensitive barcode **prefix** only | user | Names not searchable in S-02 | Phase 4 manual (no regression) |
| Not found / error | Soft status on confirm (“Looking up…” / “Not found” / “Couldn’t look up”) + Retry; identity stays as DB/cache until a successful enrich applies diffs | user | Failed lookup leaves existing DB identity intact | Phase 3 manual |

## Desired End State

Scanning shows identity from DB when already known (or from cache/OFF preview when new). Confirm adds quantity immediately without waiting on OFF. After a successful qty Confirm, background enrichment may apply **only changed** identity fields once OFF returns. Repeat scans of the same code within 30 minutes reuse the in-memory cache. Misses and errors never block add. Search stays barcode-prefix.

### Key Discoveries:

- Identity columns and UPDATE RLS already exist; the qty RPC must stay quantity-only — enrich via a separate PostgREST UPDATE (`stock_items` migration trigger comment already anticipates S-02 identity updates).
- Plan review (F1/F2): Confirm success unmounts the sheet immediately today — identity persistence after Confirm **must** be allowed as a background write tied to a successful qty Confirm (not “only while mounted”). Cancel without Confirm must not write identity.
- OFF read API: `GET /api/v2/product/{code}` with `fields=…`; custom User-Agent `AppName/Version (contact)` required; no auth for reads.
- No existing app `fetch` pattern — new service under `src/services/` mirroring `stock.ts` throw-on-error style.

## What We're NOT Doing

- Cloudflare Worker / Supabase Edge BFF for OFF
- Open Beauty Facts or a second catalog
- Closed enums for main/auxiliary category
- Mapping or filling `auxiliary_category` from OFF in S-02 (always null this slice)
- Formal units of measure or using `pack_size` in quantity math
- Name (or category) search; name editing UI
- Blind always-overwrite that clears DB fields when OFF omits them
- Background identity write after **Cancel** (no successful qty Confirm) — cache warm is OK
- Blocking Confirm on OFF completion
- Changing `add_stock_item_by_barcode` to accept identity args
- Remove / manual-add / recommendations (S-03–S-05)
- Adding a unit/e2e test runner

## Implementation Approach

1. Migration: add nullable `pack_size`; extend `StockItem` + `STOCK_SELECT`; add identity UPDATE helper that applies **diff-only** field updates under RLS.
2. OFF client + mapper + in-memory barcode cache (TTL 30 min).
3. Confirm sheet: DB-first preview; cache hit skips OFF; else soft lookup; Confirm = qty only; after delta≥1 Confirm, schedule background identity apply when OFF/cache map is ready.
4. List row: primary name/barcode; secondary category/pack; manual verification; lint + typecheck.

## Critical Implementation Details

### Timing & lifecycle

On sheet mount: load current row (qty + identity) for DB-first display. If cache has a non-expired entry for the barcode, use it for preview and skip OFF (optional: still refresh in background only if product policy requires — default **skip OFF on cache hit**). Otherwise start OFF. Confirm stays tappable. **Delta ≥ 1 Confirm:** await qty RPC, then `onSuccess` (sheet may unmount); if mapped identity is already available, apply diff UPDATE before or immediately after qty write; if OFF still in flight, keep a “confirmed barcode” token so the late result may UPDATE once when it arrives. **Delta 0 / Cancel:** dismiss only — ignore late OFF for DB writes (may still populate cache).

### State sequencing

Qty RPC and identity UPDATE must not write overlapping columns. Diff-only UPDATE: compare mapped OFF fields to current DB row; PATCH only keys that changed; never null-out a field solely because OFF omitted it. Generation/Abort token so Cancel does not apply a late write; Confirm-during-lookup is the sole post-unmount write path.

### User-Agent / web

Send OFF’s required custom User-Agent on native. On web, browsers may override `User-Agent`; if so, still identify the app via OFF-recommended query params or documented alternative and note the limitation in manual verification — do not add a BFF solely for this.

---

## Phase 1: Schema + stock identity write

### Overview

Add pack-size storage and a typed identity UPDATE path without touching the qty RPC.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_stock_items_pack_size.sql`

**Intent**: Store OFF pack quantity as display-only free text beside existing identity columns.

**Contract**: `alter table public.stock_items add column pack_size text;` (nullable, no check). No change to `add_stock_item_by_barcode`. No RLS policy changes (existing UPDATE policy covers the new column).

#### 2. Types + select list

**File**: `src/types/stock.ts`, `src/services/stock.ts`

**Intent**: Round-trip `pack_size` everywhere stock rows are read.

**Contract**: `StockItem.pack_size: string | null`; include `pack_size` in `STOCK_SELECT`.

#### 3. Identity update helper

**File**: `src/services/stock.ts`

**Intent**: Persist enriched identity after OFF success without coupling to quantity increments.

**Contract**: Function such as `updateStockItemIdentity(barcode, fields)` → trim barcode; reject blank; load or accept current values; **diff-only** `update` of `name` / `main_category` / `auxiliary_category` / `pack_size` (only keys that changed); `.eq('barcode', trimmed)`; return updated `StockItem` (or throw). Household scoping via RLS. Must not modify `quantity`. Do not clear a non-null column solely because the incoming map omitted it.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` adding nullable `pack_size` without altering the qty RPC
- `StockItem` and `STOCK_SELECT` include `pack_size`
- `updateStockItemIdentity` (or equivalent) applies **diff-only** updates to identity/pack columns
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- After applying migration: UPDATE a row’s identity columns via the helper (or SQL + service call) leaves `quantity` unchanged; second household cannot update the first’s row

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before Phase 2.

---

## Phase 2: OFF client + field mapping

### Overview

Call Open Food Facts from the Expo client and map a product payload into stock identity fields.

### Changes Required:

#### 1. OFF service

**File**: `src/services/open-food-facts.ts` (new)

**Intent**: Fetch product-by-barcode for enrichment; isolate HTTP and OFF status handling from UI.

**Contract**: Async lookup by trimmed barcode → mapped identity object or a typed miss/error outcome the UI can distinguish (“not found” vs network/HTTP failure). Use `GET {base}/api/v2/product/{code}` with a tight `fields` list covering name, categories, labels (for audience signal), and pack quantity string. Custom User-Agent `AppName/Version (contact)` per OFF docs. Optional `EXPO_PUBLIC_OPEN_FOOD_FACTS_BASE_URL` defaulting to `https://world.openfoodfacts.org`. No write/auth to OFF.

#### 2. Field mapper + cache

**File**: same module or adjacent helpers under `src/services/`

**Intent**: Encode Definitions so confirm UI and persist path share one mapping; avoid repeat OFF calls for the same barcode within TTL.

**Contract**:
- `name`: device-locale language subtag (`Intl` or equivalent) → OFF localized name → `product_name_en` → any non-empty `product_name` → null; language fallback `en`
- `main_category`: free-text from categories (prefer human English label; else tag) → null if absent
- `auxiliary_category`: **always `null`** in S-02 (no tag/label allowlist)
- `pack_size`: OFF free-text quantity/pack string → null if blank
- In-memory cache: key = trimmed barcode; value = mapped identity + stored-at; **TTL 30 minutes**; get/set/invalidate helpers used by the confirm sheet before calling the network
- Do not add `expo-localization` solely for this unless Phase 2 manual shows `Intl` is insufficient on a target platform

#### 3. Env example

**File**: `.env.example`

**Intent**: Document the optional OFF base URL override for agents and humans.

**Contract**: Comment + `EXPO_PUBLIC_OPEN_FOOD_FACTS_BASE_URL` optional line; User-Agent may be a code constant derived from app name/version rather than a secret env.

### Success Criteria:

#### Automated Verification:

- `src/services/open-food-facts.ts` exists and exports a barcode lookup used by the app
- Mapper covers name fallbacks, always-null `auxiliary_category`, and nulls for miss/omit cases (prefer pure functions callable from the sheet; **do not add a test runner**)
- Cache helpers enforce 30-minute TTL (expired entry treated as miss)
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Against live OFF: a known in-catalog barcode (e.g. a common EAN) returns non-null `name` when OFF has `product_name`
- Against a nonsense barcode: outcome is “not found” (not a throw that blocks UI wiring)
- Network failure path is distinguishable from not-found for soft status copy
- Second lookup of the same barcode within TTL does not require a new network round-trip (observable via logs, mock, or offline after first hit)

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Confirm sheet soft enrich + persist

### Overview

DB-first preview, cache-aware OFF lookup, non-blocking Confirm, and background diff-only identity apply after successful qty Confirm.

### Changes Required:

#### 1. Confirm sheet enrichment UX

**File**: `src/components/stock/stock-confirm-sheet.tsx`

**Intent**: Show known identity immediately; never block aisle qty confirm on OFF.

**Contract**: On mount, load row via `getStockItemByBarcode` (qty + identity). Prefer DB identity for display when present. Check in-memory cache before network OFF. Soft status when fetching. Preview name/category/pack from DB, then cache, then OFF. Retry re-runs lookup (bypass cache on explicit Retry). Confirm enabled regardless of OFF state (except existing qty-load errors). Busy save still blocks dismiss as today.

#### 2. Persist sequencing

**File**: `src/components/stock/stock-confirm-sheet.tsx` (+ identity helper / confirmed-barcode token)

**Intent**: Qty write is primary; identity follows in background when the user confirmed an add.

**Contract**: **Delta ≥ 1:** await `addStockByBarcode`, then allow identity apply (immediate if map ready; else one-shot when in-flight OFF completes after unmount). Diff-only UPDATE. **Delta 0:** `onSuccess` dismiss only — no identity flush. **Cancel:** no identity DB write; generation token ignores late results for persist (cache populate OK). Failed identity UPDATE is soft (does not undo qty); Retry on sheet can re-attempt lookup while still open.

#### 3. Scan screen

**File**: `src/app/(app)/scan.tsx`

**Intent**: Keep sheet keyed by barcode; support post-Confirm background apply without requiring the sheet to stay mounted.

**Contract**: Minimal change — `onSuccess` may still clear `pendingBarcode`. Background apply must not depend on the sheet remaining mounted after a successful delta≥1 Confirm (module-level or service-level “confirmed barcode” + cache is enough).

### Success Criteria:

#### Automated Verification:

- Confirm sheet starts lookup on barcode mount (cache then OFF) and does not await OFF inside the Confirm handler before qty write
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Existing enriched row: sheet shows DB name immediately; Confirm +1 works; unchanged OFF data does not rewrite identical fields
- New barcode: Confirm during “Looking up…” succeeds; identity appears on list after focus refetch once OFF completes in background
- Nonsense barcode: “Not found”; Confirm still adds barcode-only row
- Offline / failed lookup: soft error + Retry; Confirm still works; existing DB identity unchanged
- Second scan of same barcode within 30 min: no duplicate OFF request (cache hit)
- Delta 0 Confirm: dismiss only; no qty change; no forced identity write
- Cancel without Confirm: no identity DB write for a new barcode

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: List display + manual verification

### Overview

Surface enriched identity on the stock list and record an end-to-end checklist.

### Changes Required:

#### 1. List row

**File**: `src/components/stock/stock-list-row.tsx`

**Intent**: Make enriched products recognizable without changing search.

**Contract**: Primary text = `item.name ?? item.barcode`. Optional secondary line with `main_category` and/or `pack_size` when present. Quantity remains beside the row. Match existing spacing/typography patterns.

#### 2. Stock home search

**File**: `src/app/(app)/(tabs)/index.tsx` (only if needed)

**Intent**: Preserve barcode-prefix search; no name matching in this slice.

**Contract**: Filter remains case-insensitive barcode prefix. No behavioral change required unless list rendering needs a layout tweak.

#### 3. Manual verification doc

**File**: `context/changes/barcode-open-food-facts-identify/manual-verification.md`

**Intent**: Checklist for aisle enrichment against a real Supabase project + live OFF.

**Contract**: Cover known hit, miss, network failure soft status, Confirm-during-lookup with background enrich, DB-first re-scan, cache TTL hit, delta-0 dismiss, Cancel without persist, diff-only update (OFF omit does not clear DB), list primary/secondary, search still barcode-only, pack_size display when OFF provides quantity text.

### Success Criteria:

#### Automated Verification:

- List row uses name-or-barcode primary labeling
- `npm run typecheck` passes
- `npm run lint` passes
- Manual verification doc exists under this change folder

#### Manual Verification:

- Enriched row shows name + secondary metadata; unenriched row shows barcode only
- Prefix search by barcode still finds enriched rows; searching by product name does **not** filter (explicit non-goal)
- Full checklist in `manual-verification.md` completed on device or typed-fallback path

---

## Testing Strategy

### Unit Tests:

- No new test runner. Prefer pure mapper functions that are easy to reason about in review; do not introduce Jest/Vitest solely for this slice.

### Integration Tests:

- None automated. Manual: qty RPC + identity UPDATE coexistence; RLS isolation across households.

### Manual Testing Steps:

1. Existing enriched item: open confirm → DB name shown immediately → Confirm +1; cache hit on immediate re-scan.
2. New OFF product: Confirm during lookup → qty saved → identity lands in background → list shows name after focus refetch.
3. Unknown code → not found → Confirm → barcode-only row.
4. Disable network → soft error → Retry; Confirm never blocked; existing identity unchanged.
5. Delta 0 Confirm → dismiss only; Cancel on new code → no identity write.
6. Search by barcode prefix still works; name string search does not.

## Performance Considerations

- Request only needed OFF `fields`; skip network on cache hit (TTL 30 min).
- One network lookup per barcode per TTL window unless Retry bypasses cache.
- Identity UPDATE is a single-row diff write; list already refetches on focus (S-01).

## Migration Notes

- Additive `pack_size` column; existing rows get null until a successful enrich applies a non-null pack_size.
- Diff-only updates preserve household identity when OFF omits fields.
- Resolves roadmap/PRD Open Question 6 for MVP mapping (free-text main category; `auxiliary_category` deferred/null in S-02; pack_size as display text). Q7 Beauty Facts and Q8 BFF remain out of scope as decided.
- Plan-review F1/F2 resolved: background identity apply after delta≥1 Confirm is allowed; Cancel does not persist.

## References

- PRD: `context/foundation/prd.md` (US-02, FR-006–008, Open Questions 6–8)
- Roadmap: `context/foundation/roadmap.md` (S-02)
- Prior slice: `context/changes/stock-list-search-barcode-add/plan.md`
- Infra: `context/foundation/infrastructure.md` (client default; optional BFF)
- OFF API: https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/ (User-Agent + product-by-barcode)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + stock identity write

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` adding nullable `pack_size` without altering the qty RPC — ba89f9b
- [x] 1.2 `StockItem` and `STOCK_SELECT` include `pack_size` — ba89f9b
- [x] 1.3 `updateStockItemIdentity` (or equivalent) applies **diff-only** updates to identity/pack columns — ba89f9b
- [x] 1.4 `npm run typecheck` passes — ba89f9b
- [x] 1.5 `npm run lint` passes — ba89f9b

#### Manual

- [x] 1.6 After applying migration: UPDATE a row’s identity columns via the helper (or SQL + service call) leaves `quantity` unchanged; second household cannot update the first’s row — ba89f9b

### Phase 2: OFF client + field mapping

#### Automated

- [x] 2.1 `src/services/open-food-facts.ts` exists and exports a barcode lookup used by the app
- [x] 2.2 Mapper covers name fallbacks, always-null `auxiliary_category`, and nulls for miss/omit cases
- [x] 2.3 Cache helpers enforce 30-minute TTL (expired entry treated as miss)
- [x] 2.4 `npm run typecheck` passes
- [x] 2.5 `npm run lint` passes

#### Manual

- [x] 2.6 Against live OFF: a known in-catalog barcode returns non-null `name` when OFF has `product_name`
- [x] 2.7 Against a nonsense barcode: outcome is “not found”
- [x] 2.8 Network failure path is distinguishable from not-found for soft status copy
- [x] 2.9 Second lookup of the same barcode within TTL does not require a new network round-trip

### Phase 3: Confirm sheet soft enrich + persist

#### Automated

- [ ] 3.1 Confirm sheet starts lookup on barcode mount (cache then OFF) and does not await OFF inside the Confirm handler before qty write
- [ ] 3.2 `npm run typecheck` passes
- [ ] 3.3 `npm run lint` passes

#### Manual

- [ ] 3.4 Existing enriched row: sheet shows DB name immediately; Confirm +1 works; unchanged OFF data does not rewrite identical fields
- [ ] 3.5 New barcode: Confirm during lookup succeeds; identity appears on list after focus refetch once OFF completes in background
- [ ] 3.6 Nonsense barcode: “Not found”; Confirm still adds barcode-only row
- [ ] 3.7 Offline / failed lookup: soft error + Retry; Confirm still works; existing DB identity unchanged
- [ ] 3.8 Second scan of same barcode within 30 min: cache hit (no duplicate OFF request)
- [ ] 3.9 Delta 0 Confirm: dismiss only; no qty change; no forced identity write
- [ ] 3.10 Cancel without Confirm: no identity DB write for a new barcode

### Phase 4: List display + manual verification

#### Automated

- [ ] 4.1 List row uses name-or-barcode primary labeling
- [ ] 4.2 `npm run typecheck` passes
- [ ] 4.3 `npm run lint` passes
- [ ] 4.4 Manual verification doc exists under this change folder

#### Manual

- [ ] 4.5 Enriched row shows name + secondary metadata; unenriched row shows barcode only
- [ ] 4.6 Prefix search by barcode still finds enriched rows; name search does not filter
- [ ] 4.7 Full checklist in `manual-verification.md` completed
