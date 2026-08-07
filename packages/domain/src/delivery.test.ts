import { describe, expect, it } from 'vitest';
import {
  buildDeliveryMovements,
  computeOutstandingDeliveryQuantity,
  planDeliveryLines,
  planReservationConsumption,
  validateDeliveryQuantity,
  type DeliverableLine
} from './delivery.js';

function line(overrides: Partial<DeliverableLine> = {}): DeliverableLine {
  return {
    salesOrderLineId: 'line-1',
    productId: 'product-1',
    orderedQuantity: '10',
    reservedQuantity: '10',
    deliveredQuantity: '0',
    cancelledQuantity: '0',
    ...overrides
  };
}

describe('computeOutstandingDeliveryQuantity', () => {
  it('subtracts delivered and cancelled from ordered', () => {
    expect(computeOutstandingDeliveryQuantity(line({ deliveredQuantity: '3', cancelledQuantity: '2' }))).toBe('5.0000');
  });

  it('never goes negative', () => {
    expect(computeOutstandingDeliveryQuantity(line({ deliveredQuantity: '10', cancelledQuantity: '5' }))).toBe('0.0000');
  });
});

describe('planDeliveryLines', () => {
  it('ships everything outstanding in ALL mode', () => {
    expect(planDeliveryLines([line({ orderedQuantity: '10', deliveredQuantity: '3' })], 'ALL')).toEqual([
      { salesOrderLineId: 'line-1', productId: 'product-1', quantity: '7.0000' }
    ]);
  });

  it('ships only what is reserved in AVAILABLE mode (partial delivery)', () => {
    expect(planDeliveryLines([line({ orderedQuantity: '10', reservedQuantity: '4' })], 'AVAILABLE')).toEqual([
      { salesOrderLineId: 'line-1', productId: 'product-1', quantity: '4.0000' }
    ]);
  });

  it('caps AVAILABLE mode at what is still outstanding, not just what is reserved', () => {
    expect(planDeliveryLines([line({ orderedQuantity: '10', deliveredQuantity: '8', reservedQuantity: '10' })], 'AVAILABLE')).toEqual([
      { salesOrderLineId: 'line-1', productId: 'product-1', quantity: '2.0000' }
    ]);
  });

  it('ships exactly the requested quantities in SELECTED mode (customer-requested partial shipment)', () => {
    expect(
      planDeliveryLines([line({ salesOrderLineId: 'a' }), line({ salesOrderLineId: 'b' })], 'SELECTED', [{ salesOrderLineId: 'a', quantity: '3' }])
    ).toEqual([{ salesOrderLineId: 'a', productId: 'product-1', quantity: '3.0000' }]);
  });

  it('drops lines that would ship nothing', () => {
    expect(planDeliveryLines([line({ orderedQuantity: '5', deliveredQuantity: '5' })], 'ALL')).toEqual([]);
  });
});

describe('validateDeliveryQuantity', () => {
  it('accepts a quantity within what is outstanding', () => {
    expect(() => validateDeliveryQuantity(line({ orderedQuantity: '10' }), '10')).not.toThrow();
  });

  it('rejects a quantity beyond what is outstanding', () => {
    expect(() => validateDeliveryQuantity(line({ orderedQuantity: '10', deliveredQuantity: '8' }), '5')).toThrow(/still outstanding/);
  });

  it('rejects a zero or negative quantity', () => {
    expect(() => validateDeliveryQuantity(line(), '0')).toThrow(/greater than zero/);
  });
});

describe('planReservationConsumption', () => {
  it('consumes the reservation first when the delivery is fully covered', () => {
    expect(planReservationConsumption('10', '6')).toEqual({ consumedReservationQuantity: '6.0000', unreservedQuantity: '0.0000' });
  });

  it('ships the excess from unreserved stock once the reservation is exhausted (reservation and release)', () => {
    expect(planReservationConsumption('4', '10')).toEqual({ consumedReservationQuantity: '4.0000', unreservedQuantity: '6.0000' });
  });

  it('consumes nothing when there was no reservation', () => {
    expect(planReservationConsumption('0', '5')).toEqual({ consumedReservationQuantity: '0.0000', unreservedQuantity: '5.0000' });
  });
});

describe('buildDeliveryMovements', () => {
  it('builds one negative SALES_DELIVERY movement per line, keyed to the delivery line id (duplicate delivery prevention)', () => {
    const movements = buildDeliveryMovements('delivery-1', 'warehouse-1', [
      { id: 'dl-1', productId: 'product-1', quantity: '3' },
      { id: 'dl-2', productId: 'product-2', quantity: '5' }
    ]);
    expect(movements).toEqual([
      {
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        movementType: 'SALES_DELIVERY',
        signedQuantity: '-3.0000',
        sourceType: 'delivery-line',
        sourceId: 'delivery-1',
        sourceLineId: 'dl-1'
      },
      {
        productId: 'product-2',
        warehouseId: 'warehouse-1',
        movementType: 'SALES_DELIVERY',
        signedQuantity: '-5.0000',
        sourceType: 'delivery-line',
        sourceId: 'delivery-1',
        sourceLineId: 'dl-2'
      }
    ]);
  });
});
