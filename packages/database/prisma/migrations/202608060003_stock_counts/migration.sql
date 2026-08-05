CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'POSTED');

-- StockCount: a draft worksheet that freezes each line's expected quantity from the ledger
-- at creation time. "status" moves DRAFT -> POSTED exactly once, checked by
-- StockCountsService before any correction movement is posted, so a count can never post
-- twice; there is no UPDATE/DELETE path back to DRAFT once posted.
CREATE TABLE "StockCount" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "warehouseId" UUID NOT NULL REFERENCES "Warehouse"("id") ON DELETE RESTRICT,
  "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" VARCHAR(2000),
  "createdById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "postedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "StockCount_warehouseId_status_idx" ON "StockCount" ("warehouseId", "status");

-- StockCountLine: one product's expected/counted quantity within a count. "expectedQuantity"
-- is captured once, at creation, from the same posted-movement aggregation StockQueryService
-- uses for stock on hand. "countedQuantity" starts NULL and is filled in during counting;
-- posting requires every line to have a counted quantity.
CREATE TABLE "StockCountLine" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "stockCountId" UUID NOT NULL REFERENCES "StockCount"("id") ON DELETE CASCADE,
  "productId" UUID NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT,
  "expectedQuantity" DECIMAL(18, 4) NOT NULL,
  "countedQuantity" DECIMAL(18, 4),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("stockCountId", "productId")
);
CREATE INDEX "StockCountLine_productId_idx" ON "StockCountLine" ("productId");
