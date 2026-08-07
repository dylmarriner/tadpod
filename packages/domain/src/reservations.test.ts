import { describe, expect, it } from 'vitest';
import {
  computeAvailableStock,
  computeAvailableToPromise,
  orderDemands,
  planAllocationRun,
  planReservation,
  validateReservationWithinStock,
  type ReservationDemand
} from './reservations.js';

function demand(overrides: Partial<ReservationDemand> = {}): ReservationDemand {
  return {
    salesOrderId: 'order-1',
    salesOrderLineId: 'line-1',
    quantity: '5',
    priority: 5,
    promisedDate: null,
    confirmedAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

describe('computeAvailableStock', () => {
  it('subtracts active reservations from stock on hand', () => {
    expect(computeAvailableStock('100', '30')).toBe('70.0000');
  });

  it('reports a negative availability rather than clamping when stock was written down below reservations', () => {
    expect(computeAvailableStock('10', '25')).toBe('-15.0000');
  });
});

describe('computeAvailableToPromise', () => {
  it('adds confirmed incoming stock and subtracts reservations and open backorders', () => {
    expect(
      computeAvailableToPromise({
        stockOnHandQuantity: '100',
        incomingQuantity: '50',
        activeReservedQuantity: '40',
        openBackorderedQuantity: '30'
      })
    ).toBe('80.0000');
  });

  it('never counts incoming stock that is already promised to a backorder twice', () => {
    expect(
      computeAvailableToPromise({ stockOnHandQuantity: '0', incomingQuantity: '20', activeReservedQuantity: '0', openBackorderedQuantity: '20' })
    ).toBe('0.0000');
  });

  it('goes negative when commitments exceed stock plus incoming supply', () => {
    expect(
      computeAvailableToPromise({ stockOnHandQuantity: '5', incomingQuantity: '0', activeReservedQuantity: '5', openBackorderedQuantity: '10' })
    ).toBe('-10.0000');
  });
});

describe('planReservation', () => {
  it('reserves the whole request when stock is fully available', () => {
    expect(planReservation('10', '25')).toEqual({ reserveQuantity: '10.0000', shortfallQuantity: '0.0000' });
  });

  it('reserves only what is available and reports the shortfall (partial availability)', () => {
    expect(planReservation('10', '4')).toEqual({ reserveQuantity: '4.0000', shortfallQuantity: '6.0000' });
  });

  it('reserves nothing and reports a full shortfall when no stock is available (full backorder)', () => {
    expect(planReservation('10', '0')).toEqual({ reserveQuantity: '0.0000', shortfallQuantity: '10.0000' });
  });

  it('never reserves against negative availability', () => {
    expect(planReservation('10', '-5')).toEqual({ reserveQuantity: '0.0000', shortfallQuantity: '10.0000' });
  });

  it('rejects a negative request', () => {
    expect(() => planReservation('-1', '10')).toThrow();
  });
});

describe('orderDemands', () => {
  const a = demand({ salesOrderLineId: 'a', priority: 9, promisedDate: '2026-09-01T00:00:00.000Z', confirmedAt: '2026-08-01T00:00:00.000Z' });
  const b = demand({ salesOrderLineId: 'b', priority: 1, promisedDate: '2026-10-01T00:00:00.000Z', confirmedAt: '2026-08-02T00:00:00.000Z' });
  const c = demand({ salesOrderLineId: 'c', priority: 5, promisedDate: null, confirmedAt: '2026-08-03T00:00:00.000Z' });

  it('orders by priority, most urgent first', () => {
    expect(orderDemands([a, b, c], 'PRIORITY').map((d) => d.salesOrderLineId)).toEqual(['b', 'c', 'a']);
  });

  it('orders by promised delivery date, with unpromised demand last', () => {
    expect(orderDemands([c, b, a], 'PROMISED_DATE').map((d) => d.salesOrderLineId)).toEqual(['a', 'b', 'c']);
  });

  it('orders oldest confirmed order first', () => {
    expect(orderDemands([c, b, a], 'OLDEST_FIRST').map((d) => d.salesOrderLineId)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties deterministically by confirmation time then line id', () => {
    const first = demand({ salesOrderLineId: 'x', priority: 1 });
    const second = demand({ salesOrderLineId: 'y', priority: 1 });
    expect(orderDemands([second, first], 'PRIORITY').map((d) => d.salesOrderLineId)).toEqual(['x', 'y']);
  });

  it('does not mutate the input array', () => {
    const input = [c, b, a];
    orderDemands(input, 'PRIORITY');
    expect(input.map((d) => d.salesOrderLineId)).toEqual(['c', 'b', 'a']);
  });
});

describe('planAllocationRun', () => {
  it('gives the highest-priority demand the stock first and starves the rest', () => {
    const allocations = planAllocationRun(
      '6',
      [demand({ salesOrderLineId: 'low', priority: 9, quantity: '5' }), demand({ salesOrderLineId: 'high', priority: 1, quantity: '5' })],
      'PRIORITY'
    );
    expect(allocations).toEqual([
      { salesOrderId: 'order-1', salesOrderLineId: 'high', quantity: '5.0000', shortfallQuantity: '0.0000' },
      { salesOrderId: 'order-1', salesOrderLineId: 'low', quantity: '1.0000', shortfallQuantity: '4.0000' }
    ]);
  });

  it('allocates to the oldest confirmed order first', () => {
    const allocations = planAllocationRun(
      '5',
      [
        demand({ salesOrderLineId: 'new', confirmedAt: '2026-08-05T00:00:00.000Z', quantity: '5' }),
        demand({ salesOrderLineId: 'old', confirmedAt: '2026-08-01T00:00:00.000Z', quantity: '5' })
      ],
      'OLDEST_FIRST'
    );
    expect(allocations[0]).toMatchObject({ salesOrderLineId: 'old', quantity: '5.0000' });
    expect(allocations[1]).toMatchObject({ salesOrderLineId: 'new', quantity: '0.0000', shortfallQuantity: '5.0000' });
  });

  it('never allocates more than the available stock in total', () => {
    const allocations = planAllocationRun('7', [demand({ salesOrderLineId: '1', quantity: '5' }), demand({ salesOrderLineId: '2', quantity: '5' })], 'OLDEST_FIRST');
    const total = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
    expect(total).toBe(7);
  });

  it('allocates nothing when availability is zero or negative', () => {
    expect(planAllocationRun('-3', [demand()], 'OLDEST_FIRST')).toEqual([
      { salesOrderId: 'order-1', salesOrderLineId: 'line-1', quantity: '0.0000', shortfallQuantity: '5.0000' }
    ]);
  });
});

describe('validateReservationWithinStock', () => {
  it('accepts a reservation that exactly consumes the remaining stock', () => {
    expect(() => validateReservationWithinStock('10', '6', '4')).not.toThrow();
  });

  it('rejects a reservation that would oversubscribe stock on hand (concurrent reservation guard)', () => {
    expect(() => validateReservationWithinStock('10', '6', '5')).toThrow(/above stock on hand/);
  });
});
