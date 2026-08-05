# TADPODS Phase 3 Implementation Plan: Purchasing and Supplier Accounts

**Goal:** Add suppliers, purchase orders, partial receipts, supplier bills, payments, credits, remittances, exact accounts-payable balances, and received-not-billed reporting.

**Depends on:** Phases 1 and 2 merged and green.

**Primary accounting rule:** A confirmed purchase order is a commitment, not an amount owed. Only posted supplier bills create accounts payable. Goods received but not billed remain a separate operational liability view.

## Outcomes

At the end of this phase, staff can:

- Maintain supplier records and supplier product details.
- Generate or create purchase orders.
- Receive all or part of an order and increase stock once only.
- Match one or more goods receipts to one or more supplier bills.
- Record full, partial, advance, and multi-bill supplier payments.
- Automatically allocate payments oldest bill first.
- Preserve unused payment value as supplier credit.
- See exact current, overdue, due-soon, and received-not-billed totals.
- Generate supplier statements and remittance summaries.

## Database Additions

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
- `supplier_credit_applications`
- `supplier_refunds`
- `supplier_payment_reversals`

## Task 1: Supplier master records and account model

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_suppliers_and_purchasing/migration.sql`
- Create: `packages/contracts/src/suppliers.ts`
- Create: `packages/domain/src/supplier-account.ts`
- Create: `packages/domain/src/supplier-account.test.ts`
- Create: `apps/api/src/modules/suppliers/*`

- [ ] Add suppliers with unique account code, legal/display name, tax number, currency, payment terms, contact details, active state, and notes.
- [ ] Add billing, delivery, and general supplier addresses.
- [ ] Add duplicate-name warnings without treating similar names as guaranteed duplicates.
- [ ] Add supplier account projections for current amount owed, overdue amount, due within 7 days, due within 30 days, available credit, and received-not-billed.
- [ ] Add searchable supplier list and account timeline endpoints.
- [ ] Add permissions for supplier viewing, maintenance, account viewing, and financial posting.

## Task 2: Purchase orders

**Files:**

- Create: `packages/contracts/src/purchase-orders.ts`
- Create: `packages/domain/src/purchase-order.ts`
- Create: `packages/domain/src/purchase-order.test.ts`
- Create: `apps/api/src/modules/purchase-orders/*`
- Create: `apps/web/src/app/(authenticated)/purchasing/orders/*`

### Purchase-order statuses

- Draft
- Awaiting approval
- Confirmed
- Partially received
- Received
- Partially billed
- Billed
- Cancelled
- Closed

- [ ] Add purchase order header and lines with ordered, received, returned, billed, unbilled, and outstanding quantities.
- [ ] Generate document numbers transactionally.
- [ ] Support draft edits and immutable confirmed snapshots of commercial terms.
- [ ] Add approval flow controlled by permission and optional value threshold.
- [ ] Prevent receipt or billing above ordered quantity unless an authorized tolerance override is used.
- [ ] Support generation from low-stock products, reorder rules, backorders, or manual selection.
- [ ] Keep commitments visible separately from payables.
- [ ] Add duplicate-order shortcut and supplier-specific product defaults.

## Task 3: Goods receipts and stock posting

**Files:**

- Create: `packages/contracts/src/goods-receipts.ts`
- Create: `apps/api/src/modules/goods-receipts/*`
- Create: `apps/web/src/app/(authenticated)/purchasing/receipts/*`

- [ ] Create a goods receipt from one purchase order.
- [ ] Support partial receipts and multiple receipts against one order.
- [ ] Allow received quantities, rejected quantities, warehouse selection, lot/reference notes, and attachments.
- [ ] Post linked stock movements through the Phase 2 stock-posting service.
- [ ] Use source-line uniqueness so a receipt line cannot increase stock twice.
- [ ] Update purchase-order received status in the same transaction.
- [ ] Allow reversal only through an equal-and-opposite stock and receipt reversal workflow.
- [ ] Expose received-not-billed quantities and values immediately after posting.

## Task 4: Supplier bills and matching

**Files:**

- Create: `packages/contracts/src/supplier-bills.ts`
- Create: `packages/domain/src/supplier-bill.ts`
- Create: `packages/domain/src/supplier-bill.test.ts`
- Create: `apps/api/src/modules/supplier-bills/*`
- Create: `apps/web/src/app/(authenticated)/purchasing/bills/*`

### Supplier-bill statuses

- Draft
- Awaiting approval
- Approved
- Unpaid
- Partially paid
- Paid
- Overdue
- Disputed
- Voided
- Credited

- [ ] Create bills from a purchase order, one goods receipt, multiple goods receipts, or directly.
- [ ] Support partial bills and multiple bills against one purchase order.
- [ ] Store supplier invoice number, internal bill number, dates, currency, references, quantities, unit costs, discounts, tax, attachments, and notes.
- [ ] Prevent duplicate supplier invoice numbers for the same supplier.
- [ ] Allow explicit manager override with reason, permission, and audit event.
- [ ] Prevent billed quantity from exceeding received or authorized unmatched quantity.
- [ ] Post approved bills immutably.
- [ ] Calculate amount paid and outstanding from allocations, never editable balance fields.
- [ ] Update purchase-order billed state transactionally.

## Task 5: Supplier payments and oldest-bill-first allocation

**Files:**

- Create: `packages/contracts/src/supplier-payments.ts`
- Create: `packages/domain/src/payment-allocation.ts`
- Create: `packages/domain/src/payment-allocation.test.ts`
- Create: `apps/api/src/modules/supplier-payments/*`
- Create: `apps/web/src/app/(authenticated)/suppliers/payments/*`

- [ ] Store supplier payments separately from allocations.
- [ ] Record payment date, value date, amount, currency, method, reference, bank account label, notes, attachments, and idempotency key.
- [ ] Lock eligible unpaid and partially paid bills for allocation.
- [ ] Allocate oldest due bill first, then oldest bill date, then stable bill ID.
- [ ] Prevent total allocations from exceeding payment value.
- [ ] Prevent allocations from exceeding bill outstanding balance.
- [ ] Prevent cross-supplier allocations.
- [ ] Preserve unused value as supplier account credit.
- [ ] Show allocation preview before posting.
- [ ] Support manual allocation changes by authorized users.
- [ ] Preserve original allocations and create reversing allocations instead of deleting history.
- [ ] Generate a remittance summary through the outbox/document system.

## Task 6: Supplier credits, refunds, advances, and reversals

**Files:**

- Create: `apps/api/src/modules/supplier-credits/*`
- Create: `apps/web/src/app/(authenticated)/suppliers/credits/*`

- [ ] Support supplier credit notes against a bill or directly against the account.
- [ ] Support advance payments with no bill allocation.
- [ ] Support application of supplier credit to later bills.
- [ ] Support supplier refunds returning unused advance or credit.
- [ ] Support payment reversal with complete audit trail and re-opened bill balances.
- [ ] Prevent credit applications from exceeding available credit or bill balance.
- [ ] Prevent deletion of any posted payment, allocation, credit, refund, or reversal.

## Task 7: Supplier account page and timeline

**Screens:**

- Supplier list
- Supplier detail
- Supplier account
- Purchase orders
- Goods receipts
- Supplier bills
- Supplier payments
- Supplier credits
- Supplier statement
- Remittance history

- [ ] Show current amount owed, overdue amount, due soon, available credit, purchase commitments, and received-not-billed separately.
- [ ] Show unpaid, partially paid, paid, disputed, credited, and overdue bills.
- [ ] Show payments, allocations, reversals, credits, refunds, orders, receipts, and attachments in one chronological timeline.
- [ ] Link every account activity line to its source record.
- [ ] Add one-click next actions: create order, receive goods, create bill, pay supplier, apply credit, send statement, download remittance.
- [ ] Use plain operational language instead of general-ledger terminology.

## Task 8: Accounts-payable calculations and reports

Implement and test:

```text
Supplier amount owed = posted supplier bills
                     - allocated supplier payments
                     - applied supplier credits

Net accounts payable = total supplier amount owed
                     - unapplied supplier credits
```

Also calculate:

- Total owed to all suppliers
- Total overdue
- Due within 7 days
- Due within 30 days
- Received-not-billed
- Purchase commitments
- Supplier credit available

- [ ] Ensure purchase commitments never enter supplier amount owed.
- [ ] Ensure goods received but not billed never enter posted supplier balances.
- [ ] Add aged-payables buckets using due dates and the report-as-at date.
- [ ] Add supplier balance, bill register, payment register, credit, purchase commitment, and received-not-billed reports.

## API Endpoints

- `GET/POST /suppliers`
- `GET/PATCH /suppliers/:id`
- `GET /suppliers/:id/account`
- `GET /suppliers/:id/statement`
- `GET/POST /purchase-orders`
- `GET/PATCH /purchase-orders/:id`
- `POST /purchase-orders/:id/submit`
- `POST /purchase-orders/:id/approve`
- `POST /purchase-orders/:id/confirm`
- `POST /purchase-orders/:id/cancel`
- `POST /goods-receipts`
- `POST /goods-receipts/:id/post`
- `POST /goods-receipts/:id/reverse`
- `GET/POST /supplier-bills`
- `POST /supplier-bills/:id/approve`
- `POST /supplier-bills/:id/post`
- `POST /supplier-bills/:id/credit`
- `GET/POST /supplier-payments`
- `POST /supplier-payments/:id/post`
- `POST /supplier-payments/:id/reallocate`
- `POST /supplier-payments/:id/reverse`
- `POST /supplier-credits/:id/apply`
- `POST /supplier-refunds`

## Required Automated Tests

- [ ] Supplier uniqueness and archive rules
- [ ] Purchase-order approval and confirmation
- [ ] Partial receipt
- [ ] Multiple receipts
- [ ] Receipt stock posting once only
- [ ] Receipt reversal
- [ ] Partial bill
- [ ] Multiple bills against one order
- [ ] Multiple receipts matched to one bill
- [ ] Duplicate supplier invoice prevention
- [ ] Authorized duplicate override with audit event
- [ ] Full bill payment
- [ ] Partial bill payment
- [ ] Multiple payment installments
- [ ] One payment covering multiple bills
- [ ] Multiple payments covering one bill
- [ ] Oldest-bill-first allocation
- [ ] Advance payment
- [ ] Unallocated supplier credit
- [ ] Credit application
- [ ] Supplier refund
- [ ] Allocation reversal
- [ ] Payment reversal
- [ ] Duplicate payment prevention
- [ ] Concurrent allocation
- [ ] Supplier balance calculation
- [ ] Aged payables
- [ ] Due-soon totals
- [ ] Purchase commitments excluded from payables
- [ ] Received-not-billed calculation
- [ ] Remittance generation
- [ ] Permission denial and audit history

## Phase 3 Integration Gate

- [ ] Supplier balances reconcile exactly to posted bills, allocations, and credits.
- [ ] Purchase commitments and payables are visibly and mathematically separate.
- [ ] Goods receipts affect stock once only.
- [ ] Received-not-billed reconciles to receipt and bill lines.
- [ ] Payments, allocations, credits, refunds, and reversals are immutable.
- [ ] All required reports reconcile to account records.
- [ ] All tests, type checks, linting, build, Compose validation, and browser workflows pass.
- [ ] Documentation and permissions matrix are updated.
- [ ] Code review has no unresolved critical or major issues.
