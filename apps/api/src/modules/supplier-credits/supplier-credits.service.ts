import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Money, planSupplierCreditApplication } from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type {
  ApplySupplierCreditInput,
  CreateSupplierCreditInput,
  CreateSupplierRefundInput,
  ListSupplierCreditsQuery,
  ReverseSupplierCreditApplicationInput,
  SupplierCredit,
  SupplierRefund
} from '@tadpods/contracts';
import { getOpenBillsForSupplier, refreshBillStatus } from '../supplier-bills/supplier-bill-posting.js';

export type SupplierCreditsActor = { id: string; permissions: readonly string[] };
export type SupplierCreditsRequestContext = { requestId: string; ipAddress?: string };

const creditInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  applications: { include: { supplierBill: { select: { id: true, billNumber: true } } } }
} satisfies PrismaNamespace.SupplierCreditInclude;

type CreditWithRelations = PrismaNamespace.SupplierCreditGetPayload<{ include: typeof creditInclude }>;

function toCredit(row: CreditWithRelations): SupplierCredit {
  return {
    id: row.id,
    creditNumber: row.creditNumber,
    supplier: row.supplier,
    sourceType: row.sourceType,
    sourcePaymentId: row.sourcePaymentId,
    amount: Money.from(row.amountMinorUnits, row.currency).toDecimalString(),
    remaining: Money.from(row.remainingMinorUnits, row.currency).toDecimalString(),
    currency: row.currency,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    applications: row.applications.map((application) => ({
      id: application.id,
      supplierBillId: application.supplierBillId,
      billNumber: application.supplierBill.billNumber,
      amount: Money.from(application.amountMinorUnits, row.currency).toDecimalString(),
      reversedAt: application.reversedAt?.toISOString() ?? null,
      createdAt: application.createdAt.toISOString()
    }))
  };
}

function toRefund(row: PrismaNamespace.SupplierRefundGetPayload<{ include: { supplier: { select: { id: true; code: true; name: true } }; createdBy: { select: { id: true; displayName: true; email: true } } } }>): SupplierRefund {
  return {
    id: row.id,
    refundNumber: row.refundNumber,
    supplier: row.supplier,
    supplierCreditId: row.supplierCreditId,
    amount: Money.from(row.amountMinorUnits, row.currency).toDecimalString(),
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString()
  };
}

/**
 * Supplier credits and refunds — the accounts-payable mirror of `CustomerCreditsService`. A
 * credit's `remainingMinorUnits` is the one mutable balance in this module; every application
 * or refund debits it under the same transaction that creates the debiting record.
 */
@Injectable()
export class SupplierCreditsService {
  async list(query: ListSupplierCreditsQuery): Promise<{ items: SupplierCredit[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.SupplierCreditWhereInput = { ...(query.supplierId ? { supplierId: query.supplierId } : {}) };
    const [rows, total] = await Promise.all([
      database.supplierCredit.findMany({ where, include: creditInclude, orderBy: [{ createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      database.supplierCredit.count({ where })
    ]);
    return { items: rows.map(toCredit), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<SupplierCredit> {
    const row = await database.supplierCredit.findUnique({ where: { id }, include: creditInclude });
    if (!row) throw new NotFoundException('Supplier credit not found');
    return toCredit(row);
  }

  async create(input: CreateSupplierCreditInput, actor: SupplierCreditsActor, context: SupplierCreditsRequestContext): Promise<SupplierCredit> {
    return withTransaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
      const currency = input.currency ?? supplier.currency;
      const amountMinorUnits = Money.from(input.amount).minorUnits;

      const created = await transaction.supplierCredit.create({
        data: { creditNumber: await nextDocumentNumber('credit-note'), supplierId: input.supplierId, sourceType: input.sourceType, amountMinorUnits, remainingMinorUnits: amountMinorUnits, currency, notes: input.notes ?? null, createdById: actor.id },
        include: creditInclude
      });
      await this.audit(transaction, 'supplier-credit.create', created.id, actor, context, { supplierId: input.supplierId, amountMinorUnits: amountMinorUnits.toString(), sourceType: input.sourceType });
      return toCredit(created);
    });
  }

  async apply(id: string, input: ApplySupplierCreditInput, actor: SupplierCreditsActor, context: SupplierCreditsRequestContext): Promise<SupplierCredit> {
    return withTransaction(async (transaction) => {
      const credit = await transaction.supplierCredit.findUnique({ where: { id } });
      if (!credit) throw new NotFoundException('Supplier credit not found');
      if (credit.remainingMinorUnits <= 0n) throw new ConflictException('This credit has no remaining balance to apply');

      if (input.supplierBillId) {
        const amountMinorUnits = input.amount ? Money.from(input.amount).minorUnits : credit.remainingMinorUnits;
        if (amountMinorUnits > credit.remainingMinorUnits) throw new BadRequestException('Cannot apply more than the credit has remaining');

        const bill = await transaction.supplierBill.findUnique({ where: { id: input.supplierBillId } });
        if (!bill || bill.supplierId !== credit.supplierId) throw new NotFoundException('Bill not found for this supplier');
        if (bill.status === 'VOIDED') throw new ConflictException('Cannot apply a credit to a voided bill');

        await transaction.supplierCreditApplication.create({ data: { supplierCreditId: id, supplierBillId: input.supplierBillId, amountMinorUnits, createdById: actor.id } });
        await transaction.supplierCredit.update({ where: { id }, data: { remainingMinorUnits: { decrement: amountMinorUnits } } });
        await refreshBillStatus(transaction, input.supplierBillId);
      } else {
        const openBills = await getOpenBillsForSupplier(transaction, credit.supplierId, credit.currency);
        const plan = planSupplierCreditApplication(credit.remainingMinorUnits, openBills);
        if (plan.allocations.length === 0) throw new BadRequestException('There are no open bills to apply this credit to');
        for (const allocation of plan.allocations) {
          await transaction.supplierCreditApplication.create({ data: { supplierCreditId: id, supplierBillId: allocation.supplierBillId, amountMinorUnits: allocation.amountMinorUnits, createdById: actor.id } });
          await refreshBillStatus(transaction, allocation.supplierBillId);
        }
        await transaction.supplierCredit.update({ where: { id }, data: { remainingMinorUnits: plan.unappliedMinorUnits } });
      }

      const updated = await transaction.supplierCredit.findUniqueOrThrow({ where: { id }, include: creditInclude });
      await this.audit(transaction, 'supplier-credit.apply', id, actor, context, { supplierBillId: input.supplierBillId ?? null });
      return toCredit(updated);
    });
  }

  async reverseApplication(id: string, applicationId: string, input: ReverseSupplierCreditApplicationInput, actor: SupplierCreditsActor, context: SupplierCreditsRequestContext): Promise<SupplierCredit> {
    return withTransaction(async (transaction) => {
      const application = await transaction.supplierCreditApplication.findUnique({ where: { id: applicationId } });
      if (!application || application.supplierCreditId !== id) throw new NotFoundException('Credit application not found');
      if (application.reversedAt) throw new ConflictException('This application has already been reversed');

      await transaction.supplierCreditApplication.update({ where: { id: applicationId }, data: { reversedAt: new Date() } });
      await transaction.supplierCredit.update({ where: { id }, data: { remainingMinorUnits: { increment: application.amountMinorUnits } } });
      await refreshBillStatus(transaction, application.supplierBillId);

      const updated = await transaction.supplierCredit.findUniqueOrThrow({ where: { id }, include: creditInclude });
      await this.audit(transaction, 'supplier-credit.reverse-application', id, actor, context, { applicationId, reason: input.reason ?? null });
      return toCredit(updated);
    });
  }

  async listRefunds(supplierId?: string): Promise<SupplierRefund[]> {
    const rows = await database.supplierRefund.findMany({
      where: { ...(supplierId ? { supplierId } : {}) },
      include: { supplier: { select: { id: true, code: true, name: true } }, createdBy: { select: { id: true, displayName: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }]
    });
    return rows.map(toRefund);
  }

  async createRefund(input: CreateSupplierRefundInput, actor: SupplierCreditsActor, context: SupplierCreditsRequestContext): Promise<SupplierRefund> {
    return withTransaction(async (transaction) => {
      const credit = await transaction.supplierCredit.findUnique({ where: { id: input.supplierCreditId } });
      if (!credit) throw new NotFoundException('Supplier credit not found');
      const amountMinorUnits = Money.from(input.amount).minorUnits;
      if (amountMinorUnits > credit.remainingMinorUnits) throw new BadRequestException('Cannot refund more than the credit has remaining');

      await transaction.supplierCredit.update({ where: { id: input.supplierCreditId }, data: { remainingMinorUnits: { decrement: amountMinorUnits } } });
      const created = await transaction.supplierRefund.create({
        data: { refundNumber: await nextDocumentNumber('supplier-refund'), supplierId: credit.supplierId, supplierCreditId: input.supplierCreditId, amountMinorUnits, currency: credit.currency, method: input.method, reference: input.reference ?? null, notes: input.notes ?? null, createdById: actor.id },
        include: { supplier: { select: { id: true, code: true, name: true } }, createdBy: { select: { id: true, displayName: true, email: true } } }
      });
      await this.audit(transaction, 'supplier-refund.create', created.id, actor, context, { supplierCreditId: input.supplierCreditId, amountMinorUnits: amountMinorUnits.toString() });
      return toRefund(created);
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: SupplierCreditsActor,
    context: SupplierCreditsRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: { action, entityType: 'SupplierCredit', entityId, metadata: metadata as Prisma.InputJsonValue, requestId: context.requestId, userId: actor.id, ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}) }
    });
  }
}
