CREATE TYPE "StockMovementType" AS ENUM (
  'OPENING_STOCK',
  'GOODS_RECEIPT',
  'SALES_DELIVERY',
  'CUSTOMER_RETURN',
  'SUPPLIER_RETURN',
  'WAREHOUSE_TRANSFER_OUT',
  'WAREHOUSE_TRANSFER_IN',
  'POSITIVE_ADJUSTMENT',
  'NEGATIVE_ADJUSTMENT',
  'STOCK_COUNT_CORRECTION',
  'REVERSAL'
);

-- StockMovement: the sole source of truth for stock on hand. Append-only — corrections are
-- posted as an equal-and-opposite REVERSAL row linked via "reversalOfId", never an edit or
-- delete of a posted row. "signedQuantity" matches the Quantity domain primitive's default
-- scale (NUMERIC(18,4)), same as Product's reorder columns.
CREATE TABLE "StockMovement" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT,
  "warehouseId" UUID NOT NULL REFERENCES "Warehouse"("id") ON DELETE RESTRICT,
  "movementType" "StockMovementType" NOT NULL,
  "signedQuantity" DECIMAL(18, 4) NOT NULL CHECK ("signedQuantity" <> 0),
  "postedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "sourceType" VARCHAR(60) NOT NULL,
  "sourceId" VARCHAR(120) NOT NULL,
  "sourceLineId" VARCHAR(120) NOT NULL,
  "idempotencyKey" VARCHAR(200) UNIQUE,
  "reversalOfId" UUID REFERENCES "StockMovement"("id") ON DELETE RESTRICT,
  "actorId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "notes" VARCHAR(2000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  -- One external source line can create a stock effect only once. A movement's own
  -- reversal is posted with sourceType='stock-movement-reversal' and
  -- sourceId=sourceLineId=<original movement id>, so this same constraint also stops a
  -- movement from being reversed twice, concurrency-safe, without any extra locking.
  CONSTRAINT "StockMovement_source_unique" UNIQUE ("sourceType", "sourceId", "sourceLineId")
);

CREATE INDEX "StockMovement_product_warehouse_idx" ON "StockMovement" ("productId", "warehouseId");
CREATE INDEX "StockMovement_warehouseId_idx" ON "StockMovement" ("warehouseId");
CREATE INDEX "StockMovement_reversalOfId_idx" ON "StockMovement" ("reversalOfId");
CREATE INDEX "StockMovement_postedAt_idx" ON "StockMovement" ("postedAt");

-- Immutability, enforced at the database layer as well as the service layer (the service
-- exposes no update/delete method at all). A BEFORE trigger that unconditionally raises is
-- used rather than REVOKE UPDATE/DELETE, because the application connects as the owning
-- role (needed for DDL during `prisma migrate deploy`) and Postgres exempts table owners
-- from their own REVOKE, which would make a REVOKE-based guard silently ineffective here.
CREATE FUNCTION prevent_stock_movement_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement rows are immutable and cannot be % (id=%)', TG_OP, OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_no_update"
  BEFORE UPDATE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_mutation();

CREATE TRIGGER "StockMovement_no_delete"
  BEFORE DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_mutation();
