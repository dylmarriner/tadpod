import { describe, expect, it } from 'vitest';
import { Quantity } from './quantity.js';
import {
  buildReversal,
  computeStockByWarehouse,
  computeStockOnHand,
  validateMovementDirection
} from './inventory.js';

describe('validateMovementDirection', () => {
  it('accepts an increase type with a positive quantity', () => {
    expect(() => validateMovementDirection('OPENING_STOCK', Quantity.from('10'))).not.toThrow();
    expect(() => validateMovementDirection('GOODS_RECEIPT', Quantity.from('5'))).not.toThrow();
    expect(() => validateMovementDirection('CUSTOMER_RETURN', Quantity.from('1'))).not.toThrow();
    expect(() => validateMovementDirection('WAREHOUSE_TRANSFER_IN', Quantity.from('1'))).not.toThrow();
    expect(() => validateMovementDirection('POSITIVE_ADJUSTMENT', Quantity.from('1'))).not.toThrow();
  });

  it('rejects an increase type with a negative or zero quantity', () => {
    expect(() => validateMovementDirection('OPENING_STOCK', Quantity.from('-10'))).toThrow(/positive/);
    expect(() => validateMovementDirection('GOODS_RECEIPT', Quantity.zero())).toThrow(/cannot be zero/);
  });

  it('accepts a decrease type with a negative quantity', () => {
    expect(() => validateMovementDirection('SALES_DELIVERY', Quantity.from('-3'))).not.toThrow();
    expect(() => validateMovementDirection('SUPPLIER_RETURN', Quantity.from('-3'))).not.toThrow();
    expect(() => validateMovementDirection('WAREHOUSE_TRANSFER_OUT', Quantity.from('-3'))).not.toThrow();
    expect(() => validateMovementDirection('NEGATIVE_ADJUSTMENT', Quantity.from('-3'))).not.toThrow();
  });

  it('rejects a decrease type with a positive or zero quantity', () => {
    expect(() => validateMovementDirection('SALES_DELIVERY', Quantity.from('3'))).toThrow(/negative/);
    expect(() => validateMovementDirection('NEGATIVE_ADJUSTMENT', Quantity.zero())).toThrow(/cannot be zero/);
  });

  it('allows either sign for stock-count corrections and reversals, but not zero', () => {
    expect(() => validateMovementDirection('STOCK_COUNT_CORRECTION', Quantity.from('4'))).not.toThrow();
    expect(() => validateMovementDirection('STOCK_COUNT_CORRECTION', Quantity.from('-4'))).not.toThrow();
    expect(() => validateMovementDirection('STOCK_COUNT_CORRECTION', Quantity.zero())).toThrow(/cannot be zero/);
    expect(() => validateMovementDirection('REVERSAL', Quantity.from('4'))).not.toThrow();
    expect(() => validateMovementDirection('REVERSAL', Quantity.from('-4'))).not.toThrow();
  });
});

describe('computeStockOnHand', () => {
  it('sums posted increases and decreases', () => {
    const total = computeStockOnHand([
      { signedQuantity: Quantity.from('10') },
      { signedQuantity: Quantity.from('-3') },
      { signedQuantity: Quantity.from('2.5') }
    ]);
    expect(total.toDecimalString()).toBe('9.5000');
  });

  it('returns zero for an empty ledger', () => {
    expect(computeStockOnHand([]).isZero()).toBe(true);
  });
});

describe('computeStockByWarehouse', () => {
  it('groups totals per warehouse', () => {
    const totals = computeStockByWarehouse([
      { warehouseId: 'wh-1', signedQuantity: Quantity.from('10') },
      { warehouseId: 'wh-2', signedQuantity: Quantity.from('4') },
      { warehouseId: 'wh-1', signedQuantity: Quantity.from('-2') }
    ]);
    expect(totals.get('wh-1')?.toDecimalString()).toBe('8.0000');
    expect(totals.get('wh-2')?.toDecimalString()).toBe('4.0000');
    expect(totals.has('wh-3')).toBe(false);
  });
});

describe('buildReversal', () => {
  it('produces an equal-and-opposite movement linked to the original', () => {
    const original = {
      id: 'movement-1',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      signedQuantity: Quantity.from('7.5')
    };
    const reversal = buildReversal(original);
    expect(reversal.movementType).toBe('REVERSAL');
    expect(reversal.signedQuantity.toDecimalString()).toBe('-7.5000');
    expect(reversal.reversalOfId).toBe('movement-1');
    expect(reversal.productId).toBe('product-1');
    expect(reversal.warehouseId).toBe('warehouse-1');
    expect(reversal.sourceType).toBe('stock-movement-reversal');
    expect(reversal.sourceId).toBe('movement-1');
    expect(reversal.sourceLineId).toBe('movement-1');
  });

  it('reverses a negative movement back to positive', () => {
    const original = {
      id: 'movement-2',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      signedQuantity: Quantity.from('-4')
    };
    expect(buildReversal(original).signedQuantity.toDecimalString()).toBe('4.0000');
  });
});
