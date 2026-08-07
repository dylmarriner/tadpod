/** Mirrors the Postgres `InstallmentFrequency` enum. */
export const INSTALLMENT_FREQUENCIES = ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'CUSTOM'] as const;
export type InstallmentFrequency = (typeof INSTALLMENT_FREQUENCIES)[number];

export type InstallmentScheduleLineInput = { dueDate: string; amountMinorUnits: bigint };

/**
 * An installment schedule must add up to exactly the invoice total — no more, no less, so the
 * plan is always a complete, honest description of how the invoice will be paid. Unscheduled
 * partial payments are still allowed against the invoice regardless (see
 * `CustomerPaymentsService`); this only validates the *plan*, not what actually gets paid.
 */
export function validateInstallmentSchedule(lines: readonly InstallmentScheduleLineInput[], totalMinorUnits: bigint): void {
  if (lines.length === 0) throw new Error('An installment plan needs at least one scheduled line');
  const sum = lines.reduce((total, line) => total + line.amountMinorUnits, 0n);
  if (sum !== totalMinorUnits) {
    throw new Error(`Installment schedule totals ${sum} but the invoice total is ${totalMinorUnits}`);
  }
  for (const line of lines) {
    if (line.amountMinorUnits <= 0n) throw new Error('Each installment amount must be greater than zero');
  }
}

const DAYS = (count: number) => count * 24 * 60 * 60 * 1000;
const INTERVAL_MS: Record<'WEEKLY' | 'FORTNIGHTLY', number> = { WEEKLY: DAYS(7), FORTNIGHTLY: DAYS(14) };

/**
 * Generate an evenly-spread recurring schedule (weekly/fortnightly/monthly) starting from
 * `startDate`, splitting the total across `count` installments. The last installment absorbs
 * any rounding remainder, so the schedule always sums to exactly `totalMinorUnits` — monthly
 * uses calendar months (so installments land on the same day-of-month) rather than a fixed
 * 30-day interval, so a schedule that starts on the 31st does not drift.
 */
export function generateRecurringSchedule(
  frequency: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY',
  startDate: Date,
  count: number,
  totalMinorUnits: bigint
): InstallmentScheduleLineInput[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('Installment count must be a positive integer');
  const base = totalMinorUnits / BigInt(count);
  const remainder = totalMinorUnits - base * BigInt(count);

  return Array.from({ length: count }, (_, index) => {
    const dueDate =
      frequency === 'MONTHLY'
        ? new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + index, startDate.getUTCDate(), startDate.getUTCHours(), startDate.getUTCMinutes(), startDate.getUTCSeconds()))
        : new Date(startDate.getTime() + INTERVAL_MS[frequency] * index);
    const amountMinorUnits = index === count - 1 ? base + remainder : base;
    return { dueDate: dueDate.toISOString(), amountMinorUnits };
  });
}

/** Deposit-and-final: a fixed deposit due now, the remainder due on the final due date. */
export function generateDepositAndFinalSchedule(depositMinorUnits: bigint, depositDueDate: string, finalDueDate: string, totalMinorUnits: bigint): InstallmentScheduleLineInput[] {
  if (depositMinorUnits <= 0n || depositMinorUnits >= totalMinorUnits) {
    throw new Error('Deposit must be greater than zero and less than the invoice total');
  }
  return [
    { dueDate: depositDueDate, amountMinorUnits: depositMinorUnits },
    { dueDate: finalDueDate, amountMinorUnits: totalMinorUnits - depositMinorUnits }
  ];
}
