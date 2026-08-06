import { Quantity } from './quantity.js';

/**
 * Mirrors the Postgres `PurchaseOrderStatus` enum in `packages/database/prisma/schema.prisma`
 * — keep the two lists in sync.
 */
export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'PARTIALLY_BILLED',
  'BILLED',
  'CANCELLED',
  'CLOSED'
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/**
 * The commercial-editing lifecycle `PurchaseOrdersService` (Task 2) owns directly: creating,
 * submitting for approval, approving/confirming, and cancelling a draft commitment. Once a
 * purchase order is `CONFIRMED`, its status moves forward again only as a *derived* summary
 * of its lines' received/billed quantities — computed by `deriveFulfillmentStatus` below, not
 * by any transition table — as goods receipts (Task 3) and supplier bills (Task 4) post.
 */
const EDITING_TRANSITIONS: Record<'DRAFT' | 'AWAITING_APPROVAL' | 'CONFIRMED', readonly PurchaseOrderStatus[]> = {
  DRAFT: ['AWAITING_APPROVAL', 'CONFIRMED', 'CANCELLED'],
  AWAITING_APPROVAL: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED']
};

export function validateEditingTransition(current: PurchaseOrderStatus, next: PurchaseOrderStatus): void {
  const allowed = current === 'DRAFT' || current === 'AWAITING_APPROVAL' || current === 'CONFIRMED' ? EDITING_TRANSITIONS[current] : undefined;
  if (!allowed || !allowed.includes(next)) {
    throw new Error(`Cannot move a purchase order from ${current} to ${next}`);
  }
}

export type PurchaseOrderLineQuantities = {
  orderedQuantity: string;
  receivedQuantity: string;
  billedQuantity: string;
};

export type PurchaseOrderLineProjection = {
  outstandingQuantity: string;
  unbilledQuantity: string;
};

/**
 * Outstanding = ordered - received (what is still owed by the supplier).
 * Unbilled = received - billed (received-not-billed, feeding the Task 8 AP calculation).
 * Both are clamped at zero: a line can never show a negative outstanding/unbilled quantity
 * even if a tolerance override (Task 3/4) allowed receiving or billing past what was ordered.
 */
export function computeLineProjection(line: PurchaseOrderLineQuantities): PurchaseOrderLineProjection {
  const ordered = Quantity.from(line.orderedQuantity);
  const received = Quantity.from(line.receivedQuantity);
  const billed = Quantity.from(line.billedQuantity);

  const outstanding = ordered.subtract(received);
  const unbilled = received.subtract(billed);

  return {
    outstandingQuantity: (outstanding.isNegative() ? Quantity.zero() : outstanding).toDecimalString(),
    unbilledQuantity: (unbilled.isNegative() ? Quantity.zero() : unbilled).toDecimalString()
  };
}

/**
 * A purchase order's fulfillment status, derived purely from its lines' received/billed
 * quantities against what was ordered — never stored as an independent field a caller could
 * set inconsistently with the lines themselves.
 */
export function deriveFulfillmentStatus(lines: readonly PurchaseOrderLineQuantities[]): 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'PARTIALLY_BILLED' | 'BILLED' {
  const totals = lines.reduce(
    (accumulator, line) => ({
      ordered: accumulator.ordered.add(Quantity.from(line.orderedQuantity)),
      received: accumulator.received.add(Quantity.from(line.receivedQuantity)),
      billed: accumulator.billed.add(Quantity.from(line.billedQuantity))
    }),
    { ordered: Quantity.zero(), received: Quantity.zero(), billed: Quantity.zero() }
  );

  if (totals.received.isZero()) return 'CONFIRMED';
  const fullyReceived = totals.received.compare(totals.ordered) >= 0;
  if (!fullyReceived) return 'PARTIALLY_RECEIVED';
  if (totals.billed.isZero()) return 'RECEIVED';
  const fullyBilled = totals.billed.compare(totals.received) >= 0;
  return fullyBilled ? 'BILLED' : 'PARTIALLY_BILLED';
}

/** Rounds unitCost x quantity to the nearest minor unit (half away from zero). */
export function computeLineTotalMinorUnits(unitCostMinorUnits: bigint, quantity: string): bigint {
  const parsed = Quantity.from(quantity);
  const scaleFactor = 10n ** BigInt(parsed.scale);
  const product = unitCostMinorUnits * parsed.scaledUnits;
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  const rounded = (absolute + scaleFactor / 2n) / scaleFactor;
  return negative ? -rounded : rounded;
}

export function computeOrderTotalMinorUnits(lines: readonly { unitCostMinorUnits: bigint; orderedQuantity: string }[]): bigint {
  return lines.reduce((total, line) => total + computeLineTotalMinorUnits(line.unitCostMinorUnits, line.orderedQuantity), 0n);
}
