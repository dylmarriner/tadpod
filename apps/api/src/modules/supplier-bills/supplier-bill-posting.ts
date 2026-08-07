import { computeLineTotalMinorUnits, deriveFulfillmentStatus, deriveSupplierBillStatus } from '@tadpods/domain';
import type { DatabaseTransaction } from '@tadpods/database';

/**
 * Shared supplier-bill balance primitives, used directly (not through Nest DI) by
 * `SupplierPaymentsService` and `SupplierCreditsService` — the accounts-payable mirror of
 * `customer-invoice-posting.ts`.
 */

export type OpenBillBalance = {
  supplierBillId: string;
  billNumber: string;
  issueDate: string;
  currency: string;
  totalMinorUnits: bigint;
  appliedMinorUnits: bigint;
  outstandingMinorUnits: bigint;
};

export async function computeBillTotalMinorUnits(transaction: DatabaseTransaction, billId: string): Promise<bigint> {
  const lines = await transaction.supplierBillLine.findMany({ where: { supplierBillId: billId } });
  return lines.reduce((sum, line) => sum + computeLineTotalMinorUnits(line.unitCostMinorUnits, line.quantity.toString()), 0n);
}

export async function computeBillAppliedMinorUnits(transaction: DatabaseTransaction, billId: string): Promise<bigint> {
  const [payments, credits] = await Promise.all([
    transaction.supplierPaymentAllocation.aggregate({ where: { supplierBillId: billId, reversedAt: null }, _sum: { amountMinorUnits: true } }),
    transaction.supplierCreditApplication.aggregate({ where: { supplierBillId: billId, reversedAt: null }, _sum: { amountMinorUnits: true } })
  ]);
  return (payments._sum.amountMinorUnits ?? 0n) + (credits._sum.amountMinorUnits ?? 0n);
}

function computeOutstanding(total: bigint, applied: bigint): bigint {
  const outstanding = total - applied;
  return outstanding > 0n ? outstanding : 0n;
}

/** Every not-fully-settled, not-voided bill for a supplier, oldest-issued first. */
export async function getOpenBillsForSupplier(transaction: DatabaseTransaction, supplierId: string, currency: string): Promise<OpenBillBalance[]> {
  const bills = await transaction.supplierBill.findMany({
    where: { supplierId, currency, status: { notIn: ['VOIDED'] } },
    orderBy: [{ issueDate: 'asc' }, { id: 'asc' }]
  });

  const balances: OpenBillBalance[] = [];
  for (const bill of bills) {
    const [totalMinorUnits, appliedMinorUnits] = await Promise.all([computeBillTotalMinorUnits(transaction, bill.id), computeBillAppliedMinorUnits(transaction, bill.id)]);
    const outstandingMinorUnits = computeOutstanding(totalMinorUnits, appliedMinorUnits);
    if (outstandingMinorUnits <= 0n) continue;
    balances.push({ supplierBillId: bill.id, billNumber: bill.billNumber, issueDate: bill.issueDate.toISOString(), currency: bill.currency, totalMinorUnits, appliedMinorUnits, outstandingMinorUnits });
  }
  return balances;
}

/**
 * Re-derive one bill's status from its current total and applied amounts. `CREDITED` overlays
 * a fully-settled bill with no cash payment applied at all, mirroring `refreshInvoiceStatus`.
 */
export async function refreshBillStatus(transaction: DatabaseTransaction, billId: string): Promise<void> {
  const bill = await transaction.supplierBill.findUniqueOrThrow({ where: { id: billId } });
  if (bill.status === 'VOIDED') return;

  const [totalMinorUnits, paymentApplied, creditApplied] = await Promise.all([
    computeBillTotalMinorUnits(transaction, billId),
    transaction.supplierPaymentAllocation.aggregate({ where: { supplierBillId: billId, reversedAt: null }, _sum: { amountMinorUnits: true } }),
    transaction.supplierCreditApplication.aggregate({ where: { supplierBillId: billId, reversedAt: null }, _sum: { amountMinorUnits: true } })
  ]);
  const paymentAppliedMinorUnits = paymentApplied._sum.amountMinorUnits ?? 0n;
  const appliedMinorUnits = paymentAppliedMinorUnits + (creditApplied._sum.amountMinorUnits ?? 0n);

  const status = deriveSupplierBillStatus(totalMinorUnits, appliedMinorUnits);
  const finalStatus = status === 'PAID' && paymentAppliedMinorUnits === 0n ? 'CREDITED' : status;
  await transaction.supplierBill.update({ where: { id: billId }, data: { status: finalStatus } });
}

/** Re-derive a purchase order's fulfillment status purely from its lines' current quantities, mirroring `GoodsReceiptsService.refreshOrderStatus`. */
export async function refreshPurchaseOrderBillingStatus(transaction: DatabaseTransaction, purchaseOrderId: string): Promise<void> {
  const lines = await transaction.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
  const status = deriveFulfillmentStatus(
    lines.map((line) => ({ orderedQuantity: line.orderedQuantity.toString(), receivedQuantity: line.receivedQuantity.toString(), billedQuantity: line.billedQuantity.toString() }))
  );
  await transaction.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status } });
}
