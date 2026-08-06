/**
 * Pure projection of a supplier's accounts-payable position from posted bills. This is the
 * calculation surface Phase 3 Task 1 introduces; `SupplierAccountService` (Task 1) calls it
 * with an empty `bills` array today (no bills exist until Task 4), and Tasks 4-6 feed it real
 * posted-bill rows as those tables come online — the arithmetic itself never changes.
 *
 * A confirmed purchase order is a commitment, not a payable — this function only ever sees
 * posted bills, never purchase orders, so commitments can never leak into `amountOwed`.
 */
export type SupplierBillForAccount = {
  amountMinorUnits: bigint;
  paidMinorUnits: bigint;
  creditedMinorUnits: bigint;
  dueDate: Date;
};

export type SupplierAccountProjection = {
  amountOwedMinorUnits: bigint;
  overdueMinorUnits: bigint;
  dueWithin7DaysMinorUnits: bigint;
  dueWithin30DaysMinorUnits: bigint;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function outstandingBalance(bill: SupplierBillForAccount): bigint {
  const outstanding = bill.amountMinorUnits - bill.paidMinorUnits - bill.creditedMinorUnits;
  return outstanding > 0n ? outstanding : 0n;
}

export function computeSupplierAccount(bills: readonly SupplierBillForAccount[], asOf: Date): SupplierAccountProjection {
  const sevenDaysOut = new Date(asOf.getTime() + 7 * MILLISECONDS_PER_DAY);
  const thirtyDaysOut = new Date(asOf.getTime() + 30 * MILLISECONDS_PER_DAY);

  let amountOwedMinorUnits = 0n;
  let overdueMinorUnits = 0n;
  let dueWithin7DaysMinorUnits = 0n;
  let dueWithin30DaysMinorUnits = 0n;

  for (const bill of bills) {
    const outstanding = outstandingBalance(bill);
    if (outstanding === 0n) continue;
    amountOwedMinorUnits += outstanding;
    if (bill.dueDate < asOf) overdueMinorUnits += outstanding;
    if (bill.dueDate >= asOf && bill.dueDate <= sevenDaysOut) dueWithin7DaysMinorUnits += outstanding;
    if (bill.dueDate >= asOf && bill.dueDate <= thirtyDaysOut) dueWithin30DaysMinorUnits += outstanding;
  }

  return { amountOwedMinorUnits, overdueMinorUnits, dueWithin7DaysMinorUnits, dueWithin30DaysMinorUnits };
}

/** Net accounts payable = total supplier amount owed - unapplied supplier credits (Task 8). */
export function netAccountsPayable(amountOwedMinorUnits: bigint, unappliedCreditMinorUnits: bigint): bigint {
  return amountOwedMinorUnits - unappliedCreditMinorUnits;
}
