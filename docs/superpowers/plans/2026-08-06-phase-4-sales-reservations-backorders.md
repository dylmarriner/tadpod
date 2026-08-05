# TADPODS Phase 4 Implementation Plan: Sales, Reservations, Deliveries, and Backorders

**Goal:** Add customers, sales orders, stock reservations, partial fulfilment, deliveries, backorders, incoming-stock allocation, and a clear fulfilment dashboard.

**Depends on:** Phases 1–3 merged and green.

**Primary fulfilment rule:** Confirmed sales demand, reservations, deliveries, and backorders are separate records with separate statuses. Deliveries alone reduce stock, and each delivery line may affect stock once only.

## Outcomes

At the end of this phase, staff can:

- Maintain customer records and delivery addresses.
- Create sales orders with live stock visibility.
- Confirm orders and reserve available stock.
- Create full or partial backorders for shortages.
- Deliver all or part of an order.
- Allocate incoming stock to backorders.
- Generate purchase orders from shortages.
- See exactly what is available, reserved, delivered, backordered, and still outstanding.

## Database Additions

- `customers`
- `customer_addresses`
- `sales_orders`
- `sales_order_lines`
- `stock_reservations`
- `deliveries`
- `delivery_lines`
- `backorders`
- `backorder_lines`
- `backorder_allocations`
- `customer_notifications`

## Task 1: Customer master records

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_customers_sales/migration.sql`
- Create: `packages/contracts/src/customers.ts`
- Create: `apps/api/src/modules/customers/*`
- Create: `apps/web/src/app/(authenticated)/customers/*`

- [ ] Add customers with unique account code, display/legal name, tax number, currency, payment terms, credit limit, contacts, active state, and notes.
- [ ] Add billing, delivery, and general addresses.
- [ ] Add searchable customer list by account code, name, email, phone, and address.
- [ ] Add duplicate warnings with authorized override and audit reason.
- [ ] Add permissions for customer viewing, maintenance, sales entry, fulfilment, and credit-limit override.
- [ ] Expose account placeholders for Phase 5 without inventing invoice or payment data.

## Task 2: Sales orders

**Files:**

- Create: `packages/contracts/src/sales-orders.ts`
- Create: `packages/domain/src/sales-order.ts`
- Create: `packages/domain/src/sales-order.test.ts`
- Create: `apps/api/src/modules/sales-orders/*`
- Create: `apps/web/src/app/(authenticated)/sales/orders/*`

### Sales-order statuses

- Draft
- Confirmed
- Partially allocated
- Allocated
- Partially delivered
- Delivered
- Backordered
- Partially invoiced
- Invoiced
- Cancelled
- Closed

Track fulfilment status and invoicing status separately. Payment status arrives in Phase 5.

- [ ] Add order header and lines with ordered, reserved, allocated, delivered, cancelled, backordered, invoiced, and outstanding quantities.
- [ ] Generate order numbers transactionally.
- [ ] Show stock on hand, available stock, incoming stock, and available-to-promise during line entry.
- [ ] Support customer-specific prices and discounts without making pricing rules an ERP-sized subsystem.
- [ ] Validate tax, currency, totals, and customer credit status.
- [ ] Permit draft edits only; confirmation creates an immutable commercial snapshot.
- [ ] Add duplicate-order shortcut and one-click confirm action.
- [ ] Add promised delivery date, priority, warehouse, customer reference, notes, and attachments.

## Task 3: Stock reservation engine

**Files:**

- Create: `packages/domain/src/reservations.ts`
- Create: `packages/domain/src/reservations.test.ts`
- Create: `apps/api/src/modules/reservations/*`

### Reservation methods

- Immediate on order confirmation
- Manual
- By order priority
- By promised delivery date
- Oldest confirmed order first

- [ ] Store reservations separately from stock movements.
- [ ] Reserve only available stock unless an explicit negative-stock policy permits otherwise.
- [ ] Lock product and warehouse availability before changing reservations.
- [ ] Prevent total active reservations from exceeding permitted stock.
- [ ] Link each reservation to sales order and line.
- [ ] Allow release on cancellation, quantity reduction, delivery, expiry, or manual authorized action.
- [ ] Preserve reservation change history through audit records.
- [ ] Show exactly which orders consume each product’s available stock.
- [ ] Recalculate order allocation status transactionally.

## Task 4: Backorder creation and management

**Files:**

- Create: `packages/contracts/src/backorders.ts`
- Create: `packages/domain/src/backorders.ts`
- Create: `packages/domain/src/backorders.test.ts`
- Create: `apps/api/src/modules/backorders/*`
- Create: `apps/web/src/app/(authenticated)/sales/backorders/*`

### Backorder statuses

- Pending stock
- Partially available
- Ready to fulfil
- Partially fulfilled
- Fulfilled
- Cancelled

- [ ] On order confirmation, calculate unavailable quantity per line.
- [ ] Ask whether to create a backorder, cancel unavailable quantity, or use an authorized negative-stock override.
- [ ] Support full and partial backorders.
- [ ] Keep original order, line, and backorder linked.
- [ ] Store priority, warehouse, expected stock date, customer promise date, supplier, purchase order, and notes.
- [ ] Support manual backorder creation with validation against the source order.
- [ ] Support quantity changes and cancellation with audit history.
- [ ] Prevent backordered plus delivered plus cancelled quantity from exceeding ordered quantity.
- [ ] Update status automatically as reservations and stock availability change.

## Task 5: Incoming-stock allocation to backorders

**Files:**

- Create: `apps/api/src/modules/backorders/backorder-allocation.service.ts`
- Modify: `apps/api/src/modules/goods-receipts/*`
- Modify: `apps/api/src/modules/purchase-orders/*`

- [ ] After goods receipt, identify eligible open backorders by product and warehouse.
- [ ] Suggest allocation oldest first or highest priority according to settings.
- [ ] Allow the user to review and override the suggestion before posting.
- [ ] Create or increase stock reservations for allocated backorders transactionally.
- [ ] Prevent the same incoming quantity from being allocated twice.
- [ ] Update backorder status to partially available or ready to fulfil.
- [ ] Add user notification and optional customer notification through the outbox.
- [ ] Link purchase-order lines to the backorders they are intended to satisfy.

## Task 6: Deliveries and stock reduction

**Files:**

- Create: `packages/contracts/src/deliveries.ts`
- Create: `packages/domain/src/delivery.ts`
- Create: `packages/domain/src/delivery.test.ts`
- Create: `apps/api/src/modules/deliveries/*`
- Create: `apps/web/src/app/(authenticated)/sales/deliveries/*`

- [ ] Create delivery from one sales order.
- [ ] Support deliver-all, deliver-available, and selected-line workflows.
- [ ] Support partial deliveries and multiple deliveries against one order.
- [ ] Consume reservations first and reduce stock through posted stock movements.
- [ ] Prevent a delivery line from reducing stock twice.
- [ ] Prevent delivery above ordered quantity or available authorized quantity.
- [ ] Update delivered, outstanding, reservation, and backorder quantities in one transaction.
- [ ] Generate a branded delivery note.
- [ ] Support customer returns as separate Phase 2 stock movements linked to the delivery.
- [ ] Reverse incorrect delivery through linked opposite movements and fulfilment adjustments.

## Task 7: Purchase orders generated from backorders

**Files:**

- Modify: `apps/api/src/modules/purchase-orders/*`
- Create: `apps/web/src/app/(authenticated)/sales/backorders/purchase/page.tsx`

- [ ] Group selected backorders by preferred supplier and product.
- [ ] Suggest quantities based on shortage, reorder quantity, existing incoming stock, and open purchase orders.
- [ ] Create draft purchase orders with explicit backorder links.
- [ ] Prevent duplicate purchase generation for already covered quantities.
- [ ] Keep purchase commitment separate from customer fulfilment status.
- [ ] Show coverage status on every backorder line.

## Task 8: Sales and backorder interface

**Screens:**

- Customer list and detail
- Sales order list and detail
- New sales order
- Allocation view
- Delivery list and detail
- Backorder dashboard
- Backorder detail
- Incoming-stock allocation view

- [ ] Use progress indicator: `Draft → Confirmed → Allocated → Delivered` with invoicing shown separately.
- [ ] Show ordered, reserved, delivered, backordered, cancelled, and outstanding quantities at line level.
- [ ] Display warnings for shortages, credit limits, overdue promise dates, and conflicting reservations.
- [ ] Add one-click actions: duplicate, confirm, reserve, deliver all, deliver available, create backorder, create purchase order, notify customer, print delivery note.
- [ ] Link every quantity to reservations, deliveries, stock movements, purchase orders, and backorders.
- [ ] Keep mobile views readable while optimizing order entry for desktop and warehouse fulfilment for tablets.

## Task 9: Fulfilment calculations and dashboards

Implement and test:

```text
Available stock = stock on hand - active reservations
Backordered quantity = confirmed ordered quantity - delivered quantity - cancelled quantity - active reserved quantity
Available to promise = stock on hand + confirmed incoming stock - active reservations - open backordered commitments
```

- [ ] Add dashboard totals for open sales orders, orders awaiting delivery, open backorders, ready-to-fulfil backorders, overdue backorders, reserved stock, and backordered stock.
- [ ] Add backorders by customer, product, warehouse, supplier, expected date, and purchase-order coverage.
- [ ] Ensure every dashboard total links to filtered source records.

## API Endpoints

- `GET/POST /customers`
- `GET/PATCH /customers/:id`
- `GET/POST /sales-orders`
- `GET/PATCH /sales-orders/:id`
- `POST /sales-orders/:id/confirm`
- `POST /sales-orders/:id/cancel`
- `POST /sales-orders/:id/reserve`
- `POST /sales-orders/:id/release-reservations`
- `GET /reservations`
- `GET/POST /backorders`
- `GET/PATCH /backorders/:id`
- `POST /backorders/:id/cancel`
- `POST /backorders/allocate-incoming`
- `POST /backorders/create-purchase-orders`
- `GET/POST /deliveries`
- `POST /deliveries/:id/post`
- `POST /deliveries/:id/reverse`

## Required Automated Tests

- [ ] Customer creation, uniqueness, and archive rules
- [ ] Sales-order totals and status separation
- [ ] Full stock availability
- [ ] Partial stock availability
- [ ] Full backorder
- [ ] Partial backorder
- [ ] Manual backorder
- [ ] Backorder quantity validation
- [ ] Reservation on confirmation
- [ ] Manual reservation
- [ ] Reservation priority ordering
- [ ] Reservation release
- [ ] Concurrent reservation
- [ ] Full delivery
- [ ] Partial delivery
- [ ] Multiple deliveries
- [ ] Delivery consumes reservation
- [ ] Duplicate delivery prevention
- [ ] Delivery reversal
- [ ] Incoming stock allocation
- [ ] Multiple backorder fulfilments
- [ ] Backorder cancellation
- [ ] Purchase order generated from backorder
- [ ] Duplicate purchase coverage prevention
- [ ] Available-stock calculation
- [ ] Available-to-promise calculation
- [ ] Negative-stock prevention
- [ ] Permission denial and audit history

## Phase 4 Integration Gate

- [ ] Sales entry shows accurate live availability.
- [ ] Reservations reconcile to confirmed order demand.
- [ ] Deliveries reduce stock once only.
- [ ] Delivered, cancelled, reserved, and backordered quantities never exceed ordered quantity.
- [ ] Incoming stock can be allocated to backorders without double allocation.
- [ ] Backorder purchase coverage is visible and traceable.
- [ ] All dashboards reconcile to source records.
- [ ] All tests, type checks, linting, build, Compose validation, and browser workflows pass.
- [ ] Documentation and permissions matrix are updated.
- [ ] Code review has no unresolved critical or major issues.
