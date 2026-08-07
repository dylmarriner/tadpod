import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Money, planSupplierPaymentAllocation, validateSupplierManualAllocation } from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type {
  CreateSupplierPaymentInput,
  ListSupplierPaymentsQuery,
  PreviewSupplierPaymentAllocationQuery,
  ReallocateSupplierPaymentInput,
  ReverseSupplierPaymentInput,
  SupplierPayment,
  SupplierPaymentAllocationPreview
} from '@tadpods/contracts';
import { getOpenBillsForSupplier, refreshBillStatus } from '../supplier-bills/supplier-bill-posting.js';

export type SupplierPaymentsActor = { id: string; permissions: readonly string[] };
export type SupplierPaymentsRequestContext = { requestId: string; ipAddress?: string };

const paymentInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  allocations: { include: { supplierBill: { select: { id: true, billNumber: true } } } }
} satisfies PrismaNamespace.SupplierPaymentInclude;

type PaymentWithRelations = PrismaNamespace.SupplierPaymentGetPayload<{ include: typeof paymentInclude }>;

function toPayment(row: PaymentWithRelations): SupplierPayment {
  const activeAllocations = row.allocations.filter((allocation) => !allocation.reversedAt);
  const allocatedMinorUnits = activeAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n);
  return {
    id: row.id,
    paymentNumber: row.paymentNumber,
    supplier: row.supplier,
    amount: Money.from(row.amountMinorUnits, row.currency).toDecimalString(),
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    paidAt: row.paidAt.toISOString(),
    notes: row.notes,
    createdBy: row.createdBy,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    allocations: row.allocations.map((allocation) => ({
      id: allocation.id,
      supplierBillId: allocation.supplierBillId,
      billNumber: allocation.supplierBill.billNumber,
      amount: Money.from(allocation.amountMinorUnits, row.currency).toDecimalString(),
      reversedAt: allocation.reversedAt?.toISOString() ?? null,
      createdAt: allocation.createdAt.toISOString()
    })),
    unappliedAmount: Money.from(row.reversedAt ? 0n : row.amountMinorUnits - allocatedMinorUnits, row.currency).toDecimalString()
  };
}

/**
 * Supplier payments — the accounts-payable mirror of `CustomerPaymentsService`. `create` records
 * the full payment once, allocates oldest-bill-first (or a manual set) inside the same
 * `SERIALIZABLE` transaction that reads open bills, and preserves any remainder as a
 * `SupplierCredit`. `idempotencyKey` is the duplicate-payment guard.
 */
@Injectable()
export class SupplierPaymentsService {
  async list(query: ListSupplierPaymentsQuery): Promise<{ items: SupplierPayment[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.SupplierPaymentWhereInput = { ...(query.supplierId ? { supplierId: query.supplierId } : {}) };
    const [rows, total] = await Promise.all([
      database.supplierPayment.findMany({ where, include: paymentInclude, orderBy: [{ paidAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      database.supplierPayment.count({ where })
    ]);
    return { items: rows.map(toPayment), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<SupplierPayment> {
    const row = await database.supplierPayment.findUnique({ where: { id }, include: paymentInclude });
    if (!row) throw new NotFoundException('Supplier payment not found');
    return toPayment(row);
  }

  async previewAllocation(query: PreviewSupplierPaymentAllocationQuery): Promise<SupplierPaymentAllocationPreview> {
    const supplier = await database.supplier.findUnique({ where: { id: query.supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const openBills = await getOpenBillsForSupplier(database as unknown as DatabaseTransaction, query.supplierId, supplier.currency);
    const plan = planSupplierPaymentAllocation(Money.from(query.amount).minorUnits, openBills);
    const byId = new Map(openBills.map((bill) => [bill.supplierBillId, bill]));
    return {
      allocations: plan.allocations.map((allocation) => ({ supplierBillId: allocation.supplierBillId, billNumber: byId.get(allocation.supplierBillId)?.billNumber ?? '', amount: Money.from(allocation.amountMinorUnits, supplier.currency).toDecimalString() })),
      unappliedAmount: Money.from(plan.unappliedMinorUnits, supplier.currency).toDecimalString()
    };
  }

  async create(input: CreateSupplierPaymentInput, actor: SupplierPaymentsActor, context: SupplierPaymentsRequestContext): Promise<SupplierPayment> {
    return withTransaction(async (transaction) => {
      const existing = await transaction.supplierPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return toPayment(await transaction.supplierPayment.findUniqueOrThrow({ where: { id: existing.id }, include: paymentInclude }));

      const supplier = await transaction.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
      const currency = input.currency ?? supplier.currency;
      const amountMinorUnits = Money.from(input.amount).minorUnits;

      let paymentNumber: string;
      try {
        paymentNumber = await nextDocumentNumber('supplier-payment');
      } catch {
        throw new BadRequestException('Unable to allocate a payment number');
      }

      const payment = await transaction.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId: input.supplierId,
          amountMinorUnits,
          currency,
          method: input.method,
          reference: input.reference ?? null,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          notes: input.notes ?? null,
          createdById: actor.id,
          idempotencyKey: input.idempotencyKey
        }
      });

      const openBills = await getOpenBillsForSupplier(transaction, input.supplierId, currency);
      const byId = new Map(openBills.map((bill) => [bill.supplierBillId, bill]));

      let allocations: { supplierBillId: string; amountMinorUnits: bigint }[];
      let unappliedMinorUnits: bigint;
      if (input.allocations) {
        const lines = input.allocations.map((line) => {
          const bill = byId.get(line.supplierBillId);
          if (!bill) throw new BadRequestException(`Bill ${line.supplierBillId} is not an open bill for this supplier`);
          return { supplierBillId: line.supplierBillId, outstandingMinorUnits: bill.outstandingMinorUnits, amountMinorUnits: Money.from(line.amount).minorUnits };
        });
        validateSupplierManualAllocation(amountMinorUnits, lines);
        allocations = lines.map((line) => ({ supplierBillId: line.supplierBillId, amountMinorUnits: line.amountMinorUnits }));
        unappliedMinorUnits = amountMinorUnits - allocations.reduce((sum, line) => sum + line.amountMinorUnits, 0n);
      } else {
        const plan = planSupplierPaymentAllocation(amountMinorUnits, openBills);
        allocations = plan.allocations;
        unappliedMinorUnits = plan.unappliedMinorUnits;
      }

      for (const allocation of allocations) {
        await transaction.supplierPaymentAllocation.create({ data: { supplierPaymentId: payment.id, supplierBillId: allocation.supplierBillId, amountMinorUnits: allocation.amountMinorUnits, createdById: actor.id } });
        await refreshBillStatus(transaction, allocation.supplierBillId);
      }

      if (unappliedMinorUnits > 0n) {
        await transaction.supplierCredit.create({
          data: {
            creditNumber: await nextDocumentNumber('credit-note'),
            supplierId: input.supplierId,
            sourceType: 'OVERPAYMENT',
            sourcePaymentId: payment.id,
            amountMinorUnits: unappliedMinorUnits,
            remainingMinorUnits: unappliedMinorUnits,
            currency,
            notes: 'Unapplied balance from a supplier payment',
            createdById: actor.id
          }
        });
      }

      await this.audit(transaction, 'supplier-payment.create', payment.id, actor, context, { supplierId: input.supplierId, amountMinorUnits: amountMinorUnits.toString(), unappliedMinorUnits: unappliedMinorUnits.toString() });
      return toPayment(await transaction.supplierPayment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude }));
    });
  }

  async reallocate(id: string, input: ReallocateSupplierPaymentInput, actor: SupplierPaymentsActor, context: SupplierPaymentsRequestContext): Promise<SupplierPayment> {
    return withTransaction(async (transaction) => {
      const payment = await transaction.supplierPayment.findUnique({ where: { id }, include: { allocations: true } });
      if (!payment) throw new NotFoundException('Supplier payment not found');
      if (payment.reversedAt) throw new ConflictException('Cannot reallocate a reversed payment');

      const activeAllocations = payment.allocations.filter((allocation) => !allocation.reversedAt);
      const availableMinorUnits = activeAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n);
      const affectedBillIds = new Set(activeAllocations.map((allocation) => allocation.supplierBillId));

      for (const allocation of activeAllocations) {
        await transaction.supplierPaymentAllocation.update({ where: { id: allocation.id }, data: { reversedAt: new Date() } });
      }
      for (const billId of affectedBillIds) await refreshBillStatus(transaction, billId);

      const openBills = await getOpenBillsForSupplier(transaction, payment.supplierId, payment.currency);
      const byId = new Map(openBills.map((bill) => [bill.supplierBillId, bill]));
      const lines = input.allocations.map((line) => {
        const bill = byId.get(line.supplierBillId);
        return { supplierBillId: line.supplierBillId, outstandingMinorUnits: bill ? bill.outstandingMinorUnits : 0n, amountMinorUnits: Money.from(line.amount).minorUnits };
      });
      validateSupplierManualAllocation(availableMinorUnits, lines);

      for (const line of lines) {
        await transaction.supplierPaymentAllocation.create({ data: { supplierPaymentId: payment.id, supplierBillId: line.supplierBillId, amountMinorUnits: line.amountMinorUnits, createdById: actor.id } });
        await refreshBillStatus(transaction, line.supplierBillId);
      }

      await this.audit(transaction, 'supplier-payment.reallocate', id, actor, context, { lineCount: lines.length });
      return toPayment(await transaction.supplierPayment.findUniqueOrThrow({ where: { id }, include: paymentInclude }));
    });
  }

  async reverse(id: string, input: ReverseSupplierPaymentInput, actor: SupplierPaymentsActor, context: SupplierPaymentsRequestContext): Promise<SupplierPayment> {
    return withTransaction(async (transaction) => {
      const payment = await transaction.supplierPayment.findUnique({ where: { id }, include: { allocations: true, credits: true } });
      if (!payment) throw new NotFoundException('Supplier payment not found');
      if (payment.reversedAt) throw new ConflictException('This payment has already been reversed');

      for (const credit of payment.credits) {
        if (credit.remainingMinorUnits !== credit.amountMinorUnits) {
          throw new ConflictException('Cannot reverse a payment whose overpayment credit has already been applied or refunded');
        }
      }

      const activeAllocations = payment.allocations.filter((allocation) => !allocation.reversedAt);
      const affectedBillIds = new Set(activeAllocations.map((allocation) => allocation.supplierBillId));
      for (const allocation of activeAllocations) {
        await transaction.supplierPaymentAllocation.update({ where: { id: allocation.id }, data: { reversedAt: new Date() } });
      }
      for (const billId of affectedBillIds) await refreshBillStatus(transaction, billId);

      for (const credit of payment.credits) {
        await transaction.supplierCredit.update({ where: { id: credit.id }, data: { remainingMinorUnits: 0n, notes: [credit.notes, `Reversed with source payment: ${input.reason ?? 'no reason given'}`].filter(Boolean).join('\n') } });
      }

      const updated = await transaction.supplierPayment.update({ where: { id }, data: { reversedAt: new Date() }, include: paymentInclude });
      await this.audit(transaction, 'supplier-payment.reverse', id, actor, context, { reason: input.reason ?? null });
      return toPayment(updated);
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: SupplierPaymentsActor,
    context: SupplierPaymentsRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: { action, entityType: 'SupplierPayment', entityId, metadata: metadata as Prisma.InputJsonValue, requestId: context.requestId, userId: actor.id, ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}) }
    });
  }
}
