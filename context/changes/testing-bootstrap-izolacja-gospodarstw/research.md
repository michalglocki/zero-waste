---
date: 2026-09-08T16:32:59+02:00
researcher: Auto
git_commit: f70de19f9654d1e192daba7b99d0e03cc8521cbe
branch: main
repository: zero-waste
topic: "Ground Phase 1 test-plan risks #1, #2, #5 — household stock isolation / authz"
tags: [research, codebase, rls, stock, household, auth, supabase, jest-expo, test-plan-phase-1]
status: complete
last_updated: 2026-09-08
last_updated_by: Auto
---

# Research: Ground Phase 1 test-plan risks #1, #2, #5 — household stock isolation / authz

**Date**: 2026-09-08T16:32:59+02:00
**Researcher**: Auto
**Git Commit**: f70de19f9654d1e192daba7b99d0e03cc8521cbe
**Branch**: main
**Repository**: zero-waste

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` for risks #1 (cross-household stock leak A↔B), #2 (stock ops without hard household authorization), and #5 (unauthenticated / non-member reaches stock and mutates). Verify risk-response guidance (not blindly accept), ground real failure paths in code, locate existing tests, pick cheapest useful layers, and flag speculative risks or misleading hot-spot evidence. Hot-spot dirs cited as likelihood evidence only: `supabase/migrations/`, `src/`, `workers/api/src/`.

## Summary

All three risks are **real regression / contract risks worth Phase 1 proof**, but they are **not open A↔B or anon holes in today's live code**. Isolation and membership hard-deny live in Postgres (RLS helpers + invoker RPCs). The Expo client never sends `household_id`; list/mutate paths fully trust RLS. UI route gates (`Stack.Protected`) are necessary UX but insufficient proof.

**Response guidance verdict:**
- **#1** — guidance **holds**. Cheapest layer: Supabase DB integration with two households / two authenticated clients. Do not mock RLS.
- **#2** — guidance **needs sharpening**. Membership boundary largely holds; **"UI calls RPC ⇒ DB is safe" is false for product contract** — direct DELETE / unpaired utilization INSERT / qty UPDATE still succeed for a member's own household (accepted trusted-member MVP). Split assertions: (2a) membership deny, (2b) contract bypass — expect deny only after hardening, or document current allow as known state.
- **#5** — guidance **holds**. Auth screen / layout alone is not enough. Primary proof: anon + authenticated-without-membership against stock table/RPCs. Route-gate smoke is secondary.

**Stack:** App test-base is **none** (no jest-expo yet; AGENTS.md forbids adding a runner without a project decision — Phase 1 *is* that decision). Workers Vitest is scaffold-only and **out of budget** for these risks. **`workers/api/src/` is a misleading hot-spot** for #1/#2/#5 (hello-world only).

## Detailed Findings

### Risk #1 — Cross-household stock leak A↔B

**Failure scenario:** Authenticated member of household A reads or mutates stock belonging to household B.

**Grounded path today:** Expo anon-key client → PostgREST → Postgres RLS. Stock RPCs never take `household_id` from the client; they bind via `current_household_id()`. Direct table DML is membership-scoped by policies. **No live A→B exploit found** unless policies regress, RLS is disabled, or a future SECURITY DEFINER stock RPC is added carelessly.

**Schema + helpers**

- `stock_items.household_id` is required and cascades from `households` ([`supabase/migrations/20260907000000_stock_items.sql`](https://github.com/michalglocki/zero-waste/blob/f70de19f9654d1e192daba7b99d0e03cc8521cbe/supabase/migrations/20260907000000_stock_items.sql)).
- One membership per user (`memberships.user_id` PK) in [`20260904000000_households_memberships.sql`](https://github.com/michalglocki/zero-waste/blob/f70de19f9654d1e192daba7b99d0e03cc8521cbe/supabase/migrations/20260904000000_households_memberships.sql).
- Helpers (SECURITY DEFINER, `auth.uid()`-bound):

```58:86:supabase/migrations/20260904000000_households_memberships.sql
create or replace function public.current_household_id()
...
security definer
...
  select m.household_id
  from public.memberships m
  where m.user_id = (select auth.uid())
...
create or replace function public.is_household_member(p_household_id uuid)
...
```

**RLS on `stock_items`**

```107:124:supabase/migrations/20260907000000_stock_items.sql
create policy "stock_items_select_member"
  ...
  using (public.is_household_member(household_id));
create policy "stock_items_insert_own_household"
  ...
  with check (household_id = public.current_household_id());
create policy "stock_items_update_member"
  ...
  using (public.is_household_member(household_id))
  with check (household_id = public.current_household_id());
```

DELETE policy + grant: [`20260907210000_stock_remove_utilization.sql:42-48`](https://github.com/michalglocki/zero-waste/blob/f70de19f9654d1e192daba7b99d0e03cc8521cbe/supabase/migrations/20260907210000_stock_remove_utilization.sql#L42-L48).

**RPCs (all `security invoker`)** resolve household server-side and scope rows, e.g. remove-by-id:

```140:167:supabase/migrations/20260908085225_stock_manual_add_no_barcode.sql
create or replace function public.remove_stock_item_by_id(p_id uuid)
...
  v_household_id uuid := public.current_household_id();
...
  if v_household_id is null then
    raise exception 'not a household member';
  end if;
...
  where id = p_id
    and household_id = v_household_id
```

Same pattern for `add_stock_item_by_barcode`, `add_stock_item_manual_no_barcode`, `remove_stock_item_by_barcode`.

**Client**

- `listStockItems` / `getStockItemByBarcode` / identity update never filter by `household_id` — they rely entirely on RLS ([`src/services/stock.ts:45-74`](https://github.com/michalglocki/zero-waste/blob/f70de19f9654d1e192daba7b99d0e03cc8521cbe/src/services/stock.ts#L45-L74)).
- Add/remove go through RPCs with barcode/id/delta only — no client-chosen household.
- Soft spot (defense-in-depth): if RLS were off, barcode-only updates could collide across households. That is a regression signal for #1 tests, not a current open hole.

**Challenge "logged in ⇒ allowed everywhere":** Correct challenge. Login alone is insufficient; membership row + RLS USING/WITH CHECK decide visibility. Knowing B's invite and joining is intentional access, not a leak while still in A.

**Guidance verification:** Confirmed. Likely cheapest layer remains **integration vs real DB/RLS**. Anti-patterns (mock RLS in client; own-household-only happy path) would miss the failure mode.

**Speculative?** Not speculative as a *regression* risk. Speculative only if phrased as "code today lets A read B."

---

### Risk #2 — Stock ops without hard household authorization

**Failure scenario (as written):** add/remove/list succeed without hard household-membership authorization.

**Grounded split (required correction):**

| Sub-risk | Meaning | Live status |
|----------|---------|-------------|
| **#2a Membership** | Foreign household / no membership can mutate or list foreign stock | **Mitigated** by RLS + RPC `current_household_id()` null → `'not a household member'` |
| **#2b Product contract** | Mutations must go through membership-controlled *RPC path* (remove↔event pairing, qty via add/remove) | **Not enforced in DB** — table GRANTs allow trusted-client bypass for **own** household |

**Challenge "UI calls RPC ⇒ DB is safe":** **Disproved for #2b.** UI does call RPCs (`src/services/stock.ts` add/remove wrappers; Consume → `removeStockById`), but authenticated members still have:

- `GRANT SELECT, INSERT, UPDATE` on `stock_items` ([`20260907000000_stock_items.sql:104-105`](https://github.com/michalglocki/zero-waste/blob/f70de19f9654d1e192daba7b99d0e03cc8521cbe/supabase/migrations/20260907000000_stock_items.sql#L104-L105))
- `GRANT DELETE` on `stock_items` ([`20260907210000_stock_remove_utilization.sql:42`](https://github.com/michalglocki/zero-waste/blob/f70de19f9654d1e192daba7b99d0e03cc8521cbe/supabase/migrations/20260907210000_stock_remove_utilization.sql#L42))
- `GRANT SELECT, INSERT` on `stock_utilization_events` ([same file:23-24](https://github.com/michalglocki/zero-waste/blob/f70de19f9654d1e192daba7b99d0e03cc8521cbe/supabase/migrations/20260907210000_stock_remove_utilization.sql#L23-L24))

Invoker RPCs are **not** a privilege wall — they add validation/atomicity while the same role can DML under RLS.

**Historical confirmation (still live):**

```16:16:context/changes/remove-stock-item/change.md
**Impl-review F1 (accepted):** Member RLS can DELETE `stock_items` without an event and INSERT `stock_utilization_events` without changing stock. ... Trusted-member MVP tradeoff ... harden before relying on S-05...
```

**List vs add/remove auth shape:** List = table SELECT + RLS only (no RPC). Add/remove UI = RPC + invoker RLS, with parallel direct DML still granted. Shared boundary = membership helpers; not shared = RPC-only semantics.

**Guidance verification:**
- Prove membership-controlled path for cross-household / no-membership — **correct**, and code mostly **passes**.
- Prove contract-breaking bypasses fail where contract requires — **correct target**, but **today those bypasses succeed** for own household. Phase 1 must either (i) assert current allow as documented baseline / alarm when grants change, or (ii) exclude #2b harden from Phase 1 and keep it as known debt until S-05. Do **not** treat green UI-RPC unit tests as proof of #2b.
- Anti-pattern "service test with mocked Supabase success" — **confirmed dangerous**; mocks cannot see GRANTs/RLS.

**Cheapest layer:** Same DB integration surface as #1, with extra probes for direct `.delete()` / unpaired event `.insert()` / qty `.update()` as member of H.

---

### Risk #5 — Unauthenticated / non-member reaches stock and mutates

**Failure scenario:** No session, or session without membership, reaches stock UI and/or mutates stock.

**UI gate (necessary, not sufficient):**

```28:48:src/app/_layout.tsx
function RootNavigator() {
  const { session } = useAuth();
  const { membership, isMembershipReady } = useHousehold();
  ...
  <Stack.Protected guard={hasSession && hasMembership}>
    <Stack.Screen name="(app)" />
  </Stack.Protected>
  <Stack.Protected guard={hasSession && !hasMembership && isMembershipReady}>
    <Stack.Screen name="bootstrap-household" />
  </Stack.Protected>
  <Stack.Protected guard={!hasSession}>
    <Stack.Screen name="(auth)" />
  </Stack.Protected>
}
```

- `(app)` / stock screens have **no local** session or membership checks — they trust the root gate.
- Session without membership after retries → `bootstrap-household` only (retry + sign-out; no ensure RPC).
- Normal signup creates household + membership via `handle_new_user` trigger — zero-membership is failure/lag path.

**DB gate (closes the challenge):**

| Caller | Stock SELECT | Table DML | Stock RPCs |
|--------|--------------|-----------|------------|
| anon (no JWT) | No grant | Denied | EXECUTE revoked from `anon` |
| authenticated, no membership | Empty (no row passes member check) | INSERT fails (`household_id = NULL` check); UPDATE/DELETE fail USING | `'not a household member'` |

**Caution:** `listStockItems` for a non-member returns `[]` without throwing — **empty list ≠ authorization proof** if the test only asserts "no error."

**Challenge "auth screen alone is enough":** Correct. Auth-layout snapshots / Protected smoke do not prove PostgREST refuses the publishable anon key or a JWT without membership.

**Guidance verification:** Holds. Primary cheapest layer = **DB integration (anon + non-member)**. Secondary = lightweight Protected truth-table smoke (not snapshot-only). Anti-pattern confirmed.

**Speculative?** Open exploit today: **low**. Regression / must-prove: **yes** (single UI choke point; services have zero local auth).

---

### Existing tests & runner decision

| Area | Finding |
|------|---------|
| App `src/` | **No** `*.test.*` / `*.spec.*` / jest config / `test` script |
| Root `package.json` | Expo `~56.0.5`; scripts: start/android/ios/web/lint/typecheck — **no test** |
| `workers/api/test/index.spec.ts` | Only automated test file — Cloudflare hello-world Vitest |
| Seeds / fixtures | **None** (`seed.sql` absent; `supabase/config.toml` minimal; no db-reset project script) |
| AGENTS.md | Do not add unit/e2e runner without explicit project decision |
| Prior slices | Manual two-user checklists (e.g. F-01); remove-stock trusted-client note |

**Test-base profile:** `none` on the product path.

**Phase 1 stack recommendation:**
1. **Decision:** adopt **jest-expo** as the app runner (official Expo SDK 56 path) so `npm test` exists for later CI — bootstrap only.
2. **Signal for #1/#2/#5:** invest in **Supabase integration** (local or dedicated test project) with real authenticated clients and SQL/service-role seeding of two households. jest-expo unit tests with mocked Supabase **do not** close these risks.
3. Worker Vitest: leave out of product budget (matches test-plan §7).

### Misleading hot-spot evidence

`workers/api/src/` returns a static hello string and never touches stock, households, auth, or Supabase. Citing it as likelihood evidence for #1/#2/#5 overstates Worker relevance. Real surfaces: `supabase/migrations/` (policies, RPCs, grants) and `src/` (client trust of RLS + root `Stack.Protected`).

## Code References

- `supabase/migrations/20260904000000_households_memberships.sql:58-86` — `current_household_id` / `is_household_member`
- `supabase/migrations/20260907000000_stock_items.sql:102-124` — RLS enable, grants, select/insert/update policies
- `supabase/migrations/20260907210000_stock_remove_utilization.sql:21-48` — utilization grants/policies; DELETE grant/policy
- `supabase/migrations/20260907210000_stock_remove_utilization.sql:54-66` — remove-by-barcode RPC membership hard-fail
- `supabase/migrations/20260908085225_stock_manual_add_no_barcode.sql:140-167` — remove-by-id scoped to `v_household_id`
- `src/services/stock.ts:45-55` — list trusts RLS (no `household_id` filter)
- `src/app/_layout.tsx:28-48` — session + membership Protected gates
- `src/app/bootstrap-household.tsx` — no-membership recovery (no stock UI)
- `context/changes/remove-stock-item/change.md:16` — accepted trusted-client DELETE/event bypass
- `context/foundation/prd.md:125-129` — Access Control (shared household, flat member roles)
- `workers/api/src/index.ts` — hello-world only (misleading for these risks)
- `workers/api/test/index.spec.ts` — only existing automated test

## Architecture Insights

1. **Authorization is DB-first.** The mobile app is a thin PostgREST client (anon/publishable key). Product isolation claims must be proven against Postgres with real JWTs, not against React navigation trees.
2. **Two different “authorization” meanings collide in Risk #2.** Membership isolation ≠ RPC-as-only-mutation-contract. Phase 1 plans must name which assertion they make.
3. **Invoker RPC + table GRANT** is an intentional MVP pattern (add and remove slices). Tests that only exercise the happy RPC path will never see the trusted-client surface.
4. **Fixture shape that covers #1 + #2a + #5 in one harness:**
   - `user_A` / `user_B` with distinct households; seed stock in both (same barcode OK).
   - As A: assert no read/mutate of B; RPCs affect A only; `remove_stock_item_by_id(B_id)` → not found.
   - Anon client: table + RPC denied.
   - Authenticated user with membership row removed: RPC raises `not a household member`; SELECT empty; INSERT rejected.
   - Optional #2b probe: as A, direct DELETE and unpaired event INSERT — document expected allow until harden.
5. **Negative control for #1:** after A joins B via invite, A *can* see B stock — proves membership gate, not a leak.

## Historical Context (from prior changes)

- `context/changes/remove-stock-item/change.md` — F1 accepted: trusted-member can bypass remove↔event pairing via direct table DML; harden before S-05.
- `context/changes/minimal-household-auth/` (and related F-01 plans) — RLS helpers, signup trigger, manual two-user verification; no automated runner.
- Stock slices (S-01 add, S-03 remove, manual-add) repeatedly deferred test-runner addition; Phase 1 of the test plan is the first explicit decision point.
- `context/archive/` — README only; live decisions remain under `context/changes/`.

## Related Research

No prior `research.md` artifacts found under `context/changes/**/` or `context/archive/**/` for this topic.

## Open Questions

1. **#2b scope in Phase 1:** Assert current trusted-client *allows* (baseline/alarm), or defer contract-hardening assertions to a later security slice and keep Phase 1 focused on #2a membership denies?
2. **Test DB target:** Local `supabase start` + migrations vs hosted branch/project — no committed seed/reset workflow exists yet; plan must choose and add fixtures.
3. **jest-expo vs pure Node integration runner:** Isolation tests need authenticated Supabase clients and do not need RN rendering. Options: (a) jest-expo preset hosting Node-friendly integration files, (b) separate small Node/vitest suite for DB only + jest-expo later for units. Cost × signal favors whatever lands fastest with one `npm test` entrypoint without pulling Worker Vitest into the product path.
4. **Backport to test-plan §2:** Should Source/response rows drop `workers/api/src/` for these risks and split Risk #2 wording into membership vs contract? (See handoff note below.)
