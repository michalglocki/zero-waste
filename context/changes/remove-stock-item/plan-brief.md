# Remove Stock Item — Plan Brief

> Full plan: `context/changes/remove-stock-item/plan.md`

## What & Why

Let a household member decrease listed stock by 1 from a dedicated **Consume** tab, store each remove as a utilization event, and hard-delete the row when quantity would hit 0 (FR-004, FR-009) — without confusing browse/add on Stock with consume activity.

## Starting Point

S-01/S-02 deliver Stock + Household tabs, list + barcode add (and optional OFF identity). Quantity CHECK ≥ 1; RLS allows SELECT/INSERT/UPDATE only — no DELETE. List rows are display-only; confirm-sheet − is add-delta only. No utilization table yet.

## Desired End State

Tabs are **Stock | Consume | Household**. Consume lists current stock with `−` per row (confirm only on last unit). Stock stays view/search/Scan-add with no remove controls. Missing row → **Not in stock**, no event, no write. Event history for a barcode survives delete/re-add for S-05.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Event identity | `(household_id, barcode)` + `removed_at` + nullable `removed_by` (ON DELETE SET NULL) | Survives hard-delete and re-add for S-05; user delete does not wipe history | Plan |
| Remove surface | New **Consume** tab | Separates consume from Stock browse/add | Plan (revision) |
| How to pick item | Consume list of current stock + `−` | Fixed −1 without inventing scan-consume | Plan (revision) |
| Not in DB | Show **Not in stock**; no event; no write | Honest empty; no fake utilization | Plan (revision) |
| Last unit | Confirm only when qty === 1 | Guards irreversible list loss | Plan |
| FR-010 | Defer to S-05 | Matches roadmap refs; frequency can’t live on a deleted row | Plan |
| Concurrency | Atomic RPC; not-in-stock + refetch | Prevents double event / negative qty | Plan |
| RPC return | Composite `{ deleted, item? }` — not NULL `stock_items` | Avoids supabase-js null-as-row footgun vs add cast | Plan review |
| Failure UX | Inline error + Retry (retryable); no optimistic qty | Matches confirm-sheet hard-fail pattern | Plan |
| Scope cut | No undo, bulk, swipe, soft-delete, consume-scan | Keeps slice to FR-004 + FR-009 + Consume chrome | Plan |

## Scope

**In scope:** Events migration; DELETE grant/policy; `remove_stock_item_by_barcode` RPC; client service; Consume tab (native+web); list `−` + last-unit confirm + Not in stock / Retry; manual checklist.

**Out of scope:** `−` on Stock; consume-by-scan; “add instead” on miss; FR-010/011; undo; multi-qty remove; swipe; soft-delete; S-04; new test runner; changing add/OFF paths.

## Architecture / Approach

```
Tabs: Stock (browse/add) | Consume (list + −) | Household

Consume list row [ − ]
        │
        ├─ qty === 1? → Alert / window.confirm
        │                 Cancel → stop
        ▼
removeStockByBarcode ──► RPC remove_stock_item_by_barcode
                              │
                              ├─ missing → error (no event)
                              ├─ INSERT stock_utilization_events
                              ├─ qty > 1 → UPDATE quantity - 1
                              └─ qty = 1 → DELETE row
        │
        ├─ success → update/drop local row
        └─ not in stock → message + refetch (no write)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema + RPC | Events table, DELETE policy, atomic remove | Race on last unit; event insert before existence check |
| 2. Client service | `removeStockByBarcode` + not-in-stock mapping | UI conflates network fail vs missing |
| 3. Consume tab + UI | Tab chrome, `−`, confirm, Not in stock | Web/native tab href drift; Stock accidentally gets `−` |

**Prerequisites:** S-01 stock list/add working against Supabase; migration apply access  
**Estimated effort:** ~2 after-hours sessions across 3 phases (tab chrome adds a bit vs list-only)

## Open Risks & Assumptions

- S-04 empty barcodes may need a different event identity later; S-01 rows always have non-empty barcodes.
- DELETE grant enables any member client to delete under RLS — UI should still go through the RPC so events are never skipped.
- Not-in-stock on a list-only Consume surface mainly covers concurrent/stale rows, not “scan unknown barcode” (explicitly out of scope).

## Success Criteria (Summary)

- Consume tab owns all −1 removes; Stock has none
- Empty Consume says “Nothing to consume” with no Scan CTA
- − on qty > 1 decrements + stores event; last unit confirm then delete + event
- Missing row shows Not in stock with no event; list stays consistent after refetch
