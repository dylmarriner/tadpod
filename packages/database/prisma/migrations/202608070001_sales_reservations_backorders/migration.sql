-- CreateEnum
CREATE TYPE "CustomerAddressType" AS ENUM ('BILLING', 'DELIVERY', 'GENERAL');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'BACKORDERED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SalesOrderInvoicingStatus" AS ENUM ('NOT_INVOICED', 'PARTIALLY_INVOICED', 'INVOICED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "BackorderStatus" AS ENUM ('PENDING_STOCK', 'PARTIALLY_AVAILABLE', 'READY_TO_FULFIL', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legalName" VARCHAR(200),
    "taxNumber" VARCHAR(40),
    "currency" CHAR(3) NOT NULL DEFAULT 'NZD',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 20,
    "creditLimitMinorUnits" BIGINT NOT NULL DEFAULT 0,
    "contactName" VARCHAR(160),
    "contactEmail" VARCHAR(254),
    "contactPhone" VARCHAR(40),
    "notes" VARCHAR(2000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "CustomerAddressType" NOT NULL,
    "addressLine1" VARCHAR(200),
    "addressLine2" VARCHAR(200),
    "city" VARCHAR(120),
    "region" VARCHAR(120),
    "postalCode" VARCHAR(20),
    "country" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "orderNumber" VARCHAR(40) NOT NULL,
    "customerId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "invoicingStatus" "SalesOrderInvoicingStatus" NOT NULL DEFAULT 'NOT_INVOICED',
    "currency" CHAR(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "promisedDate" TIMESTAMPTZ(6),
    "customerReference" VARCHAR(120),
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "unitPriceMinorUnits" BIGINT NOT NULL,
    "discountPercentBasis" INTEGER NOT NULL DEFAULT 0,
    "orderedQuantity" DECIMAL(18,4) NOT NULL,
    "reservedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "deliveredQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cancelledQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "backorderedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "invoicedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "salesOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "method" VARCHAR(40) NOT NULL,
    "backorderLineId" UUID,
    "createdById" UUID NOT NULL,
    "releasedAt" TIMESTAMPTZ(6),
    "consumedAt" TIMESTAMPTZ(6),
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" UUID NOT NULL,
    "deliveryNumber" VARCHAR(40) NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMPTZ(6),
    "reversedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLine" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "salesOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DeliveryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backorder" (
    "id" UUID NOT NULL,
    "backorderNumber" VARCHAR(40) NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "BackorderStatus" NOT NULL DEFAULT 'PENDING_STOCK',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "expectedDate" TIMESTAMPTZ(6),
    "promisedDate" TIMESTAMPTZ(6),
    "supplierId" UUID,
    "purchaseOrderId" UUID,
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "cancelledAt" TIMESTAMPTZ(6),
    "fulfilledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Backorder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackorderLine" (
    "id" UUID NOT NULL,
    "backorderId" UUID NOT NULL,
    "salesOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "allocatedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "fulfilledQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cancelledQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "purchaseOrderLineId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BackorderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackorderAllocation" (
    "id" UUID NOT NULL,
    "backorderLineId" UUID NOT NULL,
    "sourceType" VARCHAR(60) NOT NULL,
    "sourceId" VARCHAR(120) NOT NULL,
    "sourceLineId" VARCHAR(120) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "reservationId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackorderAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_active_idx" ON "Customer"("active");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_type_idx" ON "CustomerAddress"("customerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_status_idx" ON "SalesOrder"("customerId", "status");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SalesOrder_warehouseId_status_idx" ON "SalesOrder"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "SalesOrder_priority_promisedDate_idx" ON "SalesOrder"("priority", "promisedDate");

-- CreateIndex
CREATE INDEX "SalesOrder_confirmedAt_idx" ON "SalesOrder"("confirmedAt");

-- CreateIndex
CREATE INDEX "SalesOrderLine_salesOrderId_idx" ON "SalesOrderLine"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_productId_idx" ON "SalesOrderLine"("productId");

-- CreateIndex
CREATE INDEX "StockReservation_productId_warehouseId_status_idx" ON "StockReservation"("productId", "warehouseId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_salesOrderId_status_idx" ON "StockReservation"("salesOrderId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_salesOrderLineId_status_idx" ON "StockReservation"("salesOrderLineId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_backorderLineId_idx" ON "StockReservation"("backorderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_deliveryNumber_key" ON "Delivery"("deliveryNumber");

-- CreateIndex
CREATE INDEX "Delivery_salesOrderId_status_idx" ON "Delivery"("salesOrderId", "status");

-- CreateIndex
CREATE INDEX "Delivery_warehouseId_status_idx" ON "Delivery"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "DeliveryLine_deliveryId_idx" ON "DeliveryLine"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryLine_salesOrderLineId_idx" ON "DeliveryLine"("salesOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryLine_deliveryId_salesOrderLineId_key" ON "DeliveryLine"("deliveryId", "salesOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Backorder_backorderNumber_key" ON "Backorder"("backorderNumber");

-- CreateIndex
CREATE INDEX "Backorder_salesOrderId_idx" ON "Backorder"("salesOrderId");

-- CreateIndex
CREATE INDEX "Backorder_customerId_status_idx" ON "Backorder"("customerId", "status");

-- CreateIndex
CREATE INDEX "Backorder_status_priority_idx" ON "Backorder"("status", "priority");

-- CreateIndex
CREATE INDEX "Backorder_warehouseId_status_idx" ON "Backorder"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "Backorder_expectedDate_idx" ON "Backorder"("expectedDate");

-- CreateIndex
CREATE INDEX "Backorder_purchaseOrderId_idx" ON "Backorder"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "BackorderLine_backorderId_idx" ON "BackorderLine"("backorderId");

-- CreateIndex
CREATE INDEX "BackorderLine_salesOrderLineId_idx" ON "BackorderLine"("salesOrderLineId");

-- CreateIndex
CREATE INDEX "BackorderLine_productId_idx" ON "BackorderLine"("productId");

-- CreateIndex
CREATE INDEX "BackorderLine_purchaseOrderLineId_idx" ON "BackorderLine"("purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "BackorderLine_backorderId_salesOrderLineId_key" ON "BackorderLine"("backorderId", "salesOrderLineId");

-- CreateIndex
CREATE INDEX "BackorderAllocation_sourceType_sourceId_idx" ON "BackorderAllocation"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "BackorderAllocation_backorderLineId_sourceLineId_key" ON "BackorderAllocation"("backorderLineId", "sourceLineId");

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_backorderLineId_fkey" FOREIGN KEY ("backorderLineId") REFERENCES "BackorderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackorderLine" ADD CONSTRAINT "BackorderLine_backorderId_fkey" FOREIGN KEY ("backorderId") REFERENCES "Backorder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackorderLine" ADD CONSTRAINT "BackorderLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackorderLine" ADD CONSTRAINT "BackorderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackorderLine" ADD CONSTRAINT "BackorderLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackorderAllocation" ADD CONSTRAINT "BackorderAllocation_backorderLineId_fkey" FOREIGN KEY ("backorderLineId") REFERENCES "BackorderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackorderAllocation" ADD CONSTRAINT "BackorderAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Attachment_entity_idx" RENAME TO "Attachment_entityType_entityId_createdAt_idx";

-- RenameIndex
ALTER INDEX "AuditLog_action_idx" RENAME TO "AuditLog_action_createdAt_idx";

-- RenameIndex
ALTER INDEX "AuditLog_entity_idx" RENAME TO "AuditLog_entityType_entityId_createdAt_idx";

-- RenameIndex
ALTER INDEX "AuditLog_user_idx" RENAME TO "AuditLog_userId_createdAt_idx";

-- RenameIndex
ALTER INDEX "IdempotencyKey_expiry_idx" RENAME TO "IdempotencyKey_expiresAt_idx";

-- RenameIndex
ALTER INDEX "OutboxEvent_aggregate_idx" RENAME TO "OutboxEvent_aggregateType_aggregateId_idx";

-- RenameIndex
ALTER INDEX "OutboxEvent_status_nextAttempt_idx" RENAME TO "OutboxEvent_status_nextAttemptAt_idx";

-- RenameIndex
ALTER INDEX "RefreshSession_user_status_expiry_idx" RENAME TO "RefreshSession_userId_status_expiresAt_idx";

-- RenameIndex
ALTER INDEX "StockMovement_product_warehouse_idx" RENAME TO "StockMovement_productId_warehouseId_idx";

-- RenameIndex
ALTER INDEX "StockMovement_source_unique" RENAME TO "StockMovement_sourceType_sourceId_sourceLineId_key";

-- Quantity invariants enforced by the database, not just by application code.
--
-- `SalesOrderLine_quantity_balance` is the Phase 4 integration-gate guarantee that a line's
-- delivered + cancelled + reserved + backordered quantity can never exceed what was ordered,
-- whichever of `ReservationsService`, `DeliveriesService`, `BackordersService`, or
-- `SalesOrdersService` writes last. Stock itself is still guarded separately by the
-- stock-movement ledger; this constraint guards the *commercial* balance on the order.
ALTER TABLE "SalesOrderLine"
  ADD CONSTRAINT "SalesOrderLine_quantity_nonnegative" CHECK (
    "orderedQuantity" > 0
    AND "reservedQuantity" >= 0
    AND "deliveredQuantity" >= 0
    AND "cancelledQuantity" >= 0
    AND "backorderedQuantity" >= 0
    AND "invoicedQuantity" >= 0
  );

ALTER TABLE "SalesOrderLine"
  ADD CONSTRAINT "SalesOrderLine_quantity_balance" CHECK (
    "deliveredQuantity" + "cancelledQuantity" + "reservedQuantity" + "backorderedQuantity" <= "orderedQuantity"
  );

ALTER TABLE "SalesOrderLine"
  ADD CONSTRAINT "SalesOrderLine_invoiced_within_delivered" CHECK ("invoicedQuantity" <= "deliveredQuantity");

ALTER TABLE "StockReservation"
  ADD CONSTRAINT "StockReservation_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "DeliveryLine"
  ADD CONSTRAINT "DeliveryLine_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "BackorderLine"
  ADD CONSTRAINT "BackorderLine_quantity_balance" CHECK (
    "quantity" > 0
    AND "allocatedQuantity" >= 0
    AND "fulfilledQuantity" >= 0
    AND "cancelledQuantity" >= 0
    AND "allocatedQuantity" <= "quantity"
    AND "fulfilledQuantity" + "cancelledQuantity" <= "quantity"
  );

ALTER TABLE "BackorderAllocation"
  ADD CONSTRAINT "BackorderAllocation_quantity_positive" CHECK ("quantity" > 0);
