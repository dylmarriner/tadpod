import { Quantity } from './quantity.js';

/**
 * Mirrors the Postgres `SalesOrderStatus` enum in `packages/database/prisma/schema.prisma`
 * — keep the two lists in sync.
 */
export const SALES_ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_ALLOCATED',
  'ALLOCATED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'BACKORDERED',
  'CANCELLED',
  'CLOSED'
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

/** Mirrors the Postgres `SalesOrderInvoicingStatus` enum. Phase 5 owns every transition. */
export const SALES_ORDER_INVOICING_STATUSES = ['NOT_INVOICED', 'PARTIALLY_INVOICED', 'INVOICED'] as const;
export type SalesOrderInvoicingStatus = (typeof SALES_ORDER_INVOICING_STATUSES)[number];

/**
 * The commercial-editing lifecycle `SalesOrdersService` owns directly. A draft is freely
 * editable; confirming takes an immutable commercial snapshot. Past `CONFIRMED`, the status
 * only ever moves as a *derived* summary of the lines' reserved/delivered/backordered
 * quantities — computed by `deriveSalesOrderFulfilmentStatus` below, not by a transition
 * table — as reservations, deliveries, and backorders post.
 */
const EDITING_TRANSITIONS: Record<'DRAFT' | 'CONFIRMED', readonly SalesOrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED']
};

export function validateSalesOrderEditingTransition(current: SalesOrderStatus, next: SalesOrderStatus): void {
  const allowed = current === 'DRAFT' || current === 'CONFIRMED' ? EDITING_TRANSITIONS[current] : undefined;
  if (!allowed || !allowed.includes(next)) {
    throw new Error(`Cannot move a sales order from ${current} to ${next}`);
  }
}

export type SalesOrderLineQuantities = {
  orderedQuantity: string;
  reservedQuantity: string;
  deliveredQuantity: string;
  cancelledQuantity: string;
  backorderedQuantity: string;
  invoicedQuantity: string;
};

export type SalesOrderLineProjection = {
  /** Still owed to the customer: ordered - delivered - cancelled. */
  outstandingQuantity: string;
  /** Demand with no reservation and no backorder behind it yet. */
  unreservedQuantity: string;
  /** What could be picked and delivered right now — a delivery consumes reservations first. */
  deliverableQuantity: string;
  /** Delivered but not yet invoiced. Phase 5 consumes this; Phase 4 never writes an invoice. */
  uninvoicedQuantity: string;
};

function clampAtZero(value: Quantity): Quantity {
  return value.isNegative() ? Quantity.zero() : value;
}

function parse(line: SalesOrderLineQuantities) {
  return {
    ordered: Quantity.from(line.orderedQuantity),
    reserved: Quantity.from(line.reservedQuantity),
    delivered: Quantity.from(line.deliveredQuantity),
    cancelled: Quantity.from(line.cancelledQuantity),
    backordered: Quantity.from(line.backorderedQuantity),
    invoiced: Quantity.from(line.invoicedQuantity)
  };
}

/**
 * The core Phase 4 line invariant, mirroring the `SalesOrderLine_quantity_balance` check
 * constraint in this phase's migration: a line can never promise, ship, cancel, or backorder
 * more than was ordered. Services call this before writing so the caller gets a useful error
 * rather than a raw constraint violation, but the constraint is still what makes it true.
 */
export function validateLineQuantityBalance(line: SalesOrderLineQuantities): void {
  const { ordered, reserved, delivered, cancelled, backordered } = parse(line);
  const committed = delivered.add(cancelled).add(reserved).add(backordered);
  if (committed.greaterThan(ordered)) {
    throw new Error(
      `Delivered, cancelled, reserved, and backordered quantity (${committed.toDecimalString()}) cannot exceed the ordered quantity (${ordered.toDecimalString()})`
    );
  }
}

export function computeSalesOrderLineProjection(line: SalesOrderLineQuantities): SalesOrderLineProjection {
  const { ordered, reserved, delivered, cancelled, backordered, invoiced } = parse(line);
  const outstanding = ordered.subtract(delivered).subtract(cancelled);
  const unreserved = outstanding.subtract(reserved).subtract(backordered);
  return {
    outstandingQuantity: clampAtZero(outstanding).toDecimalString(),
    unreservedQuantity: clampAtZero(unreserved).toDecimalString(),
    deliverableQuantity: clampAtZero(reserved).toDecimalString(),
    uninvoicedQuantity: clampAtZero(delivered.subtract(invoiced)).toDecimalString()
  };
}

/**
 * A sales order's fulfilment status, derived purely from its lines' quantities — never
 * stored as an independent field a caller could set inconsistently with the lines. Cancelled
 * and closed are header decisions `SalesOrdersService` makes, so they are not produced here;
 * a fully-cancelled order is reported as `CANCELLED` only because nothing was ever delivered
 * against it.
 */
export function deriveSalesOrderFulfilmentStatus(
  lines: readonly SalesOrderLineQuantities[]
): 'CONFIRMED' | 'PARTIALLY_ALLOCATED' | 'ALLOCATED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'BACKORDERED' | 'CANCELLED' {
  const totals = lines.reduce(
    (accumulator, line) => {
      const parsed = parse(line);
      return {
        ordered: accumulator.ordered.add(parsed.ordered),
        reserved: accumulator.reserved.add(parsed.reserved),
        delivered: accumulator.delivered.add(parsed.delivered),
        cancelled: accumulator.cancelled.add(parsed.cancelled),
        backordered: accumulator.backordered.add(parsed.backordered)
      };
    },
    { ordered: Quantity.zero(), reserved: Quantity.zero(), delivered: Quantity.zero(), cancelled: Quantity.zero(), backordered: Quantity.zero() }
  );

  const settled = totals.delivered.add(totals.cancelled);
  if (settled.compare(totals.ordered) >= 0) {
    return totals.delivered.isZero() ? 'CANCELLED' : 'DELIVERED';
  }
  if (totals.delivered.isPositive()) return 'PARTIALLY_DELIVERED';

  const uncovered = totals.ordered.subtract(settled).subtract(totals.reserved).subtract(totals.backordered);
  if (totals.reserved.isZero()) {
    return totals.backordered.isPositive() ? 'BACKORDERED' : 'CONFIRMED';
  }
  return uncovered.isPositive() || totals.backordered.isPositive() ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED';
}

/**
 * Line discounts are expressed in the same basis-per-million unit `TaxRate.rateBasis` uses
 * (1_000_000 = 100%), so a 12.5% discount is `125000` and no percentage ever round-trips
 * through a floating-point number.
 */
export const DISCOUNT_BASIS_SCALE = 1_000_000n;

function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

/** Rounds unitPrice x quantity to the nearest minor unit (half away from zero), before discount. */
export function computeLineGrossMinorUnits(unitPriceMinorUnits: bigint, quantity: string): bigint {
  const parsed = Quantity.from(quantity);
  return roundedDivide(unitPriceMinorUnits * parsed.scaledUnits, 10n ** BigInt(parsed.scale));
}

/** Gross less the line discount, both rounded to whole minor units. */
export function computeLineNetMinorUnits(unitPriceMinorUnits: bigint, quantity: string, discountPercentBasis = 0): bigint {
  if (!Number.isInteger(discountPercentBasis) || discountPercentBasis < 0 || BigInt(discountPercentBasis) > DISCOUNT_BASIS_SCALE) {
    throw new Error('Line discount must be between 0 and 1000000 basis (0-100%)');
  }
  const gross = computeLineGrossMinorUnits(unitPriceMinorUnits, quantity);
  const discount = roundedDivide(gross * BigInt(discountPercentBasis), DISCOUNT_BASIS_SCALE);
  return gross - discount;
}

export function computeSalesOrderTotalMinorUnits(
  lines: readonly { unitPriceMinorUnits: bigint; orderedQuantity: string; discountPercentBasis?: number }[]
): bigint {
  return lines.reduce(
    (total, line) => total + computeLineNetMinorUnits(line.unitPriceMinorUnits, line.orderedQuantity, line.discountPercentBasis ?? 0),
    0n
  );
}

/**
 * Credit check: the order's own value plus what the customer already owes, against their
 * limit. A zero limit means "no limit configured", matching the column default — a customer
 * is never blocked simply because nobody has set a limit for them yet.
 */
export function exceedsCreditLimit(
  creditLimitMinorUnits: bigint,
  currentBalanceMinorUnits: bigint,
  orderTotalMinorUnits: bigint
): boolean {
  if (creditLimitMinorUnits <= 0n) return false;
  return currentBalanceMinorUnits + orderTotalMinorUnits > creditLimitMinorUnits;
}
