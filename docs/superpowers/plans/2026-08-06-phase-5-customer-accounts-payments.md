# TADPODS Phase 5 Implementation Plan: Customer Invoices, Payments, Credits, and Statements

**Goal:** Add customer invoicing, full and installment payments, oldest-invoice-first allocation, credits, refunds, reversals, statements, aged receivables, and a clear customer account timeline.

**Depends on:** Phases 1–4 merged and green.

**Primary financial rule:** Customer payments and payment allocations are separate immutable records. A payment belongs to the customer account; allocations describe which invoices it cleared.

## Outcomes

At the end of this phase, staff can:

- Create invoices from deliveries, sales orders, or directly.
- Accept full, partial, irregular, and installment payments.
- Allocate one payment across multiple invoices.
- Allocate multiple payments to one invoice.
- Preserve overpayments as customer credit.
- Apply credit later, issue refunds, and reverse errors without deleting history.
- View exact current, overdue, and available-credit balances.
- Generate statements and aged-receivables reports that reconcile exactly.

## Database Additions

- `customer_invoices`
- `customer_invoice_lines`
- `customer_payments`
- `customer_payment_allocations`
- `customer_credits`
- `customer_credit_applications`
- `customer_refunds`
- `customer_payment_reversals`
- `installment_plans`
- `installment_schedule_lines`
- `customer_statement_runs`

## Task 1: Customer invoice model and posting

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_customer_accounts/migration.sql`
- Create: `packages/contracts/src/customer-invoices.ts`
- Create: `packages/domain/src/customer-invoice.ts`
- Create: `packages/domain/src/customer-invoice.test.ts`
- Create: `apps/api/src/modules/customer-invoices/*`
- Create: `apps/web/src/app/(authenticated)/sales/invoices/*`

### Invoice statuses

- Draft
- Unpaid
- Partially paid
- Paid
- Overdue
- Voided
- Credited

- [ ] Create invoices from one delivery, multiple deliveries for one customer, one sales order, or directly.
- [ ] Support partial invoicing and multiple invoices against one order.
- [ ] Store invoice date, due date, currency, customer reference, source references, quantities, prices, discounts, tax, totals, notes, and attachments.
- [ ] Generate invoice numbers transactionally.
- [ ] Make posted invoices immutable.
- [ ] Calculate amount paid and outstanding from allocations and credit applications only.
- [ ] Prevent invoicing above delivered or authorized direct quantities.
- [ ] Keep fulfilment, invoicing, and payment statuses separate.
- [ ] Add void and credit workflows that create linked reversing records.

## Task 2: Decimal-safe accounts-receivable calculations

**Files:**

- Create: `packages/domain/src/customer-account.ts`
- Create: `packages/domain/src/customer-account.test.ts`
- Create: `apps/api/src/modules/customer-accounts/*`

Implement and test:

```text
Invoice outstanding = invoice total
                    - payment allocations
                    - applied customer credits

Customer balance = posted invoice totals
                 - payment allocations
                 - applied credits
                 - posted refunds that reduce the account

Available customer credit = unallocated payments
                          + unapplied credit notes
                          - credit applications
                          - credit refunds
```

- [ ] Calculate current balance, overdue balance, available credit, due soon, and aged receivables as at a supplied date.
- [ ] Use invoice due date for aging.
- [ ] Never persist an editable customer balance.
- [ ] Reconcile projections to immutable source records.
- [ ] Add database indexes for account, due date, status, and posting date.

## Task 3: Customer payments and automatic allocation

**Files:**

- Create: `packages/contracts/src/customer-payments.ts`
- Create: `packages/domain/src/customer-payment-allocation.ts`
- Create: `packages/domain/src/customer-payment-allocation.test.ts`
- Create: `apps/api/src/modules/customer-payments/*`
- Create: `apps/web/src/app/(authenticated)/customers/payments/*`

- [ ] Store payment date, value date, amount, currency, method, reference, source, notes, attachments, and idempotency key.
- [ ] Allow entry from customer account, invoice, payments screen, or bank import while always storing the payment at customer-account level.
- [ ] Lock eligible unpaid and partially paid invoices for allocation.
- [ ] Sort by due date, then invoice date, then stable invoice ID.
- [ ] Allocate oldest invoice first until value is exhausted.
- [ ] Mark fully covered invoices paid and the final covered invoice partially paid when applicable.
- [ ] Preserve unused value as available customer credit.
- [ ] Prevent total allocations from exceeding payment amount.
- [ ] Prevent allocation above invoice outstanding balance.
- [ ] Prevent cross-customer and cross-currency allocation.
- [ ] Show a clear allocation preview before posting.
- [ ] Record payment and allocations in one database transaction.
- [ ] Emit account, invoice, audit, and notification events through the outbox.

## Task 4: Manual reallocation and reversals

**Files:**

- Create: `apps/api/src/modules/customer-payments/payment-reallocation.service.ts`
- Create: `apps/web/src/app/(authenticated)/customers/payments/[id]/allocate/page.tsx`

- [ ] Allow authorized users to change allocations without editing original records.
- [ ] Create reversing allocation entries for the original distribution.
- [ ] Create replacement allocation entries in the same transaction.
- [ ] Revalidate payment value, invoice balances, account ownership, and currency.
- [ ] Recalculate affected invoice statuses transactionally.
- [ ] Preserve who changed the allocation, when, and why.
- [ ] Support complete payment reversal with linked reversing records.
- [ ] Re-open invoice balances correctly after reversal.

## Task 5: Customer credits, credit notes, and refunds

**Files:**

- Create: `packages/contracts/src/customer-credits.ts`
- Create: `apps/api/src/modules/customer-credits/*`
- Create: `apps/web/src/app/(authenticated)/customers/credits/*`

- [ ] Create credit notes against an invoice or directly against the customer account.
- [ ] Support overpayment credit created automatically from unallocated payment value.
- [ ] Apply credit to one or more invoices.
- [ ] Prevent applications from exceeding available credit or invoice outstanding balance.
- [ ] Support customer refund of unallocated payment or credit value.
- [ ] Distinguish account credit, credit note, payment reversal, and refund clearly in the interface.
- [ ] Make all posted credits, applications, and refunds immutable.
- [ ] Generate branded credit-note and refund-confirmation documents.

## Task 6: Installment plans and unscheduled partial payments

**Files:**

- Create: `packages/contracts/src/installment-plans.ts`
- Create: `packages/domain/src/installment-plan.ts`
- Create: `packages/domain/src/installment-plan.test.ts`
- Create: `apps/api/src/modules/installment-plans/*`
- Create: `apps/web/src/app/(authenticated)/sales/invoices/[id]/installments/page.tsx`

### Supported plans

- Deposit and final payment
- Weekly
- Fortnightly
- Monthly
- Custom dates and amounts

- [ ] Keep installment plans optional.
- [ ] Allow any invoice to receive unscheduled partial payments without a plan.
- [ ] Validate that scheduled installment amounts equal the intended invoice amount or clearly show an unscheduled remainder.
- [ ] Show upcoming, due, overdue, paid, and partially covered installments.
- [ ] Allocate actual payments to invoices first; installment progress is a projection, not a second financial ledger.
- [ ] Permit plan amendment only through versioned replacement with audit history.
- [ ] Add reminders through the outbox without automatically charging customers.

## Task 7: Customer account page and running timeline

**Screens:**

- Customer account summary
- Invoice list and detail
- Payment list and detail
- Allocation detail
- Customer credits
- Refunds
- Installment plans
- Customer statement

- [ ] Show current balance, overdue balance, available credit, unpaid invoices, partially paid invoices, and recent payments at the top.
- [ ] Show orders, deliveries, backorders, invoices, payments, allocations, credits, refunds, and reversals in one chronological account timeline.
- [ ] Link every timeline entry to its source record.
- [ ] Show invoice total, amount paid, outstanding, progress, due date, days overdue, and payment history.
- [ ] Add one-click actions: create invoice, record payment, apply credit, reallocate, refund, reverse, send statement, download PDF.
- [ ] Use plain language such as “Amount still owing” instead of unexplained accounting terminology.

## Task 8: Statements and aged receivables

**Files:**

- Create: `packages/documents/src/customer-statement.tsx`
- Create: `apps/api/src/modules/customer-statements/*`
- Create: `apps/web/src/app/(authenticated)/customers/statements/*`

- [ ] Generate statements for a date range and as-at date.
- [ ] Include opening balance, invoices, payments, allocations, credits, refunds, reversals, and closing balance.
- [ ] Ensure statement closing balance matches the account projection exactly.
- [ ] Store statement-run metadata without freezing or duplicating underlying financial records.
- [ ] Support email, PDF, print, and batch statement generation.
- [ ] Add aged-receivables buckets and drill-down to source invoices.
- [ ] Add customer balance, invoice register, payment register, credit, cash received, and aged-receivables reports.

## Task 9: Bank import workflow

**Files:**

- Create: `packages/contracts/src/bank-imports.ts`
- Create: `apps/api/src/modules/bank-imports/*`
- Create: `apps/web/src/app/(authenticated)/customers/bank-import/*`

- [ ] Accept CSV import with configurable columns for date, amount, reference, payer, and bank transaction ID.
- [ ] Preview and validate before creating payments.
- [ ] Match suggested customers using exact references and explicit user confirmation.
- [ ] Never auto-allocate an ambiguous payment silently.
- [ ] Use bank transaction ID and idempotency key to prevent duplicate imports.
- [ ] Allow unmatched payments to remain in an import queue rather than creating fake customers.
- [ ] Record source file, row number, actor, and matching decision.

## API Endpoints

- `GET/POST /customer-invoices`
- `GET/PATCH /customer-invoices/:id`
- `POST /customer-invoices/:id/post`
- `POST /customer-invoices/:id/void`
- `POST /customer-invoices/:id/credit`
- `GET /customers/:id/account`
- `GET /customers/:id/statement`
- `GET/POST /customer-payments`
- `POST /customer-payments/:id/post`
- `POST /customer-payments/:id/reallocate`
- `POST /customer-payments/:id/reverse`
- `GET/POST /customer-credits`
- `POST /customer-credits/:id/apply`
- `POST /customer-refunds`
- `GET/POST /installment-plans`
- `PATCH /installment-plans/:id/replace`
- `POST /bank-imports/preview`
- `POST /bank-imports/:id/post`

## Required Automated Tests

- [ ] Invoice creation from delivery
- [ ] Partial invoicing
- [ ] Multiple invoices against one order
- [ ] Direct invoice authorization
- [ ] Invoice post immutability
- [ ] Full invoice payment
- [ ] Partial invoice payment
- [ ] Multiple installments
- [ ] Unscheduled partial payment
- [ ] One payment covering multiple invoices
- [ ] Multiple payments covering one invoice
- [ ] Oldest-invoice-first allocation
- [ ] Overpayment creates customer credit
- [ ] Customer credit applied later
- [ ] Manual allocation
- [ ] Allocation reversal
- [ ] Payment reversal
- [ ] Customer refund
- [ ] Credit note
- [ ] Duplicate payment prevention
- [ ] Duplicate bank import prevention
- [ ] Concurrent allocation
- [ ] Cross-customer allocation rejection
- [ ] Cross-currency allocation rejection
- [ ] Invoice outstanding calculation
- [ ] Customer balance calculation
- [ ] Available-credit calculation
- [ ] Statement closing balance
- [ ] Aged-receivables calculation
- [ ] Permission denial and audit history

## Phase 5 Integration Gate

- [ ] Customer account balances reconcile exactly to posted financial records.
- [ ] Payments and allocations remain separate and immutable.
- [ ] Overpayments create usable account credit.
- [ ] Reallocation and reversals preserve the complete audit trail.
- [ ] Statements reproduce account balances exactly.
- [ ] Aged receivables reconcile to invoice outstanding amounts.
- [ ] Bank import prevents duplicate posting and ambiguous silent matching.
- [ ] All tests, type checks, linting, build, Compose validation, and browser workflows pass.
- [ ] Documentation and permissions matrix are updated.
- [ ] Code review has no unresolved critical or major issues.
