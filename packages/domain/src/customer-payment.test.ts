import { describe, expect, it } from 'vitest';
import { planPaymentAllocation, planCreditApplication, validateManualAllocation, type OpenInvoiceForAllocation } from './customer-payment.js';

function invoice(overrides: Partial<OpenInvoiceForAllocation> = {}): OpenInvoiceForAllocation {
  return { customerInvoiceId: 'inv-1', outstandingMinorUnits: 10_000n, issueDate: '2026-08-01T00:00:00.000Z', ...overrides };
}

describe('planPaymentAllocation', () => {
  it('covers a single invoice in full (full payment)', () => {
    const plan = planPaymentAllocation(10_000n, [invoice()]);
    expect(plan.allocations).toEqual([{ customerInvoiceId: 'inv-1', amountMinorUnits: 10_000n }]);
    expect(plan.unappliedMinorUnits).toBe(0n);
  });

  it('partially covers a single invoice (partial payment)', () => {
    const plan = planPaymentAllocation(4_000n, [invoice()]);
    expect(plan.allocations).toEqual([{ customerInvoiceId: 'inv-1', amountMinorUnits: 4_000n }]);
    expect(plan.unappliedMinorUnits).toBe(0n);
  });

  it('covers multiple invoices oldest first (one payment covering multiple invoices)', () => {
    const plan = planPaymentAllocation(15_000n, [
      invoice({ customerInvoiceId: 'new', issueDate: '2026-08-05T00:00:00.000Z', outstandingMinorUnits: 10_000n }),
      invoice({ customerInvoiceId: 'old', issueDate: '2026-08-01T00:00:00.000Z', outstandingMinorUnits: 10_000n })
    ]);
    expect(plan.allocations).toEqual([
      { customerInvoiceId: 'old', amountMinorUnits: 10_000n },
      { customerInvoiceId: 'new', amountMinorUnits: 5_000n }
    ]);
    expect(plan.unappliedMinorUnits).toBe(0n);
  });

  it('leaves an overpayment as unapplied credit (overpayment creating credit)', () => {
    const plan = planPaymentAllocation(15_000n, [invoice({ outstandingMinorUnits: 10_000n })]);
    expect(plan.allocations).toEqual([{ customerInvoiceId: 'inv-1', amountMinorUnits: 10_000n }]);
    expect(plan.unappliedMinorUnits).toBe(5_000n);
  });

  it('skips invoices with nothing outstanding', () => {
    const plan = planPaymentAllocation(5_000n, [invoice({ customerInvoiceId: 'paid', outstandingMinorUnits: 0n }), invoice({ customerInvoiceId: 'open', outstandingMinorUnits: 5_000n })]);
    expect(plan.allocations).toEqual([{ customerInvoiceId: 'open', amountMinorUnits: 5_000n }]);
  });

  it('rejects a negative payment amount', () => {
    expect(() => planPaymentAllocation(-1n, [invoice()])).toThrow(/cannot be negative/);
  });

  it('does not mutate the input array', () => {
    const input = [invoice({ customerInvoiceId: 'b', issueDate: '2026-08-02T00:00:00.000Z' }), invoice({ customerInvoiceId: 'a', issueDate: '2026-08-01T00:00:00.000Z' })];
    planPaymentAllocation(1_000n, input);
    expect(input.map((i) => i.customerInvoiceId)).toEqual(['b', 'a']);
  });
});

describe('planCreditApplication', () => {
  it('applies a credit across invoices the same way a payment would (credit applied later)', () => {
    const plan = planCreditApplication(6_000n, [invoice({ outstandingMinorUnits: 10_000n })]);
    expect(plan.allocations).toEqual([{ customerInvoiceId: 'inv-1', amountMinorUnits: 6_000n }]);
  });
});

describe('validateManualAllocation', () => {
  it('accepts a manual allocation within outstanding balances and the available amount (manual allocation)', () => {
    expect(() =>
      validateManualAllocation(10_000n, [
        { customerInvoiceId: 'a', outstandingMinorUnits: 6_000n, amountMinorUnits: 6_000n },
        { customerInvoiceId: 'b', outstandingMinorUnits: 4_000n, amountMinorUnits: 4_000n }
      ])
    ).not.toThrow();
  });

  it('rejects a line that exceeds its own invoice balance', () => {
    expect(() => validateManualAllocation(10_000n, [{ customerInvoiceId: 'a', outstandingMinorUnits: 5_000n, amountMinorUnits: 6_000n }])).toThrow(/exceed its outstanding balance/);
  });

  it('rejects a total that exceeds what is available to allocate', () => {
    expect(() =>
      validateManualAllocation(5_000n, [
        { customerInvoiceId: 'a', outstandingMinorUnits: 6_000n, amountMinorUnits: 3_000n },
        { customerInvoiceId: 'b', outstandingMinorUnits: 6_000n, amountMinorUnits: 3_000n }
      ])
    ).toThrow(/exceeds the/);
  });

  it('rejects a zero or negative line amount', () => {
    expect(() => validateManualAllocation(10_000n, [{ customerInvoiceId: 'a', outstandingMinorUnits: 5_000n, amountMinorUnits: 0n }])).toThrow(/greater than zero/);
  });
});
