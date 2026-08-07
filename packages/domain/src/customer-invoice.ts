import { Quantity } from './quantity.js';

/**
 * Mirrors the Postgres `CustomerInvoiceStatus` enum in `packages/database/prisma/schema.prisma`
 * — keep the two lists in sync. Only these five values are ever persisted.
 */
export const CUSTOMER_INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'CREDITED'] as const;
export type CustomerInvoiceStatus = (typeof CUSTOMER_INVOICE_STATUSES)[number];

/**
 * The roadmap's status list also includes "Overdue" — never stored, always derived from the
 * persisted status and the due date at read time. Nothing has to sweep the table on a
 * schedule to flip a stored flag, and the displayed status can never drift from what actually
 * happened to the invoice.
 */
export type CustomerInvoiceDisplayStatus = CustomerInvoiceStatus | 'OVERDUE';

export function deriveCustomerInvoiceDisplayStatus(status: CustomerInvoiceStatus, dueDate: Date, asOf: Date): CustomerInvoiceDisplayStatus {
  if ((status === 'UNPAID' || status === 'PARTIALLY_PAID') && dueDate < asOf) return 'OVERDUE';
  return status;
}

/**
 * Derive an invoice's persisted status purely from its total and what has actually been
 * applied against it (posted payment allocations plus posted credit applications — never
 * unposted or reversed ones). `VOIDED` and `CREDITED` are header decisions
 * `CustomerInvoicesService` makes directly and are never produced here, mirroring how
 * `deriveSalesOrderFulfilmentStatus` never returns `CANCELLED`/`CLOSED`.
 */
export function deriveCustomerInvoiceStatus(totalMinorUnits: bigint, appliedMinorUnits: bigint): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  if (appliedMinorUnits <= 0n) return 'UNPAID';
  if (appliedMinorUnits >= totalMinorUnits) return 'PAID';
  return 'PARTIALLY_PAID';
}

export function computeCustomerInvoiceOutstandingMinorUnits(totalMinorUnits: bigint, appliedMinorUnits: bigint): bigint {
  const outstanding = totalMinorUnits - appliedMinorUnits;
  return outstanding > 0n ? outstanding : 0n;
}

/**
 * How much of a sales order line's delivered quantity is still uninvoiced. Mirrors
 * `SalesOrderLine`'s `uninvoicedQuantity` projection (Phase 4's `computeSalesOrderLineProjection`)
 * — this is the demand side an invoice line is built from.
 */
export type InvoiceableLine = {
  salesOrderLineId: string;
  productId: string;
  unitPriceMinorUnits: bigint;
  discountPercentBasis: number;
  deliveredQuantity: string;
  invoicedQuantity: string;
};

export type InvoiceLineDraft = {
  salesOrderLineId: string;
  productId: string;
  unitPriceMinorUnits: bigint;
  discountPercentBasis: number;
  quantity: string;
};

export function computeUninvoicedQuantity(line: Pick<InvoiceableLine, 'deliveredQuantity' | 'invoicedQuantity'>): string {
  const uninvoiced = Quantity.from(line.deliveredQuantity).subtract(Quantity.from(line.invoicedQuantity));
  return (uninvoiced.isNegative() ? Quantity.zero() : uninvoiced).toDecimalString();
}

/**
 * Reject invoicing more of a line than is delivered-and-not-already-invoiced. The
 * `(customerInvoiceId, salesOrderLineId)` unique constraint on `CustomerInvoiceLine` is the
 * database-level guarantee that a line is never invoiced twice by the *same* invoice; this is
 * the commercial guard against over-invoicing across *different* invoices.
 */
export function validateInvoiceLineQuantity(line: Pick<InvoiceableLine, 'deliveredQuantity' | 'invoicedQuantity'>, quantity: string): void {
  const requested = Quantity.from(quantity);
  if (!requested.isPositive()) throw new Error('Invoice line quantity must be greater than zero');
  const uninvoiced = Quantity.from(computeUninvoicedQuantity(line));
  if (requested.greaterThan(uninvoiced)) {
    throw new Error(`Invoicing ${requested.toDecimalString()} would exceed the ${uninvoiced.toDecimalString()} delivered and not yet invoiced`);
  }
}

/**
 * Mirrors the Postgres `SalesOrderInvoicingStatus` enum, derived purely from each line's
 * delivered vs. invoiced quantity — never stored independently of what the lines say.
 */
export function deriveSalesOrderInvoicingStatus(
  lines: readonly Pick<InvoiceableLine, 'deliveredQuantity' | 'invoicedQuantity'>[]
): 'NOT_INVOICED' | 'PARTIALLY_INVOICED' | 'INVOICED' {
  let delivered = Quantity.zero();
  let invoiced = Quantity.zero();
  for (const line of lines) {
    delivered = delivered.add(Quantity.from(line.deliveredQuantity));
    invoiced = invoiced.add(Quantity.from(line.invoicedQuantity));
  }
  if (invoiced.isZero()) return 'NOT_INVOICED';
  if (delivered.isPositive() && invoiced.compare(delivered) >= 0) return 'INVOICED';
  return 'PARTIALLY_INVOICED';
}
