import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasPermission } from '@tadpods/auth';
import {
  computeAvailableToPromise,
  computeSalesOrderLineProjection,
  computeSalesOrderTotalMinorUnits,
  deriveSalesOrderFulfilmentStatus,
  exceedsCreditLimit,
  Money,
  planReservation,
  Quantity,
  validateSalesOrderEditingTransition
} from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type {
  CancelSalesOrderInput,
  CancelSalesOrderLineInput,
  ConfirmSalesOrderInput,
  CreateSalesOrderInput,
  ListSalesOrdersQuery,
  SalesOrder,
  SalesOrderAvailability,
  SalesOrderAvailabilityQuery,
  SalesOrderLine,
  UpdateSalesOrderInput
} from '@tadpods/contracts';
import { activeReservedFor, createReservation, lockStockKey, releaseReservation, stockOnHandFor } from '../reservations/reservation-posting.js';
import { createBackorderForShortfall, refreshBackorderStatus } from '../backorders/backorder-posting.js';

export type SalesActor = { id: string; permissions: readonly string[] };
export type SalesRequestContext = { requestId: string; ipAddress?: string };

const CREDIT_OVERRIDE_PERMISSION = 'sales.override-credit-limit';

const salesOrderInclude = {
  customer: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  confirmedBy: { select: { id: true, displayName: true, email: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true } } } }
} satisfies PrismaNamespace.SalesOrderInclude;

type SalesOrderWithRelations = PrismaNamespace.SalesOrderGetPayload<{ include: typeof salesOrderInclude }>;

function toLine(row: SalesOrderWithRelations['lines'][number], currency: string): SalesOrderLine {
  const quantities = {
    orderedQuantity: row.orderedQuantity.toString(),
    reservedQuantity: row.reservedQuantity.toString(),
    deliveredQuantity: row.deliveredQuantity.toString(),
    cancelledQuantity: row.cancelledQuantity.toString(),
    backorderedQuantity: row.backorderedQuantity.toString(),
    invoicedQuantity: row.invoicedQuantity.toString()
  };
  const projection = computeSalesOrderLineProjection(quantities);
  return {
    id: row.id,
    product: row.product,
    unitPrice: Money.from(row.unitPriceMinorUnits, currency).toDecimalString(),
    discountPercentBasis: row.discountPercentBasis,
    ...quantities,
    ...projection,
    lineTotal: Money.from(computeLineTotal(row.unitPriceMinorUnits, quantities.orderedQuantity, row.discountPercentBasis), currency).toDecimalString()
  };
}

function computeLineTotal(unitPriceMinorUnits: bigint, orderedQuantity: string, discountPercentBasis: number): bigint {
  return computeSalesOrderTotalMinorUnits([{ unitPriceMinorUnits, orderedQuantity, discountPercentBasis }]);
}

function toSalesOrder(row: SalesOrderWithRelations): SalesOrder {
  const totalMinorUnits = computeSalesOrderTotalMinorUnits(
    row.lines.map((line) => ({ unitPriceMinorUnits: line.unitPriceMinorUnits, orderedQuantity: line.orderedQuantity.toString(), discountPercentBasis: line.discountPercentBasis }))
  );
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customer: row.customer,
    warehouse: row.warehouse,
    status: row.status,
    invoicingStatus: row.invoicingStatus,
    currency: row.currency,
    priority: row.priority,
    promisedDate: row.promisedDate?.toISOString() ?? null,
    customerReference: row.customerReference,
    notes: row.notes,
    totalAmount: Money.from(totalMinorUnits, row.currency).toDecimalString(),
    createdBy: row.createdBy,
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => toLine(line, row.currency))
  };
}

/**
 * Sales orders (Phase 4). `confirm` is the one operation that both takes a commercial
 * snapshot (status DRAFT -> CONFIRMED) and immediately reserves what stock is available line
 * by line, raising a backorder for whatever is short — all inside one transaction, under a
 * per-(product, warehouse) advisory lock, so a sales order is never left half-reserved by a
 * concurrent posting. Past `CONFIRMED`, `SalesOrdersService` never edits reserved/delivered/
 * backordered/invoiced quantities again — those belong to `ReservationsService`,
 * `DeliveriesService`, `BackordersService`, and Phase 5, respectively — it only derives status
 * from what they wrote.
 */
@Injectable()
export class SalesOrdersService {
  async list(query: ListSalesOrdersQuery): Promise<{ items: SalesOrder[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.SalesOrderWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      database.salesOrder.findMany({
        where,
        include: salesOrderInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.salesOrder.count({ where })
    ]);
    return { items: rows.map(toSalesOrder), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<SalesOrder> {
    const row = await database.salesOrder.findUnique({ where: { id }, include: salesOrderInclude });
    if (!row) throw new NotFoundException('Sales order not found');
    const order = toSalesOrder(row);

    // Live availability per line, at the order's warehouse — what order entry and the order
    // detail screen both show immediately, per Phase 4's Sales Workflow step 3.
    const balances = await Promise.all(
      row.lines.map(async (line) => ({
        id: line.id,
        stockOnHand: await stockOnHandFor(database as unknown as DatabaseTransaction, line.productId, row.warehouseId),
        activeReserved: await activeReservedFor(database as unknown as DatabaseTransaction, line.productId, row.warehouseId)
      }))
    );
    const byLineId = new Map(balances.map((balance) => [balance.id, balance]));
    return {
      ...order,
      lines: order.lines.map((line) => {
        const balance = byLineId.get(line.id);
        if (!balance) return line;
        return {
          ...line,
          stockOnHand: balance.stockOnHand.toDecimalString(),
          availableStock: balance.stockOnHand.subtract(balance.activeReserved).toDecimalString()
        };
      })
    };
  }

  async create(input: CreateSalesOrderInput, actor: SalesActor, context: SalesRequestContext): Promise<SalesOrder> {
    return withTransaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new NotFoundException('Customer not found');
      if (!customer.active) throw new BadRequestException('Cannot create a sales order for an inactive customer');

      const warehouse = await transaction.warehouse.findUnique({ where: { id: input.warehouseId } });
      if (!warehouse) throw new NotFoundException('Warehouse not found');
      if (warehouse.status !== 'ACTIVE') throw new BadRequestException('Cannot create a sales order for an inactive warehouse');

      const orderNumber = await nextDocumentNumber('sales-order');
      const created = await transaction.salesOrder.create({
        data: {
          orderNumber,
          customerId: input.customerId,
          warehouseId: input.warehouseId,
          currency: input.currency ?? customer.currency,
          priority: input.priority,
          promisedDate: input.promisedDate ? new Date(input.promisedDate) : null,
          customerReference: input.customerReference ?? null,
          notes: input.notes ?? null,
          createdById: actor.id,
          lines: {
            create: input.lines.map((line) => ({
              productId: line.productId,
              unitPriceMinorUnits: Money.from(line.unitPrice).minorUnits,
              discountPercentBasis: line.discountPercentBasis,
              orderedQuantity: line.orderedQuantity
            }))
          }
        },
        include: salesOrderInclude
      });
      await this.audit(transaction, 'sales-order.create', created.id, actor, context, { orderNumber, customerId: input.customerId });
      return toSalesOrder(created);
    });
  }

  async update(id: string, input: UpdateSalesOrderInput, actor: SalesActor, context: SalesRequestContext): Promise<SalesOrder> {
    return withTransaction(async (transaction) => {
      const existing = await transaction.salesOrder.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Sales order not found');
      if (existing.status !== 'DRAFT') throw new ConflictException('Only a draft sales order can be edited');

      if (input.lines) {
        await transaction.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
        await transaction.salesOrderLine.createMany({
          data: input.lines.map((line) => ({
            salesOrderId: id,
            productId: line.productId,
            unitPriceMinorUnits: Money.from(line.unitPrice).minorUnits,
            discountPercentBasis: line.discountPercentBasis,
            orderedQuantity: line.orderedQuantity
          }))
        });
      }

      const updated = await transaction.salesOrder.update({
        where: { id },
        data: {
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.promisedDate !== undefined ? { promisedDate: input.promisedDate ? new Date(input.promisedDate) : null } : {}),
          ...(input.customerReference !== undefined ? { customerReference: input.customerReference } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {})
        },
        include: salesOrderInclude
      });
      await this.audit(transaction, 'sales-order.update', id, actor, context, { linesReplaced: Boolean(input.lines) });
      return toSalesOrder(updated);
    });
  }

  /**
   * Confirm a draft order: validate the customer credit limit, take the commercial snapshot,
   * then reserve each line's outstanding demand from currently available stock — immediately,
   * one product/warehouse lock at a time in a fixed line order (avoiding deadlocks against a
   * concurrent multi-line posting) — and raise a backorder for whatever cannot be reserved.
   */
  async confirm(id: string, input: ConfirmSalesOrderInput, actor: SalesActor, context: SalesRequestContext): Promise<SalesOrder> {
    return withTransaction(async (transaction) => {
      const order = await transaction.salesOrder.findUnique({ where: { id }, include: salesOrderInclude });
      if (!order) throw new NotFoundException('Sales order not found');
      validateSalesOrderEditingTransition(order.status, 'CONFIRMED');
      if (order.lines.length === 0) throw new BadRequestException('Cannot confirm a sales order with no lines');

      const totalMinorUnits = computeSalesOrderTotalMinorUnits(
        order.lines.map((line) => ({ unitPriceMinorUnits: line.unitPriceMinorUnits, orderedQuantity: line.orderedQuantity.toString(), discountPercentBasis: line.discountPercentBasis }))
      );
      const customer = await transaction.customer.findUniqueOrThrow({ where: { id: order.customerId } });
      // No customer-invoice ledger exists yet (Phase 5), so the current balance is always
      // zero — the check still runs so a credit limit configured today is honoured today.
      const overLimit = exceedsCreditLimit(customer.creditLimitMinorUnits, 0n, totalMinorUnits);
      if (overLimit && !input.allowCreditLimitOverride) {
        throw new ConflictException('This order would exceed the customer credit limit; confirm with allowCreditLimitOverride to proceed');
      }
      if (overLimit && input.allowCreditLimitOverride && !hasPermission(actor.permissions, CREDIT_OVERRIDE_PERMISSION)) {
        throw new ForbiddenException('Overriding the customer credit limit requires the sales.override-credit-limit permission');
      }

      await transaction.salesOrder.update({ where: { id }, data: { status: 'CONFIRMED', confirmedById: actor.id, confirmedAt: new Date() } });

      const sortedLines = [...order.lines].sort((a, b) => a.id.localeCompare(b.id));
      for (const line of sortedLines) {
        const outstanding = Quantity.from(line.orderedQuantity.toString());
        if (!outstanding.isPositive()) continue;

        await lockStockKey(transaction, line.productId, order.warehouseId);
        const [stockOnHand, activeReserved] = await Promise.all([
          stockOnHandFor(transaction, line.productId, order.warehouseId),
          activeReservedFor(transaction, line.productId, order.warehouseId)
        ]);
        const available = stockOnHand.subtract(activeReserved);
        const plan = planReservation(outstanding.toDecimalString(), available.toDecimalString());

        if (Quantity.from(plan.reserveQuantity).isPositive()) {
          await createReservation(transaction, {
            salesOrderId: id,
            salesOrderLineId: line.id,
            productId: line.productId,
            warehouseId: order.warehouseId,
            quantity: Quantity.from(plan.reserveQuantity),
            method: 'IMMEDIATE',
            createdById: actor.id
          });
        }
        if (Quantity.from(plan.shortfallQuantity).isPositive()) {
          const backorder = await createBackorderForShortfall(transaction, {
            salesOrderId: id,
            salesOrderLineId: line.id,
            productId: line.productId,
            customerId: order.customerId,
            warehouseId: order.warehouseId,
            quantity: Quantity.from(plan.shortfallQuantity),
            priority: order.priority,
            promisedDate: order.promisedDate,
            createdById: actor.id
          });
          await transaction.salesOrderLine.update({
            where: { id: line.id },
            data: { backorderedQuantity: { increment: plan.shortfallQuantity } }
          });
          await refreshBackorderStatus(transaction, backorder.id);
        }
      }

      await this.refreshOrderStatus(transaction, id);
      const updated = await transaction.salesOrder.findUniqueOrThrow({ where: { id }, include: salesOrderInclude });
      await this.audit(transaction, 'sales-order.confirm', id, actor, context, { totalMinorUnits: totalMinorUnits.toString(), overLimit });
      return toSalesOrder(updated);
    });
  }

  /**
   * Cancel a draft or confirmed order in full: release every active reservation, cancel every
   * open backorder line, and mark each line's outstanding quantity cancelled. Cannot cancel a
   * line that has already shipped or invoiced quantity — that quantity is a fact of what
   * happened, not something a cancellation can erase.
   */
  async cancel(id: string, input: CancelSalesOrderInput, actor: SalesActor, context: SalesRequestContext): Promise<SalesOrder> {
    return withTransaction(async (transaction) => {
      const order = await transaction.salesOrder.findUnique({ where: { id }, include: salesOrderInclude });
      if (!order) throw new NotFoundException('Sales order not found');
      validateSalesOrderEditingTransition(order.status, 'CANCELLED');

      const activeReservations = await transaction.stockReservation.findMany({ where: { salesOrderId: id, status: 'ACTIVE' } });
      for (const reservation of activeReservations) {
        await releaseReservation(transaction, reservation.id);
      }

      const backorders = await transaction.backorder.findMany({ where: { salesOrderId: id, status: { not: 'CANCELLED' } }, include: { lines: true } });
      for (const backorder of backorders) {
        for (const line of backorder.lines) {
          const open = Quantity.from(line.quantity.toString()).subtract(Quantity.from(line.fulfilledQuantity.toString())).subtract(Quantity.from(line.cancelledQuantity.toString()));
          if (!open.isPositive()) continue;
          await transaction.backorderLine.update({ where: { id: line.id }, data: { cancelledQuantity: { increment: open.toDecimalString() } } });
        }
        await refreshBackorderStatus(transaction, backorder.id);
        await transaction.backorder.update({ where: { id: backorder.id }, data: { cancelledAt: new Date() } });
      }

      for (const line of order.lines) {
        const outstanding = Quantity.from(line.orderedQuantity.toString())
          .subtract(Quantity.from(line.deliveredQuantity.toString()))
          .subtract(Quantity.from(line.cancelledQuantity.toString()));
        if (!outstanding.isPositive()) continue;
        await transaction.salesOrderLine.update({
          where: { id: line.id },
          data: { cancelledQuantity: { increment: outstanding.toDecimalString() }, backorderedQuantity: 0 }
        });
      }

      const updated = await transaction.salesOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          notes: input.reason ? [order.notes, `Cancelled: ${input.reason}`].filter(Boolean).join('\n') : order.notes
        },
        include: salesOrderInclude
      });
      await this.audit(transaction, 'sales-order.cancel', id, actor, context, { reason: input.reason ?? null });
      return toSalesOrder(updated);
    });
  }

  /**
   * Cancel (withdraw) outstanding quantity on one confirmed line — the customer-requested
   * partial-shipment counterpart: reduce demand instead of shipping it. Releases the line's
   * active reservation first (oldest reservation released first), then withdraws any remaining
   * open backorder quantity, then marks whatever is still outstanding cancelled.
   */
  async cancelLine(id: string, lineId: string, input: CancelSalesOrderLineInput, actor: SalesActor, context: SalesRequestContext): Promise<SalesOrder> {
    return withTransaction(async (transaction) => {
      const order = await transaction.salesOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Sales order not found');
      if (order.status === 'DRAFT' || order.status === 'CANCELLED' || order.status === 'CLOSED') {
        throw new ConflictException(`Cannot cancel a line on an order with status ${order.status}`);
      }
      const line = await transaction.salesOrderLine.findUnique({ where: { id: lineId } });
      if (!line || line.salesOrderId !== id) throw new NotFoundException('Sales order line not found');

      const outstanding = Quantity.from(line.orderedQuantity.toString())
        .subtract(Quantity.from(line.deliveredQuantity.toString()))
        .subtract(Quantity.from(line.cancelledQuantity.toString()));
      const toCancel = input.quantity ? Quantity.from(input.quantity) : outstanding;
      if (!toCancel.isPositive()) throw new BadRequestException('There is no outstanding quantity to cancel on this line');
      if (toCancel.greaterThan(outstanding)) throw new BadRequestException(`Cannot cancel more than the ${outstanding.toDecimalString()} still outstanding`);

      let remaining = toCancel;
      const activeReservations = await transaction.stockReservation.findMany({ where: { salesOrderLineId: lineId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
      for (const reservation of activeReservations) {
        if (!remaining.isPositive()) break;
        const reservedQuantity = Quantity.from(reservation.quantity.toString());
        if (reservedQuantity.lessThan(remaining) || reservedQuantity.compare(remaining) === 0) {
          await releaseReservation(transaction, reservation.id);
          remaining = remaining.subtract(reservedQuantity);
        } else {
          await lockStockKey(transaction, reservation.productId, reservation.warehouseId);
          await transaction.stockReservation.update({ where: { id: reservation.id }, data: { quantity: reservedQuantity.subtract(remaining).toDecimalString() } });
          await transaction.salesOrderLine.update({ where: { id: lineId }, data: { reservedQuantity: { decrement: remaining.toDecimalString() } } });
          remaining = Quantity.zero();
        }
      }

      if (remaining.isPositive()) {
        const backorderLines = await transaction.backorderLine.findMany({ where: { salesOrderLineId: lineId, backorder: { status: { not: 'CANCELLED' } } } });
        for (const backorderLine of backorderLines) {
          if (!remaining.isPositive()) break;
          const open = Quantity.from(backorderLine.quantity.toString()).subtract(Quantity.from(backorderLine.fulfilledQuantity.toString())).subtract(Quantity.from(backorderLine.cancelledQuantity.toString()));
          if (!open.isPositive()) continue;
          const cancel = open.lessThan(remaining) ? open : remaining;
          await transaction.backorderLine.update({ where: { id: backorderLine.id }, data: { cancelledQuantity: { increment: cancel.toDecimalString() } } });
          await transaction.salesOrderLine.update({ where: { id: lineId }, data: { backorderedQuantity: { decrement: cancel.toDecimalString() } } });
          await refreshBackorderStatus(transaction, backorderLine.backorderId);
          remaining = remaining.subtract(cancel);
        }
      }

      await transaction.salesOrderLine.update({ where: { id: lineId }, data: { cancelledQuantity: { increment: toCancel.toDecimalString() } } });
      await this.refreshOrderStatus(transaction, id);

      const updated = await transaction.salesOrder.findUniqueOrThrow({ where: { id }, include: salesOrderInclude });
      await this.audit(transaction, 'sales-order.cancel-line', id, actor, context, { lineId, quantity: toCancel.toDecimalString(), reason: input.reason ?? null });
      return toSalesOrder(updated);
    });
  }

  /**
   * Live availability for order entry (Sales Workflow step 3): what could still be promised to
   * a *new* customer right now. Incoming supply is summed across every confirmed,
   * not-yet-fully-received purchase order line for the product — purchase orders carry no
   * warehouse until goods receipt assigns one, so incoming supply is necessarily
   * warehouse-agnostic here, while stock on hand, reservations, and open backorders are all
   * scoped to the requested warehouse.
   */
  async availability(query: SalesOrderAvailabilityQuery): Promise<SalesOrderAvailability> {
    const [stockOnHand, activeReserved, incomingLines, openBackorderedLines] = await Promise.all([
      stockOnHandFor(database as unknown as DatabaseTransaction, query.productId, query.warehouseId),
      activeReservedFor(database as unknown as DatabaseTransaction, query.productId, query.warehouseId),
      database.purchaseOrderLine.findMany({
        where: { productId: query.productId, purchaseOrder: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED', 'PARTIALLY_BILLED'] } } },
        select: { orderedQuantity: true, receivedQuantity: true }
      }),
      database.backorderLine.findMany({
        where: { productId: query.productId, backorder: { warehouseId: query.warehouseId, status: { not: 'CANCELLED' } } },
        select: { quantity: true, fulfilledQuantity: true, cancelledQuantity: true }
      })
    ]);

    const incoming = incomingLines.reduce(
      (sum, line) => sum.add(Quantity.from(line.orderedQuantity.toString()).subtract(Quantity.from(line.receivedQuantity.toString()))),
      Quantity.zero()
    );
    const openBackordered = openBackorderedLines.reduce(
      (sum, line) =>
        sum.add(Quantity.from(line.quantity.toString()).subtract(Quantity.from(line.fulfilledQuantity.toString())).subtract(Quantity.from(line.cancelledQuantity.toString()))),
      Quantity.zero()
    );

    return {
      productId: query.productId,
      warehouseId: query.warehouseId,
      stockOnHand: stockOnHand.toDecimalString(),
      activeReserved: activeReserved.toDecimalString(),
      availableStock: stockOnHand.subtract(activeReserved).toDecimalString(),
      incoming: incoming.toDecimalString(),
      openBackordered: openBackordered.toDecimalString(),
      availableToPromise: computeAvailableToPromise({
        stockOnHandQuantity: stockOnHand.toDecimalString(),
        incomingQuantity: incoming.toDecimalString(),
        activeReservedQuantity: activeReserved.toDecimalString(),
        openBackorderedQuantity: openBackordered.toDecimalString()
      })
    };
  }

  /** Clones a sales order's customer, warehouse, and lines into a new draft. */
  async duplicate(id: string, actor: SalesActor, context: SalesRequestContext): Promise<SalesOrder> {
    const original = await database.salesOrder.findUnique({ where: { id }, include: salesOrderInclude });
    if (!original) throw new NotFoundException('Sales order not found');
    return this.create(
      {
        customerId: original.customer.id,
        warehouseId: original.warehouse.id,
        currency: original.currency,
        priority: original.priority,
        promisedDate: original.promisedDate?.toISOString() ?? null,
        customerReference: original.customerReference,
        notes: original.notes,
        lines: original.lines.map((line) => ({
          productId: line.product.id,
          unitPrice: Money.from(line.unitPriceMinorUnits, original.currency).toDecimalString(),
          orderedQuantity: line.orderedQuantity.toString(),
          discountPercentBasis: line.discountPercentBasis
        }))
      },
      actor,
      context
    );
  }

  /** Re-derive a sales order's fulfilment status purely from its lines' current quantities. */
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
    actor: SalesActor,
    context: SalesRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'SalesOrder',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }
}
