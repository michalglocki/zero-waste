---
change_id: testing-bootstrap-izolacja-gospodarstw
title: Bootstrap + izolacja gospodarstw — test rollout Phase 1
status: implementing
created: 2026-09-08
updated: 2026-09-08
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Bootstrap + izolacja gospodarstw".
Risks covered: #1 (cross-household stock leak A↔B), #2 (stock ops without hard household authorization), #5 (unauthenticated / non-member reaches stock and mutates).
Test types planned: runner bootstrap, integration (RLS/auth).
Risk response intent:
- #1: prove authenticated member A cannot read or mutate household B stock; challenge "logged in ⇒ allowed everywhere"; avoid mocking RLS in the client / own-household-only happy path.
- #2: prove stock mutations require a membership-controlled path and contract-breaking bypasses fail where the product contract requires it; challenge "UI calls RPC ⇒ DB is safe"; avoid service tests with mocked Supabase success.
- #5: prove without session/membership there is no stock access or mutation; challenge "auth screen alone is enough"; avoid auth-layout snapshots as the only proof.

Planning decisions (2026-09-08): #2b assert current allow as baseline/alarm; **hosted** Supabase test project + service-role/SQL seed; single jest-expo npm test entrypoint; Protected truth-table secondary; light test-plan §2 fix + §6.2 cookbook on ship.
After planning, follow the downstream continuation rule → `/10x-implement`.

### Phase 2 adaptations (2026-09-08)

**Harness target:** dedicated **hosted** Supabase test project (migrations via `supabase link` + `db push`). Service role remains seed-only; never point at production. Phase 3 unblocks once `.env.test.local` is configured against that project with migrations applied.
