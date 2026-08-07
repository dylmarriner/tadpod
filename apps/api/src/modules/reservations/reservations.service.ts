import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { orderDemands, planAllocationRun, Quantity, type ReservationDemand } from '@tadpods/domain';
import { database, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type { CreateReservationInput, ListReservationsQuery, Reservation, ReservationAllocationResult, RunReservationAllocationInput } from '@tadpods/contracts';
import { activeReservedFor, createReservation, lockStockKey, releaseReservation, stockOnHandFor } from './reservation-posting.js';
import { createBackorderForShortfall, refreshBackorderStatus } from '../backorders/backorder-posting.js';

export type SalesActor = { id: string; permissions: readonly string[] };
export type SalesRequestContext = { requestId: string; ipAddress?: string };

const reservationInclude = {
  product: { select: { id: true, sku: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } }
} satisfies PrismaNamespace.StockReservationInclude;

type ReservationWithRelations = PrismaNamespace.StockReservationGetPayload<{ include: typeof reservationInclude }>;

function toReservation(row: ReservationWithRelations): Reservation {
  return {
    id: row.id,
    salesOrderId: row.salesOrderId,
    salesOrderLineId: row.salesOrderLineId,
    product: row.product,
    warehouseId: row.warehouseId,
    quantity: row.quantity.toString(),
    status: row.status,
    method: row.method as Reservation['method'],
    backorderLineId: row.backorderLineId,
    createdBy: row.createdBy,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    consumedAt: row.consumedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString()
  };
}

/**
 * Reservations (Phase 4). `create` is the "reserve manually" rule; `runAllocation` is the
 * "reserve by priority / promised date / oldest first" rule, spreading one product/warehouse's
 * available stock across every order still short on that line. Reservation changes are always
 * transactional and immediately visible from both the product's stock screens (as reduced
 * available stock) and the order screen (as `SalesOrderLine.reservedQuantity`), because both
 * read the same posted rows.
 */
@Injectable()
export class ReservationsService {
  async list(query: ListReservationsQuery): Promise<{ items: Reservation[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.StockReservationWhereInput = {
      ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      database.stockReservation.findMany({
        where,
        include: reservationInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.stockReservation.count({ where })
    ]);
    return { items: rows.map(toReservation), total, page: query.page, pageSize: query.pageSize };
  }

  async create(input: CreateReservationInput, actor: SalesActor, context: SalesRequestContext): Promise<Reservation> {
    return withTransaction(async (transaction) => {
      const line = await transaction.salesOrderLine.findUnique({ where: { id: input.salesOrderLineId }, include: { salesOrder: true } });
      if (!line) throw new NotFoundException('Sales order line not found');
      if (line.salesOrder.status === 'DRAFT' || line.salesOrder.status === 'CANCELLED' || line.salesOrder.status === 'CLOSED') {
        throw new ConflictException(`Cannot reserve stock against an order with status ${line.salesOrder.status}`);
      }

      const outstanding = Quantity.from(line.orderedQuantity.toString())
        .subtract(Quantity.from(line.deliveredQuantity.toString()))
        .subtract(Quantity.from(line.cancelledQuantity.toString()))
        .subtract(Quantity.from(line.reservedQuantity.toString()));
      const requested = Quantity.from(input.quantity);
      if (requested.greaterThan(outstanding)) {
        throw new BadRequestException(`Cannot reserve more than the ${outstanding.toDecimalString()} still unreserved on this line`);
      }

      await lockStockKey(transaction, line.productId, line.salesOrder.warehouseId);
      const reservation = await createReservation(transaction, {
        salesOrderId: line.salesOrderId,
        salesOrderLineId: line.id,
        productId: line.productId,
        warehouseId: line.salesOrder.warehouseId,
        quantity: requested,
        method: 'MANUAL',
        createdById: actor.id,
        notes: input.notes ?? null
      });

      // Manually reserving demand that was previously backordered shrinks the open backorder
      // by the same amount, so the two records never both claim the same stock.
      const backorderLine = await transaction.backorderLine.findFirst({
        where: { salesOrderLineId: line.id, backorder: { status: { not: 'CANCELLED' } } }
      });
      if (backorderLine) {
        const open = Quantity.from(backorderLine.quantity.toString())
          .subtract(Quantity.from(backorderLine.fulfilledQuantity.toString()))
          .subtract(Quantity.from(backorderLine.cancelledQuantity.toString()));
        const absorbed = requested.lessThan(open) ? requested : open;
        if (absorbed.isPositive()) {
          await transaction.backorderLine.update({ where: { id: backorderLine.id }, data: { cancelledQuantity: { increment: absorbed.toDecimalString() } } });
          await transaction.salesOrderLine.update({ where: { id: line.id }, data: { backorderedQuantity: { decrement: absorbed.toDecimalString() } } });
          await refreshBackorderStatus(transaction, backorderLine.backorderId);
        }
      }

      await this.audit(transaction, 'reservation.create', reservation.id, actor, context, { salesOrderLineId: line.id, quantity: requested.toDecimalString() });
      const withRelations = await transaction.stockReservation.findUniqueOrThrow({ where: { id: reservation.id }, include: reservationInclude });
      return toReservation(withRelations);
    });
  }

  async release(id: string, actor: SalesActor, context: SalesRequestContext): Promise<Reservation> {
    return withTransaction(async (transaction) => {
      await releaseReservation(transaction, id);
      await this.audit(transaction, 'reservation.release', id, actor, context, {});
      const withRelations = await transaction.stockReservation.findUniqueOrThrow({ where: { id }, include: reservationInclude });
      return toReservation(withRelations);
    });
  }

  /**
   * Run an allocation across every order still carrying open, unreserved demand for one
   * product/warehouse, spreading available stock by priority, promised date, or oldest-order-
   * first. Anything left short after the run is raised as a backorder, exactly as
   * `SalesOrdersService.confirm` does for a single order's own confirmation-time reservation.
   */
  async runAllocation(input: RunReservationAllocationInput, actor: SalesActor, context: SalesRequestContext): Promise<ReservationAllocationResult> {
    return withTransaction(async (transaction) => {
      await lockStockKey(transaction, input.productId, input.warehouseId);

      const lines = await transaction.salesOrderLine.findMany({
        where: {
          productId: input.productId,
          salesOrder: { warehouseId: input.warehouseId, status: { in: ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'BACKORDERED'] } }
        },
        include: { salesOrder: true }
      });

      const demands: ReservationDemand[] = lines
        .map((line) => {
          const unreserved = Quantity.from(line.orderedQuantity.toString())
            .subtract(Quantity.from(line.deliveredQuantity.toString()))
            .subtract(Quantity.from(line.cancelledQuantity.toString()))
            .subtract(Quantity.from(line.reservedQuantity.toString()))
            .subtract(Quantity.from(line.backorderedQuantity.toString()));
          return {
            salesOrderId: line.salesOrderId,
            salesOrderLineId: line.id,
            quantity: unreserved.toDecimalString(),
            priority: line.salesOrder.priority,
            promisedDate: line.salesOrder.promisedDate?.toISOString() ?? null,
            confirmedAt: (line.salesOrder.confirmedAt ?? line.salesOrder.createdAt).toISOString()
          };
        })
        .filter((demand) => Quantity.from(demand.quantity).isPositive());

      if (demands.length === 0) {
        return { productId: input.productId, warehouseId: input.warehouseId, method: input.method, reservations: [], backordersCreated: [] };
      }

      const stockOnHand = await stockOnHandFor(transaction, input.productId, input.warehouseId);
      const activeReserved = await activeReservedFor(transaction, input.productId, input.warehouseId);
      const available = stockOnHand.subtract(activeReserved);
      const ordered = orderDemands(demands, input.method);
      const allocations = planAllocationRun(available.toDecimalString(), ordered, input.method);

      const reservations: ReservationWithRelations[] = [];
      const backordersCreated: string[] = [];
      for (const allocation of allocations) {
        const line = lines.find((candidate) => candidate.id === allocation.salesOrderLineId);
        if (!line) continue;

        if (Quantity.from(allocation.quantity).isPositive()) {
          const reservation = await createReservation(transaction, {
            salesOrderId: allocation.salesOrderId,
            salesOrderLineId: allocation.salesOrderLineId,
            productId: input.productId,
            warehouseId: input.warehouseId,
            quantity: Quantity.from(allocation.quantity),
            method: input.method,
            createdById: actor.id
          });
          reservations.push(await transaction.stockReservation.findUniqueOrThrow({ where: { id: reservation.id }, include: reservationInclude }));
        }
        if (Quantity.from(allocation.shortfallQuantity).isPositive()) {
          const backorder = await createBackorderForShortfall(transaction, {
            salesOrderId: allocation.salesOrderId,
            salesOrderLineId: allocation.salesOrderLineId,
            productId: input.productId,
            customerId: line.salesOrder.customerId,
            warehouseId: input.warehouseId,
            quantity: Quantity.from(allocation.shortfallQuantity),
            priority: line.salesOrder.priority,
            promisedDate: line.salesOrder.promisedDate,
            createdById: actor.id
          });
          await transaction.salesOrderLine.update({ where: { id: line.id }, data: { backorderedQuantity: { increment: allocation.shortfallQuantity } } });
          await refreshBackorderStatus(transaction, backorder.id);
          backordersCreated.push(backorder.id);
        }
      }

      await this.audit(transaction, 'reservation.run-allocation', `${input.productId}:${input.warehouseId}`, actor, context, {
        method: input.method,
        reservedLines: reservations.length,
        backordersCreated: backordersCreated.length
      });

      return {
        productId: input.productId,
        warehouseId: input.warehouseId,
        method: input.method,
        reservations: reservations.map(toReservation),
        backordersCreated
      };
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: SalesActor,
    context: SalesRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'StockReservation',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }
}
