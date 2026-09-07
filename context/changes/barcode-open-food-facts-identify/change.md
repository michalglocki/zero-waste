---
change_id: barcode-open-food-facts-identify
title: Identify scanned products via Open Food Facts
status: implemented
created: 2026-09-07
updated: 2026-09-07
archived_at: null
---

## Notes

Roadmap S-02. After S-01 barcode-add, look up each scanned code in Open Food Facts from the Expo client, preview identity on the confirm sheet, and persist name / main_category / optional auxiliary_category / pack_size when present — without blocking quantity add (FR-006–008, US-02).

Decisions from `/10x-plan` + plan-review triage: DB-first display when identity filled; in-memory OFF cache TTL 30 min; Confirm never waits — qty write primary; background diff-only identity apply after delta≥1 Confirm (incl. after unmount); Cancel/delta 0 = no identity DB write (cache OK); pack_size free-text display column; main_category free-text; `auxiliary_category` always null in S-02; name locale via device `Intl` language subtag fallback `en`; list name + secondary; search barcode-prefix; no Worker BFF; qty RPC unchanged.
