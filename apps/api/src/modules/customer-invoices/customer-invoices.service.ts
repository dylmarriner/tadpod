import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeCustomerInvoiceOutstandingMinorUnits,
  computeLineNetMinorUnits,
  computeLineTaxMinorUnits,
  computeUninvoicedQuantity,
  deriveCustomerInvoiceDisplayStatus,
  deriveSalesOrderInvoicingStatus,
  Money,
  Quantity,
  validateInvoiceLineQuantity
} from '@tadpods/domain';
import { database, nextDocumentNumber, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type { CreateCustomerInvoiceInput, CustomerInvoice, InvoiceableLine, ListCustomerInvoicesQuery, VoidCustomerInvoiceInput } from '@tadpods/contracts';

export type CustomerInvoicingActor = { id: string; permissions: readonly string[] };
export type CustomerInvoicingRequestContext = { requestId: string; ipAddress?: string };

const invoiceInclude = {
  customer: { select: { id: true, code: true, name: true } },
  salesOrder: { select: { id: true, orderNumber: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  voidedBy: { select: { id: true, displayName: true, email: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true } }, taxRate: { select: { id: true, code: true, name: true, rateBasis: true } } } },
  paymentAllocations: { where: { reversedAt: null } },
  creditApplications: { where: { reversedAt: null } }
} satisfies PrismaNamespace.CustomerInvoiceInclude;

type InvoiceWithRelations = PrismaNamespace.CustomerInvoiceGetPayload<{ include: typeof invoiceInclude }>;

function toInvoice(row: InvoiceWithRelations): CustomerInvoice {
  const lineFigures = row.lines.map((line) => {
    const netMinorUnits = computeLineNetMinorUnits(line.unitPriceMinorUnits, line.quantity.toString(), line.discountPercentBasis);
    // taxAmountMinorUnits is the snapshotted, already-posted figure — never recomputed live,
    // so a later change to the tax rate's percentage cannot retroactively change this invoice.
    return { line, netMinorUnits, taxMinorUnits: line.taxAmountMinorUnits };
  });
  const subtotalMinorUnits = lineFigures.reduce((sum, { netMinorUnits }) => sum + netMinorUnits, 0n);
  const taxMinorUnits = lineFigures.reduce((sum, { taxMinorUnits }) => sum + taxMinorUnits, 0n);
  const totalMinorUnits = subtotalMinorUnits + taxMinorUnits;
  const appliedMinorUnits =
    row.paymentAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n) +
    row.creditApplications.reduce((sum, application) => sum + application.amountMinorUnits, 0n);
  const outstandingMinorUnits = computeCustomerInvoiceOutstandingMinorUnits(totalMinorUnits, appliedMinorUnits);

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    customer: row.customer,
    salesOrder: row.salesOrder,
    status: row.status,
    displayStatus: deriveCustomerInvoiceDisplayStatus(row.status, row.dueDate, new Date()),
    currency: row.currency,
    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate.toISOString(),
    notes: row.notes,
    subtotalAmount: Money.from(subtotalMinorUnits, row.currency).toDecimalString(),
    taxAmount: Money.from(taxMinorUnits, row.currency).toDecimalString(),
    totalAmount: Money.from(totalMinorUnits, row.currency).toDecimalString(),
    appliedAmount: Money.from(appliedMinorUnits, row.currency).toDecimalString(),
    outstandingAmount: Money.from(outstandingMinorUnits, row.currency).toDecimalString(),
    createdBy: row.createdBy,
    voidedBy: row.voidedBy,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: lineFigures.map(({ line, netMinorUnits, taxMinorUnits: lineTaxMinorUnits }) => ({
      id: line.id,
      salesOrderLineId: line.salesOrderLineId,
      product: line.product,
      unitPrice: Money.from(line.unitPriceMinorUnits, row.currency).toDecimalString(),
      discountPercentBasis: line.discountPercentBasis,
      quantity: line.quantity.toString(),
      netAmount: Money.from(netMinorUnits, row.currency).toDecimalString(),
      taxRate: line.taxRate ? { id: line.taxRate.id, code: line.taxRate.code, name: line.taxRate.name, ratePercent: (line.taxRate.rateBasis / 10_000).toFixed(2) } : null,
      taxAmount: Money.from(lineTaxMinorUnits, row.currency).toDecimalString(),
      lineTotal: Money.from(netMinorUnits + lineTaxMinorUnits, row.currency).toDecimalString()
    }))
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Customer invoices (Phase 5). An invoice bills delivered-but-uninvoiced quantity off one
 * sales order — `create` never touches a line the order itself does not already own, and the
 * `(customerInvoiceId, salesOrderLineId)` unique constraint (plus `validateInvoiceLineQuantity`
 * re-checked under the same transaction) makes it impossible to bill the same delivered unit
 * twice across separate invoices. `status` is a plain persisted field the payment/credit
 * services advance directly; only `VOIDED` is set here.
 */
@Injectable()
export class CustomerInvoicesService {
  async list(query: ListCustomerInvoicesQuery): Promise<{ items: CustomerInvoice[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.CustomerInvoiceWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      database.customerInvoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.customerInvoice.count({ where })
    ]);
    return { items: rows.map(toInvoice), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<CustomerInvoice> {
    const row = await database.customerInvoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!row) throw new NotFoundException('Customer invoice not found');
    return toInvoice(row);
  }

  /** Every uninvoiced line on a sales order — what the "create invoice" screen shows before posting. */
  async invoiceableLines(salesOrderId: string): Promise<InvoiceableLine[]> {
    const order = await database.salesOrder.findUnique({ where: { id: salesOrderId }, include: { lines: { include: { product: { select: { id: true, sku: true, name: true } } } } } });
    if (!order) throw new NotFoundException('Sales order not found');
    return order.lines
      .map((line) => ({
        salesOrderLineId: line.id,
        product: line.product,
        unitPrice: Money.from(line.unitPriceMinorUnits, order.currency).toDecimalString(),
        discountPercentBasis: line.discountPercentBasis,
        uninvoicedQuantity: computeUninvoicedQuantity({ deliveredQuantity: line.deliveredQuantity.toString(), invoicedQuantity: line.invoicedQuantity.toString() })
      }))
      .filter((line) => Quantity.from(line.uninvoicedQuantity).isPositive());
  }

  async create(input: CreateCustomerInvoiceInput, actor: CustomerInvoicingActor, context: CustomerInvoicingRequestContext): Promise<CustomerInvoice> {
    return withTransaction(async (transaction) => {
      const order = await transaction.salesOrder.findUnique({ where: { id: input.salesOrderId }, include: { customer: true, lines: true } });
      if (!order) throw new NotFoundException('Sales order not found');

      const linesById = new Map(order.lines.map((line) => [line.id, line]));
      const requested = input.lines ?? order.lines.map((line) => ({
        salesOrderLineId: line.id,
        quantity: computeUninvoicedQuantity({ deliveredQuantity: line.deliveredQuantity.toString(), invoicedQuantity: line.invoicedQuantity.toString() })
      }));

      const draftLines = requested
        .map((requestedLine) => {
          const orderLine = linesById.get(requestedLine.salesOrderLineId);
          if (!orderLine) throw new BadRequestException(`Sales order line ${requestedLine.salesOrderLineId} does not belong to this order`);
          return { orderLine, quantity: requestedLine.quantity };
        })
        .filter((line) => Quantity.from(line.quantity).isPositive());

      if (draftLines.length === 0) throw new BadRequestException('There is nothing uninvoiced to bill on this order');

      for (const line of draftLines) {
        validateInvoiceLineQuantity({ deliveredQuantity: line.orderLine.deliveredQuantity.toString(), invoicedQuantity: line.orderLine.invoicedQuantity.toString() }, line.quantity);
      }

      // Tax is snapshotted from each product's current tax rate at invoice-creation time, not
      // looked up live on every read — so a later change to the rate's percentage never
      // retroactively changes an already-posted invoice's total.
      const productIds = [...new Set(draftLines.map((line) => line.orderLine.productId))];
      const products = await transaction.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, taxRateId: true, taxRate: { select: { rateBasis: true } } }
      });
      const productById = new Map(products.map((product) => [product.id, product]));

      const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
      const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(issueDate.getTime() + order.customer.paymentTermsDays * DAY_MS);
      const invoiceNumber = await nextDocumentNumber('customer-invoice');

      const created = await transaction.customerInvoice.create({
        data: {
          invoiceNumber,
          customerId: order.customerId,
          salesOrderId: order.id,
          currency: order.currency,
          issueDate,
          dueDate,
          notes: input.notes ?? null,
          createdById: actor.id,
          lines: {
            create: draftLines.map((line) => {
              const netMinorUnits = computeLineNetMinorUnits(line.orderLine.unitPriceMinorUnits, line.quantity, line.orderLine.discountPercentBasis);
              const product = productById.get(line.orderLine.productId);
              const taxAmountMinorUnits = product?.taxRate ? computeLineTaxMinorUnits(netMinorUnits, product.taxRate.rateBasis) : 0n;
              return {
                salesOrderLineId: line.orderLine.id,
                productId: line.orderLine.productId,
                unitPriceMinorUnits: line.orderLine.unitPriceMinorUnits,
                discountPercentBasis: line.orderLine.discountPercentBasis,
                quantity: line.quantity,
                taxRateId: product?.taxRateId ?? null,
                taxAmountMinorUnits
              };
            })
          }
        },
        include: invoiceInclude
      });

      for (const line of draftLines) {
        await transaction.salesOrderLine.update({ where: { id: line.orderLine.id }, data: { invoicedQuantity: { increment: line.quantity } } });
      }
      await this.refreshOrderInvoicingStatus(transaction, order.id);
      await this.audit(transaction, 'customer-invoice.create', created.id, actor, context, { salesOrderId: order.id, lineCount: draftLines.length });

      return toInvoice(created);
    });
  }

  /** Void an unpaid invoice — corrections otherwise happen through a `CustomerCredit`, never an edit. */
  async void(id: string, input: VoidCustomerInvoiceInput, actor: CustomerInvoicingActor, context: CustomerInvoicingRequestContext): Promise<CustomerInvoice> {
    return withTransaction(async (transaction) => {
      const invoice = await transaction.customerInvoice.findUnique({ where: { id }, include: { lines: true } });
      if (!invoice) throw new NotFoundException('Customer invoice not found');
      if (invoice.status === 'VOIDED') throw new ConflictException('This invoice is already voided');

      const [paymentTotal, creditTotal] = await Promise.all([
        transaction.customerPaymentAllocation.aggregate({ where: { customerInvoiceId: id, reversedAt: null }, _sum: { amountMinorUnits: true } }),
        transaction.customerCreditApplication.aggregate({ where: { customerInvoiceId: id, reversedAt: null }, _sum: { amountMinorUnits: true } })
      ]);
      const applied = (paymentTotal._sum.amountMinorUnits ?? 0n) + (creditTotal._sum.amountMinorUnits ?? 0n);
      if (applied > 0n) throw new ConflictException('Cannot void an invoice that has payments or credits applied — reverse those first');

      for (const line of invoice.lines) {
        await transaction.salesOrderLine.update({ where: { id: line.salesOrderLineId }, data: { invoicedQuantity: { decrement: line.quantity.toString() } } });
      }
      await this.refreshOrderInvoicingStatus(transaction, invoice.salesOrderId);

      const updated = await transaction.customerInvoice.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedById: actor.id,
          voidedAt: new Date(),
          notes: input.reason ? [invoice.notes, `Voided: ${input.reason}`].filter(Boolean).join('\n') : invoice.notes
        },
        include: invoiceInclude
      });
      await this.audit(transaction, 'customer-invoice.void', id, actor, context, { reason: input.reason ?? null });
      return toInvoice(updated);
    });
  }

  private async refreshOrderInvoicingStatus(transaction: DatabaseTransaction, salesOrderId: string): Promise<void> {
    const lines = await transaction.salesOrderLine.findMany({ where: { salesOrderId } });
    const invoicingStatus = deriveSalesOrderInvoicingStatus(lines.map((line) => ({ deliveredQuantity: line.deliveredQuantity.toString(), invoicedQuantity: line.invoicedQuantity.toString() })));
    await transaction.salesOrder.update({ where: { id: salesOrderId }, data: { invoicingStatus } });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: CustomerInvoicingActor,
    context: CustomerInvoicingRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'CustomerInvoice',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }
}
