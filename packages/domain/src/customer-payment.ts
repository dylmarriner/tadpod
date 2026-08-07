/**
 * Customer payment posting (Phase 5): record the full payment once against the account, then
 * allocate it across eligible open invoices oldest-to-newest until it is exhausted, leaving any
 * remainder as unapplied account credit. `CustomerCreditsService.planApplication` reuses the
 * same greedy oldest-first shape for applying a credit to invoices later.
 */

export type OpenInvoiceForAllocation = {
  customerInvoiceId: string;
  outstandingMinorUnits: bigint;
  /** ISO 8601 UTC — invoices are allocated oldest-issued first. */
  issueDate: string;
};

export type PaymentAllocationLine = {
  customerInvoiceId: string;
  amountMinorUnits: bigint;
};

export type PaymentAllocationPlan = {
  allocations: PaymentAllocationLine[];
  /** Unapplied remainder — becomes a `CustomerCredit` when positive. */
  unappliedMinorUnits: bigint;
};

function compareOldestFirst(a: OpenInvoiceForAllocation, b: OpenInvoiceForAllocation): number {
  if (a.issueDate !== b.issueDate) return a.issueDate < b.issueDate ? -1 : 1;
  return a.customerInvoiceId < b.customerInvoiceId ? -1 : a.customerInvoiceId > b.customerInvoiceId ? 1 : 0;
}

/**
 * Spread `amountMinorUnits` across `invoices`, oldest first, covering each one fully before
 * moving to the next. The last invoice touched may be only partially covered; whatever is left
 * over once every invoice is either fully paid or the payment is exhausted becomes unapplied
 * credit. Deterministic and reviewable before posting — the same inputs always produce the
 * same plan, which is what makes an allocation preview meaningful.
 */
export function planPaymentAllocation(amountMinorUnits: bigint, invoices: readonly OpenInvoiceForAllocation[]): PaymentAllocationPlan {
  if (amountMinorUnits < 0n) throw new Error('Payment amount cannot be negative');

  let remaining = amountMinorUnits;
  const allocations: PaymentAllocationLine[] = [];
  for (const invoice of [...invoices].sort(compareOldestFirst)) {
    if (remaining <= 0n) break;
    if (invoice.outstandingMinorUnits <= 0n) continue;
    const applied = invoice.outstandingMinorUnits < remaining ? invoice.outstandingMinorUnits : remaining;
    allocations.push({ customerInvoiceId: invoice.customerInvoiceId, amountMinorUnits: applied });
    remaining -= applied;
  }

  return { allocations, unappliedMinorUnits: remaining };
}

/** Same oldest-first spread, for applying a `CustomerCredit`'s remaining balance to open invoices. */
export function planCreditApplication(creditRemainingMinorUnits: bigint, invoices: readonly OpenInvoiceForAllocation[]): PaymentAllocationPlan {
  return planPaymentAllocation(creditRemainingMinorUnits, invoices);
}

export type ManualAllocationInput = {
  customerInvoiceId: string;
  outstandingMinorUnits: bigint;
  amountMinorUnits: bigint;
};

/**
 * Validate a manually-specified allocation (the "manual reallocation" rule): every line must
 * be positive and within that invoice's outstanding balance, and the total must not exceed
 * what is available to allocate (a payment's un-reversed amount, or a credit's remaining
 * balance).
 */
export function validateManualAllocation(availableMinorUnits: bigint, lines: readonly ManualAllocationInput[]): void {
  let total = 0n;
  for (const line of lines) {
    if (line.amountMinorUnits <= 0n) throw new Error('Each allocation amount must be greater than zero');
    if (line.amountMinorUnits > line.outstandingMinorUnits) {
      throw new Error(`Allocating ${line.amountMinorUnits} to invoice ${line.customerInvoiceId} would exceed its outstanding balance of ${line.outstandingMinorUnits}`);
    }
    total += line.amountMinorUnits;
  }
  if (total > availableMinorUnits) {
    throw new Error(`Total allocation ${total} exceeds the ${availableMinorUnits} available to allocate`);
  }
}
