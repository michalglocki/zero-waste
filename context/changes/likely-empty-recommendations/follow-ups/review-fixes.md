# Review follow-ups — likely-empty-recommendations

From `reviews/impl-review.md` triage.

## F1 — Recompute EXECUTE to authenticated (Fix A)

**Status:** Accepted debt for MVP (no code change in this slice).

**Debt:** `recompute_stock_item_utilization` is `GRANT EXECUTE` to `authenticated`, so PostgREST can call it outside add/remove RPCs. Plan preferred an internal-only helper.

**Later harden (with trusted-member / unpaired-events work):** consider `SECURITY DEFINER` helper owned by a privileged role, `REVOKE` from `authenticated`, call only from add/remove RPCs — after verifying DEFINER ownership/`search_path` patterns for this project.

## F2 — Zero/negative avg always overdue (fixed)

**Status:** Fixed.

**Change:** List RPC requires `util_avg_interval_seconds > 0`.
- Additive: `supabase/migrations/20260909134000_list_recommendations_positive_avg.sql`

**Deploy note:** Apply `20260909134000_…` on the project Supabase instance (CREATE OR REPLACE list RPC).

## F3 — Members can forge util/ignore via PostgREST UPDATE (deferred)

**Status:** Deferred — no code change in this slice.

**Debt:** `util_*` / `recommendation_ignored_at` inherit household-member UPDATE on `stock_items`. Trusted clients can fake eligibility or clear ignore without add/remove/ignore RPCs.

**Later harden (with unpaired-events / trusted-member work):** column privileges, CHECK/trigger, or RPC-only writes for util/ignore fields.

## F4 — Integration test wall sleeps (fixed)

**Status:** Fixed.

**Change:** `__tests__/integration/db-utilization-frequency.test.ts` — `backdateBarcodeEvents` (service role) sets distinct `removed_at` before the next remove; three `setTimeout(1100)` calls removed.

## F5 — No-code rename orphans name_key history (deferred)

**Status:** Deferred — no code change in this slice (already noted in plan Open Risks).

**Debt:** Recompute keys no-code rows by `lower(trim(name))`. Renaming a live no-code item leaves events under the old `name_key`; next recompute can zero util columns.

**Later:** When rename support or harden lands — immutable no-code name, or migrate/rewrite `name_key` events on rename.
