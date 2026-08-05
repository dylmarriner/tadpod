# TADPODS Phase 2 Implementation Plan: Products, Warehouses, and Inventory Ledger

**Goal:** Add production-quality product management, warehouses, the authoritative stock-movement ledger, stock counts, transfers, adjustments, barcode lookup, and accurate stock availability calculations.

**Depends on:** Phase 1 platform foundation merged and green.

**Primary rule:** `stock_movements` is the sole source of truth for stock on hand. No product or warehouse record stores an editable stock balance.

## Outcomes

At the end of this phase, staff can:

- Create and maintain products and warehouses.
- Search products by SKU, name, barcode, or supplier code.
- Record opening stock, adjustments, transfers, returns, and stock counts.
- See stock on hand by warehouse and across the business.
- Trace every quantity to an immutable posted movement.
- Reverse incorrect movements without editing or deleting history.
- Prevent duplicate postings and unauthorized negative stock.

## Database Additions

- `product_categories`
- `products`
- `product_suppliers`
- `warehouses`
- `stock_movements`
- `stock_counts`
- `stock_count_lines`

Use decimal-safe quantity columns. Quantity precision must support units that are not whole numbers.

## Status and Movement Types

### Product status

- Active
- Archived

### Warehouse status

- Active
- Archived

### Stock movement types

- Opening stock
- Goods receipt
- Sales delivery
- Customer return
- Supplier return
- Warehouse transfer out
- Warehouse transfer in
- Positive adjustment
- Negative adjustment
- Stock count correction
- Reversal

## Task 1: Product, category, supplier-code, and warehouse schema

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_inventory_foundation/migration.sql`
- Modify: `packages/database/prisma/seed.ts`
- Create: `packages/contracts/src/products.ts`
- Create: `packages/contracts/src/warehouses.ts`
- Create: `packages/domain/src/quantity.ts`
- Create: `packages/domain/src/quantity.test.ts`

- [ ] Add product categories with unique names and optional parent category.
- [ ] Add products with unique SKU, optional unique barcode, name, description, category, unit of measure, sales price, purchase cost, tax rate, reorder level, reorder quantity, lead time, preferred supplier, and active state.
- [ ] Add product-supplier records with supplier product code, purchase cost, preferred flag, and lead time.
- [ ] Add warehouses with unique code and name, address fields, active state, and default-warehouse flag.
- [ ] Add indexes for SKU, barcode, normalized product name, category, supplier code, and active state.
- [ ] Add constraints preventing negative reorder values and invalid lead times.
- [ ] Add a decimal-safe `Quantity` domain type with explicit scale and deterministic comparison.
- [ ] Seed one default warehouse without generating fake operational transactions.
- [ ] Prove migration and seed idempotency on a clean database.

## Task 2: Immutable stock-movement ledger

**Files:**

- Create: `packages/domain/src/inventory.ts`
- Create: `packages/domain/src/inventory.test.ts`
- Create: `apps/api/src/modules/inventory/inventory.module.ts`
- Create: `apps/api/src/modules/inventory/stock-posting.service.ts`
- Create: `apps/api/src/modules/inventory/stock-query.service.ts`
- Create: `apps/api/src/modules/inventory/inventory.controller.ts`

- [ ] Add `stock_movements` with product, warehouse, signed quantity, movement type, posted timestamp, source type, source ID, source line ID, idempotency key, reversal linkage, actor, notes, and immutable posting metadata.
- [ ] Add a unique constraint preventing one source line from affecting stock twice.
- [ ] Add a unique idempotency key per posting operation.
- [ ] Reject direct updates and deletes of posted movements at service and database layers.
- [ ] Implement stock-on-hand aggregation from posted movements only.
- [ ] Implement posting inside serializable database transactions.
- [ ] Lock affected product and warehouse stock keys before validating available quantity.
- [ ] Reject negative stock unless system settings permit it and the user has the override permission.
- [ ] Record an audit event for every posting and reversal.

## Task 3: Opening stock and adjustments

**Files:**

- Create: `apps/api/src/modules/inventory/adjustments.controller.ts`
- Create: `apps/api/src/modules/inventory/adjustments.service.ts`
- Create: `apps/web/src/app/(authenticated)/inventory/adjustments/page.tsx`
- Create: `apps/web/src/app/(authenticated)/inventory/adjustments/new/page.tsx`

- [ ] Add guided opening-stock entry by warehouse.
- [ ] Add positive and negative adjustment workflows with mandatory reasons.
- [ ] Show before quantity, change, and after quantity before posting.
- [ ] Require confirmation for all stock-affecting posts.
- [ ] Prevent adjustments from silently changing reserved stock.
- [ ] Add reversal action that creates equal and opposite movements.
- [ ] Display source, actor, timestamp, and reversal history.

## Task 4: Warehouse transfers

**Files:**

- Create: `packages/database/prisma/migrations/<timestamp>_stock_transfers/migration.sql`
- Create: `apps/api/src/modules/inventory/transfers.controller.ts`
- Create: `apps/api/src/modules/inventory/transfers.service.ts`
- Create: `apps/web/src/app/(authenticated)/inventory/transfers/page.tsx`
- Create: `apps/web/src/app/(authenticated)/inventory/transfers/new/page.tsx`

- [ ] Represent a completed transfer as linked transfer-out and transfer-in movements in one transaction.
- [ ] Prevent source and destination warehouse from being the same.
- [ ] Validate sufficient stock at the source warehouse.
- [ ] Prevent only one side of a transfer from posting.
- [ ] Preserve transfer number, actor, notes, and audit trail.
- [ ] Support reversal as linked opposite movements.

## Task 5: Stock counts and corrections

**Files:**

- Create: `apps/api/src/modules/inventory/stock-counts.controller.ts`
- Create: `apps/api/src/modules/inventory/stock-counts.service.ts`
- Create: `apps/web/src/app/(authenticated)/inventory/stock-counts/page.tsx`
- Create: `apps/web/src/app/(authenticated)/inventory/stock-counts/[id]/page.tsx`

- [ ] Create draft stock counts for a warehouse, category, product selection, or full warehouse.
- [ ] Capture expected quantity at count creation and counted quantity at entry.
- [ ] Calculate variance without changing stock until posting.
- [ ] Post correction movements transactionally.
- [ ] Prevent a stock count from posting twice.
- [ ] Lock posted counts and preserve all lines, variances, and actor history.
- [ ] Provide barcode-friendly count entry.

## Task 6: Product and warehouse API

**Endpoints:**

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PATCH /products/:id`
- `POST /products/:id/archive`
- `GET /product-categories`
- `GET /warehouses`
- `POST /warehouses`
- `GET /warehouses/:id`
- `PATCH /warehouses/:id`
- `GET /inventory/stock-on-hand`
- `GET /inventory/movements`
- `POST /inventory/opening-stock`
- `POST /inventory/adjustments`
- `POST /inventory/transfers`
- `POST /inventory/movements/:id/reverse`
- `POST /inventory/stock-counts`
- `POST /inventory/stock-counts/:id/post`

- [ ] Validate every request and response with shared Zod contracts.
- [ ] Add stable pagination, sorting, saved URL filters, and query indexes.
- [ ] Add permissions for product maintenance, warehouse maintenance, stock viewing, stock adjustment, transfer, stock count, reversal, and negative-stock override.
- [ ] Add idempotency support to every stock-posting endpoint.

## Task 7: TADPODS inventory interface

**Screens:**

- Product list
- Product detail
- New/edit product
- Warehouse list
- Warehouse detail
- Stock on hand
- Stock movement history
- Adjustments
- Transfers
- Stock counts

- [ ] Show SKU, barcode, stock on hand, available stock, incoming stock placeholder, and reorder status on product views.
- [ ] Show stock by warehouse and complete movement history.
- [ ] Add global barcode lookup and keyboard-friendly product selection.
- [ ] Add clear status badges and empty-state guidance.
- [ ] Link every balance and movement to its source record.
- [ ] Keep common actions to one obvious primary action per screen.
- [ ] Add responsive tablet layouts suitable for warehouse staff.

## Task 8: Calculations and query projections

Implement and test:

```text
Stock on hand = sum(posted stock movements)
Available stock = stock on hand - active reservations
Incoming stock = confirmed purchase quantity - received quantity
Available to promise = stock on hand + incoming stock - active reservations - backordered commitments
```

Reservations, incoming stock, and backorders are introduced in later phases. Phase 2 must expose calculation interfaces that return zero for unavailable components without inventing records.

- [ ] Create reusable inventory projection queries.
- [ ] Ensure calculations are database-backed and consistent under concurrent writes.
- [ ] Add warehouse and company-wide totals.
- [ ] Add low-stock and out-of-stock query support.

## Required Automated Tests

- [ ] Product SKU uniqueness
- [ ] Barcode uniqueness
- [ ] Supplier product-code lookup
- [ ] Opening stock
- [ ] Positive adjustment
- [ ] Negative adjustment
- [ ] Negative-stock rejection
- [ ] Authorized negative-stock override
- [ ] Warehouse transfer
- [ ] Transfer atomicity
- [ ] Customer return movement
- [ ] Supplier return movement
- [ ] Stock-count correction
- [ ] Movement reversal
- [ ] Duplicate source-line prevention
- [ ] Idempotent retry
- [ ] Concurrent stock posting
- [ ] Multiple warehouses
- [ ] Stock-on-hand calculation
- [ ] Available-stock calculation
- [ ] Barcode search
- [ ] Permission denial
- [ ] Audit history

## Phase 2 Integration Gate

- [ ] Migration applies to a clean Phase 1 database.
- [ ] Seed remains idempotent.
- [ ] Product and warehouse workflows are usable without direct database access.
- [ ] Stock balances reconcile exactly to posted movement totals.
- [ ] No posted stock record can be edited or deleted.
- [ ] Duplicate source posting is rejected.
- [ ] Negative stock is prevented by default.
- [ ] All tests, type checks, linting, build, Compose validation, and browser flows pass.
- [ ] Documentation and permissions matrix are updated.
- [ ] Code review has no unresolved critical or major issues.
