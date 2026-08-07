import { describe, expect, it } from 'vitest';
import {
  computeCustomerInvoiceOutstandingMinorUnits,
  computeUninvoicedQuantity,
  deriveCustomerInvoiceDisplayStatus,
  deriveCustomerInvoiceStatus,
  validateInvoiceLineQuantity
} from './customer-invoice.js';

describe('deriveCustomerInvoiceStatus', () => {
  it('is UNPAID when nothing has been applied', () => {
    expect(deriveCustomerInvoiceStatus(10_000n, 0n)).toBe('UNPAID');
  });

  it('is PARTIALLY_PAID when some but not all has been applied (partial payment)', () => {
    expect(deriveCustomerInvoiceStatus(10_000n, 4_000n)).toBe('PARTIALLY_PAID');
  });

  it('is PAID once applied covers the total (full payment)', () => {
    expect(deriveCustomerInvoiceStatus(10_000n, 10_000n)).toBe('PAID');
  });

  it('is PAID even if applied slightly overshoots due to a credit application', () => {
    expect(deriveCustomerInvoiceStatus(10_000n, 10_050n)).toBe('PAID');
  });
});

describe('computeCustomerInvoiceOutstandingMinorUnits', () => {
  it('subtracts applied from total', () => {
    expect(computeCustomerInvoiceOutstandingMinorUnits(10_000n, 4_000n)).toBe(6_000n);
  });

  it('never goes negative', () => {
    expect(computeCustomerInvoiceOutstandingMinorUnits(10_000n, 12_000n)).toBe(0n);
  });
});

describe('deriveCustomerInvoiceDisplayStatus', () => {
  const now = new Date('2026-08-07T00:00:00.000Z');

  it('reports OVERDUE for an unpaid invoice past its due date', () => {
    expect(deriveCustomerInvoiceDisplayStatus('UNPAID', new Date('2026-08-01T00:00:00.000Z'), now)).toBe('OVERDUE');
  });

  it('reports OVERDUE for a partially paid invoice past its due date', () => {
    expect(deriveCustomerInvoiceDisplayStatus('PARTIALLY_PAID', new Date('2026-08-01T00:00:00.000Z'), now)).toBe('OVERDUE');
  });

  it('reports the stored status when not yet due', () => {
    expect(deriveCustomerInvoiceDisplayStatus('UNPAID', new Date('2026-09-01T00:00:00.000Z'), now)).toBe('UNPAID');
  });

  it('never reports a paid, voided, or credited invoice as overdue', () => {
    expect(deriveCustomerInvoiceDisplayStatus('PAID', new Date('2026-01-01T00:00:00.000Z'), now)).toBe('PAID');
    expect(deriveCustomerInvoiceDisplayStatus('VOIDED', new Date('2026-01-01T00:00:00.000Z'), now)).toBe('VOIDED');
    expect(deriveCustomerInvoiceDisplayStatus('CREDITED', new Date('2026-01-01T00:00:00.000Z'), now)).toBe('CREDITED');
  });
});

describe('computeUninvoicedQuantity', () => {
  it('subtracts invoiced from delivered', () => {
    expect(computeUninvoicedQuantity({ deliveredQuantity: '10', invoicedQuantity: '4' })).toBe('6.0000');
  });

  it('never goes negative', () => {
    expect(computeUninvoicedQuantity({ deliveredQuantity: '10', invoicedQuantity: '10' })).toBe('0.0000');
  });
});

describe('validateInvoiceLineQuantity', () => {
  it('accepts a quantity within what is uninvoiced', () => {
    expect(() => validateInvoiceLineQuantity({ deliveredQuantity: '10', invoicedQuantity: '0' }, '10')).not.toThrow();
  });

  it('rejects a quantity beyond what is uninvoiced', () => {
    expect(() => validateInvoiceLineQuantity({ deliveredQuantity: '10', invoicedQuantity: '4' }, '7')).toThrow(/delivered and not yet invoiced/);
  });

  it('rejects a zero or negative quantity', () => {
    expect(() => validateInvoiceLineQuantity({ deliveredQuantity: '10', invoicedQuantity: '0' }, '0')).toThrow(/greater than zero/);
  });
});
