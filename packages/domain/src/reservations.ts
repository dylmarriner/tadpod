import { Quantity } from './quantity.js';

/**
 * How a reservation run decides which demand gets the stock that exists. `IMMEDIATE` is what
 * order confirmation uses (reserve this order's own demand, now); the rest are the ways a
 * reservation run across *competing* orders can be sequenced.
 */
export const RESERVATION_METHODS = ['IMMEDIATE', 'MANUAL', 'PRIORITY', 'PROMISED_DATE', 'OLDEST_FIRST'] as const;
export type ReservationMethod = (typeof RESERVATION_METHODS)[number];

/**
 * Available stock = stock on hand - active reservations.
 *
 * Reservations are not stock movements, so they never appear in the ledger; this is the one
 * place the two numbers are combined. The result can legitimately be negative if stock was
 * written down (an adjustment, a stock count) after it had already been reserved — callers
 * decide what to do about that rather than having the arithmetic quietly clamp it.
 */
export function computeAvailableStock(stockOnHandQuantity: string, activeReservedQuantity: string): string {
  return Quantity.from(stockOnHandQuantity).subtract(Quantity.from(activeReservedQuantity)).toDecimalString();
}

export type AvailableToPromiseInput = {
  stockOnHandQuantity: string;
  /** Confirmed incoming supply: outstanding quantity on confirmed, not-yet-received purchase orders. */
  incomingQuantity: string;
  activeReservedQuantity: string;
  /** Open backordered demand already promised to customers against that incoming supply. */
  openBackorderedQuantity: string;
};

/**
 * Available to promise = stock on hand + confirmed incoming stock - active reservations
 * - open backordered commitments.
 *
 * This is the number order entry shows before anything is committed: what could still be
 * promised to a *new* customer without breaking a promise already made to an existing one.
 */
export function computeAvailableToPromise(input: AvailableToPromiseInput): string {
  return Quantity.from(input.stockOnHandQuantity)
    .add(Quantity.from(input.incomingQuantity))
    .subtract(Quantity.from(input.activeReservedQuantity))
    .subtract(Quantity.from(input.openBackorderedQuantity))
    .toDecimalString();
}

export type ReservationPlan = {
  /** How much of the requested quantity can be reserved from available stock right now. */
  reserveQuantity: string;
  /** The remainder, which becomes a backorder (or is cancelled, or overridden). */
  shortfallQuantity: string;
};

/**
 * Split one line's outstanding demand into "reserve now" and "short". Never reserves more
 * than is available, and never reserves against negative availability — negative stock is
 * disabled by default, and a reservation is a promise, so promising from a deficit is worse
 * than admitting the shortage.
 */
export function planReservation(requestedQuantity: string, availableQuantity: string): ReservationPlan {
  const requested = Quantity.from(requestedQuantity);
  if (requested.isNegative()) throw new Error('Requested reservation quantity cannot be negative');
  const available = Quantity.from(availableQuantity);
  const reservable = available.isPositive() ? available : Quantity.zero();
  const reserve = requested.lessThan(reservable) ? requested : reservable;
  return {
    reserveQuantity: reserve.toDecimalString(),
    shortfallQuantity: requested.subtract(reserve).toDecimalString()
  };
}

export type ReservationDemand = {
  salesOrderId: string;
  salesOrderLineId: string;
  /** Outstanding demand on this line that has no reservation behind it yet. */
  quantity: string;
  /** Lower is more urgent, matching `SalesOrder.priority` (1 = highest). */
  priority: number;
  /** ISO 8601 UTC, or null when no delivery date was promised. */
  promisedDate: string | null;
  /** ISO 8601 UTC — when the order became real demand. */
  confirmedAt: string;
};

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Order competing demand for the same product and warehouse. Every method falls back to
 * oldest-confirmed-first and then to the line id, so a reservation run is fully
 * deterministic: the same demand always allocates the same way, which is what makes the
 * result reviewable before it is posted.
 */
export function orderDemands(demands: readonly ReservationDemand[], method: ReservationMethod): ReservationDemand[] {
  const tiebreak = (a: ReservationDemand, b: ReservationDemand): number =>
    compareStrings(a.confirmedAt, b.confirmedAt) || compareStrings(a.salesOrderLineId, b.salesOrderLineId);

  return [...demands].sort((a, b) => {
    if (method === 'PRIORITY') return a.priority - b.priority || tiebreak(a, b);
    if (method === 'PROMISED_DATE') {
      if (a.promisedDate === null && b.promisedDate !== null) return 1;
      if (a.promisedDate !== null && b.promisedDate === null) return -1;
      if (a.promisedDate !== null && b.promisedDate !== null) {
        const compared = compareStrings(a.promisedDate, b.promisedDate);
        if (compared !== 0) return compared;
      }
      return tiebreak(a, b);
    }
    return tiebreak(a, b);
  });
}

export type ReservationAllocation = {
  salesOrderId: string;
  salesOrderLineId: string;
  quantity: string;
  shortfallQuantity: string;
};

/**
 * Spread one product/warehouse's available stock across competing demand in the order the
 * chosen method dictates. Demand that gets nothing is still returned, with its full
 * shortfall, so the caller can see every order the run considered — an allocation run that
 * silently omitted the orders it starved would be impossible to review.
 */
export function planAllocationRun(
  availableQuantity: string,
  demands: readonly ReservationDemand[],
  method: ReservationMethod
): ReservationAllocation[] {
  let remaining = Quantity.from(availableQuantity);
  if (remaining.isNegative()) remaining = Quantity.zero();

  return orderDemands(demands, method).map((demand) => {
    const plan = planReservation(demand.quantity, remaining.toDecimalString());
    remaining = remaining.subtract(Quantity.from(plan.reserveQuantity));
    return {
      salesOrderId: demand.salesOrderId,
      salesOrderLineId: demand.salesOrderLineId,
      quantity: plan.reserveQuantity,
      shortfallQuantity: plan.shortfallQuantity
    };
  });
}

/**
 * Guard the invariant that active reservations can never exceed stock on hand. Called under
 * the same `(product, warehouse)` advisory lock stock postings take, so a reservation and a
 * concurrent posting can never both pass this check against the same stock.
 */
export function validateReservationWithinStock(
  stockOnHandQuantity: string,
  activeReservedQuantity: string,
  additionalQuantity: string
): void {
  const projected = Quantity.from(activeReservedQuantity).add(Quantity.from(additionalQuantity));
  if (projected.greaterThan(Quantity.from(stockOnHandQuantity))) {
    throw new Error(
      `Reserving ${additionalQuantity} would take total reservations (${projected.toDecimalString()}) above stock on hand (${stockOnHandQuantity})`
    );
  }
}
