# Likely-Empty Recommendations Implementation Plan

## Overview

Ship FR-010 and FR-011 (plus a planning-session Ignore control): after each remove, recompute utilization frequency onto the live stock row from `stock_utilization_events`; on re-add, recompute again so hard-delete does not permanently lose stats; expose a **Recommendations** tab listing quantity-1 products whose time since last removal is **≥** that product’s average interval (≥2 removals required); allow Ignore until the next add or remove for that product. Extend utilization events so no-code rows participate via `name_key = lower(trim(name))`.

## Current State Analysis

- S-03 landed append-only `stock_utilization_events` keyed by `(household_id, barcode)` with `removed_at`, indexed for interval reads (`supabase/migrations/20260907210000_stock_remove_utilization.sql`). Frequency columns and recommendations UI were deferred.
- Qty hitting 0 **hard-deletes** `stock_items`, so any denormalized frequency/ignore on the row dies with it. Events survive; re-add must restore util columns from history.
- S-04 made barcode nullable and added `remove_stock_item_by_id` / `add_stock_item_manual_no_barcode`. No-code removes currently insert **no** event when barcode is null (`20260908085225_stock_manual_add_no_barcode.sql`).
- Consume UI calls `removeStockById` only; barcode remove RPC remains for parity/tests. Tabs today: Stock | Consume | Household (native `app-tabs.tsx` + web `_layout.web.tsx` lockstep).
- Trusted-member debt (direct DELETE / unpaired event INSERT) stays documented; this slice does **not** harden RLS (planning decision). Test-plan risk #2b “pre–S-05 harden” language is superseded for this change: harden remains a later item.
- PRD US-03/FR-011 wording says elapsed **greater than** average; planning chose **inclusive ≥**. Treat ≥ as the product contract for this plan.

## Definitions

| Term | Decided meaning | Origin | On degenerate data | Verified by |
| ---- | --------------- | ------ | ------------------ | ----------- |
| Product identity (events + ignore clear) | Barcode when present; else `lower(trim(name))` as `name_key` | user (plan Q10) | Never both; never neither; no `''` barcode | Phase 1 |
| Utilization frequency | `util_removal_count`, `util_last_removed_at`, `util_avg_interval_seconds` on `stock_items` | product (FR-010) + user (storage) | `avg` null when count &lt; 2 | Phase 1 |
| Average interval | Mean of consecutive `removed_at` gaps for that identity (= `(max−min)/(N−1)` for ordered times) | user (min history ≥2 removals) | Single removal → not eligible | Phase 1 |
| Overdue | `now() − util_last_removed_at ≥ util_avg_interval_seconds` | user (Q4 inclusive; diverges from PRD “greater than”) | Exact equality **is** overdue | Phase 1/3 |
| Recommendations row | Current stock row with `quantity = 1`, count ≥ 2, avg not null, overdue, `recommendation_ignored_at` null | product (FR-011) + user (ignore) | No-code eligible once events exist | Phase 2/3 |
| Async (MVP) | Recompute inside add/remove RPCs same transaction after the event write (no client follow-up, no cron) | user (Q2) | Document vs literal “async” | Phase 1 |
| Ignore | Set `recommendation_ignored_at = now()`; clears on next successful add **or** remove for that product (surviving row or re-add path) | user (Q7/Q9) | No un-ignore UI; last-unit delete drops flag with row | Phase 2/3 |
| Recommendations surface | Fourth tab: Stock \| Consume \| Recommendations \| Household | user (Q6) | Read-only list + Ignore; no − | Phase 3 |

## Desired End State

Household members open **Recommendations** and see current qty-1 products that look almost empty by the overdue rule, including no-code items with enough name-keyed history. Each remove (barcode or no-code) appends an event and updates util columns when the row remains; each add/re-add clears ignore and recomputes util from events. Ignore hides a row until the next add/remove for that identity. Stock and Consume behavior otherwise unchanged aside from richer `item` payloads / `STOCK_SELECT` fields.

### Key Discoveries:

- Event table today forces `barcode NOT NULL` — must become XOR `barcode` | `name_key` with partial indexes mirroring S-04 stock uniqueness (`20260907210000_stock_remove_utilization.sql`, `20260908085225_…`, `20260908101000_…`).
- Hook all **four** RPCs: `remove_stock_item_by_barcode`, `remove_stock_item_by_id`, `add_stock_item_by_barcode`, `add_stock_item_manual_no_barcode` — UI remove is by-id; barcode path still needed for tests/parity.
- Consume patches local rows from remove RPC `item` jsonb — extend that payload and `STOCK_SELECT` together or clients drift (`src/services/stock.ts`, `consume.tsx`).
- Tab lockstep footgun unchanged: native Trigger `name` = route filename; web `WebHeaderNav` + `Stack.Screen` must gain Recommendations together (`app-tabs.tsx`, `_layout.web.tsx`).

## What We're NOT Doing

- True background jobs / Worker cron / AFTER INSERT trigger as the primary frequency path
- Separate frequency or ignore tables (denormalize on `stock_items`)
- Un-ignore UI or permanent household-level mute across delete without re-add clear semantics beyond Q9
- `−` / consume / add CTAs on Recommendations
- RLS harden for unpaired events / direct DELETE (remains trusted-member debt)
- Changing PRD text in `context/foundation/` (note inclusive ≥ only in this change’s plan/brief)
- Soft-delete of stock rows; units of measure; location/demographic prediction
- New test runner; e2e browser suite

## Implementation Approach

1. Migration: XOR event identity + util/ignore columns on `stock_items` + shared SQL recompute helper; rewrite remove/add RPCs to always event (when identity resolvable), recompute, clear ignore.
2. Client: extend types/`STOCK_SELECT`; list recommendations (server-filtered preferred); ignore write path.
3. UI: Recommendations tab + read-only rows with Ignore + empty states + manual verification script.

## Critical Implementation Details

### State sequencing

Inside remove RPCs: resolve identity → insert event → if qty was 1, DELETE (util/ignore gone with row) and return `{ deleted: true }`; if qty &gt; 1, decrement, **clear ignore**, **recompute util onto the row**, return `{ deleted: false, item }` including new columns. Never leave a surviving row with stale avg after a new event. On add RPCs: after upsert/merge/insert, clear ignore and recompute before return so a re-added barcode/name immediately reflects history.

### Timing & lifecycle

Ignore clear is a side effect of add/remove RPCs only — the Ignore action only **sets** `recommendation_ignored_at`. Do not require a second client call after remove to refresh frequency.

---

## Phase 1: Schema, recompute helper, RPC hooks

### Overview

Make utilization history identity-complete (including no-code), store frequency and ignore on live stock rows, and keep those columns correct from every add/remove path.

### Changes Required:

#### 1. Migration — events XOR + stock util/ignore + helper + RPC rewrites

**File**: `supabase/migrations/<timestamp>_stock_utilization_frequency_recommendations.sql` (new)

**Intent**: Persist name-keyed events, denormalize frequency/ignore on `stock_items`, and recompute inside existing invoker RPCs so FR-010 holds across hard-delete/re-add.

**Contract**:
- `stock_utilization_events`: drop `barcode NOT NULL` / old nonempty-only check; add nullable `name_key text`; XOR check — exactly one of nonempty `barcode` or nonempty `name_key`; replace index with partial indexes on `(household_id, barcode, removed_at) WHERE barcode IS NOT NULL` and `(household_id, name_key, removed_at) WHERE name_key IS NOT NULL`. Keep append-only RLS/grants.
- `stock_items`: add `util_removal_count integer not null default 0`, `util_last_removed_at timestamptz null`, `util_avg_interval_seconds double precision null`, `recommendation_ignored_at timestamptz null`.
- Helper (e.g. `recompute_stock_item_utilization(p_household_id, p_barcode, p_name_key)` or update-by-stock-id after identity resolve): load events for the XOR identity; set count = N, last = max(`removed_at`), avg = null if N &lt; 2 else mean consecutive gap / equivalent `(max−min)/(N−1)` in seconds; write onto the matching live `stock_items` row (barcode unique or no-code name unique). No-op if no live row (last-unit already deleted).
- **One-shot backfill (same migration, after helper exists):** for every live `stock_items` row, resolve identity (barcode if present else `lower(trim(name))`) and call the helper so pre-existing `stock_utilization_events` populate `util_*` without waiting for the next add/remove. Skip rows that cannot resolve identity (should not occur under current CHECKs). Do not invent events.
- `remove_stock_item_by_barcode`: after event insert, on surviving row clear ignore + recompute; extend `item` jsonb with new columns.
- `remove_stock_item_by_id`: **always** insert an event — barcode path or `name_key = lower(trim(name))` when barcode null (reject/raise if no-code name missing — should be impossible under existing CHECK); same clear+recompute on survive; extend jsonb.
- `add_stock_item_by_barcode` / `add_stock_item_manual_no_barcode`: after write, clear `recommendation_ignored_at`, recompute from events for that identity, return row with util fields.
- Grant EXECUTE on the recompute helper only as needed (prefer internal `security invoker` called from existing RPCs; do not expose unpaired client-driven recompute). List/ignore RPCs may land in this migration or in the Phase 2 migration — see Phase 2 (mandatory RPC, not PostgREST filter).
- Do not alter F-01 membership helpers.

#### 2. Integration coverage for new contracts

**File**: `__tests__/integration/db-isolation.test.ts` (extend) and/or a focused sibling under `__tests__/integration/`

**Intent**: Prove no-code events, recompute-on-re-add, and recommendation eligibility predicates at the DB/RPC layer without trusting UI.

**Contract**: Cases covering at least: (1) no-code remove inserts `name_key` event; (2) two removes → avg set on surviving qty≥1 row; (3) last-unit delete leaves events; re-add restores util columns from history; (4) ignore clear on add after a prior ignore set (if ignore RPC lands in Phase 2, assert clear here once available — otherwise set column in test setup and clear via add); (5) household isolation unchanged for events/util columns. Keep trusted-client baseline file’s **allow** unpaired-insert expectation unless/until a harden change flips it (out of scope).

### Success Criteria:

#### Automated Verification:

- Migration file exists with XOR events, util/ignore columns, helper, one-shot util backfill, and all four RPCs updated
- `npm run typecheck` passes if generated/types touched
- `npm run lint` passes
- `npm run test:integration` passes for extended isolation/utilization cases (when `.env.test.local` present; fail clearly if env missing — do not point at production)

#### Manual Verification:

- Migration applied to the project Supabase instance
- SQL/RPC smoke: barcode path still decrements/deletes + events; no-code remove writes `name_key` event; after two removes on qty&gt;1, util columns populated; delete last unit + re-add restores count/avg from events; second household cannot read first’s events/util
- After migrate, an existing live row that already had ≥2 events shows non-zero `util_removal_count` / avg **without** a new remove (backfill)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Client types, recommendations list, ignore write

### Overview

Expose util/ignore fields to the app, query eligible recommendations via a DB RPC that uses server `now()`, and persist Ignore via RPC without an un-ignore UI.

### Changes Required:

#### 1. Types + stock service select/mapping

**Files**: `src/types/stock.ts`; `src/services/stock.ts`

**Intent**: Keep list/remove/add payloads aligned with new columns so Consume/Stock and Recommendations share one `StockItem` shape.

**Contract**: Extend `StockItem` with the four util/ignore fields. Extend `STOCK_SELECT`. Ensure `mapRemoveRpcPayload` / remove jsonb mapping includes the new fields when `deleted: false`. Update JSDoc that currently says events only when barcode present. Do not invent client-side interval math for the list source of truth.

#### 2. List recommendations + ignore

**Files**: `src/services/stock.ts`; `supabase/migrations/<timestamp>_stock_recommendations_list_ignore.sql` (new — if not already shipped in the Phase 1 migration)

**Intent**: Load only eligible rows and set ignore from the Recommendations UI, with eligibility evaluated on the database clock.

**Contract**:
- **Do not** filter overdue in the client or via PostgREST column↔literal filters — `(now() - util_last_removed_at) ≥ util_avg_interval_seconds` is not expressible that way and must not fall back to device `Date`.
- `list_likely_empty_recommendations()` (name flexible): `security invoker` RPC returning household `stock_items` (same field set as `STOCK_SELECT` + util/ignore) where `quantity = 1` AND `util_removal_count >= 2` AND `util_avg_interval_seconds IS NOT NULL` AND `recommendation_ignored_at IS NULL` AND `(now() - util_last_removed_at) >= (util_avg_interval_seconds * interval '1 second')` (or equivalent). Grant `EXECUTE` to `authenticated` only. Optional: a SQL view with the same predicate is acceptable **only if** the client reads that view (still no client-side overdue math).
- `ignore_stock_recommendation(p_id uuid)` (name flexible): `security invoker` RPC that sets `recommendation_ignored_at = now()` for the member’s current-household row only; raise if missing / wrong household. No un-ignore API. Clear remains add/remove RPC side effect only.
- Client: `listLikelyEmptyRecommendations()` and `ignoreRecommendation(itemId)` call those RPCs only (throw-on-error like other stock service methods).
- Prefer shipping both RPCs in the Phase 1 migration when practical; otherwise this Phase 2 migration file is mandatory before UI work.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes with extended `StockItem` and new exports
- `npm run lint` passes
- List and ignore RPCs exist (Phase 1 or Phase 2 migration) with `EXECUTE` for `authenticated`; client wrappers call RPCs only
- Integration test asserts: ignore RPC hides the row from the list RPC; a subsequent add for that identity clears ignore so the row can reappear when overdue (extend `__tests__/integration/` — not optional)

#### Manual Verification:

- Temporary hook or SQL+service call: after enough history and qty=1 overdue, list RPC returns the row; after ignore RPC, list omits it; after add or remove on that product, ignore cleared and row can reappear when overdue again
- Confirm overdue eligibility still holds when device clock is skewed (list must not use client `Date` for the threshold)

**Implementation Note**: Pause for human manual confirmation before Phase 3.

---

## Phase 3: Recommendations tab UI + manual checklist

### Overview

Add the fourth tab and a read-only list with Ignore, matching Consume chrome patterns without consume mutation UX.

### Changes Required:

#### 1. Tab route + native/web lockstep

**Files**: `src/app/(app)/(tabs)/recommendations.tsx` (new); `src/components/app-tabs.tsx`; `src/app/(app)/(tabs)/_layout.web.tsx`; comment in `src/app/(app)/(tabs)/_layout.tsx`

**Intent**: Make recommendations a first-class optional list surface per FR-011 / US-03.

**Contract**: Tab order **Stock | Consume | Recommendations | Household**. Native `NativeTabs.Trigger` `name="recommendations"` (SF/MD icons acceptable like Consume). Web: extend `WebHeaderNav` active union + Link + `Stack.Screen`. Screen: `useFocusEffect` refetch of recommendations list; optional search is **not** required for MVP. No Scan CTA. No `−`.

#### 2. Row + empty states + Ignore

**Files**: `src/components/stock/stock-list-row.tsx` and/or `recommendations-list-row.tsx`; `src/components/stock/recommendations-empty-state.tsx` (new); `src/app/(app)/(tabs)/recommendations.tsx`

**Intent**: Show likely-empty products and let the user mute until the next add/remove.

**Contract**: Reuse identity/qty display patterns from `StockListRow`. Add accessible **Ignore** control (not `onRemove`). On Ignore success, drop the row from local list (or refetch). Empty: distinct copy for “nothing recommended” (not enough history / none overdue / all ignored) — do not reuse Stock’s Scan CTA or Consume’s “Nothing to consume” verbatim. No un-ignore management UI. No last-unit confirm on Ignore unless product later asks; default tap → ignore write.

#### 3. Manual verification script

**File**: `context/changes/likely-empty-recommendations/manual-verification.md` (new)

**Intent**: Human checklist for FR-010/011 + Ignore + no-code + tab lockstep.

**Contract**: Steps for four tabs on native and web; barcode and no-code paths to ≥2 removals; qty=1 overdue appears; **equality boundary (≥) with the SQL seed recipe from Phase 3 Manual 3.7**; Ignore hides until add or remove; re-add restores util-based eligibility; Stock/Consume still lack Recommendations-only controls; empty state; no Scan on Recommendations.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `manual-verification.md` exists in this change folder
- Recommendations route and tab triggers exist on native and web entry points

#### Manual Verification:

- Tabs show Stock | Consume | Recommendations | Household on native and web
- With seeded history, overdue qty-1 barcode and no-code rows appear; non-overdue / count&lt;2 / qty&gt;1 do not
- Elapsed exactly equal to average still appears (≥) — **seed recipe:** pick a qty=1 household row with `util_removal_count >= 2` and non-null avg (or set util columns via SQL for a test row); `UPDATE stock_items SET util_last_removed_at = now() - (util_avg_interval_seconds * interval '1 second'), recommendation_ignored_at = null WHERE id = …`; call list RPC (or open Recommendations) and confirm the row is included; optionally bump `util_last_removed_at` one second later (`now() - … + interval '1 second'`) and confirm it drops when using strict timing if re-testing exclusion for `&lt;` is useful
- Ignore removes from list; next remove (qty&gt;1) or add brings eligibility back when predicates hold
- Recommendations has Ignore only (no − / no Scan); Consume still owns −; Stock still browse/add
- Empty Recommendations copy is specific and has no Scan CTA

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before treating the change as implementation-complete.

---

## Testing Strategy

### Unit Tests:

- Optional pure helper tests only if interval math is extracted in TS (prefer DB helper as source of truth — unit layer not required).

### Integration Tests:

- Phase 1/2: extend DB isolation / utilization cases for XOR events, recompute-on-re-add, **required** ignore set + add clear vs list RPC, eligibility predicate with DB `now()`.
- Leave `db-trusted-client-baseline.test.ts` unpaired-insert **allow** behavior as-is (harden out of scope).

### Manual Testing Steps:

1. Apply migration; confirm four tabs.
2. Build history (≥2 removes) for a barcode product; leave qty=1 until overdue; confirm Recommendations.
3. Repeat for a no-code named product.
4. Ignore → gone; add or consume once → can return when overdue.
5. Confirm Stock/Consume unchanged aside from util fields if displayed nowhere yet.

## Performance Considerations

Household-scoped lists and single-row recompute on write are enough for MVP sizes. Partial event indexes keep identity scans cheap. Recommendations list **must** filter in SQL (list RPC or view) so the client does not download full stock or evaluate overdue with device time.

## Migration Notes

- Additive + reshape of event identity constraints; existing barcode-only event rows remain valid under XOR (barcode set, `name_key` null).
- Same migration **backfills** `util_*` on all live `stock_items` from existing events so Recommendations can light up without a fresh consume/add per product.
- Rollback before production reliance: drop new RPC pieces/helper, drop columns, restore prior remove/add function bodies, revert event nullability carefully if any `name_key` rows exist.
- After deploy, old clients ignore new columns; new Recommendations UI requires the migration.

## References

- PRD: `context/foundation/prd.md` (US-03, FR-010, FR-011; Open Question 4)
- Roadmap: `context/foundation/roadmap.md` (S-05)
- Prior: `context/changes/remove-stock-item/plan.md` (events, hard-delete, FR-010 deferral)
- Prior: `context/changes/manual-add-without-barcode/plan.md` (no-code identity, remove-by-id)
- Events migration: `supabase/migrations/20260907210000_stock_remove_utilization.sql`
- No-code migration: `supabase/migrations/20260908085225_stock_manual_add_no_barcode.sql`
- Tab blueprint: `src/components/app-tabs.tsx`, `src/app/(app)/(tabs)/_layout.web.tsx`, `src/app/(app)/(tabs)/consume.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, recompute helper, RPC hooks

#### Automated

- [x] 1.1 Migration file exists with XOR events, util/ignore columns, helper, one-shot util backfill, and all four RPCs updated — f02f42b
- [x] 1.2 `npm run typecheck` passes if generated/types touched — f02f42b
- [x] 1.3 `npm run lint` passes — f02f42b
- [x] 1.4 `npm run test:integration` passes for extended isolation/utilization cases (when `.env.test.local` present; fail clearly if env missing — do not point at production) — f02f42b

#### Manual

- [x] 1.5 Migration applied to the project Supabase instance — f02f42b
- [x] 1.6 SQL/RPC smoke: barcode path still decrements/deletes + events; no-code remove writes `name_key` event; after two removes on qty>1, util columns populated; delete last unit + re-add restores count/avg from events; second household cannot read first’s events/util — f02f42b
- [x] 1.7 After migrate, an existing live row that already had ≥2 events shows non-zero `util_removal_count` / avg without a new remove (backfill) — f02f42b

### Phase 2: Client types, recommendations list, ignore write

#### Automated

- [x] 2.1 `npm run typecheck` passes with extended `StockItem` and new exports — 59b1701
- [x] 2.2 `npm run lint` passes — 59b1701
- [x] 2.3 List and ignore RPCs exist (Phase 1 or Phase 2 migration) with `EXECUTE` for `authenticated`; client wrappers call RPCs only — 59b1701
- [x] 2.4 Integration test asserts: ignore RPC hides the row from the list RPC; a subsequent add for that identity clears ignore so the row can reappear when overdue (extend `__tests__/integration/` — not optional) — 59b1701

#### Manual

- [x] 2.5 Temporary hook or SQL+service call: after enough history and qty=1 overdue, list RPC returns the row; after ignore RPC, list omits it; after add or remove on that product, ignore cleared and row can reappear when overdue again — 59b1701
- [x] 2.6 Confirm overdue eligibility still holds when device clock is skewed (list must not use client `Date` for the threshold) — 59b1701

### Phase 3: Recommendations tab UI + manual checklist

#### Automated

- [x] 3.1 `npm run typecheck` passes — a7b0351
- [x] 3.2 `npm run lint` passes — a7b0351
- [x] 3.3 `manual-verification.md` exists in this change folder — a7b0351
- [x] 3.4 Recommendations route and tab triggers exist on native and web entry points — a7b0351

#### Manual

- [x] 3.5 Tabs show Stock | Consume | Recommendations | Household on native and web — a7b0351
- [x] 3.6 With seeded history, overdue qty-1 barcode and no-code rows appear; non-overdue / count<2 / qty>1 do not — a7b0351
- [x] 3.7 Elapsed exactly equal to average still appears (≥) — seed recipe: set util_last_removed_at = now() - (util_avg_interval_seconds * interval '1 second') on a qty=1 eligible row, confirm list includes it — a7b0351
- [x] 3.8 Ignore removes from list; next remove (qty>1) or add brings eligibility back when predicates hold — a7b0351
- [x] 3.9 Recommendations has Ignore only (no − / no Scan); Consume still owns −; Stock still browse/add — a7b0351
- [x] 3.10 Empty Recommendations copy is specific and has no Scan CTA — a7b0351
