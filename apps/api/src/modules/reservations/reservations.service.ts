import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { orderDemands, planAllocationRun, Quantity, type ReservationDemand } from '@tadpods/domain';
import { database, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type { CreateReservationInput, ListReservationsQuery, Reservation, ReservationAllocationResult, RunReservationAllocationInput } from '@tadpods/contracts';
import { activeReservedFor, createReservation, lockStockKey, releaseReservation, stockOnHandFor } from './reservation-posting.js';
import { absorbBackorderForReservation } from '../backorders/backorder-posting.js';

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

      // Manually reserving demand that was previously backordered must shrink the open
      // backorder *before* the reservation increments `reservedQuantity` — both count toward
      // the same ordered-quantity check constraint.
      const backorderLineId = await absorbBackorderForReservation(transaction, line.id, requested);

      const reservation = await createReservation(transaction, {
        salesOrderId: line.salesOrderId,
        salesOrderLineId: line.id,
        productId: line.productId,
        warehouseId: line.salesOrder.warehouseId,
        quantity: requested,
        method: 'MANUAL',
        createdById: actor.id,
        backorderLineId,
        notes: input.notes ?? null
      });

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

      // Any order still short on this line is a candidate, regardless of its overall
      // fulfilment status — a `PARTIALLY_DELIVERED` order can still carry open backordered
      // demand on other lines just as much as a freshly `BACKORDERED` one.
      const lines = await transaction.salesOrderLine.findMany({
        where: {
          productId: input.productId,
          backorderedQuantity: { gt: 0 },
          salesOrder: { warehouseId: input.warehouseId, status: { notIn: ['DRAFT', 'CANCELLED', 'CLOSED'] } }
        },
        include: { salesOrder: true }
      });

      // Demand here is exactly the lines' open backordered quantity: immediately after
      // confirmation every line's outstanding demand is already either reserved or
      // backordered (see `SalesOrdersService.confirm`), so an allocation run only ever has
      // backordered demand to compete for. Not subtracting `backorderedQuantity` — it *is*
      // the demand this run exists to satisfy.
      const demands: ReservationDemand[] = lines
        .map((line) => {
          const unfulfilled = Quantity.from(line.orderedQuantity.toString())
            .subtract(Quantity.from(line.deliveredQuantity.toString()))
            .subtract(Quantity.from(line.cancelledQuantity.toString()))
            .subtract(Quantity.from(line.reservedQuantity.toString()));
          return {
            salesOrderId: line.salesOrderId,
            salesOrderLineId: line.id,
            quantity: unfulfilled.toDecimalString(),
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
      for (const allocation of allocations) {
        const line = lines.find((candidate) => candidate.id === allocation.salesOrderLineId);
        if (!line || !Quantity.from(allocation.quantity).isPositive()) continue;

        // Shrink the backorder this reservation is fulfilling before claiming the stock —
        // both counters are bound by the same ordered-quantity check constraint. Whatever
        // remains unreserved (`allocation.shortfallQuantity`) is simply left backordered;
        // it is already represented by `BackorderLine`, so no new backorder is raised.
        const backorderLineId = await absorbBackorderForReservation(transaction, line.id, Quantity.from(allocation.quantity));
        const reservation = await createReservation(transaction, {
          salesOrderId: allocation.salesOrderId,
          salesOrderLineId: allocation.salesOrderLineId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: Quantity.from(allocation.quantity),
          method: input.method,
          createdById: actor.id,
          backorderLineId
        });
        reservations.push(await transaction.stockReservation.findUniqueOrThrow({ where: { id: reservation.id }, include: reservationInclude }));
      }
      const backordersCreated: string[] = [];

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
