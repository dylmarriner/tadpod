import { describe, expect, it } from 'vitest';
import {
  computeSupplierBillOutstandingMinorUnits,
  computeUnbilledQuantity,
  deriveSupplierBillDisplayStatus,
  deriveSupplierBillStatus,
  validateBillLineQuantity
} from './supplier-bill.js';

describe('deriveSupplierBillStatus', () => {
  it('is UNPAID when nothing has been applied', () => {
    expect(deriveSupplierBillStatus(10_000n, 0n)).toBe('UNPAID');
  });

  it('is PARTIALLY_PAID when some but not all has been applied', () => {
    expect(deriveSupplierBillStatus(10_000n, 4_000n)).toBe('PARTIALLY_PAID');
  });

  it('is PAID once applied covers the total', () => {
    expect(deriveSupplierBillStatus(10_000n, 10_000n)).toBe('PAID');
  });
});

describe('computeSupplierBillOutstandingMinorUnits', () => {
  it('subtracts applied from total and never goes negative', () => {
    expect(computeSupplierBillOutstandingMinorUnits(10_000n, 4_000n)).toBe(6_000n);
    expect(computeSupplierBillOutstandingMinorUnits(10_000n, 12_000n)).toBe(0n);
  });
});

describe('deriveSupplierBillDisplayStatus', () => {
  const now = new Date('2026-08-07T00:00:00.000Z');

  it('reports OVERDUE for an unpaid bill past its due date', () => {
    expect(deriveSupplierBillDisplayStatus('UNPAID', new Date('2026-08-01T00:00:00.000Z'), now)).toBe('OVERDUE');
  });

  it('reports the stored status when not yet due', () => {
    expect(deriveSupplierBillDisplayStatus('UNPAID', new Date('2026-09-01T00:00:00.000Z'), now)).toBe('UNPAID');
  });

  it('never reports a paid, voided, or credited bill as overdue', () => {
    expect(deriveSupplierBillDisplayStatus('PAID', new Date('2026-01-01T00:00:00.000Z'), now)).toBe('PAID');
    expect(deriveSupplierBillDisplayStatus('VOIDED', new Date('2026-01-01T00:00:00.000Z'), now)).toBe('VOIDED');
  });
});

describe('computeUnbilledQuantity / validateBillLineQuantity', () => {
  it('computes received minus billed, clamped at zero', () => {
    expect(computeUnbilledQuantity({ receivedQuantity: '10', billedQuantity: '4' })).toBe('6.0000');
    expect(computeUnbilledQuantity({ receivedQuantity: '10', billedQuantity: '10' })).toBe('0.0000');
  });

  it('accepts a quantity within what is unbilled and rejects beyond it', () => {
    expect(() => validateBillLineQuantity({ receivedQuantity: '10', billedQuantity: '0' }, '10')).not.toThrow();
    expect(() => validateBillLineQuantity({ receivedQuantity: '10', billedQuantity: '4' }, '7')).toThrow(/received and not yet billed/);
  });

  it('rejects a zero or negative quantity', () => {
    expect(() => validateBillLineQuantity({ receivedQuantity: '10', billedQuantity: '0' }, '0')).toThrow(/greater than zero/);
  });
});
