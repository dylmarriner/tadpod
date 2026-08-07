import { Quantity } from './quantity.js';

export type ReorderInput = {
  stockOnHandQuantity: string;
  incomingQuantity: string;
  reorderLevel: string;
  reorderQuantity: string;
};

export type ReorderRecommendation = {
  needsReorder: boolean;
  /** Stock on hand plus confirmed incoming supply — what the reorder level is measured against. */
  projectedQuantity: string;
  suggestedOrderQuantity: string;
};

/**
 * Low-stock and reorder recommendations (Phase 6). A product needs reordering when stock on
 * hand plus confirmed incoming supply has fallen to or below its reorder level; the suggested
 * quantity is the product's own configured reorder quantity — a floor set by the person who
 * knows the supplier's minimums and lead time, not a number this function invents.
 */
export function computeReorderRecommendation(input: ReorderInput): ReorderRecommendation {
  const projected = Quantity.from(input.stockOnHandQuantity).add(Quantity.from(input.incomingQuantity));
  const reorderLevel = Quantity.from(input.reorderLevel);
  const needsReorder = projected.compare(reorderLevel) <= 0;
  return {
    needsReorder,
    projectedQuantity: projected.toDecimalString(),
    suggestedOrderQuantity: needsReorder ? Quantity.from(input.reorderQuantity).toDecimalString() : Quantity.zero().toDecimalString()
  };
}
