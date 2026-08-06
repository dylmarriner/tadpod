import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasPermission } from '@tadpods/auth';
import { computeLineProjection, computeLineTotalMinorUnits, computeOrderTotalMinorUnits, Money, validateEditingTransition } from '@tadpods/domain';
import { database, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type {
  CancelPurchaseOrderInput,
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
  PurchaseOrder,
  PurchaseOrderLine,
  UpdatePurchaseOrderInput
} from '@tadpods/contracts';

export type PurchasingActor = { id: string; permissions: readonly string[] };
export type PurchasingRequestContext = { requestId: string; ipAddress?: string };

const APPROVE_PERMISSION = 'purchasing.approve';

const purchaseOrderInclude = {
  supplier: { select: { id: true, code: true, name: true, currency: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  approvedBy: { select: { id: true, displayName: true, email: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true } } } }
} satisfies PrismaNamespace.PurchaseOrderInclude;

type PurchaseOrderWithRelations = PrismaNamespace.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>;

function toLine(row: PurchaseOrderWithRelations['lines'][number], currency: string): PurchaseOrderLine {
  const orderedQuantity = row.orderedQuantity.toString();
  const receivedQuantity = row.receivedQuantity.toString();
  const billedQuantity = row.billedQuantity.toString();
  const projection = computeLineProjection({ orderedQuantity, receivedQuantity, billedQuantity });
  return {
    id: row.id,
    product: row.product,
    unitCost: Money.from(row.unitCostMinorUnits, currency).toDecimalString(),
    orderedQuantity,
    receivedQuantity,
    returnedQuantity: row.returnedQuantity.toString(),
    billedQuantity,
    outstandingQuantity: projection.outstandingQuantity,
    unbilledQuantity: projection.unbilledQuantity,
    lineTotal: Money.from(computeLineTotalMinorUnits(row.unitCostMinorUnits, orderedQuantity), currency).toDecimalString()
  };
}

function toPurchaseOrder(row: PurchaseOrderWithRelations): PurchaseOrder {
  const totalMinorUnits = computeOrderTotalMinorUnits(
    row.lines.map((line) => ({ unitCostMinorUnits: line.unitCostMinorUnits, orderedQuantity: line.orderedQuantity.toString() }))
  );
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    supplier: { id: row.supplier.id, code: row.supplier.code, name: row.supplier.name },
    status: row.status,
    currency: row.currency,
    notes: row.notes,
    totalAmount: Money.from(totalMinorUnits, row.currency).toDecimalString(),
    createdBy: row.createdBy,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => toLine(line, row.currency))
  };
}

/**
 * Purchase orders (Phase 3 Task 2). A confirmed purchase order is a commitment, never a
 * payable — nothing in this service ever writes to a supplier's accounts-payable balance;
 * that only ever happens through posted supplier bills (Task 4). Draft edits replace an
 * order's lines wholesale inside one transaction; once `CONFIRMED`, commercial terms
 * (supplier, currency, lines) are immutable — only status, and the received/billed counters
 * Tasks 3-4 own, can still change.
 */
@Injectable()
export class PurchaseOrdersService {
  async list(query: ListPurchaseOrdersQuery): Promise<{ items: PurchaseOrder[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      database.purchaseOrder.findMany({
        where,
        include: purchaseOrderInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.purchaseOrder.count({ where })
    ]);
    return { items: rows.map(toPurchaseOrder), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<PurchaseOrder> {
    const row = await database.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
    if (!row) throw new NotFoundException('Purchase order not found');
    return toPurchaseOrder(row);
  }

  async create(input: CreatePurchaseOrderInput, actor: PurchasingActor, context: PurchasingRequestContext): Promise<PurchaseOrder> {
    return withTransaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
      if (!supplier.active) throw new BadRequestException('Cannot create a purchase order for an inactive supplier');

      const orderNumber = await this.nextOrderNumber(transaction);
      const created = await transaction.purchaseOrder.create({
        data: {
          orderNumber,
          supplierId: input.supplierId,
          currency: input.currency ?? supplier.currency,
          notes: input.notes ?? null,
          createdById: actor.id,
          lines: {
            create: input.lines.map((line) => ({
              productId: line.productId,
              unitCostMinorUnits: Money.from(line.unitCost).minorUnits,
              orderedQuantity: line.orderedQuantity
            }))
          }
        },
        include: purchaseOrderInclude
      });
      await this.audit(transaction, 'purchase-order.create', created.id, actor, context, { orderNumber, supplierId: input.supplierId });
      return toPurchaseOrder(created);
    });
  }

  async update(id: string, input: UpdatePurchaseOrderInput, actor: PurchasingActor, context: PurchasingRequestContext): Promise<PurchaseOrder> {
    return withTransaction(async (transaction) => {
      const existing = await transaction.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Purchase order not found');
      if (existing.status !== 'DRAFT') throw new ConflictException('Only a draft purchase order can be edited');

      if (input.lines) {
        await transaction.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        await transaction.purchaseOrderLine.createMany({
          data: input.lines.map((line) => ({
            purchaseOrderId: id,
            productId: line.productId,
            unitCostMinorUnits: Money.from(line.unitCost).minorUnits,
            orderedQuantity: line.orderedQuantity
          }))
        });
      }

      const updated = await transaction.purchaseOrder.update({
        where: { id },
        data: { ...(input.notes !== undefined ? { notes: input.notes } : {}) },
        include: purchaseOrderInclude
      });
      await this.audit(transaction, 'purchase-order.update', id, actor, context, { linesReplaced: Boolean(input.lines) });
      return toPurchaseOrder(updated);
    });
  }

  async submit(id: string, actor: PurchasingActor, context: PurchasingRequestContext): Promise<PurchaseOrder> {
    return this.transitionEditing(id, 'AWAITING_APPROVAL', actor, context, 'purchase-order.submit', (transaction, order) =>
      transaction.purchaseOrder.update({
        where: { id: order.id },
        data: { status: 'AWAITING_APPROVAL', submittedAt: new Date() },
        include: purchaseOrderInclude
      })
    );
  }

  async approve(id: string, actor: PurchasingActor, context: PurchasingRequestContext): Promise<PurchaseOrder> {
    if (!hasPermission(actor.permissions, APPROVE_PERMISSION)) {
      throw new ForbiddenException('Approving a purchase order requires the purchasing.approve permission');
    }
    return this.transitionEditing(id, 'CONFIRMED', actor, context, 'purchase-order.approve', (transaction, order) =>
      transaction.purchaseOrder.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', approvedById: actor.id, approvedAt: new Date(), confirmedAt: new Date() },
        include: purchaseOrderInclude
      })
    );
  }

  /**
   * Direct draft-to-confirmed transition, skipping the submit/approve round trip. Only
   * available below the configured value threshold, or to an actor who already holds
   * `purchasing.approve` (an approver confirming their own low-friction order is still an
   * approval). Above the threshold without that permission, the order must go through
   * `submit` then `approve` instead.
   */
  async confirm(id: string, actor: PurchasingActor, context: PurchasingRequestContext): Promise<PurchaseOrder> {
    return withTransaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
      if (!order) throw new NotFoundException('Purchase order not found');
      validateEditingTransition(order.status, 'CONFIRMED');

      const totalMinorUnits = computeOrderTotalMinorUnits(
        order.lines.map((line) => ({ unitCostMinorUnits: line.unitCostMinorUnits, orderedQuantity: line.orderedQuantity.toString() }))
      );
      const settings = await transaction.systemSettings.findUniqueOrThrow({ where: { singletonKey: 'default' } });
      const threshold = settings.purchaseOrderApprovalThresholdMinorUnits;
      const overThreshold = threshold !== null && totalMinorUnits >= threshold;
      if (overThreshold && !hasPermission(actor.permissions, APPROVE_PERMISSION)) {
        throw new ForbiddenException('This purchase order meets the approval threshold and must be submitted for approval');
      }

      const updated = await transaction.purchaseOrder.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          ...(overThreshold ? { approvedById: actor.id, approvedAt: new Date() } : {})
        },
        include: purchaseOrderInclude
      });
      await this.audit(transaction, 'purchase-order.confirm', id, actor, context, { overThreshold });
      return toPurchaseOrder(updated);
    });
  }

  async cancel(id: string, input: CancelPurchaseOrderInput, actor: PurchasingActor, context: PurchasingRequestContext): Promise<PurchaseOrder> {
    return withTransaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
      if (!order) throw new NotFoundException('Purchase order not found');
      validateEditingTransition(order.status, 'CANCELLED');

      const anyFulfillment = order.lines.some((line) => Number(line.receivedQuantity) > 0 || Number(line.billedQuantity) > 0);
      if (anyFulfillment) throw new ConflictException('Cannot cancel a purchase order that has already received or billed quantity');

      const updated = await transaction.purchaseOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          notes: input.reason ? [order.notes, `Cancelled: ${input.reason}`].filter(Boolean).join('\n') : order.notes
        },
        include: purchaseOrderInclude
      });
      await this.audit(transaction, 'purchase-order.cancel', id, actor, context, { reason: input.reason ?? null });
      return toPurchaseOrder(updated);
    });
  }

  /** Clones a purchase order's supplier and lines into a new draft — the duplicate-order shortcut. */
  async duplicate(id: string, actor: PurchasingActor, context: PurchasingRequestContext): Promise<PurchaseOrder> {
    const original = await database.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
    if (!original) throw new NotFoundException('Purchase order not found');
    return this.create(
      {
        supplierId: original.supplier.id,
        currency: original.currency,
        notes: original.notes,
        lines: original.lines.map((line) => ({
          productId: line.product.id,
          unitCost: Money.from(line.unitCostMinorUnits, original.currency).toDecimalString(),
          orderedQuantity: line.orderedQuantity.toString()
        }))
      },
      actor,
      context
    );
  }

  private async transitionEditing(
    id: string,
    next: 'AWAITING_APPROVAL' | 'CONFIRMED',
    actor: PurchasingActor,
    context: PurchasingRequestContext,
    auditAction: string,
    update: (transaction: DatabaseTransaction, order: PurchaseOrderWithRelations) => Promise<PurchaseOrderWithRelations>
  ): Promise<PurchaseOrder> {
    return withTransaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
      if (!order) throw new NotFoundException('Purchase order not found');
      validateEditingTransition(order.status, next);
      const updated = await update(transaction, order);
      await this.audit(transaction, auditAction, id, actor, context, { from: order.status, to: next });
      return toPurchaseOrder(updated);
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: PurchasingActor,
    context: PurchasingRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'PurchaseOrder',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }

  private async nextOrderNumber(transaction: DatabaseTransaction): Promise<string> {
    const rows = await transaction.$queryRaw<Array<{ prefix: string; value: bigint; padding: number }>>`
      UPDATE "DocumentSequence"
      SET "nextValue" = "nextValue" + 1, "updatedAt" = NOW()
      WHERE "key" = 'purchase-order'
      RETURNING "prefix", "nextValue" - 1 AS "value", "padding"
    `;
    const row = rows[0];
    if (!row) throw new Error('Unknown document sequence: purchase-order');
    return `${row.prefix}${row.value.toString().padStart(row.padding, '0')}`;
  }
}
