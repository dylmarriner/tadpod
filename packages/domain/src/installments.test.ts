import { describe, expect, it } from 'vitest';
import { generateDepositAndFinalSchedule, generateRecurringSchedule, validateInstallmentSchedule } from './installments.js';

describe('validateInstallmentSchedule', () => {
  it('accepts a schedule that sums exactly to the invoice total', () => {
    expect(() =>
      validateInstallmentSchedule([{ dueDate: '2026-08-10T00:00:00.000Z', amountMinorUnits: 5_000n }, { dueDate: '2026-09-10T00:00:00.000Z', amountMinorUnits: 5_000n }], 10_000n)
    ).not.toThrow();
  });

  it('rejects a schedule that does not sum to the invoice total', () => {
    expect(() => validateInstallmentSchedule([{ dueDate: '2026-08-10T00:00:00.000Z', amountMinorUnits: 4_000n }], 10_000n)).toThrow(/totals 4000/);
  });

  it('rejects an empty schedule', () => {
    expect(() => validateInstallmentSchedule([], 10_000n)).toThrow(/at least one/);
  });

  it('rejects a zero or negative installment amount', () => {
    expect(() => validateInstallmentSchedule([{ dueDate: '2026-08-10T00:00:00.000Z', amountMinorUnits: 0n }], 0n)).toThrow(/greater than zero/);
  });
});

describe('generateRecurringSchedule', () => {
  it('splits the total evenly across weekly installments, with the remainder on the last (multiple installments)', () => {
    const schedule = generateRecurringSchedule('WEEKLY', new Date('2026-08-01T00:00:00.000Z'), 3, 10_000n);
    expect(schedule).toHaveLength(3);
    expect(schedule.map((line) => line.amountMinorUnits)).toEqual([3_333n, 3_333n, 3_334n]);
    expect(schedule.reduce((sum, line) => sum + line.amountMinorUnits, 0n)).toBe(10_000n);
    expect(schedule[1]!.dueDate).toBe('2026-08-08T00:00:00.000Z');
  });

  it('spaces fortnightly installments fourteen days apart', () => {
    const schedule = generateRecurringSchedule('FORTNIGHTLY', new Date('2026-08-01T00:00:00.000Z'), 2, 10_000n);
    expect(schedule[1]!.dueDate).toBe('2026-08-15T00:00:00.000Z');
  });

  it('spaces monthly installments by calendar month, not a fixed day count', () => {
    const schedule = generateRecurringSchedule('MONTHLY', new Date('2026-01-31T00:00:00.000Z'), 2, 10_000n);
    expect(schedule[0]!.dueDate).toBe('2026-01-31T00:00:00.000Z');
    // Adding a calendar month to Jan 31 rolls into March in a UTC calendar (no Feb 31) —
    // exactly the JS Date arithmetic this function relies on, exercised here so the behaviour
    // is documented rather than silently relied upon.
    expect(schedule[1]!.dueDate.startsWith('2026-03')).toBe(true);
  });

  it('rejects a non-positive count', () => {
    expect(() => generateRecurringSchedule('WEEKLY', new Date('2026-08-01T00:00:00.000Z'), 0, 10_000n)).toThrow(/positive integer/);
  });
});

describe('generateDepositAndFinalSchedule', () => {
  it('splits a deposit and final payment (deposit and final payment)', () => {
    const schedule = generateDepositAndFinalSchedule(2_000n, '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 10_000n);
    expect(schedule).toEqual([
      { dueDate: '2026-08-01T00:00:00.000Z', amountMinorUnits: 2_000n },
      { dueDate: '2026-09-01T00:00:00.000Z', amountMinorUnits: 8_000n }
    ]);
  });

  it('rejects a deposit that is not strictly between zero and the total', () => {
    expect(() => generateDepositAndFinalSchedule(0n, 'a', 'b', 10_000n)).toThrow();
    expect(() => generateDepositAndFinalSchedule(10_000n, 'a', 'b', 10_000n)).toThrow();
  });
});
