# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-08 (Phase 1 cookbook §6.2 shipped)

## 1. Strategy

Testy w tym projekcie podlegają trzem zasadom:

1. **Cost × signal.** Wygrywa najtańszy test, który daje realny sygnał dla ryzyka. Nie eskaluj do e2e, bo „bezpieczniej”. Nie dokładaj warstwy AI na deterministyczny signal, który już łapie regresję.
2. **User concerns are first-class evidence.** Ryzyka z wywiadu (izolacja gospodarstw, brak autoryzacji przy operacjach, niepewność przy add/remove/list) waży tyle samo co linie PRD i hot-spoty.
3. **Risks are scenarios, not code locations.** This plan documents *what could fail* and *why we believe it's likely* — drawn from documents, interview, and codebase *signal* (churn, structure, test base). It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`. `workers/api/src/` exists in the tree but is **hello-world only** — do **not** treat it as likelihood evidence for isolation / stock authz risks (#1, #2a/#2b, #5); Worker Vitest stays out of the product test path (§7).

## 2. Risk Map

Najważniejsze scenariusze awarii (impact × likelihood). Kolumna Source to **dowód**, nie kotwica pliku.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Członek gospodarstwa A odczytuje lub zmienia stock gospodarstwa B | High | High | interview Q1; PRD Access Control; roadmap F-01/S-01; hot-spot dir `supabase/migrations/` |
| 2a | Operacja stock (add/remove/list) przechodzi bez membershipu / dla obcego gospodarstwa | High | High | interview Q2; PRD Access Control; RLS helpers + invoker RPCs in `supabase/migrations/` |
| 2b | Zaufany członek omija kontrakt produktu (direct DELETE / unpaired utilization INSERT) mimo UI→RPC | High | High | change notes remove-stock F1 (trusted-client MVP debt); table GRANTs on `stock_items` / utilization |
| 3 | Add/remove psuje quantity (zły delta, wiersz znika za wcześnie / zostaje przy 0) — lista kłamie w alei | High | High | interview Q3; PRD FR-003/004/005; hot-spot dir `src/components/stock/`, `src/services/` |
| 4 | Dwóch członków tego samego gospodarstwa nie widzi tego samego stocku po dodaniu | High | Medium | PRD US-01 Success Criteria; roadmap S-01 north star; interview Q3 |
| 5 | Użytkownik bez sesji / bez membershipu wchodzi na stock i mutuje dane | High | Medium | PRD Access Control; roadmap F-01; root `Stack.Protected` is UX only |
| 6 | Manual add / merge po kodzie tworzy duplikaty lub złe połączenie wierszy (pusty kod vs z kodem) | Medium | Medium | PRD FR-005; roadmap S-04; hot-spot dir `supabase/migrations/` |
| 7 | OFF miss blokuje dodanie albo zapisuje śmieciowe pola zamiast pustych opcjonalnych | Medium | Low | PRD FR-006–008 + Non-Goals; roadmap S-02 |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Authenticated member A nie widzi i nie zmienia wierszy B (odczyt i mutacje) | „Jestem zalogowany ⇒ wolno mi wszystko” | Jak operacja wiąże się z `household_id`; fixture dwóch gospodarstw | integration vs DB/RLS | mock RLS w kliencie; happy-path tylko własnego domu |
| #2a | Bez membershipu / dla obcego domu: list/mutate/RPC nie przechodzą (RPC: `not a household member` gdzie dotyczy) | „UI woła RPC ⇒ DB jest bezpieczna” (dla membership) | `current_household_id` / `is_household_member`; RPC null-household path | integration vs DB/RLS | test serwisu z mockiem Supabase „sukces”; empty list alone jako dowód |
| #2b | **Until harden (pre–S-05):** own-household direct DELETE + unpaired utilization INSERT **succeed** (baseline/alarm). After harden: expect deny | „UI woła RPC ⇒ DB jest bezpieczna” (dla product contract) | Table GRANTs vs RPC-only contract; remove-stock F1 | integration baseline (allow) → later deny | asserting deny before harden; rewriting baseline to “fix” green allow |
| #3 | +N zwiększa quantity; −1 zmniejsza; przy 0 wiersz znika; remove zostawia ślad zgodny z FR-009 | Assertowanie aktualnej implementacji jako wyroczni | Kontrakt quantity z PRD/planów; last-unit | unit/integration na reguły + RPC | wyrocznia skopiowana z kodu produkcyjnego |
| #4 | Po add drugi członek tego samego gospodarstwa widzi ten sam wiersz | Refetch w UI = gwarancja współdzielenia | Shared household; list query scoped | integration 2 members / 1 household | pełne e2e apki zamiast wspólnego odczytu |
| #5 | Anon + authenticated-without-membership: brak SELECT/DML/RPC mutate; empty SELECT alone ≠ pass | Sam screen auth wystarczy | Route gate + DB anon/non-member paths | DB integration primary; route-gate truth-table secondary | snapshot layoutu auth; empty list as sole #5 proof |
| #6 | Ręczny add (pusty kod vs z kodem) nie tworzy sprzecznych duplikatów względem reguł unikalności/merge | „Brak barcode = zawsze nowy wiersz” bez sprawdzenia reguł | Reguły unikalności/merge z S-04 | integration na add/merge | UI-only bez asercji stanu trwałego |
| #7 | Brak OFF nie blokuje zapisu; brakujące pola zostają puste | „200 z OFF ⇒ pola zawsze wypełnione” | Mapowanie OFF + FR-008 | unit mapowania + miss path | live e2e do OFF w CI |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap + izolacja gospodarstw | Runner w app + dowód, że A≠B na stock (oraz brak dostępu bez membershipu) | #1, #2a/#2b, #5 | runner bootstrap, integration (RLS/auth) | complete | testing-bootstrap-izolacja-gospodarstw |
| 2 | Mutacje stock (add/remove/quantity) | Dowód poprawnego quantity, last-unit i reguł manual add/merge | #3, #6 | unit + integration | not started | — |
| 3 | Współdzielony list/search | Drugi członek widzi ten sam stock; search nie kłamie o obecności | #4 | integration | not started | — |
| 4 | OFF miss + quality gates | Miss OFF nie blokuje add; floor lint/typecheck/test w CI | #7 | unit mapowania; CI gates | not started | — |

## 4. Stack

Klasyczna baza testów. Wybór runnera dla Expo jest decyzją Phase 1 (AGENTS.md: nie dodawać runnera bez jawnej decyzji). Oficjalna ścieżka Expo SDK 56: **jest-expo** ([docs.expo.dev unit testing](https://docs.expo.dev/develop/unit-testing/), checked 2026-09-08). Worker ma osobny Vitest — poza budżetem produktowym (§7).

| Layer | Tool | Version | Notes |
|----------------------|----------------------------|---------|--------------------------------------|
| unit + integration (app) | jest-expo (planowany) | none yet — see Phase 1 | Oficjalny preset Expo; finalny wybór w research/plan Phase 1 |
| DB / RLS integration | Supabase test DB + authenticated clients (planowany) | none yet — see Phase 1 | Fixtures 2 households / 2 members; bez mockowania RLS w kliencie |
| API mocking | none yet | — | Mockować tylko krawędź HTTP (np. OFF), nie wewnętrzne serwisy |
| e2e (mobile) | none yet | — | Nie w pierwszym rolloutcie; Maestro/Detox tylko jeśli tańsze warstwy nie złapią ryzyka |
| accessibility | none yet | — | Poza top ryzykami MVP |
| (optional) AI-native | none — checked: 2026-09-08 | n/a | Brak Playwright/vision MCP w sesji; nie uzasadnione cost × signal |

**Stack grounding tools (current session):**
- Docs: none (Context7 / framework docs MCP) — użyto host WebSearch → oficjalne docs Expo unit testing; checked: 2026-09-08
- Search: host WebSearch (nie Exa MCP) — discovery Expo SDK 56 testing; checked: 2026-09-08
- Runtime/browser: none (Playwright MCP) — not used; checked: 2026-09-08
- Provider/platform: Linear MCP — issue tracking only, not used for stack advice; checked: 2026-09-08

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|-------------------------------|-------------------|------------------------------|-----------------------------------------------|
| lint + typecheck | local (+ CI after §3 Phase 4) | required | drift składni / typów |
| unit + integration | local + CI | required after §3 Phase 1 | regresje izolacji i logiki stock |
| test job in CI on PR | CI on PR | required after §3 Phase 4 | suite nieodpalone lokalnie |
| pre-prod smoke (manual checklist) | przed store build | optional | env-specific (Supabase project, auth flags) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the relevant rollout phase ships; before that, the sub-section reads "TBD — see §3 Phase \<N\>."

### 6.1 Adding a unit test

TBD — see §3 Phase 2 for quantity/OFF mapping unit patterns.

### 6.2 Adding an integration test

**When:** proving household isolation, membership deny, anon/non-member stock access, or trusted-client baseline against **real** PostgREST/RLS — not mocked Supabase success.

**Entrypoints**

| Command | Runs | Notes |
| ------- | ---- | ----- |
| `npm test` | jest-expo unit/smoke under `__tests__/` | **Excludes** `__tests__/integration/` (Expo fetch polyfill breaks hosted clients) |
| `npm run test:integration` | Node Jest (`jest.integration.config.js`) | Harness + DB isolation; fails clearly if env/DB missing |

Prefer `npm run test:integration` for any new RLS/authz case. Both commands are the product test path; Worker Vitest under `workers/api` is not.

**Prerequisites**

1. Dedicated **hosted** Supabase **test** project (never production).
2. Migrations applied (`npx supabase link` + `npx supabase db push`).
3. `.env.test.local` from `.env.test.example` — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Service role is **seed/teardown only**; never `EXPO_PUBLIC_*`.

Full setup: `__tests__/support/README.md`.

**Fixture + clients (reuse, do not reinvent)**

- Seed: `seedIsolationFixture` / `teardownIsolationFixture` from `__tests__/support/fixtures.ts` — two users, two households, stock in both (shared barcode OK), plus `nonMember`.
- Assertion clients: `createAssertionClients` / `createAnonClient` — user JWTs and anon key only inside `expect()`. Never use the service-role client for asserts.
- Gate: `requireIntegrationSupabase` — unreachable/missing credentials → hard fail (no false green).

**Skeleton for a new isolation case**

1. Put the file under `__tests__/integration/` with `@jest-environment node` and `import '../support/load-test-env'`.
2. `beforeAll`: seed + `createAssertionClients`; assert two distinct `householdId`s if the case needs #1 falsifiability.
3. Act as `clients.userA` / `userB` / `anon` / `nonMember` against tables/RPCs.
4. `afterAll`: teardown via seed client only.

Mirror patterns in `db-isolation.test.ts` (#1, #2a, #5) and `db-trusted-client-baseline.test.ts` (#2b allow). Secondary route-gate (#5 UI) is `__tests__/root-route-guards.test.ts` via `npm test` — not a substitute for DB proofs.

**Anti-patterns**

- Mocking RLS / PostgREST “success” in a service unit test and calling it authz proof
- Own-household-only fixtures (makes #1 unfalsifiable)
- Treating non-member `SELECT []` alone as #5 pass — pair with failed INSERT/UPDATE/DELETE/RPC
- Asserting #2b **deny** before the intentional harden (pre–S-05); green allow is the baseline/alarm
- Pointing the harness at production; putting service role in Expo public env
- Pulling Worker Vitest into the product isolation path

### 6.3 Adding a shared-list / search regression test

TBD — see §3 Phase 3 for two-member same-household list/search pattern.

### 6.4 Adding a test for Open Food Facts miss path

TBD — see §3 Phase 4 for OFF miss → empty optional fields pattern.

### 6.5 Adding CI quality gates

TBD — see §3 Phase 4 for lint/typecheck/test job wiring pattern.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, append 2–3 lines of surprises / fixtures discovered.)

- **Phase 1 (Bootstrap + izolacja):** Empty list for authenticated-without-membership is a *symptom*, not authorization proof — always pair with failed mutation/RPC. #2b own-household direct DELETE / unpaired utilization INSERT **succeed** today (trusted-client baseline/alarm until harden pre–S-05). `workers/api/src/` is a misleading hot-spot for #1/#2/#5 (hello-world); do not cite Worker churn as isolation likelihood.

## 7. What We Deliberately Don't Test

- **Hello-world Cloudflare Worker** — nie jest ścieżką produktu (Expo → Supabase bezpośrednio). Re-evaluate jeśli Worker stanie się BFF dla stock/OFF. (Source: Phase 2 interview Q5.)
- **Pełne e2e kamery / skanera na emulatorze w pierwszym rolloutcie** — jest typed-barcode fallback; najpierw tańsze warstwy na stock/RLS. Re-evaluate jeśli kamera będzie jedyną ścieżką add.
- **Snapshoty UI / chrome startera Expo** — łamią się często, nie chronią top ryzyk. Re-evaluate tylko dla krytycznego ekranu stock, jeśli deterministyczny diff okaże się tańszy niż integration.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-08 (light §2 #2a/#2b + Worker hot-spot fix with Phase 1 cookbook)
- Stack versions last verified: 2026-09-08
- AI-native tool references last verified: 2026-09-08

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
