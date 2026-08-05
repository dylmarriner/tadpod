import { Quantity } from './quantity.js';

/**
 * Every stock movement type recognised by the immutable stock-movement ledger.
 * Mirrors the Postgres `StockMovementType` enum in `packages/database/prisma/schema.prisma` —
 * keep the two lists in sync.
 */
export const STOCK_MOVEMENT_TYPES = [
  'OPENING_STOCK',
  'GOODS_RECEIPT',
  'SALES_DELIVERY',
  'CUSTOMER_RETURN',
  'SUPPLIER_RETURN',
  'WAREHOUSE_TRANSFER_OUT',
  'WAREHOUSE_TRANSFER_IN',
  'POSITIVE_ADJUSTMENT',
  'NEGATIVE_ADJUSTMENT',
  'STOCK_COUNT_CORRECTION',
  'REVERSAL'
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/**
 * The expected sign of a posted movement's quantity, keyed by movement type.
 *
 * - `'increase'` movement types must post a strictly positive quantity.
 * - `'decrease'` movement types must post a strictly negative quantity.
 * - `'either'` movement types carry a variance or a correction whose direction depends on
 *   the situation (a stock count can find more or less stock than expected; a reversal is
 *   equal and opposite to whatever it reverses), so either sign is accepted — zero is not.
 */
const MOVEMENT_DIRECTION: Record<StockMovementType, 'increase' | 'decrease' | 'either'> = {
  OPENING_STOCK: 'increase',
  GOODS_RECEIPT: 'increase',
  SALES_DELIVERY: 'decrease',
  CUSTOMER_RETURN: 'increase',
  SUPPLIER_RETURN: 'decrease',
  WAREHOUSE_TRANSFER_OUT: 'decrease',
  WAREHOUSE_TRANSFER_IN: 'increase',
  POSITIVE_ADJUSTMENT: 'increase',
  NEGATIVE_ADJUSTMENT: 'decrease',
  STOCK_COUNT_CORRECTION: 'either',
  REVERSAL: 'either'
};

/**
 * Validate that a signed quantity's direction matches what its movement type allows.
 * Throws a descriptive error rather than silently accepting a movement that would post
 * stock in the wrong direction (e.g. a `SALES_DELIVERY` with a positive quantity).
 */
export function validateMovementDirection(movementType: StockMovementType, signedQuantity: Quantity): void {
  if (signedQuantity.isZero()) {
    throw new Error('Stock movement quantity cannot be zero');
  }
  const direction = MOVEMENT_DIRECTION[movementType];
  if (direction === 'increase' && !signedQuantity.isPositive()) {
    throw new Error(`${movementType} must post a positive quantity`);
  }
  if (direction === 'decrease' && !signedQuantity.isNegative()) {
    throw new Error(`${movementType} must post a negative quantity`);
  }
}

export type PostedMovementLike = {
  signedQuantity: Quantity;
};

export type WarehouseMovementLike = PostedMovementLike & {
  warehouseId: string;
};

/** Stock on hand = sum of every posted movement's signed quantity. No unposted state exists. */
export function computeStockOnHand(movements: readonly PostedMovementLike[]): Quantity {
  return movements.reduce<Quantity>(
    (total, movement) => total.add(movement.signedQuantity),
    Quantity.zero()
  );
}

/** Stock on hand grouped by warehouse, from a list of posted movements for a single product. */
export function computeStockByWarehouse(movements: readonly WarehouseMovementLike[]): Map<string, Quantity> {
  const totals = new Map<string, Quantity>();
  for (const movement of movements) {
    const running = totals.get(movement.warehouseId) ?? Quantity.zero();
    totals.set(movement.warehouseId, running.add(movement.signedQuantity));
  }
  return totals;
}

export type ReversibleMovement = {
  id: string;
  productId: string;
  warehouseId: string;
  signedQuantity: Quantity;
};

export type ReversalMovementInput = {
  productId: string;
  warehouseId: string;
  movementType: 'REVERSAL';
  signedQuantity: Quantity;
  reversalOfId: string;
  sourceType: 'stock-movement-reversal';
  sourceId: string;
  sourceLineId: string;
};

/**
 * Build the equal-and-opposite movement that reverses a posted movement.
 *
 * The generated `(sourceType, sourceId, sourceLineId)` triple is derived from the original
 * movement's id, so the ledger's own duplicate-source-line constraint doubles as the
 * "a movement can only be reversed once" guarantee at the database layer.
 */
export function buildReversal(original: ReversibleMovement): ReversalMovementInput {
  return {
    productId: original.productId,
    warehouseId: original.warehouseId,
    movementType: 'REVERSAL',
    signedQuantity: original.signedQuantity.negate(),
    reversalOfId: original.id,
    sourceType: 'stock-movement-reversal',
    sourceId: original.id,
    sourceLineId: original.id
  };
}
