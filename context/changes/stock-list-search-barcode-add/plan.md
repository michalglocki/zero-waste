# Stock List, Search & Barcode-Add Implementation Plan

## Overview

Ship the milestone north star: a logged-in household member can browse shared stock, search it by barcode prefix, and add (or increase) an item by scanning a barcode — with a confirm sheet for quantity — so the product persists and can be found again. Optional name/category stay empty until S-02; remove and manual-add remain later slices.

## Current State Analysis

- F-01 is implemented: session + membership gate, Supabase client, `households` / `memberships`, RLS helpers `current_household_id()` and `is_household_member` (`supabase/migrations/20260904000000_households_memberships.sql`).
- `(app)/index` is still the household invite/join surface; Explore is the Expo starter tutorial. No stock tables, services, list UI, search, or camera packages.
- Data path is Expo → Supabase + RLS directly; the Worker stays hello-world (`infrastructure.md`). Stock persistence was explicitly deferred to this slice (F-01 plan).
- Origin note: “one row per barcode” and “prefix search” are **user** decisions from planning; F-01 helpers are **product**/prior-plan contracts this slice must not weaken.

## Definitions

| Term | Decided meaning | Origin | On degenerate data (tie, duplicate, empty, boundary, legacy) | Verified by |
| ---- | --------------- | ------ | ------------------------------------------------------------ | ----------- |
| Household stock list | Shared rows for the member’s `household_id` | product (FR-001) | Empty → empty state + Scan CTA | Phase 2 manual |
| Search | Case-insensitive **prefix** match on `barcode` | user | No matches → empty results; names ignored until present | Phase 2 manual |
| Stock row identity | At most one row per `(household_id, barcode)` | user | Re-scan updates that row’s quantity | Phase 1/3 automated + manual |
| Barcode / product code | Non-empty **string** from camera or typed fallback; leading zeros preserved (never coerce to number) | product (FR-008) + user | Blank/whitespace-only after trim → cannot Confirm; trim ends only, keep internal zeros | Phase 3 manual |
| Quantity on add | Delta to add (default 1) via confirm sheet +/− and input; delta is an integer ≥ 0 | user | Non-numeric / negative coerce to 0; Confirm with 0 → no write; delta ≥ 1 upserts | Phase 3 manual |
| Empty-name display | Primary label = full barcode; qty beside it | user | All S-01 rows look like codes until S-02 | Phase 2 manual |
| Post-success UX | Stay on scanner ready for next item; stock list refetches on screen focus when the user returns | user | Stale list after adds is not acceptable — reload via focus (not pull-to-refresh) | Phase 2/3 manual |

## Desired End State

After sign-in, the primary app surface is the household stock list (searchable by barcode prefix). The user can open Scan, use the camera or typed-barcode fallback, see current stock on a confirm sheet, adjust how many to add, and Confirm to upsert. A second scan of the same code increases quantity. Optional identity fields exist as null columns. Invite/join/sign-out live on a Household tab, not on the stock home.

### Key Discoveries:

- Reuse F-01 service throw-on-error shape (`src/services/household.ts`) and form busy/error patterns (`src/components/auth/auth-form.tsx`, `join-household-form.tsx`).
- Expo SDK 56 barcode scanning is **`expo-camera` `CameraView`** + config plugin `barcodeScannerEnabled` — not `expo-barcode-scanner` ([docs v56 Camera](https://docs.expo.dev/versions/v56.0.0/sdk/camera/)).
- Prefer atomic client upsert under RLS (unique constraint + `ON CONFLICT` / PostgREST upsert with `quantity = quantity + delta`) so concurrent household members cannot create duplicate barcode rows; stock allows INSERT/UPDATE unlike F-01 membership tables (documented in Phase 1).
- Root `Stack.Protected` gate stays unchanged; only `(app)` tab/stack contents change.

## What We're NOT Doing

- Open Food Facts lookup or filling name/categories (S-02)
- List-row remove / decrement-to-delete / utilization events (S-03)
- Dedicated manual-add flow when a barcode never existed (S-04) — typed entry here is **scan fallback only**
- Recommendations (S-05), units of measure, app “enough” threshold
- Growing the Cloudflare Worker into a stock API
- Adding a unit/e2e test runner
- Pull-to-refresh / multi-sort polish (explicitly cuttable; not required for this plan’s success criteria)
- Editing name/category in the client

## Implementation Approach

1. Add a `stock_items` migration with FR-007 columns (nullable identity fields), quantity ≥ 1 while the row exists, unique `(household_id, barcode)`, and RLS + SELECT/INSERT/UPDATE grants scoped by F-01 helpers; expose list / prefix-search / add-delta via a client upsert service.
2. Make stock the `(app)` home with search + empty state + focus refetch; move invite/join/sign-out to a Household tab (delete Explore route); update native tabs and web stack titles/hrefs in lockstep.
3. Install and configure `expo-camera`; build scan → confirm sheet → upsert; typed barcode when camera denied/unavailable; stay on scanner after success; retry on save failure.
4. Document a manual verification script mirroring F-01’s checklist style; gate phases with `npm run lint` and `npm run typecheck`.

## Critical Implementation Details

### Timing & lifecycle

Pause continuous `onBarcodeScanned` while the confirm sheet is open (set handler to `undefined` / gate with a `scanned` flag) so one physical code does not spam sheets. After a successful Confirm, clear the sheet but **re-arm** the scanner for the next item (user chose stay-on-scanner).

### State sequencing

Confirm writes a **delta** (amount to add), not a replacement absolute quantity. Load “current qty” for the sheet from the existing row (0 if none) before Confirm; the write must be `quantity = quantity + delta` under the unique key so two members cannot create two rows for the same barcode. After dismiss, stock home must refetch on focus so the user sees the new qty when they leave the scanner.

---

## Phase 1: Stock schema + service

### Overview

Land the stock table, RLS, and client service so later UI only calls typed APIs.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_stock_items.sql`

**Intent**: Create household-scoped stock rows with FR-007 fields and identity uniqueness for barcode-add.

**Contract**: Table `stock_items` with at least: `id`, `household_id` → `households`, `barcode` (**text**, never numeric — leading zeros must round-trip), `quantity` (integer, check ≥ 1), `name` / `main_category` / `auxiliary_category` (nullable text), timestamps including `updated_at` (maintained on write for sort). Unique on `(household_id, barcode)`. RLS enabled. **Write path (deliberate divergence from F-01 membership tables):** clients may `SELECT` / `INSERT` / `UPDATE` under RLS (`household_id = current_household_id()` or `is_household_member(household_id)`); **no client DELETE** in S-01. Explicit table privileges: `revoke all` from `anon`/`authenticated`, then `grant select, insert, update` to `authenticated` (not delete). Prefer PostgREST upsert / `ON CONFLICT` so `quantity = quantity + delta` stays atomic under the unique key; an RPC is optional, not required. Do not alter F-01 helpers. Rationale vs memberships: stock is ongoing CRUD the member owns; memberships stay trigger/RPC-only to prevent open membership inserts. Note for S-04: empty barcodes may need a partial unique index later; S-01 always stores a non-empty code.

#### 2. Types

**File**: `src/types/stock.ts` (new)

**Intent**: Share the stock row shape with services and UI.

**Contract**: Type for a stock item matching selected columns; export anything the list/confirm UI needs (id, barcode, quantity, optional name fields).

#### 3. Stock service

**File**: `src/services/stock.ts` (new)

**Intent**: Encapsulate list, prefix search, and add-delta behind the same throw-on-error style as household services.

**Contract**: Functions such as list-for-current-household, search-by-barcode-prefix (case-insensitive prefix), and add-by-barcode(delta ≥ 1) via client upsert under RLS (not a required RPC). No OFF calls. Callers catch / map errors to UI.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with `stock_items`, unique `(household_id, barcode)`, nullable identity columns, and RLS using F-01 helpers
- `npm run typecheck` passes with new types/service compiling
- `npm run lint` passes

#### Manual Verification:

- Migration applied to the project Supabase instance used by `.env.local`
- From SQL or a throwaway call: insert/increment same barcode twice yields one row with summed quantity; second household cannot read/write the first’s rows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Stock home + search + navigation

### Overview

Make stock the primary surface and relocate household invite UI.

### Changes Required:

#### 1. Stock list + search UI

**File**: `src/app/(app)/index.tsx` (replace household home content) + components under `src/components/stock/` as needed

**Intent**: Show household stock with barcode-prefix search and empty state.

**Contract**: Primary label = barcode string; quantity beside it. Search filters with case-insensitive barcode **prefix**. Empty list → empty-state copy explaining no stock yet; Scan CTA may be **disabled or omitted** until Phase 3 wires the scan route (do not ship a dead link). Loading/error follow existing themed busy/error patterns. Default export route screen. **Refetch stock whenever this screen gains focus** (e.g. `useFocusEffect`) so returning from scan shows upserts without pull-to-refresh. **Default sort:** `updated_at` descending (most recently touched first).

#### 2. Household tab / screen

**File**: new route e.g. `src/app/(app)/household.tsx` (or rename Explore); move invite card, join entry, sign-out from current index

**Intent**: Keep F-01 invite/join reachable without owning the aisle home.

**Contract**: Invite code + join (reuse `InviteCodeCard` / `JoinHouseholdForm` / `/join`) + sign-out. No stock CRUD here.

#### 3. Tabs and web stack titles

**Files**: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`, `src/app/(app)/_layout.web.tsx`, remove or unroute `src/app/(app)/explore.tsx`

**Intent**: Stock as home tab; Household replaces Explore; titles match — avoid the F-01 web +not-found footgun from stale TabTrigger hrefs.

**Contract**: Native `NativeTabs.Trigger` **name** must match the route filename (`index` + `household`). Web `TabTrigger` name/`href` updated in lockstep (replace `explore` href). `_layout.web.tsx` Stack screens: `index` (Stock), `household`, `join` — drop Explore. **Delete or fully unroute** `(app)/explore.tsx` so the tutorial is not reachable. Tab icon: reuse `home.png` or existing asset for Household; do not leave a broken `explore` trigger. On web, rename or remove the “Expo Starter” brand chrome in `app-tabs.web.tsx`. Leave root `_layout.tsx` Protected gate unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Signed-in user lands on stock list (empty state if no rows)
- Prefix search returns matching barcodes and shows empty results when none match
- Household tab still shows invite code, join, and sign-out
- Explore tutorial route is deleted or unreachable (not only unlabeled)
- Returning to stock after leaving the screen triggers a list refetch (focus), not only initial mount
- List order is newest-updated first (`updated_at` desc)
- Web tab chrome no longer shows “Expo Starter” branding (rename or remove)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Scan → confirm → upsert

### Overview

Wire camera (and typed fallback) through the confirm sheet into the stock upsert, staying on the scanner after success.

### Changes Required:

#### 1. Install and configure `expo-camera`

**Files**: `package.json` (via `npx expo install expo-camera`), `app.json` plugins

**Intent**: Enable barcode scanning on SDK 56 with correct permissions.

**Contract**: Add `expo-camera` plugin with `barcodeScannerEnabled: true` and a clear camera permission string. Follow [Expo Camera v56](https://docs.expo.dev/versions/v56.0.0/sdk/camera/) — do not add deprecated `expo-barcode-scanner`. Prefer product-relevant 1D types (e.g. ean13/ean8/upc_a/upc_e); do not hard-reject other types unless scanning noise becomes a problem.

#### 2. Scan screen + typed fallback

**File**: route under `src/app/(app)/` (e.g. `scan.tsx`) and/or components under `src/components/stock/`

**Intent**: Capture a barcode via camera or typing when camera is denied/unavailable (web/simulator/permission).

**Contract**: Permission denied/unavailable → explain + offer typed barcode field (and settings guidance where applicable). Normalize barcode with **trim** only; store and compare as **text** so leading zeros survive (never `Number()` / parseInt). Blank after trim cannot open Confirm. Valid non-empty code opens the confirm sheet. Pause camera callbacks while confirm is open. Register the scan screen on web Stack in `_layout.web.tsx` (title e.g. Scan) so web typed-fallback is reachable.

#### 3. Confirm sheet

**File**: `src/components/stock/` confirm UI

**Intent**: Show current household qty for that barcode and let the user set add-delta before write.

**Contract**: Display current quantity (0 if new). Controls: − / + and numeric input for **delta** (default 1). Parse delta as integer; non-numeric or negative → treat as 0. Confirm with delta 0 → no write (dismiss/cancel behaviour). Confirm with delta ≥ 1 → call add service; on error stay on sheet with message + Retry, preserving the scanned code (string, leading zeros intact). On success: dismiss sheet, **remain on scanner** armed for next scan. Do not navigate away to force list focus.

#### 4. Entry from stock home

**File**: stock index / empty-state CTA

**Intent**: Primary path from list/empty state into Scan (wired in this phase).

**Contract**: Empty-state CTA and an always-available Scan affordance open the scan flow (enable/replace any Phase 2 disabled placeholder).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `expo-camera` is a dependency and listed in `app.json` plugins with barcode scanning enabled

#### Manual Verification:

- Device: scan a real barcode → confirm shows current qty → Confirm +1 → row appears/increases; stay on scanner for a second item
- Re-scan same code → confirm shows updated current qty → add another delta
- Confirm with delta 0 → no DB change
- Deny camera (or use web) → typed barcode path can complete the same upsert
- Typed code with leading zeros (e.g. `073852000123`) stores and searches as that exact string
- Kill network or force error → error + Retry on sheet; successful retry writes once
- Cancel confirm → no write; scanner can be used again

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Manual verification script

### Overview

Capture the US-01 checklist so future agents/humans can re-run the aisle loop without rediscovering steps.

### Changes Required:

#### 1. Manual verification doc

**File**: `context/changes/stock-list-search-barcode-add/manual-verification.md`

**Intent**: Document the end-to-end and edge checks for this slice (F-01 style).

**Contract**: Steps covering: empty state + Scan CTA; prefix search hit/miss; camera add; typed fallback; re-scan confirm + increment; delta 0 no-op; save error retry; Household tab invite still works; second household member sees the same stock (shared list). Record pass/fail date when executed.

### Success Criteria:

#### Automated Verification:

- `manual-verification.md` exists in the change folder
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Checklist executed at least once on a real device (camera path) and once via typed fallback
- Two members of the same household see the same stock row after one adds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in repo; do not add one in this change (`AGENTS.md`).

### Integration Tests:

- None automated. Rely on migration apply + manual two-member check.

### Manual Testing Steps:

1. Empty household → empty state → Scan CTA
2. Add via camera; confirm list shows barcode + qty when returning to stock
3. Search prefix of that barcode → hit; unrelated prefix → empty
4. Re-scan → confirm shows current qty → add delta → qty increases (one row)
5. Typed fallback path with camera blocked
6. Confirm delta 0 → no change
7. Second account on same household sees the row; other household does not

## Performance Considerations

MVP household lists are small; client-side or simple `ILIKE 'prefix%'` query is enough. Avoid full-table scans of unrelated households (RLS + `household_id` filter). No offline queue.

## Migration Notes

- Applying `stock_items` is additive; rolling back requires dropping the table (dev-safe; coordinate if shared staging has data).
- Do not weaken `current_household_id` / `is_household_member`.
- Stock table GRANTs: SELECT/INSERT/UPDATE for `authenticated` after revoke-all; no DELETE grant in S-01. This is intentional vs F-01 membership SELECT-only.
- S-04 may allow empty barcodes — plan a partial unique index then; S-01 always writes non-empty codes.
- S-02 will UPDATE nullable identity columns; no schema redesign expected if Phase 1 lands FR-007 columns now.
- Native camera needs a dev client / device build as required by Expo for `expo-camera`; web relies on typed fallback.
- Upsert must express `quantity = stock_items.quantity + excluded.delta` (or equivalent) — a blind overwrite of absolute qty loses concurrent increments.

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- PRD: `context/foundation/prd.md` (US-01, FR-001–003, FR-007–008)
- F-01 plan / helpers: `context/changes/minimal-household-auth/plan.md`, `supabase/migrations/20260904000000_households_memberships.sql`
- Expo Camera (SDK 56): https://docs.expo.dev/versions/v56.0.0/sdk/camera/
- Infra data path: `context/foundation/infrastructure.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Stock schema + service

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` with `stock_items`, unique `(household_id, barcode)`, nullable identity columns, and RLS using F-01 helpers — 4da6821
- [x] 1.2 `npm run typecheck` passes with new types/service compiling — 4da6821
- [x] 1.3 `npm run lint` passes — 4da6821

#### Manual

- [x] 1.4 Migration applied to the project Supabase instance used by `.env.local` — 4da6821
- [x] 1.5 From SQL or a throwaway call: insert/increment same barcode twice yields one row with summed quantity; second household cannot read/write the first’s rows — 4da6821

### Phase 2: Stock home + search + navigation

#### Automated

- [x] 2.1 `npm run typecheck` passes — 78cc1a5
- [x] 2.2 `npm run lint` passes — 78cc1a5

#### Manual

- [x] 2.3 Signed-in user lands on stock list (empty state if no rows) — 78cc1a5
- [x] 2.4 Prefix search returns matching barcodes and shows empty results when none match — 78cc1a5
- [x] 2.5 Household tab still shows invite code, join, and sign-out — 78cc1a5
- [x] 2.6 Explore tutorial route is deleted or unreachable (not only unlabeled) — 78cc1a5
- [x] 2.7 Returning to stock after leaving the screen triggers a list refetch (focus), not only initial mount — 78cc1a5
- [x] 2.8 List order is newest-updated first (`updated_at` desc) — 78cc1a5
- [x] 2.9 Web tab chrome no longer shows “Expo Starter” branding (rename or remove) — 78cc1a5

### Phase 3: Scan → confirm → upsert

#### Automated

- [x] 3.1 `npm run typecheck` passes — 8766538
- [x] 3.2 `npm run lint` passes — 8766538
- [x] 3.3 `expo-camera` is a dependency and listed in `app.json` plugins with barcode scanning enabled — 8766538

#### Manual

- [x] 3.4 Device: scan a real barcode → confirm shows current qty → Confirm +1 → row appears/increases; stay on scanner for a second item — 8766538
- [x] 3.5 Re-scan same code → confirm shows updated current qty → add another delta — 8766538
- [x] 3.6 Confirm with delta 0 → no DB change — 8766538
- [x] 3.7 Deny camera (or use web) → typed barcode path can complete the same upsert — 8766538
- [x] 3.8 Typed code with leading zeros (e.g. `073852000123`) stores and searches as that exact string — 8766538
- [x] 3.9 Kill network or force error → error + Retry on sheet; successful retry writes once — 8766538
- [x] 3.10 Cancel confirm → no write; scanner can be used again — 8766538

### Phase 4: Manual verification script

#### Automated

- [x] 4.1 `manual-verification.md` exists in the change folder — f832dd0
- [x] 4.2 `npm run typecheck` passes — f832dd0
- [x] 4.3 `npm run lint` passes — f832dd0

#### Manual

- [x] 4.4 Checklist executed at least once on a real device (camera path) and once via typed fallback — f832dd0
- [x] 4.5 Two members of the same household see the same stock row after one adds — f832dd0
