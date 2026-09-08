# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-08 (Phase 1 → planned)

## 1. Strategy

Testy w tym projekcie podlegają trzem zasadom:

1. **Cost × signal.** Wygrywa najtańszy test, który daje realny sygnał dla ryzyka. Nie eskaluj do e2e, bo „bezpieczniej”. Nie dokładaj warstwy AI na deterministyczny signal, który już łapie regresję.
2. **User concerns are first-class evidence.** Ryzyka z wywiadu (izolacja gospodarstw, brak autoryzacji przy operacjach, niepewność przy add/remove/list) waży tyle samo co linie PRD i hot-spoty.
3. **Risks are scenarios, not code locations.** This plan documents *what could fail* and *why we believe it's likely* — drawn from documents, interview, and codebase *signal* (churn, structure, test base). It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`, `workers/api/src/`.

## 2. Risk Map

Najważniejsze scenariusze awarii (impact × likelihood). Kolumna Source to **dowód**, nie kotwica pliku.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Członek gospodarstwa A odczytuje lub zmienia stock gospodarstwa B | High | High | interview Q1; PRD Access Control; roadmap F-01/S-01; hot-spot dir `supabase/migrations/` (6 file touches/30d) |
| 2 | Operacja stock (add/remove/list) przechodzi bez twardej autoryzacji przynależności do gospodarstwa | High | High | interview Q2; change notes remove-stock (trusted-client / ominięcie RPC); PRD Access Control |
| 3 | Add/remove psuje quantity (zły delta, wiersz znika za wcześnie / zostaje przy 0) — lista kłamie w alei | High | High | interview Q3; PRD FR-003/004/005; hot-spot dir `src/components/stock/` (22 touches/30d), `src/services/` |
| 4 | Dwóch członków tego samego gospodarstwa nie widzi tego samego stocku po dodaniu | High | Medium | PRD US-01 Success Criteria; roadmap S-01 north star; interview Q3 |
| 5 | Użytkownik bez sesji / bez membershipu wchodzi na stock i mutuje dane | High | Medium | PRD Access Control; roadmap F-01 |
| 6 | Manual add / merge po kodzie tworzy duplikaty lub złe połączenie wierszy (pusty kod vs z kodem) | Medium | Medium | PRD FR-005; roadmap S-04; hot-spot dir `supabase/migrations/` |
| 7 | OFF miss blokuje dodanie albo zapisuje śmieciowe pola zamiast pustych opcjonalnych | Medium | Low | PRD FR-006–008 + Non-Goals; roadmap S-02 |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Authenticated member A nie widzi i nie zmienia wierszy B (odczyt i mutacje) | „Jestem zalogowany ⇒ wolno mi wszystko” | Jak operacja wiąże się z `household_id`; fixture dwóch gospodarstw | integration vs DB/RLS | mock RLS w kliencie; happy-path tylko własnego domu |
| #2 | Mutacja stocku wymaga ścieżki z kontrolą członkostwa; obejście kontraktu produktu nie przechodzi tam, gdzie kontrakt tego wymaga | „UI woła RPC ⇒ DB jest bezpieczna” | Granica grantów/RLS vs RPC; co klient może zrobić bezpośrednio | integration / contract na granicę DB | test serwisu z mockiem Supabase „sukces” |
| #3 | +N zwiększa quantity; −1 zmniejsza; przy 0 wiersz znika; remove zostawia ślad zgodny z FR-009 | Assertowanie aktualnej implementacji jako wyroczni | Kontrakt quantity z PRD/planów; last-unit | unit/integration na reguły + RPC | wyrocznia skopiowana z kodu produkcyjnego |
| #4 | Po add drugi członek tego samego gospodarstwa widzi ten sam wiersz | Refetch w UI = gwarancja współdzielenia | Shared household; list query scoped | integration 2 members / 1 household | pełne e2e apki zamiast wspólnego odczytu |
| #5 | Bez sesji / bez membershipu brak dostępu do stock i mutacji | Sam screen auth wystarczy | Route gate + bootstrap household | integration / route-gate lub checklist smoke | snapshot layoutu auth |
| #6 | Ręczny add (pusty kod vs z kodem) nie tworzy sprzecznych duplikatów względem reguł unikalności/merge | „Brak barcode = zawsze nowy wiersz” bez sprawdzenia reguł | Reguły unikalności/merge z S-04 | integration na add/merge | UI-only bez asercji stanu trwałego |
| #7 | Brak OFF nie blokuje zapisu; brakujące pola zostają puste | „200 z OFF ⇒ pola zawsze wypełnione” | Mapowanie OFF + FR-008 | unit mapowania + miss path | live e2e do OFF w CI |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap + izolacja gospodarstw | Runner w app + dowód, że A≠B na stock (oraz brak dostępu bez membershipu) | #1, #2, #5 | runner bootstrap, integration (RLS/auth) | planned | testing-bootstrap-izolacja-gospodarstw |
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

TBD — see §3 Phase 1 for household isolation / RLS fixture pattern.

### 6.3 Adding a shared-list / search regression test

TBD — see §3 Phase 3 for two-member same-household list/search pattern.

### 6.4 Adding a test for Open Food Facts miss path

TBD — see §3 Phase 4 for OFF miss → empty optional fields pattern.

### 6.5 Adding CI quality gates

TBD — see §3 Phase 4 for lint/typecheck/test job wiring pattern.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, append 2–3 lines of surprises / fixtures discovered.)

## 7. What We Deliberately Don't Test

- **Hello-world Cloudflare Worker** — nie jest ścieżką produktu (Expo → Supabase bezpośrednio). Re-evaluate jeśli Worker stanie się BFF dla stock/OFF. (Source: Phase 2 interview Q5.)
- **Pełne e2e kamery / skanera na emulatorze w pierwszym rolloutcie** — jest typed-barcode fallback; najpierw tańsze warstwy na stock/RLS. Re-evaluate jeśli kamera będzie jedyną ścieżką add.
- **Snapshoty UI / chrome startera Expo** — łamią się często, nie chronią top ryzyk. Re-evaluate tylko dla krytycznego ekranu stock, jeśli deterministyczny diff okaże się tańszy niż integration.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-08
- Stack versions last verified: 2026-09-08
- AI-native tool references last verified: 2026-09-08

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
