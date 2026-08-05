CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- ProductCategory: unique names, optional self-referencing parent category.
CREATE TABLE "ProductCategory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL UNIQUE,
  "parentId" UUID REFERENCES "ProductCategory"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory" ("parentId");

-- Supplier: deliberately minimal placeholder (id/code/name/active) so `Product` and
-- `ProductSupplier` have a real foreign key to attach to now. Phase 3 adds the full
-- supplier module (addresses, purchase orders, bills, payments) and can widen this
-- table with additive migrations without breaking these foreign keys.
CREATE TABLE "Supplier" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(40) NOT NULL UNIQUE,
  "name" VARCHAR(160) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "Supplier_active_idx" ON "Supplier" ("active");

-- Product: unique SKU, optional unique barcode, category, unit of measure, decimal-safe
-- money (integer minor units, matching the `Money` domain primitive) and decimal-safe
-- reorder quantities (NUMERIC(18,4), matching the `Quantity` domain primitive's default scale).
CREATE TABLE "Product" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku" VARCHAR(64) NOT NULL UNIQUE,
  "barcode" VARCHAR(64) UNIQUE,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "categoryId" UUID REFERENCES "ProductCategory"("id") ON DELETE SET NULL,
  "unitOfMeasure" VARCHAR(20) NOT NULL,
  "salesPriceMinorUnits" BIGINT NOT NULL DEFAULT 0 CHECK ("salesPriceMinorUnits" >= 0),
  "purchaseCostMinorUnits" BIGINT NOT NULL DEFAULT 0 CHECK ("purchaseCostMinorUnits" >= 0),
  "taxRateId" UUID REFERENCES "TaxRate"("id") ON DELETE SET NULL,
  "reorderLevel" DECIMAL(18, 4) NOT NULL DEFAULT 0 CHECK ("reorderLevel" >= 0),
  "reorderQuantity" DECIMAL(18, 4) NOT NULL DEFAULT 0 CHECK ("reorderQuantity" >= 0),
  "leadTimeDays" INTEGER NOT NULL DEFAULT 0 CHECK ("leadTimeDays" >= 0 AND "leadTimeDays" <= 3650),
  "preferredSupplierId" UUID REFERENCES "Supplier"("id") ON DELETE SET NULL,
  "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "Product_categoryId_idx" ON "Product" ("categoryId");
CREATE INDEX "Product_status_idx" ON "Product" ("status");
CREATE INDEX "Product_preferredSupplierId_idx" ON "Product" ("preferredSupplierId");
-- SKU and barcode already have unique btree indexes from their UNIQUE constraints above.
-- Normalized (case-insensitive) product name search: a functional index rather than a
-- stored generated column, since Prisma's schema language has no first-class way to
-- declare a `GENERATED ALWAYS AS (...) STORED` column, and a plain expression index needs
-- no extra storage or trigger to stay correct.
CREATE INDEX "Product_name_normalized_idx" ON "Product" (lower("name"));

-- ProductSupplier: links a product to a supplier with supplier product code, purchase
-- cost, preferred flag and lead time. Only one link per (product, supplier) pair, and at
-- most one preferred link per product (enforced with a partial unique index).
CREATE TABLE "ProductSupplier" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "supplierId" UUID NOT NULL REFERENCES "Supplier"("id") ON DELETE CASCADE,
  "supplierProductCode" VARCHAR(80) NOT NULL,
  "purchaseCostMinorUnits" BIGINT NOT NULL DEFAULT 0 CHECK ("purchaseCostMinorUnits" >= 0),
  "preferred" BOOLEAN NOT NULL DEFAULT FALSE,
  "leadTimeDays" INTEGER NOT NULL DEFAULT 0 CHECK ("leadTimeDays" >= 0 AND "leadTimeDays" <= 3650),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("productId", "supplierId")
);
CREATE INDEX "ProductSupplier_supplierProductCode_idx" ON "ProductSupplier" ("supplierProductCode");
CREATE UNIQUE INDEX "ProductSupplier_one_preferred_per_product_idx" ON "ProductSupplier" ("productId") WHERE "preferred" = TRUE;

-- Warehouse: unique code and name, address fields, active state, and a single default
-- warehouse enforced with a partial unique index (rather than application logic alone) so
-- concurrent writes cannot create two defaults.
CREATE TABLE "Warehouse" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(20) NOT NULL UNIQUE,
  "name" VARCHAR(160) NOT NULL UNIQUE,
  "addressLine1" VARCHAR(200),
  "addressLine2" VARCHAR(200),
  "city" VARCHAR(120),
  "region" VARCHAR(120),
  "postalCode" VARCHAR(20),
  "country" VARCHAR(120),
  "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "Warehouse_status_idx" ON "Warehouse" ("status");
CREATE UNIQUE INDEX "Warehouse_single_default_idx" ON "Warehouse" ("isDefault") WHERE "isDefault" = TRUE;
