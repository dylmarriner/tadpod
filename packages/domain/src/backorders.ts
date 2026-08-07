import { Quantity } from './quantity.js';

/**
 * Mirrors the Postgres `BackorderStatus` enum in `packages/database/prisma/schema.prisma`
 * — keep the two lists in sync.
 */
export const BACKORDER_STATUSES = [
  'PENDING_STOCK',
  'PARTIALLY_AVAILABLE',
  'READY_TO_FULFIL',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'CANCELLED'
] as const;
export type BackorderStatus = (typeof BACKORDER_STATUSES)[number];

/**
 * Backordered quantity = confirmed ordered - delivered - cancelled - active reserved.
 *
 * Whatever the customer asked for that is neither already shipped, nor withdrawn, nor
 * covered by a live claim on stock, is by definition waiting on supply. Clamped at zero: a
 * line that is over-reserved (never possible through the services, but arithmetically
 * expressible) is not negatively backordered.
 */
export function computeBackorderQuantity(line: {
  orderedQuantity: string;
  deliveredQuantity: string;
  cancelledQuantity: string;
  reservedQuantity: string;
}): string {
  const shortfall = Quantity.from(line.orderedQuantity)
    .subtract(Quantity.from(line.deliveredQuantity))
    .subtract(Quantity.from(line.cancelledQuantity))
    .subtract(Quantity.from(line.reservedQuantity));
  return (shortfall.isNegative() ? Quantity.zero() : shortfall).toDecimalString();
}

export type BackorderLineQuantities = {
  quantity: string;
  /** Incoming stock earmarked for this line and reserved against it, not yet delivered. */
  allocatedQuantity: string;
  fulfilledQuantity: string;
  cancelledQuantity: string;
};

/** Still waiting: quantity - fulfilled - cancelled. */
export function computeBackorderOpenQuantity(line: BackorderLineQuantities): string {
  const open = Quantity.from(line.quantity).subtract(Quantity.from(line.fulfilledQuantity)).subtract(Quantity.from(line.cancelledQuantity));
  return (open.isNegative() ? Quantity.zero() : open).toDecimalString();
}

/**
 * A backorder's status, derived purely from its lines. Nothing sets it directly — allocation
 * of incoming stock, delivery, and cancellation each change quantities and this function
 * re-reads the result, so status can never drift from the quantities it claims to describe.
 */
export function deriveBackorderStatus(lines: readonly BackorderLineQuantities[]): BackorderStatus {
  const totals = lines.reduce(
    (accumulator, line) => ({
      quantity: accumulator.quantity.add(Quantity.from(line.quantity)),
      allocated: accumulator.allocated.add(Quantity.from(line.allocatedQuantity)),
      fulfilled: accumulator.fulfilled.add(Quantity.from(line.fulfilledQuantity)),
      cancelled: accumulator.cancelled.add(Quantity.from(line.cancelledQuantity)),
      open: accumulator.open.add(Quantity.from(computeBackorderOpenQuantity(line)))
    }),
    { quantity: Quantity.zero(), allocated: Quantity.zero(), fulfilled: Quantity.zero(), cancelled: Quantity.zero(), open: Quantity.zero() }
  );

  if (totals.open.isZero()) {
    if (totals.fulfilled.isPositive()) return 'FULFILLED';
    if (totals.cancelled.isPositive()) return 'CANCELLED';
    return 'FULFILLED';
  }
  if (totals.fulfilled.isPositive()) return 'PARTIALLY_FULFILLED';
  if (totals.allocated.isZero()) return 'PENDING_STOCK';
  return totals.allocated.compare(totals.open) >= 0 ? 'READY_TO_FULFIL' : 'PARTIALLY_AVAILABLE';
}

/**
 * Validate an adjustment to a backorder line's quantity. Quantity may be reduced (the
 * customer trimmed the order) but never below what has already been fulfilled or cancelled,
 * and never to zero — cancelling the whole line is a cancellation, with its own audit trail,
 * not a quantity edit to nothing.
 */
export function validateBackorderQuantityChange(line: BackorderLineQuantities, newQuantity: string): void {
  const next = Quantity.from(newQuantity);
  if (!next.isPositive()) throw new Error('Backorder line quantity must be greater than zero — cancel the line instead');
  const settled = Quantity.from(line.fulfilledQuantity).add(Quantity.from(line.cancelledQuantity));
  if (next.lessThan(settled)) {
    throw new Error(`Backorder line quantity cannot drop below the ${settled.toDecimalString()} already fulfilled or cancelled`);
  }
}

export type IncomingAllocationDemand = {
  backorderLineId: string;
  /** Open quantity still needing supply, less anything already allocated. */
  outstandingQuantity: string;
  /** Lower is more urgent, matching `Backorder.priority`. */
  priority: number;
  /** ISO 8601 UTC — when the backorder was raised. */
  createdAt: string;
};

export type IncomingAllocation = {
  backorderLineId: string;
  quantity: string;
};

/**
 * Suggest how a quantity of newly-received stock should be spread across the open backorders
 * waiting for that product. `OLDEST_FIRST` and `PRIORITY` are the two settings Task 5 allows;
 * both fall back to oldest-then-line-id so the suggestion is deterministic and reviewable
 * before anyone posts it. Lines that would receive nothing are omitted — this is a proposal
 * to act on, not a report of everything considered.
 */
export function planIncomingAllocation(
  incomingQuantity: string,
  demands: readonly IncomingAllocationDemand[],
  method: 'OLDEST_FIRST' | 'PRIORITY' = 'OLDEST_FIRST'
): IncomingAllocation[] {
  let remaining = Quantity.from(incomingQuantity);
  if (!remaining.isPositive()) return [];

  const compare = (a: IncomingAllocationDemand, b: IncomingAllocationDemand): number => {
    if (method === 'PRIORITY' && a.priority !== b.priority) return a.priority - b.priority;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.backorderLineId < b.backorderLineId ? -1 : a.backorderLineId > b.backorderLineId ? 1 : 0;
  };

  const allocations: IncomingAllocation[] = [];
  for (const demand of [...demands].sort(compare)) {
    if (!remaining.isPositive()) break;
    const outstanding = Quantity.from(demand.outstandingQuantity);
    if (!outstanding.isPositive()) continue;
    const take = outstanding.lessThan(remaining) ? outstanding : remaining;
    allocations.push({ backorderLineId: demand.backorderLineId, quantity: take.toDecimalString() });
    remaining = remaining.subtract(take);
  }
  return allocations;
}

/**
 * How much to actually buy to cover a shortage. Supply already on its way — confirmed
 * incoming stock, and quantity on open purchase orders raised for other backorders — is
 * subtracted first, so raising a purchase order twice for the same shortage buys nothing the
 * second time. When something genuinely must be bought, the product's reorder quantity acts
 * as a floor rather than a replacement, so a one-unit shortage does not quietly become a
 * one-unit purchase when the supplier's minimum is larger.
 */
export function suggestPurchaseQuantity(input: {
  shortageQuantity: string;
  incomingQuantity: string;
  openPurchaseQuantity: string;
  reorderQuantity: string;
}): string {
  const needed = Quantity.from(input.shortageQuantity)
    .subtract(Quantity.from(input.incomingQuantity))
    .subtract(Quantity.from(input.openPurchaseQuantity));
  if (!needed.isPositive()) return Quantity.zero().toDecimalString();
  const reorder = Quantity.from(input.reorderQuantity);
  return (needed.lessThan(reorder) ? reorder : needed).toDecimalString();
}
