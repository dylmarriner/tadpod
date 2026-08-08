# TADPODS Foundry Master UI Design

Date: 2026-08-09
Status: Approved design direction, implementation pending written-spec review

## 1. Purpose

Foundry becomes the single authoritative UI system for TADPODS. The goal is not to apply a theme over existing pages. Every current TADPODS workflow, state, page pattern, and interaction must be expressed through Foundry components so the product has one coherent visual and interaction language.

No production screen may require a developer to invent new visual conventions during implementation. If a workflow needs a pattern that Foundry does not yet provide, the pattern is added to Foundry first and then consumed by the workflow.

## 2. Product Coverage

Foundry must cover the complete current application surface:

### Authentication
- Sign in
- Invalid credentials
- Submission/loading state
- Session expiry
- Signed-out state
- Access denied / insufficient permissions

### Dashboard
- Default populated dashboard
- New-business / empty dashboard
- Loading and error states
- Attention and warning states
- Permission-aware metric variations

### Sales
- Sales orders: list, create, edit, detail, fulfilment, partial fulfilment, cancellation
- Backorders: queue, detail, allocation, partial availability, fulfilment
- Customer invoices: list, create, edit, issue/send, detail, paid, partially paid, overdue, void
- Customer payments: record payment, automatic allocation display, partial allocation, excess customer credit
- Customer credits: balance, allocation, usage history

### Purchasing
- Purchase orders: list, create, edit, detail, issue/order, receipt progress
- Goods receipts: receive stock, partial receipt, discrepancies, completion
- Supplier bills: list, create, edit, detail, outstanding, partial, paid
- Supplier payments: record, allocation, payment history
- Supplier credits: balance, allocation and usage history

### Inventory
- Products: list, create, edit, detail, stock by warehouse, purchase/sales history
- Warehouses: list, create/edit where supported, detail, stock visibility
- Adjustments: create, review, reason, post, result
- Transfers: create, source/destination, quantity, progress/status
- Stock counts: count session, discrepancies, review, posting
- Stock movements: searchable/filterable movement ledger

### Accounts
- Customers: list, create, edit, full account view, balance, invoices, payments, credits, activity
- Suppliers: list, create, edit, full account view, balance, bills, payments, credits, purchasing history

### Reports
- Report index
- Report filters
- Tabular report presentation
- Empty and error states
- Export/download states

### Administration
- Company / branding settings
- Users
- Roles
- Permissions
- Audit history
- System/data settings represented by the current application

### Global Interaction Surface
- Permission-aware primary navigation
- Search and actions / command menu
- Record/action search result states
- Sign out
- Responsive navigation

## 3. Information Architecture

The production shell uses this hierarchy:

- Dashboard
- Sales
  - Orders
  - Backorders
  - Invoicing
  - Payments
  - Credits
- Purchasing
  - Orders
  - Bills
  - Payments
  - Credits
- Inventory
  - Products
  - Warehouses
  - Adjustments
  - Transfers
  - Stock Counts
  - Movements
- Accounts
  - Customers
  - Suppliers
- Reports
- Administration

Permissions determine whether navigation items and actions are visible. Hidden permissions must not leave dead or misleading affordances.

## 4. Foundry Architecture

Foundry is organised into five layers.

### 4.1 Foundations
- Colour tokens
- Typography
- Spacing scale
- Radius scale
- Shadow/elevation scale
- Motion durations/easing
- Breakpoints
- Focus ring and accessibility tokens
- Semantic status colours
- Numeric alignment rules for money and quantity

### 4.2 UI Primitives
Foundry must provide production-ready primitives for:
- Button
- Icon button
- Link
- Input
- Textarea
- Select
- Combobox/autocomplete
- Checkbox
- Radio
- Switch
- Date input/date picker
- Currency input
- Quantity input
- Badge/status badge
- Tooltip
- Dropdown/action menu
- Tabs
- Breadcrumbs
- Pagination
- Modal/dialog
- Destructive confirmation dialog
- Drawer/sheet
- Toast
- Alert/banner
- Empty state
- Skeleton/loading state
- Error state
- Permission-denied state
- Offline/unavailable state
- Table/data grid
- Responsive card-list alternative for dense tables
- File/drop area where required

### 4.3 Business Components
Reusable TADPODS-specific components include:
- PageHeader
- SectionHeader
- SearchFilterBar
- RecordTable
- RecordSummaryCard
- AccountHeader
- AccountBalanceSummary
- AccountLedger
- AccountActivityTimeline
- DocumentHeader
- DocumentStatus
- LineItemEditor
- ProductSelector
- CustomerSelector
- SupplierSelector
- WarehouseSelector
- TotalsPanel
- PaymentAllocationPanel
- CreditAllocationPanel
- FulfilmentPanel
- GoodsReceiptPanel
- StockLevelSummary
- StockMovementTable
- StockDiscrepancyReview
- AuditTimeline
- PermissionMatrix
- BrandedDocumentPreview

Business components must contain domain-specific layout and interaction rules while delegating basic styling and behavior to primitives.

### 4.4 Page Patterns
Foundry defines reusable page-level layouts:
- List page
- Record detail page
- Create/edit form page
- Document workflow page
- Account page
- Dashboard page
- Report page
- Settings page
- Review/confirmation page

### 4.5 Complete Workflows
Application routes consume page patterns and business components. Route-specific code may provide data and workflow actions but must not create new design conventions outside Foundry.

## 5. Document Workflow Pattern

Sales orders, invoices, purchase orders and supplier bills share a standard document structure:

1. Page header with document number, status and primary actions
2. Counterparty summary
3. Document metadata
4. Line item editor/table
5. Totals panel
6. Fulfilment/payment/receipt panel where applicable
7. Notes and supporting information
8. Activity timeline / audit trail
9. Contextual actions menu

The same status and action placement rules apply across all document types. Domain differences are expressed through configuration and specialised business components rather than unrelated page implementations.

## 6. Account Pattern

Customers and suppliers use the same account-page skeleton:

- Identity/contact header
- Current balance and credit summary
- Primary actions
- Open documents
- Payments and allocations
- Credits
- Transaction/activity timeline
- Related sales/purchasing history

Customer and supplier terminology changes, but the interaction model remains consistent.

## 7. Tables and Dense Operational Data

Desktop operational pages may use data tables. Rules:
- Important identifiers are first and remain scannable
- Currency values are right-aligned and tabular
- Quantities use consistent precision
- Status has semantic badge treatment
- Row actions are predictable and keyboard accessible
- Filters are visible and removable
- Loading uses skeleton rows rather than layout jumps
- Empty results distinguish between no data and filters matching no records

On smaller screens, dense tables transform into structured record cards or horizontal-scrolling views only where the data relationship requires a true table.

## 8. Responsive Behaviour

Foundry is desktop-first for operational density but must be fully usable on tablet and mobile.

### Desktop
- Persistent sidebar
- Full tables
- Multi-column forms and detail layouts where useful

### Tablet
- Collapsible navigation
- Reduced column counts
- Secondary panels stack or move into drawers

### Mobile
- Navigation becomes a sheet/drawer
- Tables use responsive record cards where practical
- Primary actions remain reachable without horizontal overflow
- Forms are single-column
- Sticky document actions are allowed when they materially improve usability

No workflow may be desktop-only.

## 9. System States

Every page or component that loads remote data must define:
- Loading
- Empty
- Error
- Permission denied
- Success/confirmation where applicable

Mutating forms additionally define:
- Submitting
- Validation errors
- Server errors
- Unsaved changes
- Destructive confirmation
- Duplicate/stale conflict where applicable

The UI must distinguish a valid empty dataset from a failure to load.

## 10. Accessibility

Foundry targets WCAG 2.2 AA behaviour:
- Full keyboard navigation
- Visible focus states
- Semantic labels and landmarks
- Dialog focus trapping and return focus
- Escape behavior for dismissible overlays
- Sufficient text/status contrast
- Status is never communicated by colour alone
- Touch targets are usable on mobile
- Validation errors are associated with their fields
- Tables expose proper headers and scope
- Reduced-motion preferences are respected

## 11. Permissions

Permissions influence both navigation and available actions.

A user who cannot perform an action must not be shown an enabled control for it. Read-only access retains record visibility while mutating controls are removed or explicitly disabled only when the disabled state communicates something useful.

Permission-denied routes use a consistent Foundry state rather than raw server or framework errors.

## 12. Error Handling

Foundry provides one consistent presentation model:
- Inline field errors for validation
- Inline/section alerts for recoverable workflow errors
- Toasts for transient success/failure feedback
- Full-page states for route-level failures
- Confirmation dialogs for destructive actions

Technical error details are not exposed to normal users. A correlation/reference identifier may be shown when supported by the backend.

## 13. Testing Requirements

### Component tests
- Primitive states and keyboard behavior
- Dialog/dropdown focus handling
- Business-component rendering and edge states

### Route/integration tests
- Permission-driven navigation/actions
- Form success and failure paths
- Empty/loading/error states
- Document state transitions represented correctly

### End-to-end tests
At minimum, cover:
- Sign in
- Create customer
- Create supplier
- Create product
- Create sales order
- Create/issue invoice
- Record payment and verify allocation/credit behavior
- Create purchase order
- Receive goods
- Enter supplier bill/payment
- Transfer stock
- Perform adjustment/stock count
- Run a report
- Administration permission checks

### Visual regression
Critical page patterns and component states should have visual regression coverage at desktop and mobile widths.

## 14. Migration Strategy

Implementation occurs in this order:

1. Formalise Foundry tokens and primitive components
2. Replace the application shell/navigation with Foundry
3. Add shared page patterns and business components
4. Migrate authentication and dashboard
5. Migrate accounts: customers and suppliers
6. Migrate sales workflows
7. Migrate purchasing workflows
8. Migrate inventory workflows
9. Migrate reports and administration
10. Remove legacy CSS/components only after no production route consumes them
11. Add/complete automated accessibility, interaction and visual-regression coverage

The application remains usable throughout migration. Legacy and Foundry implementations must not be mixed within a single completed route.

## 15. Non-Goals

- Rebuilding business logic merely to accommodate the UI
- Adding unrelated ERP modules
- Introducing a second component framework alongside Foundry
- Preserving legacy visual conventions when they conflict with Foundry
- Producing static mockups without implementable component/state definitions

## 16. Definition of Done

Foundry is the master UI system only when all of the following are true:

- Every current TADPODS route and workflow uses Foundry
- Every create, view, edit and operational state is covered
- Loading, empty, error, restricted and destructive states are defined and implemented
- Desktop, tablet and mobile behavior exists for every workflow
- Keyboard/focus/accessibility behavior is implemented
- Money, quantity and statuses are presented consistently
- Permissions correctly affect navigation and actions
- No legacy UI is visible inside a Foundry route
- Shared UI patterns live in Foundry rather than being duplicated between feature modules
- New application screens can be built from Foundry without inventing a visual system
- Critical workflows pass component, integration and end-to-end tests

## 17. Decision

Foundry is the sole master design system for TADPODS. Existing Foundry visual direction is preserved. Missing primitives, business components, page patterns, workflow states and responsive behavior are added to Foundry, then all current production workflows are migrated onto it.