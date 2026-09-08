# Likely-Empty Recommendations — Plan Brief

> Full plan: `context/changes/likely-empty-recommendations/plan.md`

## What & Why

Household members need a separate list of products that look almost empty: quantity 1 and time since last removal ≥ that product’s average removal interval (US-03, FR-010, FR-011), with an Ignore control so a nudge can stay quiet until the next add or remove.

## Starting Point

S-03 stores barcode-only `stock_utilization_events` and hard-deletes stock at qty 0; S-04 no-code removes write no events. No frequency columns, ignore flag, or Recommendations UI exist. Tabs are Stock | Consume | Household.

## Desired End State

A **Recommendations** tab lists overdue qty-1 rows (barcode and no-code) once ≥2 removals exist. Frequency lives on live `stock_items` and is recomputed inside add/remove RPCs (including re-add after hard-delete). Ignore hides a product until the next add/remove; no un-ignore UI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Frequency storage | Columns on `stock_items` + recompute from events on remove and re-add | Matches FR-010 “on the stock element” while surviving hard-delete via events | Plan |
| Util backfill | One-shot in same migration for all live rows | Existing S-03 event history lights up Recommendations without waiting for new activity | Plan review F1 |
| “Async” | Same-transaction recompute in add/remove RPCs | Guarantees pairing without Worker/cron or a second aisle round-trip | Plan |
| Min history | ≥2 removals (one interval) | Earliest useful signal per roadmap cold-start unknown | Plan |
| Overdue compare | Elapsed **≥** average | Slightly earlier nudge (explicit divergence from PRD “greater than”) | Plan |
| No-code | Events via `name_key = lower(trim(name))` XOR barcode | Closes S-04 event hole; matches no-code uniqueness | Plan |
| Surface | Fourth tab | Discoverable “separate section”; mirrors Consume lockstep | Plan |
| Row actions | Read-only + **Ignore** (no −) | FR-011 list plus mute without duplicating Consume | Plan |
| Ignore lifetime | Until next add or remove | Soft mute that resets when stock activity changes | Plan |
| Ignore identity | Barcode else normalized name | Same key as events / stock merge | Plan |
| List / ignore API | `security invoker` RPCs (not PostgREST overdue filter) | Overdue math needs DB `now()`; PostgREST cannot express it | Plan review F2 |
| RLS harden | Defer | Trusted-member MVP; unpaired events remain a known debt | Plan |

## Scope

**In scope:** Event XOR identity; util + ignore columns; recompute helper; four RPC hooks; client list/ignore; Recommendations tab (native+web); Ignore; manual + integration checks.

**Out of scope:** True background jobs; un-ignore UI; − on Recommendations; RLS harden; soft-delete; prediction beyond removal intervals; e2e suite.

## Architecture / Approach

```
remove/add RPCs
  → insert event (barcode | name_key)
  → if row survives / on re-add: clear ignore + recompute util_* from events

Recommendations tab
  → list where qty=1 ∧ count≥2 ∧ elapsed ≥ avg ∧ not ignored
  → Ignore sets recommendation_ignored_at
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema + RPCs | XOR events, util/ignore columns, backfill + recompute in four RPCs | Missed by-id vs by-barcode path; re-add without recompute; incomplete backfill |
| 2. Client API | Types, list + ignore RPCs (DB `now()`), client wrappers | Missing RPC → device-clock filter footgun |
| 3. Recommendations UI | Fourth tab, Ignore, empties, checklist | Native/web tab drift; Scan CTA leaking onto empty state |

**Prerequisites:** S-03 remove/events and S-04 no-code add/remove applied; migration access; integration env for `npm run test:integration`  
**Estimated effort:** ~2–3 after-hours sessions across 3 phases

## Open Risks & Assumptions

- Inclusive ≥ diverges from PRD wording until foundation docs are updated in a later edit.
- Unpaired utilization inserts can still skew averages until a harden change.
- No-code rename (if added later) orphans old `name_key` events.
- Test-plan “harden pre–S-05” language is superseded by this plan’s deferral.

## Success Criteria (Summary)

- Overdue qty-1 products (barcode and no-code) appear on Recommendations after enough history
- Ignore hides until next add/remove; frequency stays correct across delete/re-add
- Stock/Consume unchanged in role (browse/add vs −); Recommendations is read-only + Ignore
