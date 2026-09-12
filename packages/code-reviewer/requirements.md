# Code review requirements — zero-waste

Wymagania dla agenta code review na CI/CD. Dokument definiuje, czym jest dobre review w stacku tego repozytorium oraz pięć wiążących kryteriów akceptacji PR.

**Stack (skrót):** Expo SDK 56 · React Native · TypeScript · expo-router · Supabase (Auth + Postgres/RLS) · jest-expo (+ osobne `test:integration` na hosted test DB) · opcjonalnie Worker poza ścieżką produktową.

Źródła prawdy: `AGENTS.md`, `context/foundation/prd.md`, `context/foundation/tech-stack.md`, `context/foundation/test-plan.md`.

---

## 1. Czym jest dobre code review w tym projekcie

Dobre review **nie** jest checklistą stylu ani recenzją „czy kod mi się podoba”. Jest oceną ryzyka zmiany względem produktu (wspólny stock gospodarstwa, niska tarcia w sklepie, izolacja danych).

### Zasady

1. **Diff-first, risk-second.** Ocena dotyczy wyłącznie dostarczonego diffu. Nie wymyślaj problemów poza zmianą. Gdy diff jest zdrowy — powiedz to krótko.
2. **Sygnał > szum.** Preferuj mniej findingów o wysokiej wadze (błędy logiki, RLS/authz, sekrety, regresje quantity) niż nitypików formatowania.
3. **Konwencje repo > gust.** Alias `@/`, kebab-case modułów, route default exports, `experiments.typedRoutes` / `reactCompiler`, jeden app runner (`jest-expo` / `npm test`), Worker Vitest poza ścieżką produktową.
4. **Expo jest wersjonowane.** Wzorce React Native / Expo spoza docs SDK 56 traktuj jako ryzyko idiomatyczności, nie jako „nowoczesność”.
5. **Bezpieczeństwo = granica gospodarstwa + sekrety.** UI / `Stack.Protected` to UX, nie dowód autoryzacji. Prawdziwa izolacja żyje w RLS / RPC / membership. Service role nigdy w `EXPO_PUBLIC_*`.
6. **Testy względem ryzyka, nie względem coverage %.** Brak testu przy zmianie hot-path stock / migracji RLS / auth jest poważniejszy niż brak snapshotu UI. Najtańszy test, który łapie ryzyko (unit vs integration RLS) — zgodnie z test-planem.
7. **Konstruktywność.** Finding musi mówić *co* jest nie tak, *dlaczego* to szkodzi w tym produkcie i — gdy oczywiste — *jak* naprawić (bez przepisywania całego PR).

### Poza zakresem review agenta

- Preferencje estetyczne UI bez wpływu na poprawność / a11y krytyczną dla flow.
- Refaktory „przy okazji” poza diffem.
- Pełny audit architektury niezwiązany ze zmianą.
- Uruchamianie komend / eksploracja repo poza zrozumieniem diffu (chyba że pipeline jawnie dostarcza dodatkowy kontekst).

---

## 2. Pięć kryteriów akceptacji (skala 1–10)

Każde kryterium: **1 = poważne braki**, **10 = wzorowo**. Agent ocenia **wyłącznie diff** i kontekst stacku poniżej.

### 1. Poprawność implementacji

Czy zmiana robi to, co deklaruje, bez regresji kontraktu produktu?

| Zakres | Co sprawdzać |
|--------|----------------|
| Stock | Add/remove/quantity: +N zwiększa, −1 zmniejsza, last-unit usuwa wiersz, remove zostawia ślad zgodny z FR; brak duplikatów / złego merge przy ręcznym add. |
| Dane współdzielone | Po mutacji inny członek tego samego gospodarstwa powinien móc zobaczyć ten sam stan (kontrakt, nie „refetch w UI = gwarancja”). |
| OFF / barcode | Miss lub brak pól nie blokuje add; opcjonalne pola puste, nie zaśmiecone. |
| Typy / API | Spójność typów TS z wywołaniami Supabase/RPC; obsługa błędów na ścieżkach użytkownika (nie połykanie błędów auth/RLS jako pustej listy bez rozróżnienia). |
| Routing | Poprawne użycie expo-router (grupy, protected routes jako UX gate — nie mylić z DB authz). |

**Niskie oceny (1–4):** oczywisty bug w quantity/izolacji; zmiana łamie deklarowany kontrakt; dead code ścieżki happy-path ukrywający błąd.
**Wysokie (8–10):** logika zgodna z PRD/planem, edge case’y (0, brak OFF, brak membership) świadomie obsłużone.

### 2. Idiomatyczność

Czy kod wygląda jak kod *tego* repo i *tego* stacku (Expo 56 / TS / Supabase client), a nie jak generyczny boilerplate?

| Zakres | Co sprawdzać |
|--------|----------------|
| Importy / struktura | `@/` zamiast deep relative; pliki w `src/app`, `src/components`, `src/hooks`, serwisy zgodnie z sąsiadami; kebab-case; platform siblings `.web.tsx` gdy potrzeba. |
| Expo / RN | Wzorce zgodne z docs SDK 56; brak legacy API; brak zbędnego `useMemo`/`useCallback` „na zapas” jeśli zespół opiera się na React Compiler (patrz `app.json` experiments). |
| Supabase | Klient z publicznym anon key; mutacje stock przez ustalony kontrakt (RPC vs direct table) — bez obchodzenia go „bo łatwiej”; brak service role w app. |
| Testy | Nowe testy app przez jest-expo / istniejące `__tests__`; nie dokładanie drugiego app runnera; Worker Vitest tylko w `workers/`. |
| Konfiguracja | Brak przypadkowej zmiany `experiments.*`; sekrety tylko w gitignored env. |

**Niskie (1–4):** łamanie AGENTS.md; wzorce z niewłaściwej wersji Expo; service role / złe env w kliencie.
**Wysokie (8–10):** zmiana nieodróżnialna stylowo od okolicy; świadome, udokumentowane odstępstwo tylko gdy konieczne.

### 3. Złożoność

Czy złożoność jest proporcjonalna do problemu (MVP, solo, niska tarcia w sklepie)?

| Zakres | Co sprawdzać |
|--------|----------------|
| Powierzchnia | PR robi jedną rzecz; brak spekulatywnych abstrakcji, „frameworków wewnętrznych”, zbędnych warstw. |
| Czytelność | Ścieżka krytyczna (scan → add → list) pozostaje czytelna; brak zagnieżdżeń i ukrytych side-effectów bez potrzeby. |
| Stan / efekty | Minimalny stan; jasne granice UI vs serwis vs DB; brak god-object screenów w nowym kodzie. |
| Diff size | Duży diff OK tylko gdy wynika z jednej spójnej zmiany (np. migracja + klient + test); „drive-by” w wielu obszarach = minus. |

**Niskie (1–4):** overengineering; nieczytelna ścieżka mutacji stock; ukryta złożoność w „helperach”.
**Wysokie (8–10):** najprostsze rozwiązanie, które spełnia kontrakt; złożoność uzasadniona ryzykiem (np. RLS), nie gustem.

### 4. Pokrycie testami względem ryzyka

Czy dowód w testach odpowiada *ryzyku* zmiany (cost × signal), a nie metryce linii?

| Ryzyko zmiany (z test-planu) | Oczekiwany sygnał |
|------------------------------|-------------------|
| Migracje RLS / RPC / GRANTy / membership | Integration vs real test DB (`test:integration`); fixtures ≥2 gospodarstwa; **nie** mock „Supabase success” jako dowód izolacji. |
| Quantity / last-unit / merge add | Unit i/lub integration na reguły kontraktu — wyrocznia z PRD/planu, nie skopiowana ślepo z produkcji. |
| Auth gate / anon / non-member | Integration deny paths; empty SELECT sam nie jest pass dla #5. |
| Mapowanie OFF / miss | Unit mapowania + ścieżka miss; bez live e2e OFF w CI jako jedyny dowód. |
| Czysty UI / copy / styling bez logiki domenowej | Testy nie wymagane; nie obniżaj za brak snapshotów. |
| Trusted-client baseline (pre-harden) | Nie wymagaj deny na direct DELETE, jeśli plan świadomie trzyma allow — ale flaga ryzyka w summary OK. |

**Niskie (1–4):** zmiana hot-path stock/RLS bez testu; mock RLS w kliencie jako „dowód”; regresja bez asercji stanu trwałego.
**Wysokie (8–10):** najtańszy adekwatny test; jasne nazwy scenariuszy ryzyka; brak zbędnego e2e.

### 5. Bezpieczeństwo

Czy zmiana nie osłabia izolacji gospodarstw, authz ani poufności konfiguracji?

| Zakres | Co sprawdzać |
|--------|----------------|
| Izolacja | Brak ścieżek odczytu/zapisu stock obcego `household_id`; membership egzekwowane po stronie DB; UI-only gate ≠ security. |
| Sekrety | Brak commitów `.env*.local`, service role, signing (`*.jks`, `*.p8`, `*.mobileprovision`); service role nigdy w `EXPO_PUBLIC_*`. |
| Klient | Anon key OK w app; brak eskalacji uprawnień przez szerokie GRANTy / wyłączone RLS / `security definer` bez audytu. |
| Integracje | OFF / zewnętrzne API: brak wycieku tokenów; User-Agent zgodnie z konwencją projektu; brak logowania PII/sesji. |
| Test harness | Testy nie celują w produkcyjny projekt Supabase; service role tylko seed w testach. |

**Niskie (1–4):** wyciek sekretu; dziura cross-household; wyłączenie RLS „na chwilę”; service role w bundlu.
**Wysokie (8–10):** authz na właściwej warstwie; sekrety czyste; świadome ograniczenia MVP nazwane, nie ukryte.

---

## 3. Wiążący werdykt (pass / fail)

Agent wystawia oceny 1–10; **CLI deterministycznie egzekwuje §3** (`finalizeReviewOutput`) i mapuje na `pass`/`fail` oraz `approve`/`comment`/`request_changes`. Modelowy werdykt nie jest wiążący.

Agent może także zasugerować **pass** albo **fail** w treści (obok opcjonalnego mapowania na `approve` / `comment` / `request_changes` w schemacie JSON pakietu) — pipeline i tak nadpisze wynik z progów poniżej.

### Fail (blokuje merge / `request_changes`), gdy zachodzi którekolwiek:

- **Dowolne kryterium ≤ 4**, lub
- **Bezpieczeństwo ≤ 5** (niższy próg: izolacja i sekrety są non-negotiable), lub
- **Średnia arytmetyczna pięciu ocen < 6**, lub
- Finding o severity równoważnej **error**: regresja quantity/izolacji, sekret w diffie, authz tylko w UI przy mutacji DB, service role w kliencie.

### Pass, gdy:

- Wszystkie kryteria **≥ 5**, oraz
- Bezpieczeństwo **≥ 6**, oraz
- Średnia **≥ 6**, oraz
- Brak findingów klasy error jak wyżej.

### Pass z zastrzeżeniami (w summary; werdykt nadal pass → `comment` jeśli pipeline rozróżnia):

- Kryteria 6–7 z konkretnymi, naprawialnymi uwagami (brak testu przy średnim ryzyku, drobny drift konwencji, złożoność do uproszczenia w follow-up).
- Świadomy dług MVP (np. trusted-client) **wymieniony w summary**, nie ukryty.

---

## 4. Format odpowiedzi agenta (CI)

Oceń diff w pięciu kryteriach w skali 1–10 (1 = poważne braki, 10 = wzorowo):

1. poprawność implementacji  
2. idiomatyczność  
3. złożoność  
4. pokrycie testami względem ryzyka  
5. bezpieczeństwo  

Następnie wydaj **wiązżący werdykt** (`pass` / `fail`) dla całej zmiany i dołącz krótkie podsumowanie (**2–3 zdania**) w Markdown, na podstawie którego autor PR będzie mógł działać.

### Prompt kanoniczny (do wklejenia / parametrizacji)

```text
Oceń podany diff w pięciu kryteriach w skali 1–10 (1 = poważne braki, 10 = wzorowo):
poprawność implementacji, idiomatyczność, złożoność, pokrycie testami względem ryzyka, bezpieczeństwo.

Stosuj rubryki i progi pass/fail z packages/code-reviewer/requirements.md (stack: Expo SDK 56, TypeScript, expo-router, Supabase RLS, jest-expo). Review ONLY dostarczonego diffu; zero szumu; findingi konkretne (ścieżka + dlaczego szkodzi w zero-waste).

Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2–3 zdania) w Markdown, na podstawie którego autor PR-a będzie mógł działać.
```

### Sugerowany kształt wyniku (gdy pipeline oczekuje struktury)

```markdown
## Scores
| Kryterium | Score |
|-----------|------:|
| Poprawność implementacji | N |
| Idiomatyczność | N |
| Złożoność | N |
| Pokrycie testami względem ryzyka | N |
| Bezpieczeństwo | N |

**Werdykt:** pass | fail

## Podsumowanie
…
```

Jeśli konsumuje istniejący schemat JSON pakietu (`summary`, `findings[]`, `verdict`), zmapuj: `fail` → `request_changes`, `pass` bez istotnych warningów → `approve`, `pass` z zastrzeżeniami → `comment`. Scores i rubryki i tak muszą być respektowane przy wyborze `verdict`.

---

## 5. Checklist szybkiej kalibracji (dla autora PR i agenta)

Przed `pass` warto móc odpowiedzieć „tak” lub „N/A z uzasadnieniem”:

- [ ] Mutacje stock / quantity mają jasny kontrakt i nie regresują last-unit / merge.
- [ ] Zmiany DB egzekwują membership/RLS; UI gate nie jest jedyną ochroną.
- [ ] Brak sekretów i service role w bundlu / `EXPO_PUBLIC_*`.
- [ ] Importy `@/`, konwencje nazewnictwa, brak zbędnego runnera testów.
- [ ] Testy (jeśli ryzyko tego wymaga) celują w scenariusz z test-planu, nie w mock sukcesu RLS.
- [ ] Złożoność diffu uzasadniona zakresem MVP.
`)
