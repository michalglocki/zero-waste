---
project: Zero waste
version: 1
status: draft
created: 2026-05-26
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

### Guardrails

- Stock updates must remain low-friction during shopping (minimal taps/time).

## User Stories

### US-01: Check stock and add an item while shopping

- **Given** a logged-in household member with access to the shared household stock
- **When** they open the app, view the product list, search for an item, and scan a barcode to add a product they are buying
- **Then** the product appears on the household stock list and can be found again via search

## Functional Requirements

### Stock list & search

- FR-001: Household member can view the household product stock list. Priority: must-have
  > Socrates: Counter-argument considered: "list view is redundant if search is always the entry point." Resolution: kept — browseable list still needed for at-home planning, not only search-first.
- FR-002: Household member can search products in the stock list. Priority: must-have
  > Socrates: Counter-argument considered: "search without good naming/duplicates returns wrong confidence." Resolution: kept — search stays in MVP; naming/duplicate handling deferred to Open Questions.

### Add & remove

- FR-003: Household member can add a product to stock by scanning its barcode. Priority: must-have
  > Socrates: Counter-argument considered: "barcode fails on fresh produce / bulk items without barcodes." Resolution: kept — barcode is primary add path; manual add for non-barcoded items required in MVP (see Non-Goals; FR-005).
- FR-004: Household member can remove a product from the stock list. Priority: must-have
  > Socrates: Counter-argument considered: "decrement quantity beats remove for used-up items." Resolution: kept — remove stays in MVP; quantity/decrement model deferred to Open Questions.
- FR-005: Household member can add a product to stock manually when no barcode is available. Priority: must-have
  > Socrates: Counter-argument considered: "manual entry creates duplicate or inconsistent product names." Resolution: kept — required for produce/bulk; duplicate handling stays in Open Questions with FR-002.

## Non-Functional Requirements

- While shopping or planning at home, stock lookup and search must feel fast enough that the user does not abandon the check mid-aisle (user-perceived responsiveness during active shopping).

## Business Logic

The application validates whether the household already has enough of a product before the user buys more.

**Inputs (user-facing):** Current household stock (what is on hand), the product the user is considering (e.g. via search or barcode while shopping or planning), and thresholds for “enough” per product (exact threshold model TBD).

**Output:** A clear signal when stock is already sufficient — so the user can skip buying and avoid gathering unneeded resources.

**How the user encounters it:** While shopping away from home or planning a list at home, after viewing/searching stock or scanning a barcode, the user sees whether they already have enough before adding to cart or list.

## Access Control

- **Authentication:** Login (user accounts — email/password, OAuth, or passwordless; exact mechanism TBD downstream).
- **Household model:** Users belong to a shared household; stock is one shared inventory for that household.
- **Roles:** Flat — every logged-in household member can view and edit the same stock. No admin/member split in the MVP.

## Non-Goals

- **Avoid:** Buy recommendations from low-stock and removal-frequency signals — deferred beyond MVP; validation-only first.
- **Avoid:** Classification by location (kitchen, bathroom, home) and by user (male, female, child) for need prediction — deferred beyond MVP.
- **Avoid:** Shipping a barcode-only MVP with no manual add path — non-barcoded items (e.g. fresh produce) must be addable by hand.

## Open Questions

1. **“Enough” threshold** — How is “enough” defined per product (fixed count, user-set, category default)? Owner: product. Blocks: validation rule implementation.
2. **Manual add UX** — What fields are required for manual add (name only, quantity, unit)? Owner: product. Blocks: FR-005 implementation detail.
3. **Quantity vs remove** — Should “used up” decrement quantity instead of (or in addition to) remove? Owner: product. Blocks: FR-004 behavior.
4. **Recommendation (v2)** — What signals define “low stock” and “frequency of removing” for buy suggestions? Owner: product.
5. **Classification (v2)** — Which locations and user dimensions are required at launch vs optional? Owner: product.
