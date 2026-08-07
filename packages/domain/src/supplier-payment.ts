/**
 * Supplier payment posting — the accounts-payable mirror of `customer-payment.ts`. Same
 * oldest-first allocation shape, kept as a parallel file (not a shared generic) because the
 * codebase already keeps `sales-order.ts`/`purchase-order.ts` and `customer-invoice.ts`/
 * `supplier-bill.ts` separate despite overlapping shapes — a shared "generic ledger" module
 * would blur the boundary between two ledgers that must never cross (customer and supplier
 * allocations cannot cross account boundaries, per the project's non-negotiable rules).
 */

export type OpenBillForAllocation = {
  supplierBillId: string;
  outstandingMinorUnits: bigint;
  /** ISO 8601 UTC — bills are allocated oldest-issued first. */
  issueDate: string;
};

export type PaymentAllocationLine = {
  supplierBillId: string;
  amountMinorUnits: bigint;
};

export type PaymentAllocationPlan = {
  allocations: PaymentAllocationLine[];
  /** Unapplied remainder — becomes a `SupplierCredit` when positive. */
  unappliedMinorUnits: bigint;
};

function compareOldestFirst(a: OpenBillForAllocation, b: OpenBillForAllocation): number {
  if (a.issueDate !== b.issueDate) return a.issueDate < b.issueDate ? -1 : 1;
  return a.supplierBillId < b.supplierBillId ? -1 : a.supplierBillId > b.supplierBillId ? 1 : 0;
}

/**
 * Spread `amountMinorUnits` across `bills`, oldest first, covering each one fully before
 * moving to the next. Deterministic and reviewable before posting.
 */
export function planPaymentAllocation(amountMinorUnits: bigint, bills: readonly OpenBillForAllocation[]): PaymentAllocationPlan {
  if (amountMinorUnits < 0n) throw new Error('Payment amount cannot be negative');

  let remaining = amountMinorUnits;
  const allocations: PaymentAllocationLine[] = [];
  for (const bill of [...bills].sort(compareOldestFirst)) {
    if (remaining <= 0n) break;
    if (bill.outstandingMinorUnits <= 0n) continue;
    const applied = bill.outstandingMinorUnits < remaining ? bill.outstandingMinorUnits : remaining;
    allocations.push({ supplierBillId: bill.supplierBillId, amountMinorUnits: applied });
    remaining -= applied;
  }

  return { allocations, unappliedMinorUnits: remaining };
}

/** Same oldest-first spread, for applying a `SupplierCredit`'s remaining balance to open bills. */
export function planCreditApplication(creditRemainingMinorUnits: bigint, bills: readonly OpenBillForAllocation[]): PaymentAllocationPlan {
  return planPaymentAllocation(creditRemainingMinorUnits, bills);
}

export type ManualAllocationInput = {
  supplierBillId: string;
  outstandingMinorUnits: bigint;
  amountMinorUnits: bigint;
};

/** Validate a manually-specified allocation: every line positive and within its bill's outstanding balance, total within what is available. */
export function validateManualAllocation(availableMinorUnits: bigint, lines: readonly ManualAllocationInput[]): void {
  let total = 0n;
  for (const line of lines) {
    if (line.amountMinorUnits <= 0n) throw new Error('Each allocation amount must be greater than zero');
    if (line.amountMinorUnits > line.outstandingMinorUnits) {
      throw new Error(`Allocating ${line.amountMinorUnits} to bill ${line.supplierBillId} would exceed its outstanding balance of ${line.outstandingMinorUnits}`);
    }
    total += line.amountMinorUnits;
  }
  if (total > availableMinorUnits) {
    throw new Error(`Total allocation ${total} exceeds the ${availableMinorUnits} available to allocate`);
  }
}
