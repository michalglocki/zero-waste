# Bootstrap + izolacja gospodarstw — Implementation Plan

## Overview

Adopt **jest-expo** as the app test runner (explicit AGENTS.md project decision) and prove test-plan risks **#1**, **#2a/#2b**, and **#5** against a **hosted Supabase test project** with real JWTs — two households, anon, and authenticated-without-membership — without mocking RLS or treating auth-layout snapshots as proof.

## Current State Analysis

- App test base is **none**: no `npm test`, no jest config, no `*.test.*` under `src/` (`research.md` Existing tests).
- Product authz is **DB-first**: Expo anon client → PostgREST → RLS helpers (`current_household_id` / `is_household_member`) and invoker stock RPCs. Client list/mutate never sends `household_id` (`src/services/stock.ts`).
- **#2 splits**: membership deny (#2a) holds; trusted-client table GRANTs still allow own-household direct DELETE / unpaired utilization INSERT (#2b) — accepted MVP debt (`remove-stock-item` F1).
- UI route gates in `src/app/_layout.tsx` (`Stack.Protected`) are necessary UX, insufficient isolation proof.
- `workers/api/src/` is hello-world only — misleading hot-spot for these risks; Worker Vitest stays out of budget.
- No committed seed/reset workflow; `.env.example` forbids service role in Expo public env.

## Desired End State

- `npm test` runs via **jest-expo** (Expo SDK 56 official path; docs checked **2026-09-08**).
- Hosted Supabase **test** project + migrations + service-role/SQL fixtures seed two households / two users (+ anon and non-member cases). Assertions use **user JWTs / anon key only**.
- Automated proofs: A cannot read/mutate B stock; foreign/no-membership deny; anon and authenticated-without-membership cannot access/mutate stock at DB; #2b direct bypasses **still succeed** (documented baseline/alarm).
- Secondary: Protected session×membership → screen-family truth-table (no layout snapshots).
- `context/foundation/test-plan.md` §6.2 (+ §6.6) filled; §2 lightly corrected (#2a/#2b split; drop Worker hot-spot for these risks).

### Key Discoveries:

- Stock RLS + grants: `supabase/migrations/20260907000000_stock_items.sql` (select/insert/update); DELETE + utilization: `20260907210000_stock_remove_utilization.sql`
- RPCs bind household server-side: e.g. `remove_stock_item_by_id` in `20260908085225_stock_manual_add_no_barcode.sql`
- List trusts RLS only: `src/services/stock.ts` (no `household_id` filter)
- Root gates: `src/app/_layout.tsx` — `(app)` / `bootstrap-household` / `(auth)`
- Non-member `list` → `[]` without throw — **empty list ≠ authorization proof** (`research.md` Risk #5)

## What We're NOT Doing

- Hardening #2b (revoking table DML / forcing RPC-only) — that is a later security slice (pre–S-05), not this test phase
- Hosted Supabase CI test job (test-plan §3 Phase 4) — a dedicated hosted *test* project is the Phase 2+ harness target; CI job remains deferred
- Worker Vitest / any `workers/api` product tests (test-plan §7)
- Quantity/add/remove correctness (#3), shared-list (#4), OFF miss (#7), e2e/Maestro
- Mocking Supabase success in service unit tests as “proof” of authz
- Auth-layout / chrome snapshots as sole #5 proof
- Live Open Food Facts or camera e2e

## Implementation Approach

Order by **cost × signal** and risk priority:

1. Unlock a single app entrypoint (`jest-expo`) so later phases and CI have somewhere to land.
2. Build the cheapest high-signal harness: hosted test DB + fixtures (enabler for all isolation proofs).
3. Spend almost all assertion budget on **real PostgREST/RLS** for #1, #2a, #5.
4. Encode #2b **allow** as an explicit baseline/alarm so grant drift is visible.
5. Add a cheap Protected truth-table as secondary #5 coverage.
6. Write cookbook patterns back into the frozen strategy doc’s §6 (and a light §2 fix).

All DB assertions ground in `research.md`; challenge happy-path-only and “UI calls RPC ⇒ DB is safe.”

## Critical Implementation Details

**Harness lifecycle:** Integration suites must require a reachable hosted test Supabase with migrations applied. Fail fast with a clear skip/error if URL/keys/DB are missing — do not silently pass.

**Privilege split:** Service-role (or SQL as postgres) is **seed-only**, never used for assertion clients, and never placed in `EXPO_PUBLIC_*`. Assertion clients: anon key without session, and authenticated JWTs for user A / user B / non-member.

**#5 empty-list trap:** For authenticated-without-membership, asserting `data === []` alone is insufficient — also prove INSERT/UPDATE/DELETE/RPC mutation paths fail (research: INSERT fails null household check; RPCs raise `not a household member`).

---

## Phase 1: Runner bootstrap (jest-expo)

### Overview

Make the **explicit project decision** to add an app test runner: install and wire **jest-expo** per Expo SDK 56 docs, add `npm test`, update AGENTS.md so agents stop treating “no runner” as a hard block, and land a minimal smoke test that proves the runner works — **not** a stock/RLS mock.

### Test sub-phase contract

| Field | Content |
|-------|---------|
| **Behavior asserted** | `npm test` discovers and runs at least one jest-expo test successfully |
| **Regression caught** | Missing/broken runner config; agents adding ad-hoc second runners without a shared entrypoint |
| **Research source** | `research.md` — Existing tests & runner decision; test-plan §4 (jest-expo planned) |
| **Edge / error / boundary** | Prefer non-watch CI-friendly `jest` script (docs often show `--watchAll` — use a non-watch default for agents/CI); keep Worker Vitest untouched |
| **Anti-pattern avoided** | Mocking Supabase/RLS in a “unit” smoke and calling it isolation coverage; pulling Worker Vitest into the product path |

### Changes Required:

#### 1. jest-expo install + config

**File**: `package.json` (and jest config location of implementer’s choice: `package.json#jest` or `jest.config.*`)

**Intent**: Add jest-expo + jest (+ types as needed) via `npx expo install` so versions match Expo SDK 56; expose `test` script; preset `jest-expo`.

**Contract**: Root `npm test` runs Jest with `jest-expo` preset. Docs grounding: https://docs.expo.dev/develop/unit-testing/ (checked **2026-09-08**). Do not adopt Worker Vitest.

#### 2. AGENTS.md runner decision

**File**: `AGENTS.md`

**Intent**: Replace “do not add a runner without an explicit project decision” with the decision that **jest-expo** is the app runner and `npm test` is the entrypoint; note DB integration tests may live under the same entrypoint.

**Contract**: Build/test section no longer forbids adding the runner; documents jest-expo as chosen.

#### 3. Runner smoke test

**File**: new minimal test file under an agreed app test root (e.g. `__tests__/` or `src/**`)

**Intent**: Prove discovery + green run without exercising stock, households, or mocked PostgREST.

**Contract**: One trivial assertion (pure function or `expect(true)`-class smoke). No Supabase mocks. No snapshots of Expo chrome.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 with jest-expo discovering the smoke test
- `npm run typecheck` and `npm run lint` still pass
- No new test scripts under `workers/api` for this phase

#### Manual Verification:

- Confirm AGENTS.md reads as an explicit “jest-expo is the app runner” decision for future agents

**Implementation Note**: After automated verification passes, pause for human confirmation of the AGENTS wording before Phase 2.

---

## Phase 2: Local Supabase fixture harness

### Overview

Provide a repeatable **hosted test** DB target and seed shape: two users, two households, stock in both (same barcode OK), plus ability to run as anon and as authenticated-without-membership. Seed with service-role/SQL; expose only user/anon clients to tests.

### Test sub-phase contract

| Field | Content |
|-------|---------|
| **Behavior asserted** | Fixture setup yields distinct households H_A / H_B with stock rows; clients can authenticate as A and B; non-member and anon clients are constructible |
| **Regression caught** | Tests that accidentally share one household; seeds that omit cross-household rows (making #1 unfalsifiable) |
| **Research source** | `research.md` Architecture Insight 4 (fixture shape); Open Question 2 → hosted test project (Phase 2 adaptation) |
| **Edge / error / boundary** | Membership row removed (or never created) for non-member case; service role never used in expect(); env keys for test URL/anon/service role are gitignored |
| **Anti-pattern avoided** | Seeding via mocked client “success”; own-household-only fixtures; putting service role in `EXPO_PUBLIC_*`; pointing harness at production |

### Changes Required:

#### 1. Local DB workflow docs/scripts

**File**: test harness docs and/or `package.json` / `scripts/` helper (implementer chooses minimal surface)

**Intent**: Document (and optionally script) hosted test project + apply migrations (`supabase link` / `db push`) as the prerequisite for integration tests.

**Contract**: A developer can target a dedicated hosted Supabase matching `supabase/migrations/` before running integration suites.

#### 2. Seed module (service-role / SQL)

**File**: new test-support module (e.g. under `__tests__/support/` or `tests/integration/support/`)

**Intent**: Create users A/B, memberships into distinct households, stock rows in both; support tearing down or resetting between runs; create/obtain a user with session but no membership.

**Contract**: Seed uses service role or SQL. Returns identifiers (user ids, household ids, stock ids, barcodes) for assertions. Does not assert product behavior itself.

#### 3. Assertion clients factory

**File**: same support area

**Intent**: Build Supabase JS clients: anon (no session), user A JWT, user B JWT, non-member JWT — using test URL + anon key.

**Contract**: Factories never silently fall back to service role for “convenience” reads during expects.

#### 4. Env example for tests (not Expo public)

**File**: `.env.example` and/or a test-only example (e.g. `.env.test.example`)

**Intent**: Document test URL, anon key, and **service role for seed only** — reinforcing that service role must not enter the Expo app env.

**Contract**: Clear naming split from `EXPO_PUBLIC_*`. No real secrets committed.

### Success Criteria:

#### Automated Verification:

- Harness module typechecks; a harness self-check test (or scripted step) can seed and authenticate A/B against the hosted test DB when configured
- Integration suite fails clearly when Supabase is down (no false green)

#### Manual Verification:

- Developer follows documented steps once: prepare hosted test project, apply migrations, run harness self-check successfully

**Implementation Note**: Pause for human confirmation that hosted test Supabase + seed works before Phase 3.

---

## Phase 3: DB isolation suite (#1, #2a, #5 primary)

### Overview

Highest-signal phase: against the real DB, prove cross-household isolation, membership hard-deny, and unauthenticated / non-member denial for stock table + RPCs. Challenge “logged in ⇒ allowed everywhere” and “empty list ⇒ authorized.”

### Test sub-phase contract

| Field | Content |
|-------|---------|
| **Behavior asserted** | (1) Member A cannot SELECT/UPDATE/DELETE B’s `stock_items` nor mutate B via stock RPCs; A’s RPC with B’s id is not-found / no-op on B. (2a) No-membership and foreign-household paths cannot list/mutate others’ stock; RPCs raise membership failure where applicable. (5) Anon cannot SELECT/DML/EXECUTE stock paths; authenticated-without-membership cannot mutate and does not gain rows via SELECT |
| **Regression caught** | RLS disabled; policy USING/WITH CHECK widened; SECURITY DEFINER stock RPC that trusts client `household_id`; GRANT to `anon`; membership helper broken |
| **Research source** | `research.md` Risk #1, #2a, #5; Code References (policies, RPCs, `stock.ts`, grants) |
| **Edge / error / boundary** | Same barcode in A and B — A’s barcode ops must not touch B’s row; `remove_stock_item_by_id(B_id)` as A; non-member SELECT `[]` **plus** failed INSERT/RPC; optional negative control note: after joining B, A *can* see B (membership gate, not leak) — implement if cheap, else document as manual/follow-up |
| **Anti-pattern avoided** | Mock RLS in client; own-household-only happy path; service test with mocked Supabase success; treating non-member empty list alone as #5 pass; route-gate as substitute for DB proof |

### Changes Required:

#### 1. Cross-household isolation tests (#1)

**File**: new integration test module(s) under the jest-expo tree

**Intent**: As authenticated A, assert no read of B stock; no successful UPDATE/DELETE of B rows; RPC add/remove scoped to A only.

**Contract**: Uses fixture H_A/H_B. Assertions via user JWT clients only. Covers at least: SELECT visibility, one table mutate attempt on B’s row, one RPC path with B’s id or shared barcode that must leave B unchanged.

#### 2. Membership deny tests (#2a)

**File**: same or sibling integration module

**Intent**: Prove foreign / no-membership cannot pass the membership boundary for list/mutate.

**Contract**: Distinct from #2b (do not require RPC-only). Include RPC hard-fail message/path for null `current_household_id()` where research specifies (`not a household member`).

#### 3. Anon + non-member DB tests (#5 primary)

**File**: same suite family

**Intent**: Anon key without JWT and authenticated-without-membership cannot access/mutate stock at DB.

**Contract**: Anon: denied SELECT/DML/RPC execute as applicable. Non-member: SELECT empty is allowed only as a *symptom* — pair with failed mutation/RPC. No UI involvement.

### Success Criteria:

#### Automated Verification:

- Isolation suite passes against hosted test Supabase with fixtures
- Suite fails if run with only one household seeded (spot-check or structural fixture assert)
- `npm test` still runs smoke + integration (integration may be gated by env/name pattern if needed — document how)

#### Manual Verification:

- Spot-check one failing case by temporarily commenting a policy expectation (or reviewing logs) to confirm the suite would catch RLS regression — optional but recommended once

**Implementation Note**: Pause after green isolation suite before encoding #2b allow.

---

## Phase 4: #2b baseline allow + Protected route-gate

### Overview

(1) Encode trusted-client **allow** for own-household direct DELETE and unpaired utilization INSERT as a **baseline/alarm** (not a harden). (2) Add secondary #5 coverage: session×membership → screen-family truth-table for `RootNavigator` guards — no auth-layout snapshots.

### Test sub-phase contract — #2b

| Field | Content |
|-------|---------|
| **Behavior asserted** | Authenticated member of H **can** today: direct `DELETE` on own `stock_items` without going through remove RPC; `INSERT` into `stock_utilization_events` without a paired stock change — under RLS |
| **Regression caught** | Accidental GRANT revocation or policy tighten that flips MVP trusted-client contract without an intentional security slice; also documents that “UI RPC green” never proved #2b |
| **Research source** | `research.md` Risk #2b; `context/changes/remove-stock-item/change.md` F1 accepted |
| **Edge / error / boundary** | Probes are **own household only**; cross-household direct DELETE must still fail (#1). Comment in test: allow is baseline until harden pre–S-05 |
| **Anti-pattern avoided** | Asserting deny for #2b before harden; service mock “RPC success ⇒ DB safe”; treating this allow as eternal product desire without comment |

### Test sub-phase contract — route-gate (#5 secondary)

| Field | Content |
|-------|---------|
| **Behavior asserted** | Given `(hasSession, hasMembership, isMembershipReady)` combinations, the Protected guards map to `(app)` / `bootstrap-household` / `(auth)` as in `src/app/_layout.tsx` |
| **Regression caught** | Accidental guard inversion that exposes `(app)` without membership or session |
| **Research source** | `research.md` Risk #5 UI gate; `_layout.tsx:28-48` |
| **Edge / error / boundary** | Session + !membership + !ready must not flash `(app)`; truth-table over boolean inputs, not pixel snapshots |
| **Anti-pattern avoided** | Auth-layout snapshot as sole #5 proof; substituting this for DB anon/non-member tests |

### Changes Required:

#### 1. #2b baseline probes

**File**: integration test module (sibling to Phase 3)

**Intent**: As member A, perform direct DELETE on A’s row and/or unpaired event INSERT; expect **success**; assert B still protected.

**Contract**: Named/documented as trusted-client baseline (alarm when allow flips). Does not change production GRANTs.

#### 2. Protected truth-table

**File**: unit/light test extracting or mirroring guard boolean logic from `RootNavigator`

**Intent**: Prove routing family selection from session/membership flags without rendering full chrome snapshots.

**Contract**: Prefer testing pure guard predicates or a small exported mapping over snapshotting `Stack.Protected` trees. May use RN testing library only if needed — still no layout snapshots.

### Success Criteria:

#### Automated Verification:

- #2b baseline tests pass (allow) on local DB
- Route-gate truth-table passes under `npm test`
- Cross-household deny from Phase 3 still passes alongside #2b allow

#### Manual Verification:

- Read #2b test comments: a future agent understands “allow = known MVP debt,” not “feature forever”

**Implementation Note**: Pause for human skim of #2b wording before cookbook write-back.

---

## Phase 5: Cookbook §6.2 + light §2 fix

### Overview

Close the rollout phase by teaching future agents how to add isolation/RLS integration tests (§6.2, §6.6 notes) and lightly correcting §2 so Risk #2 is split and `workers/api/src/` is not cited as likelihood evidence for #1/#2/#5.

### Test sub-phase contract

| Field | Content |
|-------|---------|
| **Behavior asserted** | A new contributor can follow §6.2 to add an isolation regression without reinventing fixtures or mocking RLS |
| **Regression caught** | Process regression: next phase copies Worker hot-spot or collapses #2a/#2b again |
| **Research source** | `research.md` Misleading hot-spot; Open Question 4; test-plan §6 placeholders |
| **Edge / error / boundary** | Edit only §2 rows/guidance for these risks + §6.2/§6.6 — do not rewrite entire §1–§5 (that is `--refresh`) |
| **Anti-pattern avoided** | Leaving cookbook TBD after shipping the harness; full strategy rewrite disguised as Phase 1 |

### Changes Required:

#### 1. Fill §6.2 (+ §6.6)

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.2 TBD with the fixture pattern, assertion-client rules, hosted test Supabase prerequisite, and anti-patterns. Append 2–3 lines to §6.6 (surprises: empty list ≠ authz; #2b baseline allow; Worker hot-spot misleading).

**Contract**: §6.2 describes how to add an integration test in *this* repo. §6.1/§6.3–§6.5 remain TBD for later phases.

#### 2. Light §2 correction

**File**: `context/foundation/test-plan.md` §2

**Intent**: Split Risk #2 wording / response guidance into **#2a membership** vs **#2b product-contract/trusted-client**; remove or qualify `workers/api/src/` as hot-spot evidence for #1/#2/#5.

**Contract**: Strategy tables stay coherent; bump “Last updated” / freshness ledger dates. Do not change phase table goals except Status for Phase 1 when appropriate (orchestrator may also flip status later).

#### 3. Mark rollout phase artifacts complete in change notes

**File**: `context/changes/testing-bootstrap-izolacja-gospodarstw/change.md` (notes only as needed)

**Intent**: Record that cookbook write-back landed with the suite.

**Contract**: No archive yet — archive is a separate skill after implement completes.

### Success Criteria:

#### Automated Verification:

- Markdown files exist and §6.2 is no longer “TBD — see §3 Phase 1”
- Full `npm test` still green

#### Manual Verification:

- Skim §6.2: another agent could add a cross-household case without reading this entire plan
- Confirm §2 no longer implies Worker relevance for isolation risks

**Implementation Note**: After this phase, suggest marking test-plan §3 Phase 1 complete via `/10x-test-plan` state machine (or manual status edit if orchestrating by hand).

---

## Testing Strategy

### Unit Tests:

- Runner smoke (Phase 1)
- Protected guard truth-table (Phase 4) — boolean mapping only

### Integration Tests:

- Fixture harness self-check (Phase 2)
- #1 cross-household read/mutate/RPC (Phase 3)
- #2a membership deny (Phase 3)
- #5 anon + non-member DB (Phase 3)
- #2b trusted-client baseline allow (Phase 4)

### Manual Testing Steps:

1. Hosted test project + migrations; run `npm test` / `npm run test:integration` with credentials configured
2. Confirm AGENTS.md and §6.2 match what was implemented
3. Optional: break one RLS policy locally and confirm #1 tests fail

## Performance Considerations

Keep fixture seed minimal (two users, few stock rows). Prefer suite setup/teardown over heavy dumps. No load testing in this phase.

## Migration Notes

No production schema migrations required for the happy path. If tests need a helper view/function, prefer test-only SQL applied in the harness — do not weaken RLS in production migrations to make tests easier.

## References

- Related research: `context/changes/testing-bootstrap-izolacja-gospodarstw/research.md`
- Test plan: `context/foundation/test-plan.md` (§3 Phase 1, §4, §6.2)
- Trusted-client debt: `context/changes/remove-stock-item/change.md` (F1)
- Expo unit testing (jest-expo): https://docs.expo.dev/develop/unit-testing/ (checked **2026-09-08**)
- Policies/RPCs: `supabase/migrations/20260904000000_households_memberships.sql`, `20260907000000_stock_items.sql`, `20260907210000_stock_remove_utilization.sql`, `20260908085225_stock_manual_add_no_barcode.sql`
- Client trust RLS: `src/services/stock.ts`
- Route gates: `src/app/_layout.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner bootstrap (jest-expo)

#### Automated

- [x] 1.1 `npm test` exits 0 with jest-expo discovering the smoke test — ad8eca4
- [x] 1.2 `npm run typecheck` and `npm run lint` still pass — ad8eca4
- [x] 1.3 No new test scripts under `workers/api` for this phase — ad8eca4

#### Manual

- [x] 1.4 Confirm AGENTS.md reads as an explicit “jest-expo is the app runner” decision for future agents — ad8eca4

### Phase 2: Local Supabase fixture harness

#### Automated

- [x] 2.1 Harness module typechecks; harness self-check can seed and authenticate A/B against local DB when Supabase is up — 36817a9
- [x] 2.2 Integration suite fails clearly when Supabase is down (no false green) — 36817a9

#### Manual

- [x] 2.3 Developer follows documented steps once: start Supabase, apply migrations, run harness self-check successfully — 36817a9

### Phase 3: DB isolation suite (#1, #2a, #5 primary)

#### Automated

- [x] 3.1 Isolation suite passes against hosted test Supabase with fixtures
- [x] 3.2 Suite fails if run with only one household seeded (spot-check or structural fixture assert)
- [x] 3.3 `npm test` still runs smoke + integration (gating documented if used)

#### Manual

- [x] 3.4 Optional spot-check that suite would catch an RLS regression

### Phase 4: #2b baseline allow + Protected route-gate

#### Automated

- [ ] 4.1 #2b baseline tests pass (allow) on local DB
- [ ] 4.2 Route-gate truth-table passes under `npm test`
- [ ] 4.3 Cross-household deny from Phase 3 still passes alongside #2b allow

#### Manual

- [ ] 4.4 Read #2b test comments: future agent understands allow = known MVP debt

### Phase 5: Cookbook §6.2 + light §2 fix

#### Automated

- [ ] 5.1 §6.2 is no longer TBD; §6.6 notes appended
- [ ] 5.2 Full `npm test` still green

#### Manual

- [ ] 5.3 Skim §6.2 usability for a new agent
- [ ] 5.4 Confirm §2 no longer implies Worker relevance for isolation risks
