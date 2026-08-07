import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildDeliveryMovements,
  deriveSalesOrderFulfilmentStatus,
  planDeliveryLines,
  planReservationConsumption,
  validateDeliveryQuantity,
  Quantity,
  type DeliverableLine
} from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type { CreateDeliveryInput, Delivery, ListDeliveriesQuery, PostDeliveryInput, ReverseDeliveryInput } from '@tadpods/contracts';
import { StockPostingService, type InventoryRequestContext, type PostingActor } from '../inventory/stock-posting.service.js';
import { consumeReservation, lockStockKey } from '../reservations/reservation-posting.js';

const DELIVERY_SOURCE_TYPE = 'delivery-line';

const deliveryInclude = {
  salesOrder: { select: { id: true, orderNumber: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  postedBy: { select: { id: true, displayName: true, email: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true } } } }
} satisfies PrismaNamespace.DeliveryInclude;

type DeliveryWithRelations = PrismaNamespace.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

function toDelivery(row: DeliveryWithRelations): Delivery {
  return {
    id: row.id,
    deliveryNumber: row.deliveryNumber,
    salesOrder: row.salesOrder,
    warehouse: row.warehouse,
    status: row.status,
    notes: row.notes,
    createdBy: row.createdBy,
    postedBy: row.postedBy,
    postedAt: row.postedAt?.toISOString() ?? null,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({ id: line.id, salesOrderLineId: line.salesOrderLineId, product: line.product, quantity: line.quantity.toString() }))
  };
}

const FULFILLABLE_STATUSES = new Set(['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'PARTIALLY_DELIVERED', 'BACKORDERED']);

/**
 * Deliveries (Phase 4). A delivery is created as a `DRAFT` with planned line quantities so
 * they can be reviewed, then posts separately: posting is the only operation that touches
 * stock, and it does so exclusively through `StockPostingService`, one `SALES_DELIVERY`
 * movement per line keyed to that line's own id — the ledger's `(sourceType, sourceId,
 * sourceLineId)` unique constraint is what actually makes "a delivery line reduces stock
 * exactly once" true, not application logic here (mirrors `GoodsReceiptsService`).
 */
@Injectable()
export class DeliveriesService {
  constructor(private readonly posting: StockPostingService) {}

  async list(query: ListDeliveriesQuery): Promise<{ items: Delivery[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.DeliveryWhereInput = {
      ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      database.delivery.findMany({
        where,
        include: deliveryInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.delivery.count({ where })
    ]);
    return { items: rows.map(toDelivery), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Delivery> {
    const row = await database.delivery.findUnique({ where: { id }, include: deliveryInclude });
    if (!row) throw new NotFoundException('Delivery not found');
    return toDelivery(row);
  }

  async create(input: CreateDeliveryInput, actor: PostingActor, context: InventoryRequestContext): Promise<Delivery> {
    return withTransaction(async (transaction) => {
      const order = await transaction.salesOrder.findUnique({ where: { id: input.salesOrderId }, include: { lines: true } });
      if (!order) throw new NotFoundException('Sales order not found');
      if (!FULFILLABLE_STATUSES.has(order.status)) throw new ConflictException(`A sales order with status ${order.status} cannot be delivered`);

      const deliverableLines: DeliverableLine[] = order.lines.map((line) => ({
        salesOrderLineId: line.id,
        productId: line.productId,
        orderedQuantity: line.orderedQuantity.toString(),
        reservedQuantity: line.reservedQuantity.toString(),
        deliveredQuantity: line.deliveredQuantity.toString(),
        cancelledQuantity: line.cancelledQuantity.toString()
      }));
      const planned = planDeliveryLines(deliverableLines, input.mode, input.selections ?? []);
      if (planned.length === 0) throw new BadRequestException('This delivery would ship nothing');

      for (const plannedLine of planned) {
        const source = deliverableLines.find((line) => line.salesOrderLineId === plannedLine.salesOrderLineId);
        if (source) validateDeliveryQuantity(source, plannedLine.quantity);
      }

      const deliveryNumber = await nextDocumentNumber('delivery');
      const created = await transaction.delivery.create({
        data: {
          deliveryNumber,
          salesOrderId: order.id,
          warehouseId: order.warehouseId,
          notes: input.notes ?? null,
          createdById: actor.id,
          lines: { create: planned.map((line) => ({ salesOrderLineId: line.salesOrderLineId, productId: line.productId, quantity: line.quantity })) }
        },
        include: deliveryInclude
      });
      await this.audit(transaction, 'delivery.create', created.id, actor, context, { salesOrderId: order.id, lineCount: planned.length });
      return toDelivery(created);
    });
  }

  /**
   * Post a draft delivery: build one negative `SALES_DELIVERY` movement per line (through
   * `StockPostingService`, so it takes the same per-key advisory lock and negative-stock rule
   * every other posting does), consume the reservation each line covers first, then increment
   * `SalesOrderLine.deliveredQuantity` and re-derive the order's fulfilment status.
   */
  async post(id: string, input: PostDeliveryInput, actor: PostingActor, context: InventoryRequestContext): Promise<Delivery> {
    const delivery = await database.delivery.findUnique({ where: { id }, include: { lines: true } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'DRAFT') throw new ConflictException(`Only a draft delivery can be posted (this one is ${delivery.status})`);

    const movements = buildDeliveryMovements(
      delivery.id,
      delivery.warehouseId,
      delivery.lines.map((line) => ({ id: line.id, productId: line.productId, quantity: line.quantity.toString() }))
    ).map((movement) => ({ ...movement, idempotencyKey: `${input.idempotencyKey}:${movement.sourceLineId}`, notes: null, allowNegativeStockOverride: false }));

    await this.posting.postMovements(movements, actor, context);

    return withTransaction(async (transaction) => {
      for (const line of delivery.lines) {
        const quantity = Quantity.from(line.quantity.toString());
        const salesOrderLine = await transaction.salesOrderLine.findUniqueOrThrow({ where: { id: line.salesOrderLineId } });

        await lockStockKey(transaction, line.productId, delivery.warehouseId);
        const consumption = planReservationConsumption(salesOrderLine.reservedQuantity.toString(), quantity.toDecimalString());
        if (Quantity.from(consumption.consumedReservationQuantity).isPositive()) {
          const reservations = await transaction.stockReservation.findMany({
            where: { salesOrderLineId: line.salesOrderLineId, status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' }
          });
          let remaining = Quantity.from(consumption.consumedReservationQuantity);
          for (const reservation of reservations) {
            if (!remaining.isPositive()) break;
            const reservedQuantity = Quantity.from(reservation.quantity.toString());
            const take = reservedQuantity.lessThan(remaining) ? reservedQuantity : remaining;
            await consumeReservation(transaction, reservation.id, take);
            remaining = remaining.subtract(take);
          }
        }

        await transaction.salesOrderLine.update({ where: { id: line.salesOrderLineId }, data: { deliveredQuantity: { increment: quantity.toDecimalString() } } });
      }

      await this.refreshOrderStatus(transaction, delivery.salesOrderId);
      const updated = await transaction.delivery.update({
        where: { id },
        data: { status: 'POSTED', postedById: actor.id, postedAt: new Date() },
        include: deliveryInclude
      });
      await this.audit(transaction, 'delivery.post', id, actor, context, { salesOrderId: delivery.salesOrderId, lineCount: delivery.lines.length });
      return toDelivery(updated);
    });
  }

  /** Reverse every stock effect a posted delivery created, atomically, and decrement the order lines it advanced. */
  async reverse(id: string, input: ReverseDeliveryInput, actor: PostingActor, context: InventoryRequestContext): Promise<Delivery> {
    const delivery = await database.delivery.findUnique({ where: { id }, include: { lines: true } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'POSTED') throw new ConflictException('Only a posted delivery can be reversed');

    const movements = await database.stockMovement.findMany({ where: { sourceType: DELIVERY_SOURCE_TYPE, sourceId: id }, select: { id: true } });
    if (movements.length > 0) {
      await this.posting.reverseMovements(movements.map((movement) => movement.id), input, actor, context);
    }

    return withTransaction(async (transaction) => {
      for (const line of delivery.lines) {
        await transaction.salesOrderLine.update({ where: { id: line.salesOrderLineId }, data: { deliveredQuantity: { decrement: line.quantity.toString() } } });
      }
      await this.refreshOrderStatus(transaction, delivery.salesOrderId);
      const updated = await transaction.delivery.update({ where: { id }, data: { status: 'REVERSED', reversedAt: new Date() }, include: deliveryInclude });
      await this.audit(transaction, 'delivery.reverse', id, actor, context, { reason: input.notes ?? null });
      return toDelivery(updated);
    });
  }

  private async refreshOrderStatus(transaction: DatabaseTransaction, salesOrderId: string): Promise<void> {
    const order = await transaction.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });
    if (order.status === 'CANCELLED' || order.status === 'CLOSED') return;
    const lines = await transaction.salesOrderLine.findMany({ where: { salesOrderId } });
    const status = deriveSalesOrderFulfilmentStatus(
      lines.map((line) => ({
        orderedQuantity: line.orderedQuantity.toString(),
        reservedQuantity: line.reservedQuantity.toString(),
        deliveredQuantity: line.deliveredQuantity.toString(),
        cancelledQuantity: line.cancelledQuantity.toString(),
        backorderedQuantity: line.backorderedQuantity.toString(),
        invoicedQuantity: line.invoicedQuantity.toString()
      }))
    );
    if (status === 'CANCELLED') return;
    await transaction.salesOrder.update({ where: { id: salesOrderId }, data: { status } });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: PostingActor,
    context: InventoryRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'Delivery',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }
}
