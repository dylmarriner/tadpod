import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { database, Prisma, type StockMovement as StockMovementRow } from '@tadpods/database';
import type {
  AdjustmentListItem,
  AdjustmentProductPicker,
  AdjustmentProductSearchQuery,
  AdjustmentWarehousePicker,
  ListAdjustmentsQuery,
  PostAdjustmentInput,
  PostOpeningStockInput
} from '@tadpods/contracts';
import { StockPostingService, type InventoryRequestContext, type PostingActor } from './stock-posting.service.js';

const OPENING_STOCK_SOURCE_TYPE = 'opening-stock';
const ADJUSTMENT_SOURCE_TYPE = 'adjustment';

type RunningBalanceRow = {
  id: string;
  productId: string;
  warehouseId: string;
  movementType: string;
  signedQuantity: string;
  postedAt: Date;
  sourceType: string;
  sourceId: string;
  notes: string | null;
  actorId: string | null;
  beforeQuantity: string;
  afterQuantity: string;
};

/**
 * Guided opening-stock entry and mandatory-reason adjustments (Phase 2 Task 3). This
 * service is a thin wrapper over `StockPostingService.postMovement` — it owns no locking,
 * idempotency, or negative-stock logic itself; those live entirely in `StockPostingService`
 * (Task 2) and are exercised unchanged here. This service only shapes movement type and
 * source metadata for the two workflows, and reads the ledger back for the adjustments list.
 */
@Injectable()
export class AdjustmentsService {
  constructor(private readonly posting: StockPostingService) {}

  async postOpeningStock(
    input: PostOpeningStockInput,
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<StockMovementRow> {
    const sourceId = randomUUID();
    return this.posting.postMovement(
      {
        productId: input.productId,
        warehouseId: input.warehouseId,
        movementType: 'OPENING_STOCK',
        signedQuantity: input.quantity,
        sourceType: OPENING_STOCK_SOURCE_TYPE,
        sourceId,
        sourceLineId: sourceId,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes ?? null,
        allowNegativeStockOverride: false
      },
      actor,
      context
    );
  }

  async postAdjustment(
    input: PostAdjustmentInput,
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<StockMovementRow> {
    const sourceId = randomUUID();
    const signedQuantity = input.direction === 'INCREASE' ? input.quantity : `-${input.quantity}`;
    return this.posting.postMovement(
      {
        productId: input.productId,
        warehouseId: input.warehouseId,
        movementType: input.direction === 'INCREASE' ? 'POSITIVE_ADJUSTMENT' : 'NEGATIVE_ADJUSTMENT',
        signedQuantity,
        sourceType: ADJUSTMENT_SOURCE_TYPE,
        sourceId,
        sourceLineId: sourceId,
        idempotencyKey: input.idempotencyKey,
        // The mandatory reason is the ledger's only free-text field, so it is stored as
        // `notes` — the adjustments list reads it back verbatim.
        notes: input.reason,
        allowNegativeStockOverride: input.allowNegativeStockOverride
      },
      actor,
      context
    );
  }

  /**
   * Opening-stock and adjustment movements, each carrying the stock-on-hand quantity
   * immediately before and after it posted, plus the reversal that undid it if any. The
   * before/after values are computed with a SQL window function over *every* posted
   * movement for that (product, warehouse) pair — not just other adjustments — because
   * stock on hand is the sum of the whole ledger, and this view must reconcile to it.
   */
  async listAdjustments(query: ListAdjustmentsQuery): Promise<{ items: AdjustmentListItem[]; total: number; page: number; pageSize: number }> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"sourceType" IN ('opening-stock', 'adjustment')`];
    if (query.productId) conditions.push(Prisma.sql`"productId" = ${query.productId}::uuid`);
    if (query.warehouseId) conditions.push(Prisma.sql`"warehouseId" = ${query.warehouseId}::uuid`);
    const whereSql = Prisma.join(conditions, ' AND ');

    const [rows, totalRows] = await Promise.all([
      database.$queryRaw<RunningBalanceRow[]>(Prisma.sql`
        WITH running AS (
          SELECT
            id, "productId", "warehouseId", "movementType", "signedQuantity", "postedAt", "sourceType", "sourceId", notes, "actorId",
            SUM("signedQuantity") OVER (PARTITION BY "productId", "warehouseId" ORDER BY "postedAt", id) AS "runningAfter"
          FROM "StockMovement"
        )
        SELECT
          id, "productId", "warehouseId", "movementType", "signedQuantity"::text AS "signedQuantity", "postedAt", "sourceType", "sourceId", notes, "actorId",
          ("runningAfter" - "signedQuantity")::text AS "beforeQuantity",
          "runningAfter"::text AS "afterQuantity"
        FROM running
        WHERE ${whereSql}
        ORDER BY "postedAt" DESC, id DESC
        OFFSET ${(query.page - 1) * query.pageSize} LIMIT ${query.pageSize}
      `),
      database.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "StockMovement" WHERE ${whereSql}`)
    ]);

    const total = Number(totalRows[0]?.count ?? 0n);
    if (rows.length === 0) return { items: [], total, page: query.page, pageSize: query.pageSize };

    const ids = rows.map((row) => row.id);
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => id !== null))];
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const warehouseIds = [...new Set(rows.map((row) => row.warehouseId))];

    const [actors, products, warehouses, reversals] = await Promise.all([
      database.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, email: true } }),
      database.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true } }),
      database.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, code: true, name: true } }),
      database.stockMovement.findMany({
        where: { reversalOfId: { in: ids } },
        select: { id: true, reversalOfId: true, postedAt: true }
      })
    ]);

    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const reversalByOriginalId = new Map(reversals.map((reversal) => [reversal.reversalOfId as string, reversal]));

    const items: AdjustmentListItem[] = rows.map((row) => {
      const product = productById.get(row.productId);
      const warehouse = warehouseById.get(row.warehouseId);
      const actor = row.actorId ? (actorById.get(row.actorId) ?? null) : null;
      const reversal = reversalByOriginalId.get(row.id);
      return {
        id: row.id,
        movementType: row.movementType as AdjustmentListItem['movementType'],
        product: product ?? { id: row.productId, sku: '(unknown)', name: '(unknown product)' },
        warehouse: warehouse ?? { id: row.warehouseId, code: '(unknown)', name: '(unknown warehouse)' },
        signedQuantity: row.signedQuantity,
        beforeQuantity: row.beforeQuantity,
        afterQuantity: row.afterQuantity,
        postedAt: row.postedAt.toISOString(),
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        notes: row.notes,
        actor,
        reversal: reversal ? { id: reversal.id, postedAt: reversal.postedAt.toISOString() } : null
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async listActiveWarehouses(): Promise<AdjustmentWarehousePicker[]> {
    return database.warehouse.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, isDefault: true }
    });
  }

  async searchActiveProducts(query: AdjustmentProductSearchQuery): Promise<AdjustmentProductPicker[]> {
    const search = query.search;
    return database.product.findMany({
      where: {
        status: 'ACTIVE',
        ...(search
          ? {
              OR: [
                { sku: { contains: search, mode: 'insensitive' as const } },
                { name: { contains: search, mode: 'insensitive' as const } },
                { barcode: { contains: search, mode: 'insensitive' as const } }
              ]
            }
          : {})
      },
      orderBy: [{ name: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, sku: true, name: true, barcode: true, unitOfMeasure: true }
    });
  }
}
