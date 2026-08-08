import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeLineTotalMinorUnits,
  computeSupplierBillOutstandingMinorUnits,
  computeUnbilledQuantity,
  deriveSupplierBillDisplayStatus,
  Money,
  Quantity,
  validateBillLineQuantity
} from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type { BillableLine, CreateSupplierBillInput, ListSupplierBillsQuery, SupplierBill, VoidSupplierBillInput } from '@tadpods/contracts';
import { refreshPurchaseOrderBillingStatus } from './supplier-bill-posting.js';

export type SupplierBillingActor = { id: string; permissions: readonly string[] };
export type SupplierBillingRequestContext = { requestId: string; ipAddress?: string };

const billInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, orderNumber: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  voidedBy: { select: { id: true, displayName: true, email: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true } } } },
  paymentAllocations: { where: { reversedAt: null } },
  creditApplications: { where: { reversedAt: null } }
} satisfies PrismaNamespace.SupplierBillInclude;

type BillWithRelations = PrismaNamespace.SupplierBillGetPayload<{ include: typeof billInclude }>;

function toBill(row: BillWithRelations): SupplierBill {
  const totalMinorUnits = row.lines.reduce((sum, line) => sum + computeLineTotalMinorUnits(line.unitCostMinorUnits, line.quantity.toString()), 0n);
  const appliedMinorUnits =
    row.paymentAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n) +
    row.creditApplications.reduce((sum, application) => sum + application.amountMinorUnits, 0n);
  const outstandingMinorUnits = computeSupplierBillOutstandingMinorUnits(totalMinorUnits, appliedMinorUnits);

  return {
    id: row.id,
    billNumber: row.billNumber,
    supplier: row.supplier,
    purchaseOrder: row.purchaseOrder,
    status: row.status,
    displayStatus: deriveSupplierBillDisplayStatus(row.status, row.dueDate, new Date()),
    currency: row.currency,
    supplierReference: row.supplierReference,
    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate.toISOString(),
    notes: row.notes,
    totalAmount: Money.from(totalMinorUnits, row.currency).toDecimalString(),
    appliedAmount: Money.from(appliedMinorUnits, row.currency).toDecimalString(),
    outstandingAmount: Money.from(outstandingMinorUnits, row.currency).toDecimalString(),
    createdBy: row.createdBy,
    voidedBy: row.voidedBy,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      purchaseOrderLineId: line.purchaseOrderLineId,
      product: line.product,
      unitCost: Money.from(line.unitCostMinorUnits, row.currency).toDecimalString(),
      quantity: line.quantity.toString(),
      lineTotal: Money.from(computeLineTotalMinorUnits(line.unitCostMinorUnits, line.quantity.toString()), row.currency).toDecimalString()
    }))
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Supplier bills (the accounts-payable mirror of `CustomerInvoicesService`). A bill records
 * received-but-unbilled quantity off one purchase order — `create` never touches a line the
 * order does not already own, and the `(supplierBillId, purchaseOrderLineId)` unique constraint
 * (plus `validateBillLineQuantity` re-checked under the same transaction) makes it impossible to
 * bill the same received unit twice across separate bills.
 */
@Injectable()
export class SupplierBillsService {
  async list(query: ListSupplierBillsQuery): Promise<{ items: SupplierBill[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.SupplierBillWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      database.supplierBill.findMany({ where, include: billInclude, orderBy: [{ createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      database.supplierBill.count({ where })
    ]);
    return { items: rows.map(toBill), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<SupplierBill> {
    const row = await database.supplierBill.findUnique({ where: { id }, include: billInclude });
    if (!row) throw new NotFoundException('Supplier bill not found');
    return toBill(row);
  }

  /** Every unbilled (received-not-billed) line on a purchase order — what the "create bill" screen shows before posting. */
  async billableLines(purchaseOrderId: string): Promise<BillableLine[]> {
    const order = await database.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { lines: { include: { product: { select: { id: true, sku: true, name: true } } } } } });
    if (!order) throw new NotFoundException('Purchase order not found');
    return order.lines
      .map((line) => ({
        purchaseOrderLineId: line.id,
        product: line.product,
        unitCost: Money.from(line.unitCostMinorUnits, order.currency).toDecimalString(),
        unbilledQuantity: computeUnbilledQuantity({ receivedQuantity: line.receivedQuantity.toString(), billedQuantity: line.billedQuantity.toString() })
      }))
      .filter((line) => Quantity.from(line.unbilledQuantity).isPositive());
  }

  async create(input: CreateSupplierBillInput, actor: SupplierBillingActor, context: SupplierBillingRequestContext): Promise<SupplierBill> {
    return withTransaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { supplier: true, lines: true } });
      if (!order) throw new NotFoundException('Purchase order not found');

      const linesById = new Map(order.lines.map((line) => [line.id, line]));
      const requested =
        input.lines ??
        order.lines.map((line) => ({ purchaseOrderLineId: line.id, quantity: computeUnbilledQuantity({ receivedQuantity: line.receivedQuantity.toString(), billedQuantity: line.billedQuantity.toString() }) }));

      const draftLines = requested
        .map((requestedLine) => {
          const orderLine = linesById.get(requestedLine.purchaseOrderLineId);
          if (!orderLine) throw new BadRequestException(`Purchase order line ${requestedLine.purchaseOrderLineId} does not belong to this order`);
          return { orderLine, quantity: requestedLine.quantity };
        })
        .filter((line) => Quantity.from(line.quantity).isPositive());

      if (draftLines.length === 0) throw new BadRequestException('There is nothing unbilled to bill on this order');

      for (const line of draftLines) {
        try {
          validateBillLineQuantity({ receivedQuantity: line.orderLine.receivedQuantity.toString(), billedQuantity: line.orderLine.billedQuantity.toString() }, line.quantity);
        } catch (error) {
          throw new BadRequestException(error instanceof Error ? error.message : 'Invalid bill line quantity');
        }
      }

      const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
      const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(issueDate.getTime() + order.supplier.paymentTermsDays * DAY_MS);
      const billNumber = await nextDocumentNumber('supplier-bill');

      const created = await transaction.supplierBill.create({
        data: {
          billNumber,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          currency: order.currency,
          supplierReference: input.supplierReference ?? null,
          issueDate,
          dueDate,
          notes: input.notes ?? null,
          createdById: actor.id,
          lines: {
            create: draftLines.map((line) => ({ purchaseOrderLineId: line.orderLine.id, productId: line.orderLine.productId, unitCostMinorUnits: line.orderLine.unitCostMinorUnits, quantity: line.quantity }))
          }
        },
        include: billInclude
      });

      for (const line of draftLines) {
        await transaction.purchaseOrderLine.update({ where: { id: line.orderLine.id }, data: { billedQuantity: { increment: line.quantity } } });
      }
      await refreshPurchaseOrderBillingStatus(transaction, order.id);
      await this.audit(transaction, 'supplier-bill.create', created.id, actor, context, { purchaseOrderId: order.id, lineCount: draftLines.length });

      return toBill(created);
    });
  }

  /** Void an unpaid bill — corrections otherwise happen through a `SupplierCredit`, never an edit. */
  async void(id: string, input: VoidSupplierBillInput, actor: SupplierBillingActor, context: SupplierBillingRequestContext): Promise<SupplierBill> {
    return withTransaction(async (transaction) => {
      const bill = await transaction.supplierBill.findUnique({ where: { id }, include: { lines: true } });
      if (!bill) throw new NotFoundException('Supplier bill not found');
      if (bill.status === 'VOIDED') throw new ConflictException('This bill is already voided');

      const [paymentTotal, creditTotal] = await Promise.all([
        transaction.supplierPaymentAllocation.aggregate({ where: { supplierBillId: id, reversedAt: null }, _sum: { amountMinorUnits: true } }),
        transaction.supplierCreditApplication.aggregate({ where: { supplierBillId: id, reversedAt: null }, _sum: { amountMinorUnits: true } })
      ]);
      const applied = (paymentTotal._sum.amountMinorUnits ?? 0n) + (creditTotal._sum.amountMinorUnits ?? 0n);
      if (applied > 0n) throw new ConflictException('Cannot void a bill that has payments or credits applied — reverse those first');

      for (const line of bill.lines) {
        await transaction.purchaseOrderLine.update({ where: { id: line.purchaseOrderLineId }, data: { billedQuantity: { decrement: line.quantity.toString() } } });
      }
      await refreshPurchaseOrderBillingStatus(transaction, bill.purchaseOrderId);

      const updated = await transaction.supplierBill.update({
        where: { id },
        data: { status: 'VOIDED', voidedById: actor.id, voidedAt: new Date(), notes: input.reason ? [bill.notes, `Voided: ${input.reason}`].filter(Boolean).join('\n') : bill.notes },
        include: billInclude
      });
      await this.audit(transaction, 'supplier-bill.void', id, actor, context, { reason: input.reason ?? null });
      return toBill(updated);
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: SupplierBillingActor,
    context: SupplierBillingRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: { action, entityType: 'SupplierBill', entityId, metadata: metadata as Prisma.InputJsonValue, requestId: context.requestId, userId: actor.id, ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}) }
    });
  }
}
