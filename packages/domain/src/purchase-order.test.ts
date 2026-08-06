import { describe, expect, it } from 'vitest';
import {
  computeLineProjection,
  computeLineTotalMinorUnits,
  computeOrderTotalMinorUnits,
  deriveFulfillmentStatus,
  validateEditingTransition
} from './purchase-order.js';

describe('validateEditingTransition', () => {
  it('allows draft to move to awaiting approval, confirmed, or cancelled', () => {
    expect(() => validateEditingTransition('DRAFT', 'AWAITING_APPROVAL')).not.toThrow();
    expect(() => validateEditingTransition('DRAFT', 'CONFIRMED')).not.toThrow();
    expect(() => validateEditingTransition('DRAFT', 'CANCELLED')).not.toThrow();
  });

  it('allows awaiting approval to move to confirmed or cancelled, but not back to draft', () => {
    expect(() => validateEditingTransition('AWAITING_APPROVAL', 'CONFIRMED')).not.toThrow();
    expect(() => validateEditingTransition('AWAITING_APPROVAL', 'CANCELLED')).not.toThrow();
    expect(() => validateEditingTransition('AWAITING_APPROVAL', 'DRAFT')).toThrow();
  });

  it('allows confirmed to move only to cancelled, not back to draft or awaiting approval', () => {
    expect(() => validateEditingTransition('CONFIRMED', 'CANCELLED')).not.toThrow();
    expect(() => validateEditingTransition('CONFIRMED', 'DRAFT')).toThrow();
    expect(() => validateEditingTransition('CONFIRMED', 'AWAITING_APPROVAL')).toThrow();
  });

  it('rejects any transition once a purchase order has moved past confirmed', () => {
    expect(() => validateEditingTransition('RECEIVED', 'CANCELLED')).toThrow();
    expect(() => validateEditingTransition('CANCELLED', 'DRAFT')).toThrow();
  });
});

describe('computeLineProjection', () => {
  it('computes outstanding and unbilled quantities', () => {
    const projection = computeLineProjection({ orderedQuantity: '10', receivedQuantity: '6', billedQuantity: '4' });
    expect(projection.outstandingQuantity).toBe('4.0000');
    expect(projection.unbilledQuantity).toBe('2.0000');
  });

  it('clamps outstanding and unbilled at zero even if received/billed exceed ordered (a tolerance override)', () => {
    const projection = computeLineProjection({ orderedQuantity: '10', receivedQuantity: '12', billedQuantity: '13' });
    expect(projection.outstandingQuantity).toBe('0.0000');
    expect(projection.unbilledQuantity).toBe('0.0000');
  });
});

describe('deriveFulfillmentStatus', () => {
  it('reports confirmed when nothing has been received', () => {
    expect(deriveFulfillmentStatus([{ orderedQuantity: '10', receivedQuantity: '0', billedQuantity: '0' }])).toBe('CONFIRMED');
  });

  it('reports partially received when some but not all lines are fully received', () => {
    expect(deriveFulfillmentStatus([{ orderedQuantity: '10', receivedQuantity: '4', billedQuantity: '0' }])).toBe('PARTIALLY_RECEIVED');
  });

  it('reports received once every line is fully received and nothing is billed', () => {
    expect(deriveFulfillmentStatus([{ orderedQuantity: '10', receivedQuantity: '10', billedQuantity: '0' }])).toBe('RECEIVED');
  });

  it('reports partially billed when some but not all received quantity is billed', () => {
    expect(deriveFulfillmentStatus([{ orderedQuantity: '10', receivedQuantity: '10', billedQuantity: '6' }])).toBe('PARTIALLY_BILLED');
  });

  it('reports billed only once fully received and fully billed', () => {
    expect(deriveFulfillmentStatus([{ orderedQuantity: '10', receivedQuantity: '10', billedQuantity: '10' }])).toBe('BILLED');
  });

  it('sums across multiple lines rather than judging each line in isolation', () => {
    const lines = [
      { orderedQuantity: '10', receivedQuantity: '10', billedQuantity: '10' },
      { orderedQuantity: '5', receivedQuantity: '2', billedQuantity: '0' }
    ];
    expect(deriveFulfillmentStatus(lines)).toBe('PARTIALLY_RECEIVED');
  });
});

describe('computeLineTotalMinorUnits', () => {
  it('multiplies unit cost by quantity for whole-unit quantities', () => {
    expect(computeLineTotalMinorUnits(1000n, '3')).toBe(3000n);
  });

  it('rounds fractional quantities to the nearest minor unit', () => {
    expect(computeLineTotalMinorUnits(1000n, '2.5')).toBe(2500n);
    expect(computeLineTotalMinorUnits(333n, '0.001')).toBe(0n);
  });
});

describe('computeOrderTotalMinorUnits', () => {
  it('sums line totals across a whole order', () => {
    const total = computeOrderTotalMinorUnits([
      { unitCostMinorUnits: 1000n, orderedQuantity: '3' },
      { unitCostMinorUnits: 500n, orderedQuantity: '2' }
    ]);
    expect(total).toBe(4000n);
  });

  it('returns zero for an order with no lines', () => {
    expect(computeOrderTotalMinorUnits([])).toBe(0n);
  });
});
