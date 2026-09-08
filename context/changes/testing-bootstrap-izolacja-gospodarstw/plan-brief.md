# Bootstrap + izolacja gospodarstw — Plan Brief

> Full plan: `context/changes/testing-bootstrap-izolacja-gospodarstw/plan.md`
> Research: `context/changes/testing-bootstrap-izolacja-gospodarstw/research.md`

## What & Why

Stand up the first app test runner and prove that household stock isolation and authz hold where it matters — Postgres RLS / grants / RPCs — for risks #1, #2, and #5. UI route gates and mocked services are not enough; the product client never sends `household_id` and trusts the DB.

## Starting Point

No app `npm test` / jest config. Authz is DB-first (RLS + invoker RPCs). #2a membership deny holds; #2b trusted-client direct DELETE / unpaired event INSERT still allowed (accepted MVP debt). Worker Vitest exists but is out of budget; `workers/api` does not touch stock.

## Desired End State

`npm test` via jest-expo; **hosted** Supabase test-project fixtures (2 households / 2 users + anon + non-member); automated A≠B / membership / anon proofs; #2b allow encoded as baseline/alarm; Protected truth-table; test-plan §6.2 filled and §2 lightly corrected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| #2b in Phase 1 | Assert current **allow** as baseline/alarm | Makes trusted-client debt visible without hardening scope | Plan |
| Test DB | Dedicated **hosted** Supabase test project + migrations (`db push`) | Real JWTs/RLS without a local DB stack | Phase 2 adaptation |
| Runner | Single jest-expo `npm test` hosting DB suites | Official Expo SDK 56 path; one CI entrypoint later | Research / Plan |
| #5 secondary | Protected boolean truth-table | Challenges auth-screen-alone without snapshot anti-pattern | Plan |
| Fixtures | Service-role/SQL seed; user JWTs for asserts | Deterministic; never confuse seed privilege with product authz | Plan |
| test-plan write-back | §6.2 + §6.6 + light §2 (#2a/#2b, drop Worker cite) | Prevents next phases repeating collapsed #2 / misleading hot-spot | Research / Plan |

## Scope

**In scope:** jest-expo bootstrap; AGENTS decision; local fixture harness; DB tests for #1/#2a/#5; #2b baseline allow probes; route-gate truth-table; §6.2/§6.6 + light §2.

**Out of scope:** #2b harden; hosted test DB / CI job; Worker tests; quantity/OFF/shared-list risks; e2e; mocking RLS as proof.

## Architecture / Approach

```
jest-expo (npm test)
    ├── smoke (runner only)
    ├── route-gate truth-table (session × membership)
    └── integration (needs hosted test Supabase)
            ├── seed: service role / SQL → H_A, H_B, stock, non-member
            └── assert: anon | JWT_A | JWT_B | JWT_non_member
                    → #1 A≠B | #2a membership deny | #5 anon/non-member
                    → #2b own-household direct DML still allowed
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Runner bootstrap | jest-expo + AGENTS + smoke | Agents still blocked / dual runners |
| 2. Fixture harness | Hosted test DB seed + JWT clients | False green if DB down; service role leaks into asserts |
| 3. DB isolation suite | #1 + #2a + #5 primary proofs | Empty list mistaken for authz; own-household-only fixtures |
| 4. #2b + route-gate | Baseline allow + Protected table | Misreading allow as eternal desire; snapshot creep |
| 5. Cookbook + §2 | §6.2 patterns + risk-map fix | Leaving TBD cookbook after shipping |

**Prerequisites:** Hosted Supabase test project + CLI `link`/`db push` for migrations; Expo SDK 56 project as today  
**Estimated effort:** ~2–3 sessions across 5 phases

## Open Risks & Assumptions

- Dedicated test project must not be production; seed/teardown mutates auth users and stock.
- #2b allow tests will fail when harden ships — that failure is the desired alarm, then rewrite expects.
- Optional “join B via invite ⇒ can see B” negative control may be deferred if invite fixture cost is high.

## Success Criteria (Summary)

- A cannot read/mutate B stock at the DB; anon/non-member cannot mutate stock
- `npm test` is the single app entrypoint; §6.2 documents the fixture pattern
- #2b trusted-client allow is explicit baseline, not confused with #2a deny
