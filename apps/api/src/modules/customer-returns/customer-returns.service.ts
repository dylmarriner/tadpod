import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { validateReturnQuantity, computeReturnableQuantity, CUSTOMER_RETURN_SOURCE_TYPE } from '@tadpods/domain';
import { database, type StockMovement as StockMovementRow } from '@tadpods/database';
import type { CustomerReturnListItem, DeliveryLineReturnable, ListCustomerReturnsQuery, PostCustomerReturnInput } from '@tadpods/contracts';
import { StockPostingService, type InventoryRequestContext, type PostingActor } from '../inventory/stock-posting.service.js';

/**
 * Customer returns (post-Phase-4 gap fix). A return is posted directly against one already
 * *posted* delivery line — mirroring `AdjustmentsService`'s pattern of a thin wrapper over
 * `StockPostingService.postMovement`, with no header/lines table of its own. "How much of
 * this line has already been returned" is read back from the ledger itself (every
 * `CUSTOMER_RETURN` movement whose `sourceLineId` is that delivery line), the same way stock
 * on hand is read back from the whole ledger elsewhere, rather than kept as a denormalized
 * counter that could drift from it.
 */
@Injectable()
export class CustomerReturnsService {
  constructor(private readonly posting: StockPostingService) {}

  async returnable(deliveryLineId: string): Promise<DeliveryLineReturnable> {
    const line = await database.deliveryLine.findUnique({
      where: { id: deliveryLineId },
      include: { delivery: { select: { status: true } } }
    });
    if (!line) throw new NotFoundException('Delivery line not found');

    const alreadyReturned = await this.sumReturned(deliveryLineId);
    const deliveredQuantity = line.quantity.toString();
    const returnableQuantity = line.delivery.status === 'POSTED' ? computeReturnableQuantity(deliveredQuantity, alreadyReturned) : '0.0000';

    return { deliveryLineId, deliveredQuantity, returnedQuantity: alreadyReturned, returnableQuantity };
  }

  async post(input: PostCustomerReturnInput, actor: PostingActor, context: InventoryRequestContext): Promise<StockMovementRow> {
    const line = await database.deliveryLine.findUnique({
      where: { id: input.deliveryLineId },
      include: { delivery: { select: { id: true, deliveryNumber: true, status: true, warehouseId: true } } }
    });
    if (!line) throw new NotFoundException('Delivery line not found');
    if (line.delivery.status !== 'POSTED') throw new ConflictException(`Only a posted delivery can be returned against (this one is ${line.delivery.status})`);

    const alreadyReturned = await this.sumReturned(input.deliveryLineId);
    try {
      validateReturnQuantity(line.quantity.toString(), alreadyReturned, input.quantity);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid return quantity');
    }

    const sourceId = randomUUID();
    return this.posting.postMovement(
      {
        productId: line.productId,
        warehouseId: line.delivery.warehouseId,
        movementType: 'CUSTOMER_RETURN',
        signedQuantity: input.quantity,
        sourceType: CUSTOMER_RETURN_SOURCE_TYPE,
        sourceId,
        sourceLineId: input.deliveryLineId,
        idempotencyKey: input.idempotencyKey,
        notes: input.reason,
        allowNegativeStockOverride: false
      },
      actor,
      context
    );
  }

  /** Every posted customer return, newest first, optionally scoped to one delivery line, product, or warehouse. */
  async list(query: ListCustomerReturnsQuery): Promise<{ items: CustomerReturnListItem[]; total: number; page: number; pageSize: number }> {
    const where = {
      sourceType: CUSTOMER_RETURN_SOURCE_TYPE,
      ...(query.deliveryLineId ? { sourceLineId: query.deliveryLineId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {})
    };

    const [rows, total] = await Promise.all([
      database.stockMovement.findMany({
        where,
        orderBy: [{ postedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.stockMovement.count({ where })
    ]);
    if (rows.length === 0) return { items: [], total, page: query.page, pageSize: query.pageSize };

    const deliveryLineIds = [...new Set(rows.map((row) => row.sourceLineId))];
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const warehouseIds = [...new Set(rows.map((row) => row.warehouseId))];
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => id !== null))];

    const [deliveryLines, products, warehouses, actors] = await Promise.all([
      database.deliveryLine.findMany({ where: { id: { in: deliveryLineIds } }, include: { delivery: { select: { id: true, deliveryNumber: true } } } }),
      database.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true } }),
      database.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, code: true, name: true } }),
      database.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, email: true } })
    ]);

    const deliveryLineById = new Map(deliveryLines.map((line) => [line.id, line]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    const items: CustomerReturnListItem[] = rows.map((row) => {
      const deliveryLine = deliveryLineById.get(row.sourceLineId);
      const product = productById.get(row.productId);
      const warehouse = warehouseById.get(row.warehouseId);
      return {
        id: row.id,
        delivery: deliveryLine ? deliveryLine.delivery : { id: '(unknown)', deliveryNumber: '(unknown)' },
        deliveryLineId: row.sourceLineId,
        product: product ?? { id: row.productId, sku: '(unknown)', name: '(unknown product)' },
        warehouse: warehouse ?? { id: row.warehouseId, code: '(unknown)', name: '(unknown warehouse)' },
        quantity: row.signedQuantity.toString(),
        reason: row.notes,
        postedAt: row.postedAt.toISOString(),
        actor: row.actorId ? (actorById.get(row.actorId) ?? null) : null
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async sumReturned(deliveryLineId: string): Promise<string> {
    const result = await database.stockMovement.aggregate({
      where: { sourceType: CUSTOMER_RETURN_SOURCE_TYPE, sourceLineId: deliveryLineId },
      _sum: { signedQuantity: true }
    });
    return (result._sum.signedQuantity ?? 0).toString();
  }
}
