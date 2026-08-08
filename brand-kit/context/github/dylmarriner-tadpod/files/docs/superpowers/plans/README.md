# TADPODS Implementation Plan Index

This directory contains the approved product design, the cross-phase roadmap, and execution-level plans for every delivery phase.

## Product and Roadmap

- [Product and System Design](../specs/2026-08-05-tadpods-product-design.md)
- [Complete Implementation Roadmap](2026-08-06-tadpods-implementation-roadmap.md)

## Execution Plans

1. [Phase 1: Platform Foundation](2026-08-05-platform-foundation.md)
2. [Phase 2: Products, Warehouses, and Inventory Ledger](2026-08-06-phase-2-products-inventory.md)
3. [Phase 3: Purchasing and Supplier Accounts](2026-08-06-phase-3-purchasing-supplier-accounts.md)
4. [Phase 4: Sales, Reservations, Deliveries, and Backorders](2026-08-06-phase-4-sales-reservations-backorders.md)
5. [Phase 5: Customer Invoices, Payments, Credits, and Statements](2026-08-06-phase-5-customer-accounts-payments.md)
6. [Phase 6: Documents, Reports, Imports, and Operational Hardening](2026-08-06-phase-6-documents-reports-hardening.md)

## Execution Rule

Each phase must be implemented as a separate branch and pull request. A later phase may begin only after its dependencies are merged and its integration gate is green. Financial and stock posting rules cannot be weakened to make a phase appear complete.
