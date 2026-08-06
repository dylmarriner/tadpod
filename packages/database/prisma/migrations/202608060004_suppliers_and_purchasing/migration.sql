-- CreateEnum
CREATE TYPE "SupplierAddressType" AS ENUM ('BILLING', 'DELIVERY', 'GENERAL');

-- AlterTable
ALTER TABLE "Supplier"
  ADD COLUMN "legalName" VARCHAR(200),
  ADD COLUMN "taxNumber" VARCHAR(40),
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'NZD',
  ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "contactName" VARCHAR(160),
  ADD COLUMN "contactEmail" VARCHAR(254),
  ADD COLUMN "contactPhone" VARCHAR(40),
  ADD COLUMN "notes" VARCHAR(2000);

CREATE INDEX "Supplier_name_normalized_idx" ON "Supplier" (lower("name"));

-- CreateTable
CREATE TABLE "SupplierAddress" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "type" "SupplierAddressType" NOT NULL,
    "addressLine1" VARCHAR(200),
    "addressLine2" VARCHAR(200),
    "city" VARCHAR(120),
    "region" VARCHAR(120),
    "postalCode" VARCHAR(20),
    "country" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SupplierAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierAddress_supplierId_type_idx" ON "SupplierAddress"("supplierId", "type");

ALTER TABLE "SupplierAddress" ADD CONSTRAINT "SupplierAddress_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
