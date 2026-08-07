# TADPODS Implementation Roadmap

**Status:** Active build plan  
**Repository:** `dylmarriner/tadpods`  
**Default integration target:** `main`  
**Current working branch:** `phase1-platform-foundation-main`

## Objective

Build TADPODS as a focused, production-quality business management platform for customers, suppliers, inventory, purchasing, sales, backorders, invoicing, payments, credits, statements, reporting, and audit history.

TADPODS must remain narrower and easier to operate than a general ERP. Every workflow must use plain language, sensible defaults, minimal data entry, visible status, and an obvious next action.

## Non-Negotiable Rules

- TADPODS is the default brand on every screen, email, PDF, report, notification, document, favicon, and metadata surface.
- PostgreSQL is the source of truth.
- Posted financial and inventory records are immutable.
- Corrections use reversals, not edits or deletion.
- Money uses decimal-safe storage and calculation.
- Stock is derived from posted `stock_movements`.
- Payments and allocations are separate records.
- Customer and supplier allocations cannot cross account boundaries.
- Duplicate financial or stock postings must be rejected through unique constraints and idempotency keys.
- Negative stock is disabled by default.
- Purchase commitments remain separate from actual supplier payables.
- Goods received but not billed remain separate from posted supplier balances.
- Every material write records user attribution and audit history.
- No fake records, placeholder workflows, `TODO`, or `FIXME` markers are accepted as completed work.

## Delivery Strategy

The build is divided into vertical phases. Each phase must leave the repository runnable, migrated, documented, and covered by automated tests before the next phase is merged.

---

## Phase 1: Platform Foundation

**Purpose:** Establish the application shell and the safety mechanisms required by every later module.

### Scope

- pnpm TypeScript monorepo
- Next.js web application
- NestJS and Fastify API
- PostgreSQL and Prisma
- Environment validation
- Decimal-safe money primitive
- Authentication and refresh sessions
- Configurable users, roles, and permissions
- Audit logging
- TADPODS branding settings
- Document numbering
- Outbox worker foundation
- Branded document and email primitives
- Docker Compose development stack
- CI verification
- Administrator, deployment, development, and end-user guides

### Current Status

Implementation is present on `phase1-platform-foundation-main` and PR #1. Linting, type checking, package tests, production builds, migrations, seed idempotency, and Compose validation have passed in CI. Final CI cleanup and the complete browser smoke test remain part of the integration gate.

### Integration Gate

- [ ] Dependency lockfile committed
- [ ] Lint passes
- [ ] Type checking passes
- [ ] Unit and integration tests pass
- [ ] Production build passes
- [ ] Migration applies to a clean database
- [ ] Seed runs twice without duplication
- [ ] Docker Compose configuration validates
- [ ] Browser login and dashboard smoke test passes
- [ ] Code review has no unresolved critical or major issues
- [ ] PR is merged to `main`

---

## Phase 2: Products, Warehouses, and Inventory Ledger

**Purpose:** Establish accurate stock visibility before sales and purchasing workflows depend on it.

### Database Records

- `products`
- `product_categories`
- `product_suppliers`
- `warehouses`
- `stock_movements`
- `stock_counts`
- `stock_count_lines`

### Product Capabilities

- SKU, barcode, name, description, category, unit of measure
- Sales price, purchase cost, tax rate
- Preferred and alternative suppliers
- Supplier product codes
- Reorder level, reorder quantity, and lead time
- Active and archived state
- Searchable and barcode-friendly selection

### Inventory Capabilities

- Opening stock
- Goods receipt
- Sales delivery
- Customer return
- Supplier return
- Warehouse transfer
- Positive and negative adjustment
- Stock-count correction
- Reversal movement
- Stock by warehouse
- Complete movement history

### Calculations

```text
Stock on hand = posted stock increases - posted stock decreases
Available stock = stock on hand - active reservations
Incoming stock = confirmed purchase quantity not yet received
Available to promise = stock on hand + confirmed incoming stock - reservations - backordered commitments
```

### Safety Controls

- Posted movements are immutable.
- Each external source line can create stock effect only once.
- Reversals create equal and opposite movements.
- Negative stock is rejected unless explicitly enabled and authorized.
- Concurrent stock posting uses database transactions and row-level locking.

### Required Tests

- Opening balance
- Receipt and delivery
- Customer and supplier returns
- Warehouse transfer
- Positive and negative adjustment
- Stock count correction
- Reversal
- Duplicate posting prevention
- Negative-stock prevention
- Multiple warehouses
- Concurrent stock posting
- Stock-on-hand and available-stock calculations

### Integration Gate

- [ ] Product and warehouse CRUD is usable
- [ ] Ledger calculations match posted movements
- [ ] Stock screens link to source records
- [ ] Barcode lookup works
- [ ] All required inventory tests pass

---

## Phase 3: Purchasing and Supplier Accounts

**Purpose:** Manage supplier commitments, receipts, bills, payments, credits, and exact amounts owed.

### Database Records

- `suppliers`
- `supplier_addresses`
- `purchase_orders`
- `purchase_order_lines`
- `goods_receipts`
- `goods_receipt_lines`
- `supplier_bills`
- `supplier_bill_lines`
- `supplier_payments`
- `supplier_payment_allocations`
- `supplier_credits`
- `supplier_refunds`

### Purchase Workflow

1. Create or generate a purchase order.
2. Select supplier and products.
3. Confirm the purchase order.
4. Receive all or part of the order.
5. Post stock movements.
6. Match or create supplier bills.
7. Record supplier payments.
8. Allocate payments oldest bill first by default.
9. Close the order when fully received and billed.

### Supplier Account Calculation

```text
Supplier amount owed = posted supplier bills
                     - allocated supplier payments
                     - applied supplier credits
```

Purchase orders are commitments, not payables. Received-not-billed values remain separate from posted supplier balances.

### Required Tests

- Full and partial receipt
- Multiple receipts against one order
- Partial and multiple bills
- Duplicate supplier invoice prevention
- Full and partial bill payments
- One payment covering multiple bills
- Multiple payments covering one bill
- Advance payment and unallocated credit
- Supplier credit and refund
- Allocation reversal
- Supplier balance
- Aged payables
- Received-not-billed

### Integration Gate

- [ ] Supplier account page reconciles to source records
- [ ] Purchasing progress indicator is accurate
- [ ] Goods receipts affect stock once only
- [ ] Supplier payments generate remittance summaries
- [ ] Purchase commitments and payables are visibly separate

---

## Phase 4: Sales, Reservations, Deliveries, and Backorders

**Purpose:** Support simple order entry, accurate fulfilment, stock reservations, partial deliveries, and linked backorders.

### Database Records

- `customers`
- `customer_addresses`
- `sales_orders`
- `sales_order_lines`
- `stock_reservations`
- `deliveries`
- `delivery_lines`
- `backorders`
- `backorder_lines`

### Sales Workflow

1. Create a sales order.
2. Select customer and products.
3. Display stock on hand and available stock immediately.
4. Confirm the order.
5. Reserve available stock.
6. Create backorders for unavailable quantities.
7. Deliver all or part of the order.
8. Post stock decreases exactly once.
9. Continue fulfilment as incoming stock arrives.
10. Hand completed delivery quantities to invoicing.

### Reservation Rules

- Reserve immediately on confirmation
- Reserve manually
- Reserve by priority
- Reserve by promised date
- Reserve oldest order first

Reservation changes must be transactional and visible from both product and order screens.

### Backorder Rules

- Full and partial backorders
- One backorder per order line where appropriate
- Multiple fulfilments
- Customer-requested partial shipment
- Linked supplier and purchase order
- Expected availability and promise date
- Automatic readiness update after goods receipt
- Cancellation and quantity adjustment with audit history

### Required Tests

- Full stock availability
- Partial availability
- Full and partial backorders
- Multiple fulfilments
- Incoming stock allocation
- Cancellation
- Purchase order generated from backorder
- Partial delivery
- Reservation and release
- Duplicate delivery prevention
- Concurrent reservation
- Available-to-promise calculation

### Integration Gate

- [x] Sales entry displays live availability
- [x] Delivery and backorder quantities reconcile to the order
- [x] Incoming stock can be assigned to backorders
- [x] Backorder dashboard links to all source records
- [x] Stock cannot be consumed twice

---

## Phase 5: Customer Invoices, Payments, Credits, and Statements

**Purpose:** Provide Xero-like clarity for customer accounts without importing the rest of accounting civilisation.

### Database Records

- `customer_invoices`
- `customer_invoice_lines`
- `customer_payments`
- `customer_payment_allocations`
- `customer_credits`
- `customer_credit_applications`
- `customer_refunds`
- `installment_plans`
- `installment_schedule_lines`

### Customer Payment Posting

1. Record the full payment against the customer account.
2. Lock eligible unpaid and partially paid invoices.
3. Sort invoices from oldest to newest.
4. Allocate until the payment is exhausted.
5. Mark covered invoices paid.
6. Mark the final covered invoice partially paid when required.
7. Preserve unused value as available account credit.
8. Store the full allocation summary.
9. Allow authorized manual reallocation and reversal.
10. Preserve all original and reversing records.

### Invoice Statuses

- Unpaid
- Partially paid
- Paid
- Overdue
- Voided
- Credited

### Installments

- Deposit and final payment
- Weekly
- Fortnightly
- Monthly
- Custom dates and amounts
- Unscheduled partial payments remain allowed

### Required Tests

- Full payment
- Partial payment
- Multiple installments
- One payment covering multiple invoices
- Multiple payments covering one invoice
- Overpayment creating credit
- Credit applied later
- Manual allocation
- Allocation reversal
- Refund
- Duplicate payment prevention
- Concurrent allocation
- Statement balance
- Aged receivables

### Integration Gate

- [x] Customer account timeline reconciles to invoices, payments, allocations, credits, and refunds
- [x] Statements reproduce the account balance exactly
- [x] Payment allocation preview is clear before posting
- [x] Posted financial records cannot be edited
- [x] Reversals retain the full audit trail

---

## Phase 6: Documents, Reports, Imports, and Operational Hardening

**Purpose:** Complete the operational product around the transaction engine.

### Documents

- Sales orders
- Purchase orders
- Delivery notes
- Goods-received notes
- Customer invoices
- Supplier remittances
- Customer statements
- Supplier statements
- Credit notes
- Refund confirmations

Every template uses configurable TADPODS branding while retaining TADPODS defaults.

### Reports

- Customer balances and aged receivables
- Customer invoice and payment registers
- Customer credits
- Supplier balances and aged payables
- Supplier bill and payment registers
- Supplier credits
- Received-not-billed
- Purchase commitments
- Sales and purchases by account and product
- Stock on hand, available, reserved, incoming, and by warehouse
- Stock movement history
- Backorders by customer, product, warehouse, and expected date
- Low stock and reorder recommendations
- Tax summary
- Cash received and cash paid

### Imports and Exports

- CSV and spreadsheet-compatible exports
- Bank payment import workflow
- Product import
- Customer and supplier import
- Opening-balance import with validation and preview
- Export filters saved in URLs

### Hardening

- Pagination and query indexes
- Background email and PDF generation
- Retry and dead-letter handling
- Attachment storage and retention
- Backup and restore procedure
- Health and readiness probes
- Structured logs
- Rate limiting
- Security headers
- Audit retention
- Performance baselines
- Accessibility checks
- Production deployment runbook

### Integration Gate

- [ ] Documents match source records and brand settings
- [ ] Report totals reconcile to ledger data
- [ ] Imports provide preview, validation, and idempotency
- [ ] Backup and restore is tested
- [ ] Production deployment is documented and repeatable
- [ ] Full regression suite passes

---

## Standard Screen Pattern

Every main record screen must show:

1. Document title and number
2. Current status
3. Progress indicator
4. Key totals and outstanding quantities
5. What has already occurred
6. What remains outstanding
7. Warnings requiring attention
8. Recommended next action
9. Related records
10. Audit history

Common actions must remain consistent across modules:

- Duplicate
- Confirm
- Receive
- Deliver
- Create backorder
- Create invoice or bill
- Record payment
- Apply credit
- Email
- Download PDF
- Print
- Export
- Reverse

Destructive, financial, stock-affecting, and irreversible operations require confirmation. Ordinary navigation and data entry do not.

## API Conventions

- REST JSON API under `/api` or a dedicated API host
- Zod-validated request and response contracts
- UUID identifiers
- ISO 8601 UTC timestamps
- Cursor or stable offset pagination
- Query-string filters and sorting
- Structured validation errors
- Idempotency key support for posting operations
- Optimistic version checking where appropriate
- Database transactions for every multi-record posting

## Definition of Done for Every Feature

A feature is complete only when:

- [ ] Database schema and migration exist
- [ ] Constraints and indexes exist
- [ ] Domain calculations are isolated and tested
- [ ] API contracts are validated
- [ ] Permission checks exist
- [ ] Audit events exist
- [ ] UI uses real API data
- [ ] Empty, loading, success, warning, and error states exist
- [ ] Keyboard and responsive behaviour are usable
- [ ] Unit, integration, and relevant browser tests pass
- [ ] Documentation is updated
- [ ] CI passes on the exact commit proposed for merge

## Recommended Build Order After Phase 1

1. Products and warehouses
2. Stock movement posting
3. Stock availability screens
4. Suppliers and purchase orders
5. Goods receipts
6. Supplier bills and payments
7. Customers and sales orders
8. Reservations and deliveries
9. Backorders and incoming-stock allocation
10. Customer invoices and payments
11. Credits, refunds, and statements
12. Reports, imports, and production hardening

This order is deliberate. Inventory and financial engines are built before dashboards and reports depend on them, because decorating incorrect numbers merely makes the incorrect numbers easier to admire.
