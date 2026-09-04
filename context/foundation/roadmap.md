---
project: Zero waste
version: 1
status: draft
created: 2026-09-03
updated: 2026-09-04
prd_version: 6
main_goal: low-complexity
top_blocker: time
milestone_id: first-shared-stock-check
milestone_seq: 1
milestone_status: open
---

# Roadmap: Zero waste

> Derived from `context/foundation/prd.md` (v6) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First shared stock check** — Status: open

- **Intent:** Prove that a logged-in household member can see one shared stock list, search it, and add a scanned barcode item — usable both while shopping away from home and while planning a list at home.
- **Source materials:** `context/foundation/prd.md` (v6)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-011, US-01, US-02, US-03, Access Control (login + flat shared household).

## Vision recap

Household members forget what they already have when they shop or plan a list, so they buy extras, run out, waste money on expiry, and fill storage with surplus. Stock is a household problem: any adult who shops or plans must see and update the same inventory, not a single “inventory manager.” The smallest proof is a shared list that can be searched and kept current by barcode add in those two moments.

## North star

**S-01: user can view household stock, search it, and add an item by barcode** — this is the validation milestone: the smallest end-to-end slice whose successful delivery would prove the core product hypothesis (that shared stock is actually usable in the aisle and at home) — placed as early as Prerequisites allow because everything else only matters if this works.

> “North star” here means that same slice: the first story that would show the product is real, not a recap of the whole MVP.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| ----- | ---------------------- | --------------------------------- | ---------------- | -------------- | -------- |
| F-01 | minimal-household-auth | (foundation) a signed-in user is tied to one household so stock can be shared | — | Access Control | in-progress |
| S-01 | stock-list-search-barcode-add | view household stock, search it, and add a product by scanning its barcode | F-01 | US-01, FR-001, FR-002, FR-003, FR-007, FR-008 | planning |
| S-02 | barcode-open-food-facts-identify | after a scan, store the barcode and fill known name/category fields from Open Food Facts when present | S-01 | US-02, FR-006, FR-007, FR-008 | blocked |
| S-03 | remove-stock-item | decrease stock by 1; store the remove; drop the row when quantity hits 0 | S-01 | US-01, FR-004, FR-009 | proposed |
| S-04 | manual-add-without-barcode | add a product by hand (barcode number + quantity; no unit) | S-01 | FR-005, FR-007, FR-008 | proposed |
| S-05 | likely-empty-recommendations | open a recommendations list of quantity-1 products overdue vs their average removal interval | S-03 | US-03, FR-010, FR-011 | proposed |

## Baseline

What's already in place in the codebase as of `2026-09-03` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Expo starter + file-based routing; product stock screens not started (`src/app/index.tsx`)
- **Backend / API:** partial — hello-world Worker only (`workers/api/src/index.ts`); no product API
- **Data:** absent — not wired; user-confirmed intent is hosted auth + Postgres with household-scoped access (planned, not present)
- **Auth:** absent — no provider, sessions, or route guards
- **Deploy / infra:** partial — Worker config present (`wrangler.jsonc`); store-build and merge CI declared in `tech-stack.md` but not in the repo
- **Observability:** absent — no error-tracking or logging stack

## Foundations

### F-01: Minimal household login

- **Outcome:** (foundation) a signed-in user is associated with one household so later slices can show and edit a single shared stock list.
- **Change ID:** minimal-household-auth
- **PRD refs:** Access Control (authentication; household model; flat roles — every member views and edits the same stock)
- **Unlocks:** S-01, S-03, S-04, S-02, S-05
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Exact sign-in mechanism (email/password, OAuth, or passwordless) is TBD in the PRD — Owner: team. Block: no.
- **Risk:** Sequenced first because US-01’s Given is a logged-in household member; without this contract, stock slices cannot be planned as shared. Keep the contract minimal (membership + session), not a full account-admin surface — after-hours time is the #1 risk.
- **Status:** in-progress

## Slices

### S-01: View, search, and barcode-add stock

- **Outcome:** user can open the household stock list, search it, and add a product by scanning its barcode so it appears on the list and can be found again.
- **Change ID:** stock-list-search-barcode-add
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-007, FR-008
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Open Food Facts mapping and catalog coverage wait until S-02; this slice stores the scanned code and leaves optional name/category empty — Owner: team. Block: no.
  - “Similar items” are whatever list/search already shows; no separate matcher in this slice. Richer identity (categories) arrives in S-02 — Owner: team. Block: no.
  - Stock amount is quantity only (no unit); barcode-add records quantity the same way as manual add — Owner: team. Block: no.
- **Risk:** This is the north star and the must-have path — the set of capabilities the Success Criteria say must work at first ship — so it sits immediately after auth. Combining list, search, and barcode-add matches US-01 and is the surface the user uses to decide “enough” (no app-imposed threshold). Catalog enrichment is split out so this slice stays plannable under a tight after-hours budget. Persistence for the stock list lands here (first slice that needs it), not as a separate layer project.
- **Status:** planning

### S-02: Identify a scanned product via Open Food Facts

- **Outcome:** after a barcode is scanned, the user still gets a saved product; when Open Food Facts returns data, name, main category, and auxiliary category are filled, and missing fields stay empty.
- **Change ID:** barcode-open-food-facts-identify
- **PRD refs:** US-02, FR-006, FR-007, FR-008
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Exactly which Open Food Facts attributes map to name, main category, and auxiliary category (and closed enum values) — Owner: product + eng. Block: yes.
  - Whether a second catalog for non-food (e.g. cosmetics) is in MVP, or empty-fields fallback is enough — Owner: product. Block: no.
  - Call Open Food Facts from the app or via the Worker — Owner: eng. Block: no.
- **Risk:** Sequenced after a working scan-and-save so enrichment cannot block the aisle add. Planning is blocked on field mapping (PRD Open Question 6). Lookup path defaults to “no extra BFF unless needed”; do not grow the hello-world Worker here unless that question is answered the other way.
- **Status:** blocked

### S-03: Decrement stock (drop row at zero)

- **Outcome:** user can decrease a listed product’s quantity by 1; each such remove is stored; if quantity is then 0, that list position is removed completely.
- **Change ID:** remove-stock-item
- **PRD refs:** US-01, FR-004, FR-009
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Needed to keep stock current and to leave a utilization history for S-05. Sequenced after S-01 because quantity must already exist on the list.
- **Status:** proposed

### S-04: Manual add without a barcode

- **Outcome:** user can add a product to household stock by hand, entering barcode number (empty when none) and quantity; no unit of measure.
- **Change ID:** manual-add-without-barcode
- **PRD refs:** FR-005, FR-007, FR-008
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Required so MVP is not barcode-only (PRD Non-Goals). Fields are now decided (barcode + quantity only), so this slice is plannable after S-01. Optional name/category stay empty when unknown, matching FR-008.
- **Status:** proposed

### S-05: Recommendations for likely-empty stock

- **Outcome:** user can open a separate recommendations section listing products with quantity 1 whose time since last removal is greater than that product’s average interval between removals.
- **Change ID:** likely-empty-recommendations
- **PRD refs:** US-03, FR-010, FR-011
- **Prerequisites:** S-03
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:**
  - Until a product has enough stored removals to form an average interval, it does not appear in the list — Owner: team. Block: no.
- **Risk:** Sequenced after S-03 so frequency is computed from real remove events, not guessed. Stays a separate section so it does not become an “enough” warning on lookup (resolved Q1). Frequency updates run asynchronously after each removal and are stored on the stock element.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| ---------- | ---------------------- | ----------------------------- | --------------------- | ----- |
| F-01 | minimal-household-auth | Minimal login tied to one shared household | yes | Run `/10x-plan minimal-household-auth` |
| S-01 | stock-list-search-barcode-add | View, search, and barcode-add household stock | no | Wait for F-01 |
| S-02 | barcode-open-food-facts-identify | Fill scanned product fields from Open Food Facts | no | Blocked on field mapping |
| S-03 | remove-stock-item | Decrement by 1, store the remove, delete row at 0 | no | Wait for S-01 |
| S-04 | manual-add-without-barcode | Manual add (barcode number + quantity, no unit) | no | Wait for S-01 |
| S-05 | likely-empty-recommendations | Recommendations: qty 1 and last removal later than average interval | no | Wait for S-03 |

## Open Roadmap Questions

1. **“Enough” threshold** — **Resolved (2026-09-03):** the app does not impose a threshold, count, or skip-purchase warning. Each user decides from the displayed stock of the searched item and of similar items when those can be identified (list/search now; identity from S-02 when present). Owner: product. Block: none.
2. **Manual add UX** — **Resolved (2026-09-03):** barcode number and quantity; quantity is the only amount field; no unit in MVP (optional later). Typed barcode may be empty when none exists. Owner: product. Block: none.
3. **Quantity vs remove** — **Resolved (2026-09-03):** remove always decreases quantity by 1; if quantity is then 0, the entire position is deleted. Owner: product. Block: none.
4. **Recommendation signals** — **Resolved (2026-09-03):** store each remove; after each removal, compute utilization frequency asynchronously and update the stock element; a separate recommendations section lists quantity = 1 where time since last removal is greater than that product’s average interval between removals. Owner: product. Block: none.
5. **Classification (v2)** — Which locations and user dimensions are required at launch vs optional? Owner: product. Block: none.
6. **Open Food Facts field mapping** — Exactly which OFF attributes map to name, main category, and auxiliary category (and closed enum values for those categories)? Owner: product + eng. Block: S-02.
7. **Non-food barcodes** — Open Food Facts coverage is food-heavy; cosmetics and other non-food may miss often. Is a second catalog in scope for MVP, or is empty-fields fallback enough? Owner: product. Block: none (FR-008 already allows empty fields).
8. **Lookup path** — Call Open Food Facts from the app, or via the Worker (keys, rate limits, aisle latency)? Owner: eng. Block: none (do not assume a BFF; S-02 records the question).

## Parked

- **Classification by location and household-member demographics for need prediction** — Why parked: PRD §Non-Goals (product-level categories from Open Food Facts in FR-007 are identity metadata, not this model).
- **Requiring the user to fill empty Open Food Facts fields before save** — Why parked: PRD §Non-Goals; empty optional fields are valid.
- **Units of measure** — Why parked: resolved Open Question 2; amount is quantity only in MVP; unit may return later.
- **Application-defined “enough” threshold or skip-purchase warning** — Why parked: PRD §Business Logic and §Non-Goals (resolved Open Question 1). List/search (S-01) is the decision surface; no extra validation slice.
- **Dedicated similar-item engine beyond list/search (and S-02 identity when present)** — Why parked: similar rows may appear when they can be identified; time and low-complexity say do not add a separate matching product.
- **Store-ready binary pipeline and merge-to-main CI** — Why parked: declared in `tech-stack.md` but not required to prove the aisle loop; time says defer until S-01 exists.
- **Growing the hello-world Worker into a product API / BFF** — Why parked: infrastructure default is app → hosted data directly; Open Question 8 is unresolved.

## Milestone History

## Done
