import { describe, expect, it } from 'vitest';
import { computeCustomerAccount, computeStatementBalance, netAccountsReceivable, type CustomerInvoiceForAccount } from './customer-account.js';

function invoice(overrides: Partial<CustomerInvoiceForAccount> = {}): CustomerInvoiceForAccount {
  return { totalMinorUnits: 10_000n, appliedMinorUnits: 0n, dueDate: new Date('2026-08-15T00:00:00.000Z'), ...overrides };
}

describe('computeCustomerAccount', () => {
  const asOf = new Date('2026-08-07T00:00:00.000Z');

  it('sums outstanding balances into amountOwed', () => {
    const account = computeCustomerAccount([invoice({ totalMinorUnits: 10_000n, appliedMinorUnits: 4_000n })], asOf);
    expect(account.amountOwedMinorUnits).toBe(6_000n);
  });

  it('buckets an overdue invoice (statement balance / aged receivables)', () => {
    const account = computeCustomerAccount([invoice({ dueDate: new Date('2026-08-01T00:00:00.000Z') })], asOf);
    expect(account.overdueMinorUnits).toBe(10_000n);
    expect(account.dueWithin7DaysMinorUnits).toBe(0n);
  });

  it('buckets an invoice due within 7 days', () => {
    const account = computeCustomerAccount([invoice({ dueDate: new Date('2026-08-10T00:00:00.000Z') })], asOf);
    expect(account.dueWithin7DaysMinorUnits).toBe(10_000n);
    expect(account.dueWithin30DaysMinorUnits).toBe(10_000n);
  });

  it('excludes fully paid invoices', () => {
    const account = computeCustomerAccount([invoice({ appliedMinorUnits: 10_000n })], asOf);
    expect(account.amountOwedMinorUnits).toBe(0n);
  });

  it('aggregates across multiple invoices', () => {
    const account = computeCustomerAccount(
      [invoice({ dueDate: new Date('2026-08-01T00:00:00.000Z') }), invoice({ dueDate: new Date('2026-08-10T00:00:00.000Z') })],
      asOf
    );
    expect(account.amountOwedMinorUnits).toBe(20_000n);
    expect(account.overdueMinorUnits).toBe(10_000n);
    expect(account.dueWithin7DaysMinorUnits).toBe(10_000n);
  });
});

describe('netAccountsReceivable / computeStatementBalance', () => {
  it('subtracts unapplied credit from the amount owed and reproduces the same result both ways', () => {
    expect(netAccountsReceivable(10_000n, 3_000n)).toBe(7_000n);
    expect(computeStatementBalance(10_000n, 3_000n)).toBe(7_000n);
  });
});
