import { computeCustomerInvoiceOutstandingMinorUnits, computeLineNetMinorUnits, deriveCustomerInvoiceStatus } from '@tadpods/domain';
import type { DatabaseTransaction } from '@tadpods/database';

/**
 * Shared invoice-balance primitives, used directly (not through Nest DI) by
 * `CustomerPaymentsService` and `CustomerCreditsService` — the same "call the sibling
 * module's function directly" pattern `reservation-posting.ts`/`backorder-posting.ts` use in
 * Phase 4, rather than introducing cross-module DI for a handful of pure reads.
 */

export type OpenInvoiceBalance = {
  customerInvoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  currency: string;
  totalMinorUnits: bigint;
  appliedMinorUnits: bigint;
  outstandingMinorUnits: bigint;
};

export async function computeInvoiceTotalMinorUnits(transaction: DatabaseTransaction, invoiceId: string): Promise<bigint> {
  const lines = await transaction.customerInvoiceLine.findMany({ where: { customerInvoiceId: invoiceId } });
  return lines.reduce((sum, line) => sum + computeLineNetMinorUnits(line.unitPriceMinorUnits, line.quantity.toString(), line.discountPercentBasis), 0n);
}

export async function computeInvoiceAppliedMinorUnits(transaction: DatabaseTransaction, invoiceId: string): Promise<bigint> {
  const [payments, credits] = await Promise.all([
    transaction.customerPaymentAllocation.aggregate({ where: { customerInvoiceId: invoiceId, reversedAt: null }, _sum: { amountMinorUnits: true } }),
    transaction.customerCreditApplication.aggregate({ where: { customerInvoiceId: invoiceId, reversedAt: null }, _sum: { amountMinorUnits: true } })
  ]);
  return (payments._sum.amountMinorUnits ?? 0n) + (credits._sum.amountMinorUnits ?? 0n);
}

/** Every not-fully-settled, not-voided invoice for a customer, oldest-issued first. */
export async function getOpenInvoicesForCustomer(transaction: DatabaseTransaction, customerId: string, currency: string): Promise<OpenInvoiceBalance[]> {
  const invoices = await transaction.customerInvoice.findMany({
    where: { customerId, currency, status: { notIn: ['VOIDED'] } },
    orderBy: [{ issueDate: 'asc' }, { id: 'asc' }]
  });

  const balances: OpenInvoiceBalance[] = [];
  for (const invoice of invoices) {
    const [totalMinorUnits, appliedMinorUnits] = await Promise.all([
      computeInvoiceTotalMinorUnits(transaction, invoice.id),
      computeInvoiceAppliedMinorUnits(transaction, invoice.id)
    ]);
    const outstandingMinorUnits = computeCustomerInvoiceOutstandingMinorUnits(totalMinorUnits, appliedMinorUnits);
    if (outstandingMinorUnits <= 0n) continue;
    balances.push({ customerInvoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate.toISOString(), currency: invoice.currency, totalMinorUnits, appliedMinorUnits, outstandingMinorUnits });
  }
  return balances;
}

/**
 * Re-derive one invoice's status from its current total and applied amounts. `CREDITED` is a
 * refinement layered on top of the pure total/applied math in `deriveCustomerInvoiceStatus`:
 * an invoice fully settled with no cash payment applied at all — only credit — is `CREDITED`
 * rather than `PAID`, so the roadmap's distinction between the two survives even though both
 * mean "nothing outstanding".
 */
export async function refreshInvoiceStatus(transaction: DatabaseTransaction, invoiceId: string): Promise<void> {
  const invoice = await transaction.customerInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status === 'VOIDED') return;

  const [totalMinorUnits, paymentApplied, creditApplied] = await Promise.all([
    computeInvoiceTotalMinorUnits(transaction, invoiceId),
    transaction.customerPaymentAllocation.aggregate({ where: { customerInvoiceId: invoiceId, reversedAt: null }, _sum: { amountMinorUnits: true } }),
    transaction.customerCreditApplication.aggregate({ where: { customerInvoiceId: invoiceId, reversedAt: null }, _sum: { amountMinorUnits: true } })
  ]);
  const paymentAppliedMinorUnits = paymentApplied._sum.amountMinorUnits ?? 0n;
  const appliedMinorUnits = paymentAppliedMinorUnits + (creditApplied._sum.amountMinorUnits ?? 0n);

  const status = deriveCustomerInvoiceStatus(totalMinorUnits, appliedMinorUnits);
  const finalStatus = status === 'PAID' && paymentAppliedMinorUnits === 0n ? 'CREDITED' : status;
  await transaction.customerInvoice.update({ where: { id: invoiceId }, data: { status: finalStatus } });
}
