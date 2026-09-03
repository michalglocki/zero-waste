---
project: Zero waste
version: 6
status: draft
created: 2026-05-26
updated: 2026-09-03
context_type: greenfield
product_type: mobile
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Household members forget what they already have at home when they shop away from home or when they plan a shopping list at home. Without a shared, up-to-date picture of stock, they buy things they do not need, run out of things they do need, tie up money in excess inventory, throw away expired products, and use storage space for surplus.

Home inventory is a household problem: stock must be visible and updatable by any family member who shops or plans, in both moments (in-store and at-home list planning), not owned by a single “inventory manager.”

## User & Persona

**Primary persona:** Any adult household member who shops outside the home or plans the household shopping list at home. They need to know what is on stock (including how much) before buying more or before finalizing a list.

**Typical moments:**

1. **Away from home / shopping** — deciding what to buy without remembering current stock.
2. **At home / planning** — building or reviewing a shopping list and needing stock to be assured.
3. **At home / consuming** — removing products when used or exhausted.

**Cost today:** Time spent on unnecessary purchases; money frozen in too many products; money wasted when validity dates expire; physical space needed to store surplus.

## Success Criteria

### Primary

- User opens the app and can view household product stock with search.
- User can add products by barcode and remove products, keeping stock current.
- This flow works in both key moments: while shopping away from home and while planning a list at home.

### Secondary

- Barcode scanning adds products quickly and reliably for everyday use.
- After a scan, the app looks up the barcode in Open Food Facts and fills known product fields when available.
- A separate recommendations section lists products that look almost empty (quantity 1 and last removal later than that product’s average interval).

### Guardrails

- Stock updates must remain low-friction during shopping (minimal taps/time).
- Missing Open Food Facts data must not block adding the product — unknown fields stay empty.

## User Stories

### US-01: Check stock and add an item while shopping

- **Given** a logged-in household member with access to the shared household stock
- **When** they open the app, view the product list, search for an item, and scan a barcode to add a product they are buying
- **Then** the product appears on the household stock list and can be found again via search

### US-02: Identify a scanned product via Open Food Facts

- **Given** a logged-in household member scanning a product barcode to add or check stock
- **When** the app looks up that barcode in Open Food Facts
- **Then** the product record stores the barcode code and, when the API returns them, optional name, main category, and auxiliary category; when the API returns no match or omits a field, that field remains empty

### US-03: See products likely almost empty

- **Given** a logged-in household member and stored remove history for household products
- **When** they open the recommendations section
- **Then** they see products whose quantity is 1 and whose time since last removal is greater than that product’s average interval between removals (high probability the pack is almost empty)

## Functional Requirements

### Stock list & search

- FR-001: Household member can view the household product stock list. Priority: must-have
  > Socrates: Counter-argument considered: "list view is redundant if search is always the entry point." Resolution: kept — browseable list still needed for at-home planning, not only search-first.
- FR-002: Household member can search products in the stock list. Priority: must-have
  > Socrates: Counter-argument considered: "search without good naming/duplicates returns wrong confidence." Resolution: kept — search stays in MVP; naming/duplicate handling deferred to Open Questions.

### Add & remove

- FR-003: Household member can add a product to stock by scanning its barcode. Priority: must-have
  > Socrates: Counter-argument considered: "barcode fails on fresh produce / bulk items without barcodes." Resolution: kept — barcode is primary add path; manual add for non-barcoded items required in MVP (see Non-Goals; FR-005).
- FR-004: Household member can decrease stock of a listed product by 1; if quantity is then 0, the list row is removed. Priority: must-have
  > Socrates: Counter-argument considered: "decrement quantity beats remove for used-up items." Resolution (2026-09-03): both — remove always decrements quantity by 1; when quantity reaches 0 the entire position is deleted.
- FR-005: Household member can add a product to stock manually when no barcode is available. Priority: must-have
  > Socrates: Counter-argument considered: "manual entry creates duplicate or inconsistent product names." Resolution: kept — required for produce/bulk; duplicate handling stays in Open Questions with FR-002.
  > Manual add fields (resolved 2026-09-03): barcode number (typed; may be empty when none exists) and quantity. No unit of measure in MVP.

### Product identity (barcode → Open Food Facts)

- FR-006: After a barcode is scanned, the app identifies the product by looking it up in Open Food Facts. Priority: must-have
  > Socrates: Counter-argument considered: "offline aisle / API miss blocks add." Resolution: kept — lookup is best-effort; add still proceeds with empty optional fields when data is missing (FR-007, FR-008).
- FR-007: A product record includes: product code (barcode); quantity (numeric amount only — no unit in MVP); name (optional); main category (optional, e.g. cosmetics, food/groceries); auxiliary category (optional, audience such as women’s, men’s, universal, for children). Priority: must-have
- FR-008: When Open Food Facts returns no product or omits a field, the corresponding optional fields remain empty (null/blank); the product code from the scan is still stored when a barcode was scanned. Priority: must-have
  > Socrates: Counter-argument considered: "force user to fill name/category before save." Resolution: rejected for MVP — empty fields keep aisle friction low; manual edit can follow later if needed.

### Utilization history & recommendations

- FR-009: Each remove operation (quantity decreased by 1) is stored as a utilization event. Priority: must-have
- FR-010: After each removal, product utilization frequency is calculated asynchronously and updated on the stock element. Priority: must-have
- FR-011: Household member can open a separate recommendations section that lists products whose quantity is 1 and whose last removal is later than that product’s average interval between removals. Priority: must-have

## Non-Functional Requirements

- While shopping or planning at home, stock lookup and search must feel fast enough that the user does not abandon the check mid-aisle (user-perceived responsiveness during active shopping).

## Business Logic

The application does **not** impose an “enough” threshold or warn the user to skip a purchase. Each household member decides for themselves after seeing current stock.

**Inputs (user-facing):** Current household stock for the item they looked up (search or barcode) and, when those rows can be identified, stock of similar items already on the list.

**Output:** Displayed stock — not an application judgment. The user uses that picture to decide whether to buy more.

**How the user encounters it:** While shopping away from home or planning a list at home, they view or search stock (and see similar items when identity makes that possible). The decision to buy or skip stays with them.

**Barcode identification:** On scan, the app queries Open Food Facts with the barcode. Returned attributes map onto the product fields in FR-007 when present; absent attributes stay empty (FR-008). Identification helps the user recognize the item and related rows on the list; it does not drive an app-defined “enough” rule.

**Utilization and recommendations:** Every remove is stored. After each removal, utilization frequency is recalculated asynchronously and stored on the stock element. A separate recommendations section lists products with quantity 1 whose time since last removal is greater than that product’s average interval between removals — a high-probability “almost empty” hint. This is not an “enough” threshold on lookup (see resolved Open Question 1); it is an optional list the user can open.

## Access Control

- **Authentication:** Login (user accounts — email/password, OAuth, or passwordless; exact mechanism TBD downstream).
- **Household model:** Users belong to a shared household; stock is one shared inventory for that household.
- **Roles:** Flat — every logged-in household member can view and edit the same stock. No admin/member split in the MVP.

## Non-Goals

- **Avoid:** An application-defined “enough” threshold, count, or skip-purchase warning — the user judges from displayed stock. The recommendations section (FR-011) is a separate, optional list, not a block on add or lookup.
- **Avoid:** Recommendation signals other than stored removals, async frequency on the stock element, quantity = 1, and last removal later than the product’s average interval (e.g. location or demographic prediction stays out).
- **Avoid:** Classification by location (kitchen, bathroom, home) and by household-member demographics for need prediction — deferred beyond MVP. (Product-level main/auxiliary categories from Open Food Facts in FR-007 are identity metadata, not this deferred prediction model.)
- **Avoid:** Units of measure in MVP — stock amount is quantity only; unit may be an option later.
- **Avoid:** Shipping a barcode-only MVP with no manual add path — non-barcoded items (e.g. fresh produce) must be addable by hand.
- **Avoid:** Requiring the user to complete empty Open Food Facts fields before the product can be saved — empty optional fields are valid in MVP.

## Open Questions

1. **“Enough” threshold** — **Resolved (2026-09-03):** the app does not impose a threshold. The user decides from displayed stock of the searched item and of similar items when those can be identified. Owner: product. Blocks: none.
2. **Manual add UX** — **Resolved (2026-09-03):** manual add considers barcode number and quantity. Quantity is the only amount field; unit of measure is out of MVP (optional later). Barcode may be empty when none exists (FR-005). Owner: product. Blocks: none.
3. **Quantity vs remove** — **Resolved (2026-09-03):** remove always decreases quantity by 1. If quantity is then 0, the entire list position is deleted. Owner: product. Blocks: none.
4. **Recommendation signals** — **Resolved (2026-09-03):** store each remove; compute utilization frequency asynchronously after each removal and update the stock element; recommendations section shows quantity = 1 and last removal later than the product’s average interval between removals. Owner: product. Blocks: none.
5. **Classification (v2)** — Which locations and user dimensions are required at launch vs optional? Owner: product.
6. **Open Food Facts field mapping** — Exactly which OFF attributes map to name, main category, and auxiliary category (and closed enum values for those categories)? Owner: product + eng. Blocks: FR-006/FR-007 implementation.
7. **Non-food barcodes** — Open Food Facts coverage is food-heavy; cosmetics and other non-food may miss often. Is Open Beauty Facts (or another catalog) in scope for MVP, or is empty-fields fallback enough? Owner: product. Blocks: enrichment completeness expectations.
8. **Lookup path** — Call Open Food Facts from the Expo client, or via the Cloudflare Worker BFF (keys, rate limits, aisle latency)? Owner: eng. Blocks: infra wiring vs `infrastructure.md` optional-BFF rule.
