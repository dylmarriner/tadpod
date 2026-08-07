import { describe, expect, it } from 'vitest';
import {
  computeLineGrossMinorUnits,
  computeLineNetMinorUnits,
  computeSalesOrderLineProjection,
  computeSalesOrderTotalMinorUnits,
  deriveSalesOrderFulfilmentStatus,
  exceedsCreditLimit,
  validateLineQuantityBalance,
  validateSalesOrderEditingTransition,
  type SalesOrderLineQuantities
} from './sales-order.js';

function line(overrides: Partial<SalesOrderLineQuantities> = {}): SalesOrderLineQuantities {
  return {
    orderedQuantity: '10',
    reservedQuantity: '0',
    deliveredQuantity: '0',
    cancelledQuantity: '0',
    backorderedQuantity: '0',
    invoicedQuantity: '0',
    ...overrides
  };
}

describe('validateSalesOrderEditingTransition', () => {
  it('allows a draft to be confirmed or cancelled', () => {
    expect(() => validateSalesOrderEditingTransition('DRAFT', 'CONFIRMED')).not.toThrow();
    expect(() => validateSalesOrderEditingTransition('DRAFT', 'CANCELLED')).not.toThrow();
  });

  it('allows a confirmed order to be cancelled but never returned to draft', () => {
    expect(() => validateSalesOrderEditingTransition('CONFIRMED', 'CANCELLED')).not.toThrow();
    expect(() => validateSalesOrderEditingTransition('CONFIRMED', 'DRAFT')).toThrow();
  });

  it('rejects any transition once an order has been delivered or cancelled', () => {
    expect(() => validateSalesOrderEditingTransition('DELIVERED', 'CANCELLED')).toThrow();
    expect(() => validateSalesOrderEditingTransition('CANCELLED', 'DRAFT')).toThrow();
  });
});

describe('validateLineQuantityBalance', () => {
  it('accepts a line whose committed quantity exactly equals what was ordered', () => {
    expect(() =>
      validateLineQuantityBalance(line({ deliveredQuantity: '4', cancelledQuantity: '1', reservedQuantity: '3', backorderedQuantity: '2' }))
    ).not.toThrow();
  });

  it('rejects delivered plus cancelled plus reserved plus backordered exceeding ordered', () => {
    expect(() =>
      validateLineQuantityBalance(line({ deliveredQuantity: '5', cancelledQuantity: '1', reservedQuantity: '3', backorderedQuantity: '2' }))
    ).toThrow(/cannot exceed the ordered quantity/);
  });
});

describe('computeSalesOrderLineProjection', () => {
  it('derives outstanding, unreserved, deliverable, and uninvoiced quantities', () => {
    const projection = computeSalesOrderLineProjection(
      line({ deliveredQuantity: '2', cancelledQuantity: '1', reservedQuantity: '3', backorderedQuantity: '1', invoicedQuantity: '1' })
    );
    expect(projection.outstandingQuantity).toBe('7.0000');
    expect(projection.unreservedQuantity).toBe('3.0000');
    expect(projection.deliverableQuantity).toBe('3.0000');
    expect(projection.uninvoicedQuantity).toBe('1.0000');
  });

  it('clamps every projected quantity at zero', () => {
    const projection = computeSalesOrderLineProjection(line({ deliveredQuantity: '12', invoicedQuantity: '13' }));
    expect(projection.outstandingQuantity).toBe('0.0000');
    expect(projection.unreservedQuantity).toBe('0.0000');
    expect(projection.uninvoicedQuantity).toBe('0.0000');
  });
});

describe('deriveSalesOrderFulfilmentStatus', () => {
  it('reports confirmed when nothing is reserved, delivered, or backordered', () => {
    expect(deriveSalesOrderFulfilmentStatus([line()])).toBe('CONFIRMED');
  });

  it('reports allocated when every ordered unit is reserved (full stock availability)', () => {
    expect(deriveSalesOrderFulfilmentStatus([line({ reservedQuantity: '10' })])).toBe('ALLOCATED');
  });

  it('reports partially allocated when only some of the demand is reserved (partial availability)', () => {
    expect(deriveSalesOrderFulfilmentStatus([line({ reservedQuantity: '4', backorderedQuantity: '6' })])).toBe('PARTIALLY_ALLOCATED');
  });

  it('reports backordered when nothing could be reserved at all (full backorder)', () => {
    expect(deriveSalesOrderFulfilmentStatus([line({ backorderedQuantity: '10' })])).toBe('BACKORDERED');
  });

  it('reports partially delivered while any quantity is still outstanding', () => {
    expect(deriveSalesOrderFulfilmentStatus([line({ deliveredQuantity: '4', reservedQuantity: '6' })])).toBe('PARTIALLY_DELIVERED');
  });

  it('reports delivered once delivered plus cancelled covers the whole order', () => {
    expect(deriveSalesOrderFulfilmentStatus([line({ deliveredQuantity: '8', cancelledQuantity: '2' })])).toBe('DELIVERED');
  });

  it('reports cancelled when the whole order was withdrawn without a single delivery', () => {
    expect(deriveSalesOrderFulfilmentStatus([line({ cancelledQuantity: '10' })])).toBe('CANCELLED');
  });

  it('sums across lines rather than judging each line in isolation', () => {
    expect(deriveSalesOrderFulfilmentStatus([line({ reservedQuantity: '10' }), line({ orderedQuantity: '5', backorderedQuantity: '5' })])).toBe(
      'PARTIALLY_ALLOCATED'
    );
  });
});

describe('sales order money calculations', () => {
  it('multiplies unit price by quantity, rounding to the nearest minor unit', () => {
    expect(computeLineGrossMinorUnits(1250n, '3')).toBe(3750n);
    expect(computeLineGrossMinorUnits(1000n, '2.5')).toBe(2500n);
  });

  it('applies a line discount expressed in basis per million', () => {
    expect(computeLineNetMinorUnits(10000n, '1', 125_000)).toBe(8750n);
    expect(computeLineNetMinorUnits(10000n, '1', 0)).toBe(10000n);
    expect(computeLineNetMinorUnits(10000n, '1', 1_000_000)).toBe(0n);
  });

  it('rejects a discount outside 0-100%', () => {
    expect(() => computeLineNetMinorUnits(10000n, '1', 1_000_001)).toThrow();
    expect(() => computeLineNetMinorUnits(10000n, '1', -1)).toThrow();
  });

  it('sums net line totals across a whole order', () => {
    const total = computeSalesOrderTotalMinorUnits([
      { unitPriceMinorUnits: 1000n, orderedQuantity: '3' },
      { unitPriceMinorUnits: 2000n, orderedQuantity: '1', discountPercentBasis: 500_000 }
    ]);
    expect(total).toBe(4000n);
  });

  it('returns zero for an order with no lines', () => {
    expect(computeSalesOrderTotalMinorUnits([])).toBe(0n);
  });
});

describe('exceedsCreditLimit', () => {
  it('treats a zero limit as no limit configured', () => {
    expect(exceedsCreditLimit(0n, 999_999n, 999_999n)).toBe(false);
  });

  it('compares the existing balance plus this order against the limit', () => {
    expect(exceedsCreditLimit(100_00n, 60_00n, 30_00n)).toBe(false);
    expect(exceedsCreditLimit(100_00n, 60_00n, 40_00n)).toBe(false);
    expect(exceedsCreditLimit(100_00n, 60_00n, 40_01n)).toBe(true);
  });
});
