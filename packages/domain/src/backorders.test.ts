import { describe, expect, it } from 'vitest';
import {
  computeBackorderQuantity,
  computeBackorderOpenQuantity,
  deriveBackorderStatus,
  planIncomingAllocation,
  suggestPurchaseQuantity,
  validateBackorderQuantityChange,
  type BackorderLineQuantities,
  type IncomingAllocationDemand
} from './backorders.js';

function line(overrides: Partial<BackorderLineQuantities> = {}): BackorderLineQuantities {
  return { quantity: '10', allocatedQuantity: '0', fulfilledQuantity: '0', cancelledQuantity: '0', ...overrides };
}

describe('computeBackorderQuantity', () => {
  it('is zero when a line is fully reserved (full stock availability)', () => {
    expect(computeBackorderQuantity({ orderedQuantity: '10', deliveredQuantity: '0', cancelledQuantity: '0', reservedQuantity: '10' })).toBe('0.0000');
  });

  it('reports the shortfall when only some of the line is reserved (partial availability)', () => {
    expect(computeBackorderQuantity({ orderedQuantity: '10', deliveredQuantity: '0', cancelledQuantity: '0', reservedQuantity: '4' })).toBe('6.0000');
  });

  it('reports the full quantity when nothing is reserved (full backorder)', () => {
    expect(computeBackorderQuantity({ orderedQuantity: '10', deliveredQuantity: '0', cancelledQuantity: '0', reservedQuantity: '0' })).toBe('10.0000');
  });

  it('never goes negative', () => {
    expect(computeBackorderQuantity({ orderedQuantity: '10', deliveredQuantity: '0', cancelledQuantity: '0', reservedQuantity: '15' })).toBe('0.0000');
  });
});

describe('computeBackorderOpenQuantity', () => {
  it('subtracts fulfilled and cancelled from the line quantity', () => {
    expect(computeBackorderOpenQuantity(line({ quantity: '10', fulfilledQuantity: '3', cancelledQuantity: '2' }))).toBe('5.0000');
  });

  it('never goes negative', () => {
    expect(computeBackorderOpenQuantity(line({ quantity: '10', fulfilledQuantity: '10', cancelledQuantity: '5' }))).toBe('0.0000');
  });
});

describe('deriveBackorderStatus', () => {
  it('is PENDING_STOCK when nothing has been allocated yet', () => {
    expect(deriveBackorderStatus([line({ quantity: '10' })])).toBe('PENDING_STOCK');
  });

  it('is PARTIALLY_AVAILABLE when some incoming stock is allocated but not enough', () => {
    expect(deriveBackorderStatus([line({ quantity: '10', allocatedQuantity: '4' })])).toBe('PARTIALLY_AVAILABLE');
  });

  it('is READY_TO_FULFIL when allocation covers the full open quantity', () => {
    expect(deriveBackorderStatus([line({ quantity: '10', allocatedQuantity: '10' })])).toBe('READY_TO_FULFIL');
  });

  it('is PARTIALLY_FULFILLED after one of several fulfilments with quantity still open', () => {
    expect(deriveBackorderStatus([line({ quantity: '10', allocatedQuantity: '10', fulfilledQuantity: '4' })])).toBe('PARTIALLY_FULFILLED');
  });

  it('is FULFILLED once every line has been fully fulfilled', () => {
    expect(deriveBackorderStatus([line({ quantity: '10', fulfilledQuantity: '10' })])).toBe('FULFILLED');
  });

  it('is CANCELLED when every line was withdrawn without any fulfilment', () => {
    expect(deriveBackorderStatus([line({ quantity: '10', cancelledQuantity: '10' })])).toBe('CANCELLED');
  });

  it('aggregates across multiple lines', () => {
    expect(
      deriveBackorderStatus([line({ quantity: '10', fulfilledQuantity: '10' }), line({ quantity: '5', allocatedQuantity: '5' })])
    ).toBe('PARTIALLY_FULFILLED');
  });
});

describe('validateBackorderQuantityChange', () => {
  it('accepts reducing an untouched line', () => {
    expect(() => validateBackorderQuantityChange(line({ quantity: '10' }), '6')).not.toThrow();
  });

  it('rejects dropping below what has already been fulfilled or cancelled', () => {
    expect(() => validateBackorderQuantityChange(line({ quantity: '10', fulfilledQuantity: '4', cancelledQuantity: '2' }), '5')).toThrow(/already fulfilled or cancelled/);
  });

  it('rejects a zero or negative quantity — cancel the line instead', () => {
    expect(() => validateBackorderQuantityChange(line(), '0')).toThrow(/cancel the line instead/);
    expect(() => validateBackorderQuantityChange(line(), '-1')).toThrow();
  });
});

describe('planIncomingAllocation', () => {
  function demand(overrides: Partial<IncomingAllocationDemand> = {}): IncomingAllocationDemand {
    return { backorderLineId: 'line-1', outstandingQuantity: '5', priority: 5, createdAt: '2026-08-01T00:00:00.000Z', ...overrides };
  }

  it('allocates oldest backorder first by default', () => {
    const allocations = planIncomingAllocation(
      '5',
      [demand({ backorderLineId: 'new', createdAt: '2026-08-05T00:00:00.000Z' }), demand({ backorderLineId: 'old', createdAt: '2026-08-01T00:00:00.000Z' })]
    );
    expect(allocations).toEqual([{ backorderLineId: 'old', quantity: '5.0000' }]);
  });

  it('allocates by priority when requested', () => {
    const allocations = planIncomingAllocation(
      '5',
      [demand({ backorderLineId: 'low', priority: 9 }), demand({ backorderLineId: 'high', priority: 1 })],
      'PRIORITY'
    );
    expect(allocations[0]).toMatchObject({ backorderLineId: 'high', quantity: '5.0000' });
  });

  it('spreads incoming stock across several backorders (multiple fulfilments from one receipt)', () => {
    const allocations = planIncomingAllocation('8', [
      demand({ backorderLineId: 'a', outstandingQuantity: '5', createdAt: '2026-08-01T00:00:00.000Z' }),
      demand({ backorderLineId: 'b', outstandingQuantity: '5', createdAt: '2026-08-02T00:00:00.000Z' })
    ]);
    expect(allocations).toEqual([
      { backorderLineId: 'a', quantity: '5.0000' },
      { backorderLineId: 'b', quantity: '3.0000' }
    ]);
  });

  it('omits lines that receive nothing', () => {
    const allocations = planIncomingAllocation('2', [demand({ backorderLineId: 'a', outstandingQuantity: '2' }), demand({ backorderLineId: 'b', outstandingQuantity: '5' })]);
    expect(allocations.map((a) => a.backorderLineId)).toEqual(['a']);
  });

  it('returns nothing for zero or negative incoming quantity', () => {
    expect(planIncomingAllocation('0', [demand()])).toEqual([]);
    expect(planIncomingAllocation('-3', [demand()])).toEqual([]);
  });
});

describe('suggestPurchaseQuantity', () => {
  it('suggests the shortage net of incoming and open purchase quantity', () => {
    expect(suggestPurchaseQuantity({ shortageQuantity: '10', incomingQuantity: '2', openPurchaseQuantity: '3', reorderQuantity: '1' })).toBe('5.0000');
  });

  it('never suggests buying twice for supply already on order (purchase order generated from backorder)', () => {
    expect(suggestPurchaseQuantity({ shortageQuantity: '10', incomingQuantity: '5', openPurchaseQuantity: '5', reorderQuantity: '1' })).toBe('0.0000');
  });

  it('floors the suggestion at the reorder quantity', () => {
    expect(suggestPurchaseQuantity({ shortageQuantity: '1', incomingQuantity: '0', openPurchaseQuantity: '0', reorderQuantity: '20' })).toBe('20.0000');
  });
});
