# Stock List, Search & Barcode-Add — Plan Brief

> Full plan: `context/changes/stock-list-search-barcode-add/plan.md`

## What & Why

Ship the north-star aisle loop: a household member opens shared stock, searches it, and adds by barcode so the item appears and can be found again. This is the smallest end-to-end proof that shared inventory is usable while shopping or planning at home (US-01 / FR-001–003).

## Starting Point

F-01 auth and household membership are implemented (session gate, RLS helpers). There is no stock schema, list UI, search, or camera package; `(app)/index` still shows invite/join.

## Desired End State

Stock is the app home: browseable list, barcode-prefix search, and scan (or typed fallback) through a confirm sheet that upserts one row per barcode. Name/category columns exist but stay null until S-02. Invite/join live on a Household tab.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Re-scan identity | Confirm sheet then increment one row | Keeps list clean and supports “you already have N” without an enough-threshold | Plan |
| Qty on add | Delta default +1; +/− and input on confirm only | Aisle speed + manual adjust; list stays read-only until S-03 | Plan |
| Confirm at 0 | No write | Avoid accidental deletes; S-03 owns zero→drop | Plan |
| Search | Case-insensitive barcode **prefix** | Works with empty names; predictable | Plan |
| Empty-name UI | Primary label = full barcode | Honest until OFF fills names | Plan |
| Barcode storage | Text string; trim ends; keep leading zeros | UPC-A and similar must not lose zeros | Plan |
| List sort | `updated_at` desc | Deterministic “just added” visibility | Plan |
| Phase 2 Scan CTA | Disabled/omitted until Phase 3 | Avoid dead links mid-implement | Plan |
| Web chrome | Drop “Expo Starter” branding | Product surface, not starter shell | Plan |
| Post-success | Stay on scanner; list refetches on focus | Fast multi-item stocking + visible updates on return | Plan |
| Navigation | Stock = home; Household tab; delete Explore; web hrefs/Stack in lockstep | Aisle-first; avoid F-01 web +not-found | Plan |
| No camera | Typed barcode fallback | Web/dev/permission still complete US-01 | Plan |
| Concurrency | Unique `(household_id, barcode)` + client upsert under RLS | One row; INSERT/UPDATE (not DELETE) with explicit grants — unlike memberships | Plan |
| Save failure | Stay on confirm + Retry | Don’t lose the scanned code | Plan |
| Schema | Nullable name/categories now | S-02 updates in place | Plan |
| Verification | lint + typecheck + manual script | Matches F-01 / AGENTS.md | Plan |

## Scope

**In scope:** `stock_items` + RLS; list/search/upsert service; stock home; Household tab; `expo-camera` scan; confirm sheet; typed fallback; manual checklist.

**Out of scope:** Open Food Facts (S-02); remove/utilization (S-03); full manual-add (S-04); recommendations (S-05); Worker BFF; test runner; list-row qty edit; pull-to-refresh polish.

## Architecture / Approach

```
Stock UI ──► services/stock ──► Supabase Postgres + RLS
                │                    │
         add delta upsert        stock_items
         list / prefix search   UNIQUE (household_id, barcode)
                                SELECT/INSERT/UPDATE grants
                │
         expo-camera CameraView
         + typed fallback ──► confirm sheet (delta) ──► upsert
```

F-01 `current_household_id()` / `is_household_member` scope every row. No Worker on this path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema + service | Table, RLS, list/search/add APIs | Weak RLS or non-atomic increment → duplicates |
| 2. Stock home + nav | List, prefix search, Household tab | Invite buried or Explore left as product tab |
| 3. Scan → confirm → upsert | Camera, typed fallback, confirm UX | Permission/web gaps; scan spam without pause |
| 4. Manual verification | Checklist + two-member share check | Camera path untested if only web used |

**Prerequisites:** F-01 working against Supabase (`.env.local`); device or emulator for camera (typed fallback otherwise)
**Estimated effort:** ~2–3 after-hours sessions across 4 phases

## Open Risks & Assumptions

- `expo-camera` may require a dev build / physical device; web demos rely on typed fallback.
- Concurrent increments can drop a delta if upsert overwrites absolute qty — implement `quantity = quantity + delta` under the unique key.
- S-04 empty barcodes will need a partial unique index; S-01 always stores non-empty codes.
- Roadmap handoff still said “wait for F-01”; F-01 is implemented — planning proceeded.
- Stock client INSERT/UPDATE is intentional vs F-01 membership SELECT-only (documented in plan Phase 1).

## Success Criteria (Summary)

- User can view stock, prefix-search a barcode, and add via scan or typed fallback
- Re-scan increases the same row after confirm; delta 0 writes nothing
- Second household member sees the same shared list; lint + typecheck pass
