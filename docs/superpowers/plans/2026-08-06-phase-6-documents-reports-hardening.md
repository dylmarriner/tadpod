# TADPODS Phase 6 Implementation Plan: Documents, Reports, Imports, and Operational Hardening

**Goal:** Complete the operational product around the transaction engine with branded documents, reporting, imports and exports, notifications, backup and restore, observability, performance, accessibility, and production deployment controls.

**Depends on:** Phases 1–5 merged and green.

**Primary completion rule:** Documents and reports must be derived from posted source records and must reconcile exactly. No exported total may be maintained as a separate editable balance.

## Outcomes

At the end of this phase, TADPODS provides:

- Consistent branded PDFs, emails, print views, and notifications.
- Complete customer, supplier, purchasing, sales, stock, tax, and cash reports.
- CSV and spreadsheet-compatible exports.
- Safe product, customer, supplier, opening-balance, and bank imports.
- Background generation and delivery with retries and dead-letter handling.
- Tested backup, restore, security, observability, accessibility, and deployment procedures.
- A full regression suite covering the complete platform.

## Task 1: Unified TADPODS document system

**Files:**

- Expand: `packages/documents/*`
- Create: `apps/api/src/modules/documents/*`
- Create: `apps/worker/src/handlers/document-generation.ts`
- Create: `apps/web/src/app/(authenticated)/administration/documents/*`

### Required templates

- Sales order
- Purchase order
- Delivery note
- Goods-received note
- Customer invoice
- Customer statement
- Supplier statement
- Supplier remittance
- Customer credit note
- Supplier credit note
- Customer refund confirmation
- Supplier refund confirmation

- [ ] Create a single document theme driven by active brand settings.
- [ ] Include TADPODS as the default product identity, configurable logo, legal name, addresses, tax number, payment details, colours, footer, and contact details.
- [ ] Render HTML email, print HTML, and PDF from the same typed document view model.
- [ ] Ensure totals and quantities come from posted source records.
- [ ] Add document version metadata, generated timestamp, source record ID, and hash.
- [ ] Store generated document references without making generated files the source of truth.
- [ ] Add regeneration with audit history.
- [ ] Prevent cross-customer or cross-supplier document access.
- [ ] Add print and PDF snapshot tests for representative records.

## Task 2: Email and notification delivery

**Files:**

- Create: `apps/worker/src/handlers/email-delivery.ts`
- Create: `apps/api/src/modules/notifications/*`
- Create: `apps/web/src/app/(authenticated)/administration/notifications/*`

- [ ] Send invoices, statements, orders, delivery notes, remittances, backorder updates, and payment confirmations through the transactional outbox.
- [ ] Store delivery attempts, provider response IDs, status, failure reason, and timestamps.
- [ ] Use bounded retries with exponential backoff.
- [ ] Move permanently failed messages to a dead-letter state.
- [ ] Allow authorized retry and cancellation.
- [ ] Prevent duplicate sending on worker restart or retry.
- [ ] Add template preview and test-send to an administrator-controlled address.
- [ ] Keep all customer-facing content branded TADPODS by default.

## Task 3: Reporting query layer

**Files:**

- Create: `packages/contracts/src/reports.ts`
- Create: `apps/api/src/modules/reports/*`
- Create: `apps/web/src/app/(authenticated)/reports/*`

### Customer reports

- Customer balances
- Customer statements
- Aged receivables
- Customer invoice register
- Customer payment register
- Customer credits
- Cash received

### Supplier reports

- Supplier balances
- Supplier statements
- Aged payables
- Supplier bill register
- Supplier payment register
- Supplier credits
- Cash paid
- Received-not-billed
- Purchase commitments

### Sales and purchasing reports

- Sales by customer
- Sales by product
- Purchases by supplier
- Purchases by product

### Inventory and backorder reports

- Stock on hand
- Available stock
- Reserved stock
- Incoming stock
- Stock by warehouse
- Stock movement history
- Backorders by customer
- Backorders by product
- Backorders by warehouse
- Backorders by expected date
- Low-stock report
- Reorder recommendations

### Tax reports

- Tax summary by rate
- Output tax from customer invoices
- Input tax from supplier bills
- Net tax position for a selected period

- [ ] Build report queries from immutable posted records and current projections.
- [ ] Add as-at dates, date ranges, account, product, warehouse, status, and currency filters.
- [ ] Add stable sorting and pagination.
- [ ] Link totals and rows to source records.
- [ ] Add saved filters in URL parameters.
- [ ] Add report reconciliation tests against known source transactions.
- [ ] Add database indexes and query plans for the largest expected datasets.

## Task 4: Export system

**Files:**

- Create: `apps/api/src/modules/exports/*`
- Create: `apps/worker/src/handlers/report-export.ts`

- [ ] Support CSV and XLSX-compatible exports for every report.
- [ ] Preserve decimal values, dates, document numbers, and identifiers without locale corruption.
- [ ] Include filter and generated-at metadata.
- [ ] Stream small exports directly and generate large exports asynchronously.
- [ ] Store large export files with expiry and access controls.
- [ ] Prevent formula injection in spreadsheet exports.
- [ ] Add audit events for exports containing customer or supplier financial data.

## Task 5: Product, customer, and supplier imports

**Files:**

- Create: `packages/contracts/src/imports.ts`
- Create: `apps/api/src/modules/imports/*`
- Create: `apps/worker/src/handlers/import-processing.ts`
- Create: `apps/web/src/app/(authenticated)/administration/imports/*`

- [ ] Accept CSV files with explicit column mapping.
- [ ] Provide preview, validation, warnings, and errors before posting.
- [ ] Distinguish create, update, skip, and conflict rows.
- [ ] Use natural keys such as SKU, account code, and supplier code only when explicitly mapped.
- [ ] Prevent silent overwrites.
- [ ] Use an import batch idempotency key.
- [ ] Store original file reference, row decisions, actor, timestamps, and final result.
- [ ] Allow re-download of error rows.
- [ ] Add permission checks and audit events.

## Task 6: Opening-balance import

**Files:**

- Create: `apps/api/src/modules/imports/opening-balances/*`
- Create: `apps/web/src/app/(authenticated)/administration/imports/opening-balances/*`

- [ ] Support opening customer invoices, supplier bills, account credits, and stock through normal posting services.
- [ ] Require an effective date and import reference.
- [ ] Preview resulting account and stock balances before posting.
- [ ] Prevent a row from posting twice.
- [ ] Preserve original document references and opening-balance source metadata.
- [ ] Require elevated permission and explicit confirmation.
- [ ] Generate reconciliation totals before and after posting.
- [ ] Reject attempts to directly write editable balances.

## Task 7: Attachment storage and retention

**Files:**

- Expand: `packages/database` attachment models
- Create: `apps/api/src/modules/attachments/*`
- Create: `apps/worker/src/handlers/attachment-retention.ts`

- [ ] Use S3-compatible object storage with private buckets.
- [ ] Store object key, content type, size, checksum, source record, uploader, and retention metadata.
- [ ] Validate file type and size.
- [ ] Add malware-scanning integration point before files become downloadable.
- [ ] Use signed short-lived download URLs.
- [ ] Prevent orphaned file references and cross-account access.
- [ ] Implement configurable retention without deleting files required for financial or audit records.

## Task 8: Security hardening

- [ ] Add rate limits for authentication, imports, exports, and posting endpoints.
- [ ] Add secure headers and a restrictive content-security policy.
- [ ] Add CSRF protection appropriate to cookie-authenticated writes.
- [ ] Add session revocation, inactivity expiry, and administrator session view.
- [ ] Add password policy and optional multi-factor authentication architecture.
- [ ] Add secret rotation documentation.
- [ ] Add dependency and container scanning in CI.
- [ ] Add authorization tests for every module and cross-account data-access tests.
- [ ] Add structured security event logging without storing passwords, tokens, or financial secrets.

## Task 9: Observability and operational health

**Files:**

- Create: `apps/api/src/modules/health/readiness.controller.ts`
- Create: `packages/observability/*` if separation is justified
- Update: Docker and deployment configuration

- [ ] Add liveness and readiness endpoints.
- [ ] Check database, object storage, and worker/outbox health.
- [ ] Add structured logs with request IDs, actor IDs, source record IDs, and durations.
- [ ] Add metrics for request latency, errors, posting failures, outbox backlog, email failures, and report duration.
- [ ] Add trace correlation across web, API, worker, and database operations.
- [ ] Define alerts for failed migrations, unavailable database, growing outbox backlog, repeated posting errors, and backup failures.
- [ ] Ensure logs redact tokens, cookies, passwords, and sensitive attachment URLs.

## Task 10: Backup and restore

**Files:**

- Create: `scripts/backup.sh`
- Create: `scripts/restore.sh`
- Create: `docs/backup-and-restore.md`

- [ ] Back up PostgreSQL and object storage with encryption.
- [ ] Define retention and rotation.
- [ ] Verify backup integrity.
- [ ] Restore into an isolated environment.
- [ ] Run migrations and reconciliation checks after restore.
- [ ] Test recovery of account balances, stock balances, attachments, and audit history.
- [ ] Record recovery point and recovery time measurements.
- [ ] Document who may run backup and restore operations.

## Task 11: Performance and concurrency hardening

- [ ] Establish realistic data-volume fixtures without shipping fake production data.
- [ ] Benchmark product search, customer account load, supplier account load, stock-on-hand report, aged receivables, aged payables, and backorder dashboard.
- [ ] Add indexes based on measured query plans.
- [ ] Validate serializable posting operations under concurrent payments, receipts, deliveries, and reservations.
- [ ] Add pagination limits and export background thresholds.
- [ ] Prevent N+1 queries on account timelines and document generation.
- [ ] Define acceptable response-time targets for common workflows.

## Task 12: Accessibility and usability verification

- [ ] Run automated accessibility checks across login, dashboard, order entry, receipt, delivery, invoice, payment, account, report, and administration screens.
- [ ] Verify keyboard-only operation for common workflows.
- [ ] Verify visible focus, labels, error association, status communication, and contrast.
- [ ] Verify tablet warehouse workflows and mobile account lookup.
- [ ] Perform guided usability tests using new-staff scenarios.
- [ ] Remove unnecessary steps, duplicate fields, and ambiguous accounting language found during testing.

## Task 13: Production deployment and release process

**Files:**

- Update: `docs/deployment.md`
- Create: `docs/production-runbook.md`
- Create: `docs/release-checklist.md`
- Update: CI/CD workflows

- [ ] Provide repeatable container-based deployment.
- [ ] Separate build-time and runtime configuration.
- [ ] Run migrations as an explicit controlled release step.
- [ ] Add zero-downtime or maintenance-mode procedure for schema changes.
- [ ] Add rollback procedure for application releases and forward-recovery procedure for database changes.
- [ ] Add environment validation before startup.
- [ ] Add release notes and version metadata in the application.
- [ ] Add smoke tests after deployment.
- [ ] Add documented first-administrator provisioning and credential rotation.

## Task 14: Full regression and reconciliation suite

- [ ] Run every required test from Phases 1–5.
- [ ] Add end-to-end purchase-to-pay workflow.
- [ ] Add end-to-end order-to-cash workflow.
- [ ] Add backorder-to-purchase-to-delivery workflow.
- [ ] Add overpayment-credit-refund workflow.
- [ ] Add supplier-advance-credit-refund workflow.
- [ ] Add restore-and-reconcile workflow.
- [ ] Verify customer statements, supplier statements, stock reports, aged reports, tax reports, cash reports, and dashboard totals against the same seeded transaction set.
- [ ] Verify duplicate retries do not create duplicate financial or stock effects.

## Required API Areas

- `/documents`
- `/notifications`
- `/reports`
- `/exports`
- `/imports`
- `/attachments`
- `/health/live`
- `/health/ready`
- `/administration/sessions`
- `/administration/system-health`

All write endpoints require validated contracts, permissions, idempotency where appropriate, audit events, and transaction boundaries.

## Phase 6 Integration Gate

- [ ] All document templates reconcile to source records and active brand settings.
- [ ] All report totals reconcile to financial and stock ledgers.
- [ ] Imports provide preview, validation, conflict handling, and idempotency.
- [ ] Exports are safe from spreadsheet formula injection.
- [ ] Email and document jobs retry safely without duplication.
- [ ] Backup and restore have been executed successfully in an isolated environment.
- [ ] Security, performance, concurrency, and accessibility gates pass.
- [ ] Production deployment and rollback procedures are documented and tested.
- [ ] Full regression suite passes on the exact release commit.
- [ ] No unresolved critical or major code-review findings remain.
- [ ] Administrator and end-user guides describe all completed workflows.
