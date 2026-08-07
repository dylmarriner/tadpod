import { describe, expect, it } from 'vitest';
import { computeSupplierAccount, computeSupplierStatementBalance, netAccountsPayable } from './supplier-account.js';

const asOf = new Date('2026-08-06T00:00:00Z');

function days(offset: number): Date {
  return new Date(asOf.getTime() + offset * 24 * 60 * 60 * 1000);
}

describe('computeSupplierAccount', () => {
  it('returns all zeros when there are no bills', () => {
    expect(computeSupplierAccount([], asOf)).toEqual({
      amountOwedMinorUnits: 0n,
      overdueMinorUnits: 0n,
      dueWithin7DaysMinorUnits: 0n,
      dueWithin30DaysMinorUnits: 0n
    });
  });

  it('sums outstanding balance as amount minus paid minus credited', () => {
    const projection = computeSupplierAccount(
      [{ amountMinorUnits: 10_000n, paidMinorUnits: 3_000n, creditedMinorUnits: 1_000n, dueDate: days(10) }],
      asOf
    );
    expect(projection.amountOwedMinorUnits).toBe(6_000n);
  });

  it('never lets a bill go negative when paid plus credited exceeds the amount', () => {
    const projection = computeSupplierAccount(
      [{ amountMinorUnits: 5_000n, paidMinorUnits: 4_000n, creditedMinorUnits: 2_000n, dueDate: days(10) }],
      asOf
    );
    expect(projection.amountOwedMinorUnits).toBe(0n);
  });

  it('buckets overdue, due-within-7, and due-within-30 independently, not mutually exclusively', () => {
    const projection = computeSupplierAccount(
      [
        { amountMinorUnits: 1_000n, paidMinorUnits: 0n, creditedMinorUnits: 0n, dueDate: days(-5) },
        { amountMinorUnits: 2_000n, paidMinorUnits: 0n, creditedMinorUnits: 0n, dueDate: days(3) },
        { amountMinorUnits: 4_000n, paidMinorUnits: 0n, creditedMinorUnits: 0n, dueDate: days(20) },
        { amountMinorUnits: 8_000n, paidMinorUnits: 0n, creditedMinorUnits: 0n, dueDate: days(45) }
      ],
      asOf
    );
    expect(projection.amountOwedMinorUnits).toBe(15_000n);
    expect(projection.overdueMinorUnits).toBe(1_000n);
    expect(projection.dueWithin7DaysMinorUnits).toBe(2_000n);
    expect(projection.dueWithin30DaysMinorUnits).toBe(6_000n);
  });

  it('excludes fully paid bills from every bucket', () => {
    const projection = computeSupplierAccount(
      [{ amountMinorUnits: 1_000n, paidMinorUnits: 1_000n, creditedMinorUnits: 0n, dueDate: days(-1) }],
      asOf
    );
    expect(projection.amountOwedMinorUnits).toBe(0n);
    expect(projection.overdueMinorUnits).toBe(0n);
  });
});

describe('netAccountsPayable', () => {
  it('subtracts unapplied credit from total amount owed', () => {
    expect(netAccountsPayable(10_000n, 2_500n)).toBe(7_500n);
  });

  it('returns zero total when there is nothing owed and no credit', () => {
    expect(netAccountsPayable(0n, 0n)).toBe(0n);
  });
});

describe('computeSupplierStatementBalance', () => {
  it('matches netAccountsPayable exactly, reproducing the account balance', () => {
    expect(computeSupplierStatementBalance(10_000n, 3_000n)).toBe(netAccountsPayable(10_000n, 3_000n));
  });
});
