-- CreateEnum
CREATE TYPE "SupplierBillStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'CREDITED');

-- CreateTable
CREATE TABLE "SupplierBill" (
    "id" UUID NOT NULL,
    "billNumber" VARCHAR(40) NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "status" "SupplierBillStatus" NOT NULL DEFAULT 'UNPAID',
    "currency" CHAR(3) NOT NULL,
    "supplierReference" VARCHAR(120),
    "issueDate" TIMESTAMPTZ(6) NOT NULL,
    "dueDate" TIMESTAMPTZ(6) NOT NULL,
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "voidedById" UUID,
    "voidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SupplierBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBillLine" (
    "id" UUID NOT NULL,
    "supplierBillId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "unitCostMinorUnits" BIGINT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" UUID NOT NULL,
    "paymentNumber" VARCHAR(40) NOT NULL,
    "supplierId" UUID NOT NULL,
    "amountMinorUnits" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" VARCHAR(60) NOT NULL,
    "reference" VARCHAR(120),
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "reversedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPaymentAllocation" (
    "id" UUID NOT NULL,
    "supplierPaymentId" UUID NOT NULL,
    "supplierBillId" UUID NOT NULL,
    "amountMinorUnits" BIGINT NOT NULL,
    "createdById" UUID NOT NULL,
    "reversedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCredit" (
    "id" UUID NOT NULL,
    "creditNumber" VARCHAR(40) NOT NULL,
    "supplierId" UUID NOT NULL,
    "sourceType" VARCHAR(30) NOT NULL,
    "sourcePaymentId" UUID,
    "amountMinorUnits" BIGINT NOT NULL,
    "remainingMinorUnits" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCreditApplication" (
    "id" UUID NOT NULL,
    "supplierCreditId" UUID NOT NULL,
    "supplierBillId" UUID NOT NULL,
    "amountMinorUnits" BIGINT NOT NULL,
    "createdById" UUID NOT NULL,
    "reversedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCreditApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRefund" (
    "id" UUID NOT NULL,
    "refundNumber" VARCHAR(40) NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierCreditId" UUID NOT NULL,
    "amountMinorUnits" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" VARCHAR(60) NOT NULL,
    "reference" VARCHAR(120),
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBill_billNumber_key" ON "SupplierBill"("billNumber");

-- CreateIndex
CREATE INDEX "SupplierBill_supplierId_status_idx" ON "SupplierBill"("supplierId", "status");

-- CreateIndex
CREATE INDEX "SupplierBill_status_dueDate_idx" ON "SupplierBill"("status", "dueDate");

-- CreateIndex
CREATE INDEX "SupplierBill_purchaseOrderId_idx" ON "SupplierBill"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "SupplierBillLine_supplierBillId_idx" ON "SupplierBillLine"("supplierBillId");

-- CreateIndex
CREATE INDEX "SupplierBillLine_purchaseOrderLineId_idx" ON "SupplierBillLine"("purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBillLine_supplierBillId_purchaseOrderLineId_key" ON "SupplierBillLine"("supplierBillId", "purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_paymentNumber_key" ON "SupplierPayment"("paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_idempotencyKey_key" ON "SupplierPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_paidAt_idx" ON "SupplierPayment"("supplierId", "paidAt");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_supplierPaymentId_idx" ON "SupplierPaymentAllocation"("supplierPaymentId");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_supplierBillId_idx" ON "SupplierPaymentAllocation"("supplierBillId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCredit_creditNumber_key" ON "SupplierCredit"("creditNumber");

-- CreateIndex
CREATE INDEX "SupplierCredit_supplierId_idx" ON "SupplierCredit"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierCreditApplication_supplierCreditId_idx" ON "SupplierCreditApplication"("supplierCreditId");

-- CreateIndex
CREATE INDEX "SupplierCreditApplication_supplierBillId_idx" ON "SupplierCreditApplication"("supplierBillId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRefund_refundNumber_key" ON "SupplierRefund"("refundNumber");

-- CreateIndex
CREATE INDEX "SupplierRefund_supplierId_idx" ON "SupplierRefund"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierRefund_supplierCreditId_idx" ON "SupplierRefund"("supplierCreditId");

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBillLine" ADD CONSTRAINT "SupplierBillLine_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "SupplierBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBillLine" ADD CONSTRAINT "SupplierBillLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBillLine" ADD CONSTRAINT "SupplierBillLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "SupplierBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "SupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditApplication" ADD CONSTRAINT "SupplierCreditApplication_supplierCreditId_fkey" FOREIGN KEY ("supplierCreditId") REFERENCES "SupplierCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditApplication" ADD CONSTRAINT "SupplierCreditApplication_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "SupplierBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditApplication" ADD CONSTRAINT "SupplierCreditApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRefund" ADD CONSTRAINT "SupplierRefund_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRefund" ADD CONSTRAINT "SupplierRefund_supplierCreditId_fkey" FOREIGN KEY ("supplierCreditId") REFERENCES "SupplierCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRefund" ADD CONSTRAINT "SupplierRefund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
