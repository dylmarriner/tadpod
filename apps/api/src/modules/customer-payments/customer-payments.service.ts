import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Money, planPaymentAllocation, validateManualAllocation } from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type {
  CreateCustomerPaymentInput,
  CustomerPayment,
  ListCustomerPaymentsQuery,
  PaymentAllocationPreview,
  PreviewPaymentAllocationQuery,
  ReallocateCustomerPaymentInput,
  ReverseCustomerPaymentInput
} from '@tadpods/contracts';
import { getOpenInvoicesForCustomer, refreshInvoiceStatus } from '../customer-invoices/customer-invoice-posting.js';

export type CustomerPaymentsActor = { id: string; permissions: readonly string[] };
export type CustomerPaymentsRequestContext = { requestId: string; ipAddress?: string };

const paymentInclude = {
  customer: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  allocations: { include: { customerInvoice: { select: { id: true, invoiceNumber: true } } } }
} satisfies PrismaNamespace.CustomerPaymentInclude;

type PaymentWithRelations = PrismaNamespace.CustomerPaymentGetPayload<{ include: typeof paymentInclude }>;

function toPayment(row: PaymentWithRelations): CustomerPayment {
  const activeAllocations = row.allocations.filter((allocation) => !allocation.reversedAt);
  const allocatedMinorUnits = activeAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n);
  return {
    id: row.id,
    paymentNumber: row.paymentNumber,
    customer: row.customer,
    amount: Money.from(row.amountMinorUnits, row.currency).toDecimalString(),
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    receivedAt: row.receivedAt.toISOString(),
    notes: row.notes,
    createdBy: row.createdBy,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    allocations: row.allocations.map((allocation) => ({
      id: allocation.id,
      customerInvoiceId: allocation.customerInvoiceId,
      invoiceNumber: allocation.customerInvoice.invoiceNumber,
      amount: Money.from(allocation.amountMinorUnits, row.currency).toDecimalString(),
      reversedAt: allocation.reversedAt?.toISOString() ?? null,
      createdAt: allocation.createdAt.toISOString()
    })),
    unappliedAmount: Money.from(row.reversedAt ? 0n : row.amountMinorUnits - allocatedMinorUnits, row.currency).toDecimalString()
  };
}

/**
 * Customer payments (Phase 5). `create` implements the roadmap's "Customer Payment Posting"
 * workflow exactly: record the full payment once, lock in eligible open invoices (read inside
 * the same `SERIALIZABLE` transaction `withTransaction` already provides, so a concurrent
 * payment against the same invoices cannot double-allocate the same balance), allocate
 * oldest-to-newest until exhausted, and preserve any remainder as a `CustomerCredit`. A manual
 * `allocations` array bypasses the oldest-first default; either way the leftover still becomes
 * credit. `idempotencyKey` is the duplicate-payment guard — a retried request returns the
 * original payment rather than posting a second one.
 */
@Injectable()
export class CustomerPaymentsService {
  async list(query: ListCustomerPaymentsQuery): Promise<{ items: CustomerPayment[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.CustomerPaymentWhereInput = { ...(query.customerId ? { customerId: query.customerId } : {}) };
    const [rows, total] = await Promise.all([
      database.customerPayment.findMany({ where, include: paymentInclude, orderBy: [{ receivedAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      database.customerPayment.count({ where })
    ]);
    return { items: rows.map(toPayment), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<CustomerPayment> {
    const row = await database.customerPayment.findUnique({ where: { id }, include: paymentInclude });
    if (!row) throw new NotFoundException('Customer payment not found');
    return toPayment(row);
  }

  /** Preview how a payment amount would allocate oldest-first, before anything is posted. */
  async previewAllocation(query: PreviewPaymentAllocationQuery): Promise<PaymentAllocationPreview> {
    const customer = await database.customer.findUnique({ where: { id: query.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const openInvoices = await getOpenInvoicesForCustomer(database as unknown as DatabaseTransaction, query.customerId, customer.currency);
    const plan = planPaymentAllocation(Money.from(query.amount).minorUnits, openInvoices);
    const byId = new Map(openInvoices.map((invoice) => [invoice.customerInvoiceId, invoice]));
    return {
      allocations: plan.allocations.map((allocation) => ({
        customerInvoiceId: allocation.customerInvoiceId,
        invoiceNumber: byId.get(allocation.customerInvoiceId)?.invoiceNumber ?? '',
        amount: Money.from(allocation.amountMinorUnits, customer.currency).toDecimalString()
      })),
      unappliedAmount: Money.from(plan.unappliedMinorUnits, customer.currency).toDecimalString()
    };
  }

  async create(input: CreateCustomerPaymentInput, actor: CustomerPaymentsActor, context: CustomerPaymentsRequestContext): Promise<CustomerPayment> {
    return withTransaction(async (transaction) => {
      const existing = await transaction.customerPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return toPayment(await transaction.customerPayment.findUniqueOrThrow({ where: { id: existing.id }, include: paymentInclude }));

      const customer = await transaction.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new NotFoundException('Customer not found');
      const currency = input.currency ?? customer.currency;
      const amountMinorUnits = Money.from(input.amount).minorUnits;

      let paymentNumber: string;
      try {
        paymentNumber = await nextDocumentNumber('customer-payment');
      } catch {
        throw new BadRequestException('Unable to allocate a payment number');
      }

      const payment = await transaction.customerPayment.create({
        data: {
          paymentNumber,
          customerId: input.customerId,
          amountMinorUnits,
          currency,
          method: input.method,
          reference: input.reference ?? null,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
          notes: input.notes ?? null,
          createdById: actor.id,
          idempotencyKey: input.idempotencyKey
        }
      });

      const openInvoices = await getOpenInvoicesForCustomer(transaction, input.customerId, currency);
      const byId = new Map(openInvoices.map((invoice) => [invoice.customerInvoiceId, invoice]));

      let allocations: { customerInvoiceId: string; amountMinorUnits: bigint }[];
      let unappliedMinorUnits: bigint;
      if (input.allocations) {
        const lines = input.allocations.map((line) => {
          const invoice = byId.get(line.customerInvoiceId);
          if (!invoice) throw new BadRequestException(`Invoice ${line.customerInvoiceId} is not an open invoice for this customer`);
          return { customerInvoiceId: line.customerInvoiceId, outstandingMinorUnits: invoice.outstandingMinorUnits, amountMinorUnits: Money.from(line.amount).minorUnits };
        });
        validateManualAllocation(amountMinorUnits, lines);
        allocations = lines.map((line) => ({ customerInvoiceId: line.customerInvoiceId, amountMinorUnits: line.amountMinorUnits }));
        unappliedMinorUnits = amountMinorUnits - allocations.reduce((sum, line) => sum + line.amountMinorUnits, 0n);
      } else {
        const plan = planPaymentAllocation(amountMinorUnits, openInvoices);
        allocations = plan.allocations;
        unappliedMinorUnits = plan.unappliedMinorUnits;
      }

      for (const allocation of allocations) {
        await transaction.customerPaymentAllocation.create({
          data: { customerPaymentId: payment.id, customerInvoiceId: allocation.customerInvoiceId, amountMinorUnits: allocation.amountMinorUnits, createdById: actor.id }
        });
        await refreshInvoiceStatus(transaction, allocation.customerInvoiceId);
      }

      if (unappliedMinorUnits > 0n) {
        await transaction.customerCredit.create({
          data: {
            creditNumber: await nextDocumentNumber('credit-note'),
            customerId: input.customerId,
            sourceType: 'OVERPAYMENT',
            sourcePaymentId: payment.id,
            amountMinorUnits: unappliedMinorUnits,
            remainingMinorUnits: unappliedMinorUnits,
            currency,
            notes: 'Unapplied balance from a customer payment',
            createdById: actor.id
          }
        });
      }

      await this.audit(transaction, 'customer-payment.create', payment.id, actor, context, { customerId: input.customerId, amountMinorUnits: amountMinorUnits.toString(), unappliedMinorUnits: unappliedMinorUnits.toString() });
      return toPayment(await transaction.customerPayment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude }));
    });
  }

  /** Replace a payment's currently-active allocations with a new manual set covering the same total. */
  async reallocate(id: string, input: ReallocateCustomerPaymentInput, actor: CustomerPaymentsActor, context: CustomerPaymentsRequestContext): Promise<CustomerPayment> {
    return withTransaction(async (transaction) => {
      const payment = await transaction.customerPayment.findUnique({ where: { id }, include: { allocations: true } });
      if (!payment) throw new NotFoundException('Customer payment not found');
      if (payment.reversedAt) throw new ConflictException('Cannot reallocate a reversed payment');

      const activeAllocations = payment.allocations.filter((allocation) => !allocation.reversedAt);
      const availableMinorUnits = activeAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n);
      const affectedInvoiceIds = new Set(activeAllocations.map((allocation) => allocation.customerInvoiceId));

      for (const allocation of activeAllocations) {
        await transaction.customerPaymentAllocation.update({ where: { id: allocation.id }, data: { reversedAt: new Date() } });
      }
      for (const invoiceId of affectedInvoiceIds) await refreshInvoiceStatus(transaction, invoiceId);

      const openInvoices = await getOpenInvoicesForCustomer(transaction, payment.customerId, payment.currency);
      const byId = new Map(openInvoices.map((invoice) => [invoice.customerInvoiceId, invoice]));
      const lines = input.allocations.map((line) => {
        const invoice = byId.get(line.customerInvoiceId);
        const outstandingMinorUnits = invoice ? invoice.outstandingMinorUnits : 0n;
        return { customerInvoiceId: line.customerInvoiceId, outstandingMinorUnits, amountMinorUnits: Money.from(line.amount).minorUnits };
      });
      validateManualAllocation(availableMinorUnits, lines);

      for (const line of lines) {
        await transaction.customerPaymentAllocation.create({
          data: { customerPaymentId: payment.id, customerInvoiceId: line.customerInvoiceId, amountMinorUnits: line.amountMinorUnits, createdById: actor.id }
        });
        await refreshInvoiceStatus(transaction, line.customerInvoiceId);
      }

      await this.audit(transaction, 'customer-payment.reallocate', id, actor, context, { lineCount: lines.length });
      return toPayment(await transaction.customerPayment.findUniqueOrThrow({ where: { id }, include: paymentInclude }));
    });
  }

  /**
   * Reverse a payment: reverse every active allocation, restoring the affected invoices'
   * balances, then reverse any overpayment credit the payment raised — refusing if any of that
   * credit has already been applied elsewhere or refunded, since reversing a payment cannot
   * retroactively undo a credit spent on a different invoice.
   */
  async reverse(id: string, input: ReverseCustomerPaymentInput, actor: CustomerPaymentsActor, context: CustomerPaymentsRequestContext): Promise<CustomerPayment> {
    return withTransaction(async (transaction) => {
      const payment = await transaction.customerPayment.findUnique({ where: { id }, include: { allocations: true, credits: true } });
      if (!payment) throw new NotFoundException('Customer payment not found');
      if (payment.reversedAt) throw new ConflictException('This payment has already been reversed');

      for (const credit of payment.credits) {
        if (credit.remainingMinorUnits !== credit.amountMinorUnits) {
          throw new ConflictException('Cannot reverse a payment whose overpayment credit has already been applied or refunded');
        }
      }

      const activeAllocations = payment.allocations.filter((allocation) => !allocation.reversedAt);
      const affectedInvoiceIds = new Set(activeAllocations.map((allocation) => allocation.customerInvoiceId));
      for (const allocation of activeAllocations) {
        await transaction.customerPaymentAllocation.update({ where: { id: allocation.id }, data: { reversedAt: new Date() } });
      }
      for (const invoiceId of affectedInvoiceIds) await refreshInvoiceStatus(transaction, invoiceId);

      for (const credit of payment.credits) {
        await transaction.customerCredit.update({ where: { id: credit.id }, data: { remainingMinorUnits: 0n, notes: [credit.notes, `Reversed with source payment: ${input.reason ?? 'no reason given'}`].filter(Boolean).join('\n') } });
      }

      const updated = await transaction.customerPayment.update({ where: { id }, data: { reversedAt: new Date() }, include: paymentInclude });
      await this.audit(transaction, 'customer-payment.reverse', id, actor, context, { reason: input.reason ?? null });
      return toPayment(updated);
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: CustomerPaymentsActor,
    context: CustomerPaymentsRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'CustomerPayment',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }
}
