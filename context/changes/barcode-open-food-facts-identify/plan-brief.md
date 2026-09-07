# Barcode Open Food Facts Identify — Plan Brief

> Full plan: `context/changes/barcode-open-food-facts-identify/plan.md`

## What & Why

After a scan, look up the barcode in Open Food Facts and store optional name, main category, auxiliary category, and pack-size text when present — without blocking aisle quantity add when data is missing (US-02 / FR-006–008).

## Starting Point

S-01 delivers scan → confirm → qty RPC upsert. Identity columns exist but stay null; list labels by barcode; no OFF client. Qty RPC writes quantity only; RLS already allows member UPDATE.

## Desired End State

Confirm shows DB identity when known (else cache/OFF preview). Confirm never waits on OFF. After delta≥1 Confirm, background enrich applies **only changed** fields. 30-minute in-memory cache avoids repeat OFF calls for the same barcode. Search stays barcode-prefix.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Lookup timing | Start on barcode known ∥ confirm; Confirm never waits | Aisle add must not depend on OFF latency | Plan |
| Display | DB-first when identity filled; OFF async to check updates | Instant preview on re-scan | Plan review |
| Cache | In-memory by barcode, TTL 30 min | Multi-unit adds without repeat OFF | Plan review |
| Post-Confirm enrich | Background identity apply after delta≥1 (incl. after unmount) | Fixes Confirm-during-lookup vs sheet unmount | Plan review |
| Overwrite | Diff-only — UPDATE only changed fields; OFF omit does not clear DB | Preserve good household data | Plan review |
| Delta 0 / Cancel | Dismiss only; no identity DB write on Cancel | Matches S-01 qty semantics | Plan review |
| `name` | Device locale language → OFF localized name → EN / any fallbacks | Matches OFF titles without hardcoding English-only | Plan review |
| `main_category` | Free-text from OFF categories (no enum) | Unblocks S-02 without taxonomy project | Plan |
| `auxiliary_category` | Always null in S-02 | Avoid inventing audience heuristics; column kept for later | Plan review |
| Pack size | Nullable free-text `pack_size` (display-only) | Aisle context without UoM math | Plan |
| Lookup path | Expo client → OFF directly | Infra default; no BFF | Plan |
| List / search | Name primary + secondary meta; barcode-prefix search | Recognition without name search | Plan |
| Persist path | Separate identity UPDATE; qty RPC unchanged | Avoid racing qty with catalog fields | Plan |

## Scope

**In scope:** `pack_size` migration; OFF client + mapper + TTL cache; confirm DB-first + background enrich; list row labels; manual checklist.

**Out of scope:** Worker/Edge BFF; Beauty Facts; closed category enums; filling `auxiliary_category`; UoM math; name search/edit; always-wipe on OFF omit; identity write after Cancel; S-03–S-05; new test runner.

## Architecture / Approach

```
Scan / typed barcode
        │
        ▼
StockConfirmSheet ──► cache (30m) ──► open-food-facts.ts ──► OFF
        │                 │
        │            map → preview
        │
        ├─ show DB identity if present
        ├─ Confirm delta≥1 ──► addStockByBarcode (primary)
        │                         │
        │                    background diff UPDATE identity
        └─ Cancel / delta 0 ──► dismiss (cache OK, no identity write)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema + identity write | `pack_size` + diff-only UPDATE helper | Accidental qty coupling / wipe-on-omit |
| 2. OFF client + mapping + cache | Fetch, map, 30m TTL cache | Web UA limits; brittle audience signal |
| 3. Confirm soft enrich | DB-first, background post-Confirm apply | Late-write token vs Cancel race |
| 4. List + verification | Name/secondary UI + checklist | Search accidentally widened to names |

**Prerequisites:** S-01 stock flow working against Supabase; network access to OFF for manual checks  
**Estimated effort:** ~2 after-hours sessions across 4 phases

## Open Risks & Assumptions

- React Native web may not send a custom `User-Agent`; native path is the source of truth for OFF compliance.
- Auxiliary stays null in S-02 by decision (no audience allowlist this slice).
- S-01 may still be finishing manual verification; this plan assumes its schema/RPC contracts hold.

## Success Criteria (Summary)

- Known/enriched barcode: DB name on confirm → Confirm adds qty → list stays correct; unchanged OFF fields not rewritten
- New barcode: Confirm during lookup works; identity may land in background; Cancel does not persist
- Cache hit within 30 min skips repeat OFF; barcode-prefix search unchanged
