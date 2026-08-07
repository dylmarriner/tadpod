import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Money, planCreditApplication } from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type {
  ApplyCustomerCreditInput,
  CreateCustomerCreditInput,
  CreateCustomerRefundInput,
  CustomerCredit,
  CustomerRefund,
  ListCustomerCreditsQuery,
  ReverseCreditApplicationInput
} from '@tadpods/contracts';
import { getOpenInvoicesForCustomer, refreshInvoiceStatus } from '../customer-invoices/customer-invoice-posting.js';

export type CustomerCreditsActor = { id: string; permissions: readonly string[] };
export type CustomerCreditsRequestContext = { requestId: string; ipAddress?: string };

const creditInclude = {
  customer: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  applications: { include: { customerInvoice: { select: { id: true, invoiceNumber: true } } } }
} satisfies PrismaNamespace.CustomerCreditInclude;

type CreditWithRelations = PrismaNamespace.CustomerCreditGetPayload<{ include: typeof creditInclude }>;

function toCredit(row: CreditWithRelations): CustomerCredit {
  return {
    id: row.id,
    creditNumber: row.creditNumber,
    customer: row.customer,
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
      customerInvoiceId: application.customerInvoiceId,
      invoiceNumber: application.customerInvoice.invoiceNumber,
      amount: Money.from(application.amountMinorUnits, row.currency).toDecimalString(),
      reversedAt: application.reversedAt?.toISOString() ?? null,
      createdAt: application.createdAt.toISOString()
    }))
  };
}

function toRefund(row: PrismaNamespace.CustomerRefundGetPayload<{ include: { customer: { select: { id: true; code: true; name: true } }; createdBy: { select: { id: true; displayName: true; email: true } } } }>): CustomerRefund {
  return {
    id: row.id,
    refundNumber: row.refundNumber,
    customer: row.customer,
    customerCreditId: row.customerCreditId,
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
 * Customer credits and refunds (Phase 5). A credit's `remainingMinorUnits` is the one mutable
 * balance in this module — every application or refund debits it under the same transaction
 * that creates the debiting record, so the two can never drift. `CustomerInvoicesService`
 * never writes to credits directly; only this service ever changes `remainingMinorUnits`.
 */
@Injectable()
export class CustomerCreditsService {
  async list(query: ListCustomerCreditsQuery): Promise<{ items: CustomerCredit[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.CustomerCreditWhereInput = { ...(query.customerId ? { customerId: query.customerId } : {}) };
    const [rows, total] = await Promise.all([
      database.customerCredit.findMany({ where, include: creditInclude, orderBy: [{ createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      database.customerCredit.count({ where })
    ]);
    return { items: rows.map(toCredit), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<CustomerCredit> {
    const row = await database.customerCredit.findUnique({ where: { id }, include: creditInclude });
    if (!row) throw new NotFoundException('Customer credit not found');
    return toCredit(row);
  }

  async create(input: CreateCustomerCreditInput, actor: CustomerCreditsActor, context: CustomerCreditsRequestContext): Promise<CustomerCredit> {
    return withTransaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new NotFoundException('Customer not found');
      const currency = input.currency ?? customer.currency;
      const amountMinorUnits = Money.from(input.amount).minorUnits;

      const created = await transaction.customerCredit.create({
        data: {
          creditNumber: await nextDocumentNumber('credit-note'),
          customerId: input.customerId,
          sourceType: input.sourceType,
          amountMinorUnits,
          remainingMinorUnits: amountMinorUnits,
          currency,
          notes: input.notes ?? null,
          createdById: actor.id
        },
        include: creditInclude
      });
      await this.audit(transaction, 'customer-credit.create', created.id, actor, context, { customerId: input.customerId, amountMinorUnits: amountMinorUnits.toString(), sourceType: input.sourceType });
      return toCredit(created);
    });
  }

  /** Apply a credit's remaining balance — to one specific invoice, or oldest-first across every open invoice. */
  async apply(id: string, input: ApplyCustomerCreditInput, actor: CustomerCreditsActor, context: CustomerCreditsRequestContext): Promise<CustomerCredit> {
    return withTransaction(async (transaction) => {
      const credit = await transaction.customerCredit.findUnique({ where: { id } });
      if (!credit) throw new NotFoundException('Customer credit not found');
      if (credit.remainingMinorUnits <= 0n) throw new ConflictException('This credit has no remaining balance to apply');

      if (input.customerInvoiceId) {
        const amountMinorUnits = input.amount ? Money.from(input.amount).minorUnits : credit.remainingMinorUnits;
        if (amountMinorUnits > credit.remainingMinorUnits) throw new BadRequestException('Cannot apply more than the credit has remaining');

        const invoice = await transaction.customerInvoice.findUnique({ where: { id: input.customerInvoiceId } });
        if (!invoice || invoice.customerId !== credit.customerId) throw new NotFoundException('Invoice not found for this customer');
        if (invoice.status === 'VOIDED') throw new ConflictException('Cannot apply a credit to a voided invoice');

        await transaction.customerCreditApplication.create({ data: { customerCreditId: id, customerInvoiceId: input.customerInvoiceId, amountMinorUnits, createdById: actor.id } });
        await transaction.customerCredit.update({ where: { id }, data: { remainingMinorUnits: { decrement: amountMinorUnits } } });
        await refreshInvoiceStatus(transaction, input.customerInvoiceId);
      } else {
        const openInvoices = await getOpenInvoicesForCustomer(transaction, credit.customerId, credit.currency);
        const plan = planCreditApplication(credit.remainingMinorUnits, openInvoices);
        if (plan.allocations.length === 0) throw new BadRequestException('There are no open invoices to apply this credit to');
        for (const allocation of plan.allocations) {
          await transaction.customerCreditApplication.create({ data: { customerCreditId: id, customerInvoiceId: allocation.customerInvoiceId, amountMinorUnits: allocation.amountMinorUnits, createdById: actor.id } });
          await refreshInvoiceStatus(transaction, allocation.customerInvoiceId);
        }
        await transaction.customerCredit.update({ where: { id }, data: { remainingMinorUnits: plan.unappliedMinorUnits } });
      }

      const updated = await transaction.customerCredit.findUniqueOrThrow({ where: { id }, include: creditInclude });
      await this.audit(transaction, 'customer-credit.apply', id, actor, context, { customerInvoiceId: input.customerInvoiceId ?? null });
      return toCredit(updated);
    });
  }

  /** Reverse one credit application, restoring both the credit's remaining balance and the invoice's status. */
  async reverseApplication(id: string, applicationId: string, input: ReverseCreditApplicationInput, actor: CustomerCreditsActor, context: CustomerCreditsRequestContext): Promise<CustomerCredit> {
    return withTransaction(async (transaction) => {
      const application = await transaction.customerCreditApplication.findUnique({ where: { id: applicationId } });
      if (!application || application.customerCreditId !== id) throw new NotFoundException('Credit application not found');
      if (application.reversedAt) throw new ConflictException('This application has already been reversed');

      await transaction.customerCreditApplication.update({ where: { id: applicationId }, data: { reversedAt: new Date() } });
      await transaction.customerCredit.update({ where: { id }, data: { remainingMinorUnits: { increment: application.amountMinorUnits } } });
      await refreshInvoiceStatus(transaction, application.customerInvoiceId);

      const updated = await transaction.customerCredit.findUniqueOrThrow({ where: { id }, include: creditInclude });
      await this.audit(transaction, 'customer-credit.reverse-application', id, actor, context, { applicationId, reason: input.reason ?? null });
      return toCredit(updated);
    });
  }

  async listRefunds(customerId?: string): Promise<CustomerRefund[]> {
    const rows = await database.customerRefund.findMany({
      where: { ...(customerId ? { customerId } : {}) },
      include: { customer: { select: { id: true, code: true, name: true } }, createdBy: { select: { id: true, displayName: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }]
    });
    return rows.map(toRefund);
  }

  async createRefund(input: CreateCustomerRefundInput, actor: CustomerCreditsActor, context: CustomerCreditsRequestContext): Promise<CustomerRefund> {
    return withTransaction(async (transaction) => {
      const credit = await transaction.customerCredit.findUnique({ where: { id: input.customerCreditId } });
      if (!credit) throw new NotFoundException('Customer credit not found');
      const amountMinorUnits = Money.from(input.amount).minorUnits;
      if (amountMinorUnits > credit.remainingMinorUnits) throw new BadRequestException('Cannot refund more than the credit has remaining');

      await transaction.customerCredit.update({ where: { id: input.customerCreditId }, data: { remainingMinorUnits: { decrement: amountMinorUnits } } });
      const created = await transaction.customerRefund.create({
        data: {
          refundNumber: await nextDocumentNumber('customer-refund'),
          customerId: credit.customerId,
          customerCreditId: input.customerCreditId,
          amountMinorUnits,
          currency: credit.currency,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          createdById: actor.id
        },
        include: { customer: { select: { id: true, code: true, name: true } }, createdBy: { select: { id: true, displayName: true, email: true } } }
      });
      await this.audit(transaction, 'customer-refund.create', created.id, actor, context, { customerCreditId: input.customerCreditId, amountMinorUnits: amountMinorUnits.toString() });
      return toRefund(created);
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: CustomerCreditsActor,
    context: CustomerCreditsRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'CustomerCredit',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }
}
