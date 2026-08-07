import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { planIncomingAllocation, Quantity, suggestPurchaseQuantity, validateBackorderQuantityChange } from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type {
  AdjustBackorderLineQuantityInput,
  AllocateIncomingStockInput,
  Backorder,
  CancelBackorderInput,
  CancelBackorderLineInput,
  GeneratePurchaseOrderFromBackordersInput,
  ListBackordersQuery,
  PlanBackorderAllocationQuery,
  PlannedBackorderAllocation
} from '@tadpods/contracts';
import { refreshBackorderStatus } from './backorder-posting.js';

export type SalesActor = { id: string; permissions: readonly string[] };
export type SalesRequestContext = { requestId: string; ipAddress?: string };

const backorderInclude = {
  salesOrder: { select: { id: true, orderNumber: true } },
  customer: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  supplier: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, orderNumber: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true } } } }
} satisfies PrismaNamespace.BackorderInclude;

type BackorderWithRelations = PrismaNamespace.BackorderGetPayload<{ include: typeof backorderInclude }>;

function openQuantity(line: { quantity: { toString(): string }; fulfilledQuantity: { toString(): string }; cancelledQuantity: { toString(): string } }): string {
  return Quantity.from(line.quantity.toString())
    .subtract(Quantity.from(line.fulfilledQuantity.toString()))
    .subtract(Quantity.from(line.cancelledQuantity.toString()))
    .toDecimalString();
}

function toBackorder(row: BackorderWithRelations): Backorder {
  return {
    id: row.id,
    backorderNumber: row.backorderNumber,
    salesOrder: row.salesOrder,
    customer: row.customer,
    warehouse: row.warehouse,
    status: row.status,
    priority: row.priority,
    expectedDate: row.expectedDate?.toISOString() ?? null,
    promisedDate: row.promisedDate?.toISOString() ?? null,
    supplier: row.supplier,
    purchaseOrder: row.purchaseOrder,
    notes: row.notes,
    createdBy: row.createdBy,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      salesOrderLineId: line.salesOrderLineId,
      product: line.product,
      quantity: line.quantity.toString(),
      allocatedQuantity: line.allocatedQuantity.toString(),
      fulfilledQuantity: line.fulfilledQuantity.toString(),
      cancelledQuantity: line.cancelledQuantity.toString(),
      openQuantity: openQuantity(line),
      purchaseOrderLineId: line.purchaseOrderLineId
    }))
  };
}

/**
 * Backorders (Phase 4). Every line traces back to the sales order line that raised it
 * (`salesOrderLineId`) and, once covered, to the purchase order raised for it
 * (`purchaseOrderLineId`) — the backorder dashboard's promise is that every backordered
 * quantity links to both the customer commitment and the supply that will satisfy it.
 */
@Injectable()
export class BackordersService {
  async list(query: ListBackordersQuery): Promise<{ items: Backorder[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.BackorderWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { lines: { some: { productId: query.productId } } } : {})
    };
    const [rows, total] = await Promise.all([
      database.backorder.findMany({
        where,
        include: backorderInclude,
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.backorder.count({ where })
    ]);
    return { items: rows.map(toBackorder), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Backorder> {
    const row = await database.backorder.findUnique({ where: { id }, include: backorderInclude });
    if (!row) throw new NotFoundException('Backorder not found');
    return toBackorder(row);
  }

  /** Cancel every open line on a backorder — withdraws the demand entirely. */
  async cancel(id: string, input: CancelBackorderInput, actor: SalesActor, context: SalesRequestContext): Promise<Backorder> {
    return withTransaction(async (transaction) => {
      const backorder = await transaction.backorder.findUnique({ where: { id }, include: { lines: true } });
      if (!backorder) throw new NotFoundException('Backorder not found');
      if (backorder.status === 'CANCELLED') throw new ConflictException('This backorder is already cancelled');

      for (const line of backorder.lines) {
        const open = Quantity.from(openQuantity(line));
        if (!open.isPositive()) continue;
        await transaction.backorderLine.update({ where: { id: line.id }, data: { cancelledQuantity: { increment: open.toDecimalString() } } });
        await transaction.salesOrderLine.update({
          where: { id: line.salesOrderLineId },
          data: { backorderedQuantity: { decrement: open.toDecimalString() }, cancelledQuantity: { increment: open.toDecimalString() } }
        });
      }
      await refreshBackorderStatus(transaction, id);
      const updated = await transaction.backorder.update({
        where: { id },
        data: { notes: input.reason ? [backorder.notes, `Cancelled: ${input.reason}`].filter(Boolean).join('\n') : backorder.notes },
        include: backorderInclude
      });
      await this.audit(transaction, 'backorder.cancel', id, actor, context, { reason: input.reason ?? null });
      return toBackorder(updated);
    });
  }

  /** Withdraw one backorder line's remaining open quantity. */
  async cancelLine(id: string, lineId: string, input: CancelBackorderLineInput, actor: SalesActor, context: SalesRequestContext): Promise<Backorder> {
    return withTransaction(async (transaction) => {
      const line = await transaction.backorderLine.findUnique({ where: { id: lineId } });
      if (!line || line.backorderId !== id) throw new NotFoundException('Backorder line not found');
      const open = Quantity.from(openQuantity(line));
      if (!open.isPositive()) throw new BadRequestException('This backorder line has nothing open to cancel');

      await transaction.backorderLine.update({ where: { id: lineId }, data: { cancelledQuantity: { increment: open.toDecimalString() } } });
      await transaction.salesOrderLine.update({
        where: { id: line.salesOrderLineId },
        data: { backorderedQuantity: { decrement: open.toDecimalString() }, cancelledQuantity: { increment: open.toDecimalString() } }
      });
      await refreshBackorderStatus(transaction, id);

      const updated = await transaction.backorder.findUniqueOrThrow({ where: { id }, include: backorderInclude });
      await this.audit(transaction, 'backorder.cancel-line', id, actor, context, { lineId, quantity: open.toDecimalString(), reason: input.reason ?? null });
      return toBackorder(updated);
    });
  }

  /** Adjust a backorder line's quantity — the customer trimmed the order, without cancelling the whole line. */
  async adjustLineQuantity(id: string, lineId: string, input: AdjustBackorderLineQuantityInput, actor: SalesActor, context: SalesRequestContext): Promise<Backorder> {
    return withTransaction(async (transaction) => {
      const line = await transaction.backorderLine.findUnique({ where: { id: lineId } });
      if (!line || line.backorderId !== id) throw new NotFoundException('Backorder line not found');

      const current = {
        quantity: line.quantity.toString(),
        allocatedQuantity: line.allocatedQuantity.toString(),
        fulfilledQuantity: line.fulfilledQuantity.toString(),
        cancelledQuantity: line.cancelledQuantity.toString()
      };
      validateBackorderQuantityChange(current, input.quantity);

      const delta = Quantity.from(input.quantity).subtract(Quantity.from(current.quantity));
      if (delta.isPositive()) {
        const salesOrderLine = await transaction.salesOrderLine.findUniqueOrThrow({ where: { id: line.salesOrderLineId } });
        const slack = Quantity.from(salesOrderLine.orderedQuantity.toString())
          .subtract(Quantity.from(salesOrderLine.deliveredQuantity.toString()))
          .subtract(Quantity.from(salesOrderLine.cancelledQuantity.toString()))
          .subtract(Quantity.from(salesOrderLine.reservedQuantity.toString()))
          .subtract(Quantity.from(salesOrderLine.backorderedQuantity.toString()));
        if (delta.greaterThan(slack)) {
          throw new BadRequestException(`Increasing this backorder line by ${delta.toDecimalString()} would exceed the order line's ordered quantity`);
        }
      }

      await transaction.backorderLine.update({ where: { id: lineId }, data: { quantity: input.quantity } });
      await transaction.salesOrderLine.update({ where: { id: line.salesOrderLineId }, data: { backorderedQuantity: { increment: delta.toDecimalString() } } });
      await refreshBackorderStatus(transaction, id);

      const updated = await transaction.backorder.findUniqueOrThrow({ where: { id }, include: backorderInclude });
      await this.audit(transaction, 'backorder.adjust-line-quantity', id, actor, context, { lineId, from: current.quantity, to: input.quantity });
      return toBackorder(updated);
    });
  }

  /** Preview how newly received (or about-to-be-ordered) stock would spread across open backorders, without posting anything. */
  async planAllocation(query: PlanBackorderAllocationQuery): Promise<PlannedBackorderAllocation[]> {
    const openLines = await database.backorderLine.findMany({
      where: { productId: query.productId, backorder: { warehouseId: query.warehouseId, status: { notIn: ['CANCELLED', 'FULFILLED'] } } },
      include: { backorder: true }
    });
    const demands = openLines
      .map((line) => ({
        backorderLineId: line.id,
        outstandingQuantity: Quantity.from(line.quantity.toString())
          .subtract(Quantity.from(line.allocatedQuantity.toString()))
          .subtract(Quantity.from(line.fulfilledQuantity.toString()))
          .subtract(Quantity.from(line.cancelledQuantity.toString()))
          .toDecimalString(),
        priority: line.backorder.priority,
        createdAt: line.createdAt.toISOString()
      }))
      .filter((demand) => Quantity.from(demand.outstandingQuantity).isPositive());
    return planIncomingAllocation(query.incomingQuantity, demands, query.method);
  }

  /** Post a specific set of incoming-stock allocations against open backorder lines. */
  async allocateIncoming(input: AllocateIncomingStockInput, actor: SalesActor, context: SalesRequestContext): Promise<Backorder[]> {
    return withTransaction(async (transaction) => {
      const backorderIds = new Set<string>();
      for (const allocation of input.allocations) {
        const line = await transaction.backorderLine.findUnique({ where: { id: allocation.backorderLineId } });
        if (!line) throw new NotFoundException(`Backorder line ${allocation.backorderLineId} not found`);
        try {
          await transaction.backorderAllocation.create({
            data: {
              backorderLineId: allocation.backorderLineId,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              sourceLineId: allocation.sourceLineId,
              quantity: allocation.quantity,
              createdById: actor.id
            }
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('This source line has already been allocated to this backorder line');
          }
          throw error;
        }
        await transaction.backorderLine.update({ where: { id: allocation.backorderLineId }, data: { allocatedQuantity: { increment: allocation.quantity } } });
        backorderIds.add(line.backorderId);
      }
      for (const backorderId of backorderIds) {
        await refreshBackorderStatus(transaction, backorderId);
      }
      await this.audit(transaction, 'backorder.allocate-incoming', input.sourceId, actor, context, { sourceType: input.sourceType, allocationCount: input.allocations.length });

      const updated = await transaction.backorder.findMany({ where: { id: { in: [...backorderIds] } }, include: backorderInclude });
      return updated.map(toBackorder);
    });
  }

  /**
   * Raise (or reuse a draft) purchase order covering the open quantity on the given backorder
   * lines, using each product's reorder quantity as a floor and netting off anything already
   * incoming or on an open purchase order — "purchase order generated from backorder".
   */
  async generatePurchaseOrder(input: GeneratePurchaseOrderFromBackordersInput, actor: SalesActor, context: SalesRequestContext): Promise<{ purchaseOrderId: string }> {
    return withTransaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      const lines = await transaction.backorderLine.findMany({ where: { id: { in: input.backorderLineIds } }, include: { product: true, backorder: true } });
      if (lines.length !== input.backorderLineIds.length) throw new NotFoundException('One or more backorder lines were not found');

      const byProduct = new Map<string, { productId: string; quantity: Quantity; unitCostMinorUnits: bigint; lineIds: string[] }>();
      for (const line of lines) {
        const open = Quantity.from(line.quantity.toString())
          .subtract(Quantity.from(line.allocatedQuantity.toString()))
          .subtract(Quantity.from(line.fulfilledQuantity.toString()))
          .subtract(Quantity.from(line.cancelledQuantity.toString()));
        if (!open.isPositive()) continue;

        const [incomingLines, openPurchaseLines] = await Promise.all([
          transaction.purchaseOrderLine.aggregate({
            where: { productId: line.productId, purchaseOrder: { supplierId: input.supplierId, status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } } },
            _sum: { orderedQuantity: true, receivedQuantity: true }
          }),
          transaction.purchaseOrderLine.aggregate({
            where: { productId: line.productId, purchaseOrder: { supplierId: input.supplierId, status: { in: ['DRAFT', 'AWAITING_APPROVAL'] } } },
            _sum: { orderedQuantity: true }
          })
        ]);
        const incoming = Quantity.from(incomingLines._sum.orderedQuantity?.toString() ?? '0').subtract(Quantity.from(incomingLines._sum.receivedQuantity?.toString() ?? '0'));
        const openPurchase = Quantity.from(openPurchaseLines._sum.orderedQuantity?.toString() ?? '0');

        const quantity = Quantity.from(
          suggestPurchaseQuantity({
            shortageQuantity: open.toDecimalString(),
            incomingQuantity: incoming.toDecimalString(),
            openPurchaseQuantity: openPurchase.toDecimalString(),
            reorderQuantity: line.product.reorderQuantity?.toString() ?? '0'
          })
        );
        if (!quantity.isPositive()) continue;

        const existing = byProduct.get(line.productId);
        if (existing) {
          existing.quantity = existing.quantity.add(quantity);
          existing.lineIds.push(line.id);
        } else {
          byProduct.set(line.productId, { productId: line.productId, quantity, unitCostMinorUnits: line.product.purchaseCostMinorUnits, lineIds: [line.id] });
        }
      }

      if (byProduct.size === 0) throw new BadRequestException('There is no net shortage to purchase for the selected backorder lines');

      const orderNumber = await nextDocumentNumber('purchase-order');
      const purchaseOrder = await transaction.purchaseOrder.create({
        data: {
          orderNumber,
          supplierId: input.supplierId,
          currency: supplier.currency,
          notes: 'Generated from backorders',
          createdById: actor.id,
          lines: { create: [...byProduct.values()].map((entry) => ({ productId: entry.productId, unitCostMinorUnits: entry.unitCostMinorUnits, orderedQuantity: entry.quantity.toDecimalString() })) }
        },
        include: { lines: true }
      });

      for (const entry of byProduct.values()) {
        const purchaseOrderLine = purchaseOrder.lines.find((candidate) => candidate.productId === entry.productId);
        if (!purchaseOrderLine) continue;
        await transaction.backorderLine.updateMany({ where: { id: { in: entry.lineIds } }, data: { purchaseOrderLineId: purchaseOrderLine.id } });
      }
      const backorderIds = [...new Set(lines.map((line) => line.backorderId))];
      await transaction.backorder.updateMany({ where: { id: { in: backorderIds } }, data: { supplierId: input.supplierId, purchaseOrderId: purchaseOrder.id } });

      await this.audit(transaction, 'backorder.generate-purchase-order', purchaseOrder.id, actor, context, { supplierId: input.supplierId, backorderLineIds: input.backorderLineIds });
      return { purchaseOrderId: purchaseOrder.id };
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
        entityType: 'Backorder',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }
}
