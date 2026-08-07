/**
 * Pure projection of a customer's accounts-receivable position from posted invoices — the
 * accounts-receivable mirror of `computeSupplierAccount`. Only ever sees posted invoices, so a
 * confirmed-but-undelivered sales order can never leak into `amountOwed`.
 */
export type CustomerInvoiceForAccount = {
  totalMinorUnits: bigint;
  appliedMinorUnits: bigint;
  dueDate: Date;
};

export type CustomerAccountProjection = {
  amountOwedMinorUnits: bigint;
  overdueMinorUnits: bigint;
  dueWithin7DaysMinorUnits: bigint;
  dueWithin30DaysMinorUnits: bigint;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function outstandingBalance(invoice: CustomerInvoiceForAccount): bigint {
  const outstanding = invoice.totalMinorUnits - invoice.appliedMinorUnits;
  return outstanding > 0n ? outstanding : 0n;
}

export function computeCustomerAccount(invoices: readonly CustomerInvoiceForAccount[], asOf: Date): CustomerAccountProjection {
  const sevenDaysOut = new Date(asOf.getTime() + 7 * MILLISECONDS_PER_DAY);
  const thirtyDaysOut = new Date(asOf.getTime() + 30 * MILLISECONDS_PER_DAY);

  let amountOwedMinorUnits = 0n;
  let overdueMinorUnits = 0n;
  let dueWithin7DaysMinorUnits = 0n;
  let dueWithin30DaysMinorUnits = 0n;

  for (const invoice of invoices) {
    const outstanding = outstandingBalance(invoice);
    if (outstanding === 0n) continue;
    amountOwedMinorUnits += outstanding;
    if (invoice.dueDate < asOf) overdueMinorUnits += outstanding;
    if (invoice.dueDate >= asOf && invoice.dueDate <= sevenDaysOut) dueWithin7DaysMinorUnits += outstanding;
    if (invoice.dueDate >= asOf && invoice.dueDate <= thirtyDaysOut) dueWithin30DaysMinorUnits += outstanding;
  }

  return { amountOwedMinorUnits, overdueMinorUnits, dueWithin7DaysMinorUnits, dueWithin30DaysMinorUnits };
}

/** Net accounts receivable = total amount owed - unapplied customer credits. */
export function netAccountsReceivable(amountOwedMinorUnits: bigint, unappliedCreditMinorUnits: bigint): bigint {
  return amountOwedMinorUnits - unappliedCreditMinorUnits;
}

/** A statement's closing balance must reproduce exactly: owed minus unapplied credit. */
export function computeStatementBalance(amountOwedMinorUnits: bigint, unappliedCreditMinorUnits: bigint): bigint {
  return netAccountsReceivable(amountOwedMinorUnits, unappliedCreditMinorUnits);
}
