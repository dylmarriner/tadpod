import { describe, expect, it } from 'vitest';
import { planPaymentAllocation, planCreditApplication, validateManualAllocation, type OpenBillForAllocation } from './supplier-payment.js';

function bill(overrides: Partial<OpenBillForAllocation> = {}): OpenBillForAllocation {
  return { supplierBillId: 'bill-1', outstandingMinorUnits: 10_000n, issueDate: '2026-08-01T00:00:00.000Z', ...overrides };
}

describe('planPaymentAllocation', () => {
  it('covers a single bill in full', () => {
    const plan = planPaymentAllocation(10_000n, [bill()]);
    expect(plan.allocations).toEqual([{ supplierBillId: 'bill-1', amountMinorUnits: 10_000n }]);
    expect(plan.unappliedMinorUnits).toBe(0n);
  });

  it('covers multiple bills oldest first', () => {
    const plan = planPaymentAllocation(15_000n, [
      bill({ supplierBillId: 'new', issueDate: '2026-08-05T00:00:00.000Z', outstandingMinorUnits: 10_000n }),
      bill({ supplierBillId: 'old', issueDate: '2026-08-01T00:00:00.000Z', outstandingMinorUnits: 10_000n })
    ]);
    expect(plan.allocations).toEqual([
      { supplierBillId: 'old', amountMinorUnits: 10_000n },
      { supplierBillId: 'new', amountMinorUnits: 5_000n }
    ]);
  });

  it('leaves an overpayment as unapplied credit', () => {
    const plan = planPaymentAllocation(15_000n, [bill({ outstandingMinorUnits: 10_000n })]);
    expect(plan.unappliedMinorUnits).toBe(5_000n);
  });

  it('rejects a negative payment amount', () => {
    expect(() => planPaymentAllocation(-1n, [bill()])).toThrow(/cannot be negative/);
  });
});

describe('planCreditApplication', () => {
  it('applies a credit across bills the same way a payment would', () => {
    const plan = planCreditApplication(6_000n, [bill({ outstandingMinorUnits: 10_000n })]);
    expect(plan.allocations).toEqual([{ supplierBillId: 'bill-1', amountMinorUnits: 6_000n }]);
  });
});

describe('validateManualAllocation', () => {
  it('accepts a manual allocation within outstanding balances and the available amount', () => {
    expect(() =>
      validateManualAllocation(10_000n, [
        { supplierBillId: 'a', outstandingMinorUnits: 6_000n, amountMinorUnits: 6_000n },
        { supplierBillId: 'b', outstandingMinorUnits: 4_000n, amountMinorUnits: 4_000n }
      ])
    ).not.toThrow();
  });

  it('rejects a line that exceeds its own bill balance', () => {
    expect(() => validateManualAllocation(10_000n, [{ supplierBillId: 'a', outstandingMinorUnits: 5_000n, amountMinorUnits: 6_000n }])).toThrow(/exceed its outstanding balance/);
  });

  it('rejects a total that exceeds what is available to allocate', () => {
    expect(() =>
      validateManualAllocation(5_000n, [
        { supplierBillId: 'a', outstandingMinorUnits: 6_000n, amountMinorUnits: 3_000n },
        { supplierBillId: 'b', outstandingMinorUnits: 6_000n, amountMinorUnits: 3_000n }
      ])
    ).toThrow(/exceeds the/);
  });
});
