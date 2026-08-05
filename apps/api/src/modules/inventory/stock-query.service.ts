import { Injectable } from '@nestjs/common';
import { database, Prisma } from '@tadpods/database';
import type { ListStockMovementsQuery, StockOnHandQuery } from '@tadpods/contracts';

type StockOnHandByWarehouseRow = { productId: string; warehouseId: string; quantity: string };
type StockOnHandTotalRow = { productId: string; quantity: string };

@Injectable()
export class StockQueryService {
  /**
   * Stock on hand, aggregated from posted movements only, by SQL `SUM` rather than loading
   * every movement into memory — correct and cheap regardless of how large the ledger grows,
   * and consistent under concurrent writes because it reads the same committed rows every
   * other transaction sees once its posting commits.
   */
  async stockOnHand(query: StockOnHandQuery): Promise<{ byWarehouse: StockOnHandByWarehouseRow[]; total: StockOnHandTotalRow[] }> {
    const conditions: Prisma.Sql[] = [];
    if (query.productId) conditions.push(Prisma.sql`"productId" = ${query.productId}::uuid`);
    if (query.warehouseId) conditions.push(Prisma.sql`"warehouseId" = ${query.warehouseId}::uuid`);
    const whereSql = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const [byWarehouse, total] = await Promise.all([
      database.$queryRaw<StockOnHandByWarehouseRow[]>(Prisma.sql`
        SELECT "productId", "warehouseId", COALESCE(SUM("signedQuantity"), 0)::text AS quantity
        FROM "StockMovement"
        ${whereSql}
        GROUP BY "productId", "warehouseId"
        ORDER BY "productId", "warehouseId"
      `),
      database.$queryRaw<StockOnHandTotalRow[]>(Prisma.sql`
        SELECT "productId", COALESCE(SUM("signedQuantity"), 0)::text AS quantity
        FROM "StockMovement"
        ${whereSql}
        GROUP BY "productId"
        ORDER BY "productId"
      `)
    ]);
    return { byWarehouse, total };
  }

  async listMovements(query: ListStockMovementsQuery) {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.movementType ? { movementType: query.movementType } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.sourceId ? { sourceId: query.sourceId } : {})
    };
    const [items, total] = await Promise.all([
      database.stockMovement.findMany({
        where,
        orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.stockMovement.count({ where })
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
