import { Quantity } from './quantity.js';

/**
 * Mirrors the Postgres `SupplierBillStatus` enum — keep the two lists in sync. Only these five
 * values are ever persisted; "Overdue" is derived, exactly like `CustomerInvoiceStatus`/
 * `deriveCustomerInvoiceDisplayStatus` on the customer side.
 */
export const SUPPLIER_BILL_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'CREDITED'] as const;
export type SupplierBillStatus = (typeof SUPPLIER_BILL_STATUSES)[number];

export type SupplierBillDisplayStatus = SupplierBillStatus | 'OVERDUE';

export function deriveSupplierBillDisplayStatus(status: SupplierBillStatus, dueDate: Date, asOf: Date): SupplierBillDisplayStatus {
  if ((status === 'UNPAID' || status === 'PARTIALLY_PAID') && dueDate < asOf) return 'OVERDUE';
  return status;
}

/**
 * Derive a bill's persisted status purely from its total and what has actually been applied
 * against it (posted payment allocations plus posted credit applications — never unposted or
 * reversed ones). `VOIDED` and `CREDITED` are header decisions `SupplierBillsService` makes
 * directly and are never produced here.
 */
export function deriveSupplierBillStatus(totalMinorUnits: bigint, appliedMinorUnits: bigint): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  if (appliedMinorUnits <= 0n) return 'UNPAID';
  if (appliedMinorUnits >= totalMinorUnits) return 'PAID';
  return 'PARTIALLY_PAID';
}

export function computeSupplierBillOutstandingMinorUnits(totalMinorUnits: bigint, appliedMinorUnits: bigint): bigint {
  const outstanding = totalMinorUnits - appliedMinorUnits;
  return outstanding > 0n ? outstanding : 0n;
}

/** How much of a purchase order line's received quantity is still unbilled — mirrors `computeUninvoicedQuantity`. */
export type BillableLine = { purchaseOrderLineId: string; productId: string; unitCostMinorUnits: bigint; receivedQuantity: string; billedQuantity: string };

export function computeUnbilledQuantity(line: Pick<BillableLine, 'receivedQuantity' | 'billedQuantity'>): string {
  const unbilled = Quantity.from(line.receivedQuantity).subtract(Quantity.from(line.billedQuantity));
  return (unbilled.isNegative() ? Quantity.zero() : unbilled).toDecimalString();
}

/**
 * Reject billing more of a line than is received-and-not-already-billed. The
 * `(supplierBillId, purchaseOrderLineId)` unique constraint on `SupplierBillLine` is the
 * database-level guarantee that a line is never billed twice by the *same* bill; this is the
 * commercial guard against over-billing across *different* bills.
 */
export function validateBillLineQuantity(line: Pick<BillableLine, 'receivedQuantity' | 'billedQuantity'>, quantity: string): void {
  const requested = Quantity.from(quantity);
  if (!requested.isPositive()) throw new Error('Bill line quantity must be greater than zero');
  const unbilled = Quantity.from(computeUnbilledQuantity(line));
  if (requested.greaterThan(unbilled)) {
    throw new Error(`Billing ${requested.toDecimalString()} would exceed the ${unbilled.toDecimalString()} received and not yet billed`);
  }
}
