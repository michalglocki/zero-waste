# Manual Add Without Barcode — Plan Brief

> Full plan: `context/changes/manual-add-without-barcode/plan.md`

## What & Why

Household members must add produce/bulk when no barcode exists (FR-005 / S-04). Manual add collects an optional barcode and quantity (no unit); when the code is absent, a name is required so the list stays usable.

## Starting Point

Scan → confirm → `add_stock_item_by_barcode` requires nonempty barcodes. Consume removes by barcode; utilization events reject blank codes. List/search assume a barcode label. S-01 foreshadowed a partial unique index for empty barcodes.

## Desired End State

From Scan, **No barcode?** opens a form: optional barcode, required name when empty, add-delta quantity. Empty barcode → null-barcode row merged by trim+casefold name, searchable by name, consumable by `id` (no utilization event). Typed barcode on the form → existing confirm/OFF path.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Empty barcode cardinality | Many no-code rows | Produce must not collapse into one pile | Plan |
| List identity | Name required when no barcode | Avoid blank `name ?? barcode` rows | Plan |
| Quantity | Add-delta (like scan) | One mental model with confirm sheet | Plan |
| Entry point | Scan + **No barcode?** | Reuse add hub without a second tab CTA | Plan |
| Typed code on form | Hand off to confirm; **discard form name** | Confirm/OFF owns identity; hide name while barcode filled | Plan |
| Add RPC after partial unique | Rewrite `ON CONFLICT … WHERE barcode IS NOT NULL` | Bare conflict target breaks barcode upsert (`42P10`) | Plan review |
| Consume | Remove by `stock_items.id` | Empty barcodes cannot key busy/events | Plan |
| Same name twice | Merge (trim + `lower`, delta) | Fewer accidental dupes among no-code | Plan |
| Search | Barcode **or** name prefix | Produce findable on Stock/Consume | Plan |
| Failure UX | Inline errors + Retry | Matches confirm hard-fail pattern | Plan |
| Utilization | Skip event if barcode null | Preserve S-05 for real codes; no `''` bucket | Plan |
| Storage | `NULL` barcode (not `''`) | Clean partial unique + merge scope | Plan |

## Scope

**In scope:** Nullable barcode + partial unique; no-code add/merge RPC; remove-by-id RPC; services; Consume-by-id; name|barcode search; Scan manual sheet; manual checklist.

**Out of scope:** Units; post-save name editor; OFF for no-code; sentinel barcodes; empty-barcode events; S-05 recommendations; test runner; locale-heavy name normalization.

## Architecture / Approach

```
Scan
 ├─ camera / typed Continue → StockConfirmSheet → add_stock_item_by_barcode (+ OFF)
 └─ No barcode? → ManualAddSheet
       ├─ barcode filled → StockConfirmSheet (same as above)
       └─ barcode empty → add_stock_item_manual_no_barcode (merge by lower(trim(name)))

Consume − → remove_stock_item_by_id
              ├─ barcode present → utilization event + dec/delete
              └─ barcode null → dec/delete only
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema + RPCs | Null barcode, merge add, remove-by-id | Race on name merge without atomic RPC |
| 2. Services + lists | Consume-by-id; name\|barcode search | Missed barcode-keyed busy state |
| 3. Scan UI | No barcode? form + confirm handoff | Two modals open at once |
| 4. Verification | End-to-end checklist | Consume/event regression on barcoded rows |

**Prerequisites:** S-01 stock add + S-03 Consume working against Supabase  
**Estimated effort:** ~2–3 after-hours sessions across 4 phases

## Open Risks & Assumptions

- Name merge uses simple `lower(trim(...))` — acceptable for MVP Latin produce names.
- No-code removes leave no S-05 history (intentional).
- `remove_stock_item_by_barcode` may remain in DB unused by UI after Consume migrates to id.

## Success Criteria (Summary)

- User can add/merge no-code items from Scan and find them by name
- Consume can − no-code rows by id without locking siblings
- Barcoded scan/confirm/OFF and barcoded utilization events still work
