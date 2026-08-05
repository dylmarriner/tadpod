import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { database, Prisma } from '@tadpods/database';
import type {
  CreateStockCountInput,
  ListStockCountsQuery,
  PostStockCountInput,
  StockCount,
  StockCountListItem,
  UpdateStockCountLineInput
} from '@tadpods/contracts';
import { StockPostingService, type InventoryRequestContext, type PostingActor } from './stock-posting.service.js';

const STOCK_COUNT_SOURCE_TYPE = 'stock-count';

const countInclude = {
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  lines: {
    include: { product: { select: { id: true, sku: true, name: true, barcode: true, unitOfMeasure: true } } },
    orderBy: { product: { name: 'asc' as const } }
  }
} satisfies Prisma.StockCountInclude;

type CountWithLines = Prisma.StockCountGetPayload<{ include: typeof countInclude }>;

function toStockCount(count: CountWithLines): StockCount {
  return {
    id: count.id,
    warehouse: count.warehouse,
    status: count.status,
    notes: count.notes,
    createdBy: count.createdBy,
    postedAt: count.postedAt?.toISOString() ?? null,
    createdAt: count.createdAt.toISOString(),
    lines: count.lines.map((line) => {
      const counted = line.countedQuantity;
      return {
        id: line.id,
        product: line.product,
        expectedQuantity: line.expectedQuantity.toFixed(4),
        countedQuantity: counted ? counted.toFixed(4) : null,
        variance: counted ? counted.sub(line.expectedQuantity).toFixed(4) : null
      };
    })
  };
}

/**
 * Stock counts and corrections (Phase 2 Task 5). A count is a draft worksheet: expected
 * quantities are frozen from the ledger at creation, staff fill in counted quantities, and
 * posting turns each line's variance into a `STOCK_COUNT_CORRECTION` movement through the
 * same `StockPostingService.postMovements` batch primitive warehouse transfers use — either
 * every non-zero-variance line posts, or none of them do. Once posted, a count is locked:
 * this service exposes no way to edit a line or repost.
 */
@Injectable()
export class StockCountsService {
  constructor(private readonly posting: StockPostingService) {}

  async create(input: CreateStockCountInput, actor: PostingActor): Promise<StockCount> {
    const warehouse = await database.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const productIds = await this.resolveProductIds(input);
    if (productIds.length === 0) throw new BadRequestException('No active products match this stock count selection');

    const expectedByProduct = await this.expectedQuantities(input.warehouseId, productIds);

    const count = await database.stockCount.create({
      data: {
        warehouseId: input.warehouseId,
        createdById: actor.id,
        notes: input.notes ?? null,
        lines: {
          create: productIds.map((productId) => ({
            productId,
            expectedQuantity: expectedByProduct.get(productId) ?? '0'
          }))
        }
      },
      include: countInclude
    });

    return toStockCount(count);
  }

  async get(id: string): Promise<StockCount> {
    const count = await database.stockCount.findUnique({ where: { id }, include: countInclude });
    if (!count) throw new NotFoundException('Stock count not found');
    return toStockCount(count);
  }

  async listStockCounts(
    query: ListStockCountsQuery
  ): Promise<{ items: StockCountListItem[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.StockCountWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      database.stockCount.findMany({
        where,
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, displayName: true, email: true } },
          lines: { select: { countedQuantity: true } }
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.stockCount.count({ where })
    ]);

    const items: StockCountListItem[] = rows.map((count) => ({
      id: count.id,
      warehouse: count.warehouse,
      status: count.status,
      lineCount: count.lines.length,
      countedLineCount: count.lines.filter((line) => line.countedQuantity !== null).length,
      createdBy: count.createdBy,
      postedAt: count.postedAt?.toISOString() ?? null,
      createdAt: count.createdAt.toISOString()
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Barcode-friendly entry: one line, looked up and updated by its own id, no full-page reload required. */
  async updateLine(lineId: string, input: UpdateStockCountLineInput): Promise<void> {
    const line = await database.stockCountLine.findUnique({ where: { id: lineId }, include: { stockCount: true } });
    if (!line) throw new NotFoundException('Stock count line not found');
    if (line.stockCount.status !== 'DRAFT') throw new ConflictException('This stock count is already posted and cannot be edited');

    await database.stockCountLine.update({ where: { id: lineId }, data: { countedQuantity: input.countedQuantity } });
  }

  async post(id: string, input: PostStockCountInput, actor: PostingActor, context: InventoryRequestContext): Promise<StockCount> {
    const count = await database.stockCount.findUnique({ where: { id }, include: countInclude });
    if (!count) throw new NotFoundException('Stock count not found');
    if (count.status !== 'DRAFT') throw new ConflictException('This stock count has already been posted');
    if (count.lines.length === 0) throw new BadRequestException('A stock count with no lines cannot be posted');
    if (count.lines.some((line) => line.countedQuantity === null)) {
      throw new BadRequestException('Every line must have a counted quantity before this stock count can be posted');
    }

    // Variance is relative to the quantity frozen at count creation, not a live
    // re-aggregation at posting time — this matches "capture expected quantity at count
    // creation" from the phase plan. A `STOCK_COUNT_CORRECTION` movement is only posted for
    // lines with a non-zero variance; `postMovements` rejects zero-quantity movements.
    const movements = count.lines.flatMap((line) => {
      const variance = line.countedQuantity!.sub(line.expectedQuantity);
      if (variance.isZero()) return [];
      return [
        {
          productId: line.product.id,
          warehouseId: count.warehouse.id,
          movementType: 'STOCK_COUNT_CORRECTION' as const,
          signedQuantity: variance.toFixed(4),
          sourceType: STOCK_COUNT_SOURCE_TYPE,
          sourceId: count.id,
          sourceLineId: line.id,
          idempotencyKey: `${input.idempotencyKey}:${line.id}`,
          notes: count.notes,
          allowNegativeStockOverride: false
        }
      ];
    });

    if (movements.length > 0) {
      await this.posting.postMovements(movements, actor, context);
    }

    const posted = await database.stockCount.update({
      where: { id },
      data: { status: 'POSTED', postedAt: new Date() },
      include: countInclude
    });
    return toStockCount(posted);
  }

  /** Read-only pickers for the guided "new stock count" form. */
  async listActiveWarehouses() {
    return database.warehouse.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, isDefault: true }
    });
  }

  async listCategories() {
    return database.productCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  }

  private async resolveProductIds(input: CreateStockCountInput): Promise<string[]> {
    if (input.productIds) {
      const products = await database.product.findMany({
        where: { id: { in: input.productIds }, status: 'ACTIVE' },
        select: { id: true }
      });
      if (products.length !== input.productIds.length) {
        throw new BadRequestException('Every selected product must exist and be active');
      }
      return products.map((product) => product.id);
    }

    if (input.categoryId) {
      const products = await database.product.findMany({
        where: { categoryId: input.categoryId, status: 'ACTIVE' },
        select: { id: true }
      });
      return products.map((product) => product.id);
    }

    const products = await database.product.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    return products.map((product) => product.id);
  }

  private async expectedQuantities(warehouseId: string, productIds: string[]): Promise<Map<string, string>> {
    const rows = await database.$queryRaw<Array<{ productId: string; quantity: string }>>(Prisma.sql`
      SELECT "productId", COALESCE(SUM("signedQuantity"), 0)::text AS quantity
      FROM "StockMovement"
      WHERE "warehouseId" = ${warehouseId}::uuid
        AND "productId" IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY "productId"
    `);
    return new Map(rows.map((row) => [row.productId, row.quantity]));
  }
}
