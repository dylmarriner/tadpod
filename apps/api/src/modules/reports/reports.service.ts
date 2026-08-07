import { Injectable } from '@nestjs/common';
import { computeCustomerAccount, computeLineNetMinorUnits, computeReorderRecommendation, Money, Quantity } from '@tadpods/domain';
import { database } from '@tadpods/database';

export type DateRangeQuery = { from?: Date; to?: Date };

/**
 * Reports (Phase 6). Every report reads posted records only — the same immutable ledger the
 * rest of the system reads — and reuses the domain calculations already proven correct
 * elsewhere (`computeCustomerAccount` for aging, `computeReorderRecommendation` for low stock)
 * rather than re-deriving the arithmetic here. Supplier-financial reports (aged payables, bill
 * and payment registers, supplier credits, received-not-billed, purchase commitments) are not
 * included: Phase 3 never built supplier bills, payments, or credits, so there is no ledger for
 * those reports to read — adding them now would mean inventing numbers.
 */
@Injectable()
export class ReportsService {
  /** Aged receivables across every active customer, not just one — the cross-customer view `/customers/:id/account` can't give. */
  async agedReceivables(asOf: Date = new Date()) {
    const customers = await database.customer.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }] });
    const rows = await Promise.all(
      customers.map(async (customer) => {
        const invoices = await database.customerInvoice.findMany({
          where: { customerId: customer.id, status: { not: 'VOIDED' } },
          include: { lines: true, paymentAllocations: { where: { reversedAt: null } }, creditApplications: { where: { reversedAt: null } } }
        });
        const forAccount = invoices.map((invoice) => ({
          totalMinorUnits: invoice.lines.reduce((sum, line) => sum + computeLineNetMinorUnits(line.unitPriceMinorUnits, line.quantity.toString(), line.discountPercentBasis), 0n),
          appliedMinorUnits:
            invoice.paymentAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n) +
            invoice.creditApplications.reduce((sum, application) => sum + application.amountMinorUnits, 0n),
          dueDate: invoice.dueDate
        }));
        const projection = computeCustomerAccount(forAccount, asOf);
        return {
          customerId: customer.id,
          customerCode: customer.code,
          customerName: customer.name,
          currency: customer.currency,
          amountOwed: Money.from(projection.amountOwedMinorUnits, customer.currency).toDecimalString(),
          overdue: Money.from(projection.overdueMinorUnits, customer.currency).toDecimalString(),
          dueWithin7Days: Money.from(projection.dueWithin7DaysMinorUnits, customer.currency).toDecimalString(),
          dueWithin30Days: Money.from(projection.dueWithin30DaysMinorUnits, customer.currency).toDecimalString()
        };
      })
    );
    return rows.filter((row) => Number(row.amountOwed) > 0);
  }

  /** Low stock and reorder recommendations across every active product. */
  async lowStock() {
    const products = await database.product.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ sku: 'asc' }] });
    const rows = await Promise.all(
      products.map(async (product) => {
        const [stockAgg, incomingAgg] = await Promise.all([
          database.stockMovement.aggregate({ where: { productId: product.id }, _sum: { signedQuantity: true } }),
          database.purchaseOrderLine.aggregate({
            where: { productId: product.id, purchaseOrder: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } } },
            _sum: { orderedQuantity: true, receivedQuantity: true }
          })
        ]);
        const stockOnHandQuantity = Quantity.from(stockAgg._sum.signedQuantity?.toString() ?? '0').toDecimalString();
        const incomingQuantity = Quantity.from(incomingAgg._sum.orderedQuantity?.toString() ?? '0')
          .subtract(Quantity.from(incomingAgg._sum.receivedQuantity?.toString() ?? '0'))
          .toDecimalString();
        const recommendation = computeReorderRecommendation({
          stockOnHandQuantity,
          incomingQuantity,
          reorderLevel: product.reorderLevel.toString(),
          reorderQuantity: product.reorderQuantity.toString()
        });
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          stockOnHand: stockOnHandQuantity,
          incoming: incomingQuantity,
          reorderLevel: product.reorderLevel.toString(),
          ...recommendation
        };
      })
    );
    return rows.filter((row) => row.needsReorder);
  }

  /** Sales totals grouped by customer, over an optional date range (confirmed orders only). */
  async salesByCustomer(range: DateRangeQuery) {
    const orders = await database.salesOrder.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, ...this.dateFilter('confirmedAt', range) },
      include: { customer: { select: { id: true, code: true, name: true } }, lines: true }
    });
    return this.groupSalesLines(orders, (order) => ({ id: order.customer.id, code: order.customer.code, name: order.customer.name }));
  }

  /** Sales totals grouped by product, over an optional date range (confirmed orders only). */
  async salesByProduct(range: DateRangeQuery) {
    const orders = await database.salesOrder.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, ...this.dateFilter('confirmedAt', range) },
      include: { lines: { include: { product: { select: { id: true, sku: true, name: true } } } } }
    });
    const totals = new Map<string, { id: string; code: string; name: string; quantity: Quantity; minorUnits: bigint; currency: string }>();
    for (const order of orders) {
      for (const line of order.lines) {
        const key = line.product.id;
        const existing = totals.get(key) ?? { id: line.product.id, code: line.product.sku, name: line.product.name, quantity: Quantity.zero(), minorUnits: 0n, currency: order.currency };
        existing.quantity = existing.quantity.add(Quantity.from(line.orderedQuantity.toString()));
        existing.minorUnits += computeLineNetMinorUnits(line.unitPriceMinorUnits, line.orderedQuantity.toString(), line.discountPercentBasis);
        totals.set(key, existing);
      }
    }
    return [...totals.values()]
      .map((entry) => ({ productId: entry.id, sku: entry.code, name: entry.name, quantity: entry.quantity.toDecimalString(), totalAmount: Money.from(entry.minorUnits, entry.currency).toDecimalString() }))
      .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));
  }

  /** Tax collected on confirmed sales orders, grouped by each line product's configured tax rate. */
  async taxSummary(range: DateRangeQuery) {
    const orders = await database.salesOrder.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, ...this.dateFilter('confirmedAt', range) },
      include: { lines: { include: { product: { include: { taxRate: true } } } } }
    });
    const totals = new Map<string, { code: string; name: string; rateBasis: number; netMinorUnits: bigint; taxMinorUnits: bigint; currency: string }>();
    for (const order of orders) {
      for (const line of order.lines) {
        const taxRate = line.product.taxRate;
        const key = taxRate?.code ?? 'UNSPECIFIED';
        const netMinorUnits = computeLineNetMinorUnits(line.unitPriceMinorUnits, line.orderedQuantity.toString(), line.discountPercentBasis);
        const rateBasis = taxRate?.rateBasis ?? 0;
        const taxMinorUnits = (netMinorUnits * BigInt(rateBasis)) / 1_000_000n;
        const existing = totals.get(key) ?? { code: key, name: taxRate?.name ?? 'No tax rate configured', rateBasis, netMinorUnits: 0n, taxMinorUnits: 0n, currency: order.currency };
        existing.netMinorUnits += netMinorUnits;
        existing.taxMinorUnits += taxMinorUnits;
        totals.set(key, existing);
      }
    }
    return [...totals.values()].map((entry) => ({
      taxCode: entry.code,
      taxName: entry.name,
      ratePercent: (entry.rateBasis / 10_000).toFixed(2),
      netAmount: Money.from(entry.netMinorUnits, entry.currency).toDecimalString(),
      taxAmount: Money.from(entry.taxMinorUnits, entry.currency).toDecimalString()
    }));
  }

  /** Cash actually received from customers, grouped by day and method. Cash paid is not reported — no supplier-payment ledger exists yet. */
  async cashReceived(range: DateRangeQuery) {
    const payments = await database.customerPayment.findMany({ where: { reversedAt: null, ...this.dateFilter('receivedAt', range) } });
    const totals = new Map<string, { date: string; method: string; minorUnits: bigint; currency: string }>();
    for (const payment of payments) {
      const date = payment.receivedAt.toISOString().slice(0, 10);
      const key = `${date}:${payment.method}`;
      const existing = totals.get(key) ?? { date, method: payment.method, minorUnits: 0n, currency: payment.currency };
      existing.minorUnits += payment.amountMinorUnits;
      totals.set(key, existing);
    }
    return [...totals.values()]
      .map((entry) => ({ date: entry.date, method: entry.method, amountReceived: Money.from(entry.minorUnits, entry.currency).toDecimalString() }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.method.localeCompare(b.method));
  }

  private dateFilter(field: string, range: DateRangeQuery): Record<string, unknown> {
    if (!range.from && !range.to) return {};
    return { [field]: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } };
  }

  private groupSalesLines<T extends { currency: string; lines: readonly { unitPriceMinorUnits: bigint; orderedQuantity: unknown; discountPercentBasis: number }[] }>(
    orders: readonly T[],
    keyOf: (order: T) => { id: string; code: string; name: string }
  ) {
    const totals = new Map<string, { id: string; code: string; name: string; minorUnits: bigint; currency: string }>();
    for (const order of orders) {
      const key = keyOf(order);
      const existing = totals.get(key.id) ?? { ...key, minorUnits: 0n, currency: order.currency };
      for (const line of order.lines) {
        existing.minorUnits += computeLineNetMinorUnits(line.unitPriceMinorUnits, String(line.orderedQuantity), line.discountPercentBasis);
      }
      totals.set(key.id, existing);
    }
    return [...totals.values()]
      .map((entry) => ({ id: entry.id, code: entry.code, name: entry.name, totalAmount: Money.from(entry.minorUnits, entry.currency).toDecimalString() }))
      .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));
  }
}
