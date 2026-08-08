import { Quantity } from './quantity.js';

/** Mirrors the Postgres `DeliveryStatus` enum. A delivery drafts, posts once, and may reverse. */
export const DELIVERY_STATUSES = ['DRAFT', 'POSTED', 'REVERSED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * `ALL` ships everything still outstanding (needs stock or an authorized override),
 * `AVAILABLE` ships only what is actually reserved, and `SELECTED` ships exactly the
 * quantities the user typed.
 */
export const DELIVERY_MODES = ['ALL', 'AVAILABLE', 'SELECTED'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export type DeliverableLine = {
  salesOrderLineId: string;
  productId: string;
  orderedQuantity: string;
  reservedQuantity: string;
  deliveredQuantity: string;
  cancelledQuantity: string;
};

export type PlannedDeliveryLine = {
  salesOrderLineId: string;
  productId: string;
  quantity: string;
};

/** Still owed to the customer on this line: ordered - delivered - cancelled. */
export function computeOutstandingDeliveryQuantity(line: DeliverableLine): string {
  const outstanding = Quantity.from(line.orderedQuantity)
    .subtract(Quantity.from(line.deliveredQuantity))
    .subtract(Quantity.from(line.cancelledQuantity));
  return (outstanding.isNegative() ? Quantity.zero() : outstanding).toDecimalString();
}

/**
 * Turn a delivery intent into concrete line quantities. Lines that would ship nothing are
 * dropped, so "deliver available" on an order with nothing reserved produces an empty plan
 * the caller can reject outright rather than an empty delivery record.
 */
export function planDeliveryLines(
  lines: readonly DeliverableLine[],
  mode: DeliveryMode,
  selections: readonly { salesOrderLineId: string; quantity: string }[] = []
): PlannedDeliveryLine[] {
  const selected = new Map(selections.map((selection) => [selection.salesOrderLineId, selection.quantity]));

  return lines
    .map((line) => {
      const outstanding = Quantity.from(computeOutstandingDeliveryQuantity(line));
      const reserved = Quantity.from(line.reservedQuantity);
      let quantity: Quantity;
      if (mode === 'ALL') {
        quantity = outstanding;
      } else if (mode === 'AVAILABLE') {
        quantity = reserved.lessThan(outstanding) ? reserved : outstanding;
      } else {
        const requested = selected.get(line.salesOrderLineId);
        quantity = requested === undefined ? Quantity.zero() : Quantity.from(requested);
      }
      return { salesOrderLineId: line.salesOrderLineId, productId: line.productId, quantity: quantity.toDecimalString() };
    })
    .filter((line) => Quantity.from(line.quantity).isPositive());
}

/**
 * Reject a delivery line that would ship more than the customer still has coming. This is
 * the commercial guard; the ledger's own duplicate-source-line constraint is the separate,
 * independent guard against the *same* delivery line reducing stock twice.
 */
export function validateDeliveryQuantity(line: DeliverableLine, quantity: string): void {
  const requested = Quantity.from(quantity);
  if (!requested.isPositive()) throw new Error('Delivery quantity must be greater than zero');
  const outstanding = Quantity.from(computeOutstandingDeliveryQuantity(line));
  if (requested.greaterThan(outstanding)) {
    throw new Error(
      `Delivering ${requested.toDecimalString()} would exceed the ${outstanding.toDecimalString()} still outstanding on this line`
    );
  }
}

export type ReservationConsumption = {
  /** How much of this delivery is covered by an existing reservation being consumed. */
  consumedReservationQuantity: string;
  /** The remainder, shipped straight from unreserved stock. */
  unreservedQuantity: string;
};

/**
 * A delivery consumes reservations first: the stock was already claimed for this customer,
 * so shipping it should release the claim rather than leave a stale reservation holding
 * stock that has physically left the building. Anything beyond what was reserved is shipped
 * from general available stock — permitted, but it is the part that can drive stock negative
 * and is therefore checked against the ledger's negative-stock rule when the movement posts.
 */
export function planReservationConsumption(reservedQuantity: string, deliveryQuantity: string): ReservationConsumption {
  const reserved = Quantity.from(reservedQuantity);
  const delivering = Quantity.from(deliveryQuantity);
  const consumed = reserved.lessThan(delivering) ? reserved : delivering;
  return {
    consumedReservationQuantity: consumed.toDecimalString(),
    unreservedQuantity: delivering.subtract(consumed).toDecimalString()
  };
}

/** Still returnable on a posted delivery line: what was delivered minus what has already been returned. */
export function computeReturnableQuantity(deliveredQuantity: string, alreadyReturnedQuantity: string): string {
  const returnable = Quantity.from(deliveredQuantity).subtract(Quantity.from(alreadyReturnedQuantity));
  return (returnable.isNegative() ? Quantity.zero() : returnable).toDecimalString();
}

/** Reject a customer return that would return more of a delivery line than was ever delivered. */
export function validateReturnQuantity(deliveredQuantity: string, alreadyReturnedQuantity: string, quantity: string): void {
  const requested = Quantity.from(quantity);
  if (!requested.isPositive()) throw new Error('Return quantity must be greater than zero');
  const returnable = Quantity.from(computeReturnableQuantity(deliveredQuantity, alreadyReturnedQuantity));
  if (requested.greaterThan(returnable)) {
    throw new Error(`Returning ${requested.toDecimalString()} would exceed the ${returnable.toDecimalString()} still returnable on this delivery line`);
  }
}

export const DELIVERY_SOURCE_TYPE = 'delivery-line';
export const CUSTOMER_RETURN_SOURCE_TYPE = 'customer-return';

export type DeliveryMovementInput = {
  productId: string;
  warehouseId: string;
  movementType: 'SALES_DELIVERY';
  signedQuantity: string;
  sourceType: typeof DELIVERY_SOURCE_TYPE;
  sourceId: string;
  sourceLineId: string;
};

/**
 * Build the stock movements a delivery posts. `sourceLineId` is the delivery line's own id,
 * so `StockMovement`'s `(sourceType, sourceId, sourceLineId)` unique constraint is what makes
 * "a delivery line reduces stock exactly once" true at the database level — no application
 * check is load-bearing for that guarantee.
 */
export function buildDeliveryMovements(
  deliveryId: string,
  warehouseId: string,
  lines: readonly { id: string; productId: string; quantity: string }[]
): DeliveryMovementInput[] {
  return lines.map((line) => ({
    productId: line.productId,
    warehouseId,
    movementType: 'SALES_DELIVERY' as const,
    signedQuantity: Quantity.from(line.quantity).negate().toDecimalString(),
    sourceType: DELIVERY_SOURCE_TYPE,
    sourceId: deliveryId,
    sourceLineId: line.id
  }));
}
