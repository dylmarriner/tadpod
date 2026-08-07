import { Injectable } from '@nestjs/common';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecordDocument, StatementDocument, type DocumentBrand } from '@tadpods/documents';
import { database } from '@tadpods/database';
import { SalesOrdersService } from '../sales-orders/sales-orders.service.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';
import { GoodsReceiptsService } from '../goods-receipts/goods-receipts.service.js';
import { CustomerInvoicesService } from '../customer-invoices/customer-invoices.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { CustomerCreditsService } from '../customer-credits/customer-credits.service.js';
import { SuppliersService } from '../suppliers/suppliers.service.js';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service.js';
import { SupplierCreditsService } from '../supplier-credits/supplier-credits.service.js';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Documents (Phase 6). Every document is rendered on demand from the same data the API already
 * serves — never a separately-maintained snapshot — so a document can never drift from the
 * record it describes. Rendering is plain React SSR (`renderToStaticMarkup`) into the shared
 * `RecordDocument`/`StatementDocument` shell from `@tadpods/documents`; no PDF-generation
 * dependency is installed, so a document becomes a PDF via the browser's own "Print to PDF"
 * against the print-tuned HTML this returns.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly salesOrders: SalesOrdersService,
    private readonly deliveries: DeliveriesService,
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly goodsReceipts: GoodsReceiptsService,
    private readonly customerInvoices: CustomerInvoicesService,
    private readonly customers: CustomersService,
    private readonly customerCredits: CustomerCreditsService,
    private readonly suppliers: SuppliersService,
    private readonly supplierPayments: SupplierPaymentsService,
    private readonly supplierCredits: SupplierCreditsService
  ) {}

  private async brand(): Promise<DocumentBrand> {
    const settings = await database.brandSettings.findUniqueOrThrow({ where: { singletonKey: 'default' } });
    return {
      displayName: settings.displayName,
      legalName: settings.legalName,
      logoUrl: settings.logoUrl,
      primaryColour: settings.primaryColour,
      accentColour: settings.accentColour,
      documentFooter: settings.documentFooter
    };
  }

  async salesOrder(id: string): Promise<string> {
    const [order, brand] = await Promise.all([this.salesOrders.get(id), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Sales Order',
        documentNumber: order.orderNumber,
        status: order.status.replaceAll('_', ' '),
        issuedDate: formatDate(order.createdAt),
        parties: [{ label: 'Customer', name: order.customer.name, lines: [order.customer.code] }],
        meta: [
          { label: 'Warehouse', value: order.warehouse.name },
          ...(order.customerReference ? [{ label: 'Reference', value: order.customerReference }] : []),
          ...(order.promisedDate ? [{ label: 'Promised date', value: formatDate(order.promisedDate) }] : [])
        ],
        lines: order.lines.map((line) => ({ description: `${line.product.sku} — ${line.product.name}`, quantity: line.orderedQuantity, unitPrice: line.unitPrice, amount: line.lineTotal })),
        totals: [{ label: 'Total', value: `${order.totalAmount} ${order.currency}`, emphasis: true }],
        notes: order.notes
      })
    );
  }

  async deliveryNote(id: string): Promise<string> {
    const [delivery, brand] = await Promise.all([this.deliveries.get(id), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Delivery Note',
        documentNumber: delivery.deliveryNumber,
        status: delivery.status,
        issuedDate: formatDate(delivery.createdAt),
        parties: [{ label: 'Sales order', name: delivery.salesOrder.orderNumber }],
        meta: [{ label: 'Warehouse', value: delivery.warehouse.name }],
        lines: delivery.lines.map((line) => ({ description: `${line.product.sku} — ${line.product.name}`, quantity: line.quantity, amount: '' })),
        lineColumns: ['Description', 'Quantity', '', ''],
        totals: [],
        notes: delivery.notes
      })
    );
  }

  async purchaseOrder(id: string): Promise<string> {
    const [order, brand] = await Promise.all([this.purchaseOrders.get(id), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Purchase Order',
        documentNumber: order.orderNumber,
        status: order.status.replaceAll('_', ' '),
        issuedDate: formatDate(order.createdAt),
        parties: [{ label: 'Supplier', name: order.supplier.name, lines: [order.supplier.code] }],
        lines: order.lines.map((line) => ({ description: `${line.product.sku} — ${line.product.name}`, quantity: line.orderedQuantity, unitPrice: line.unitCost, amount: line.lineTotal })),
        totals: [{ label: 'Total', value: `${order.totalAmount} ${order.currency}`, emphasis: true }],
        notes: order.notes
      })
    );
  }

  async goodsReceivedNote(id: string): Promise<string> {
    const [receipt, brand] = await Promise.all([this.goodsReceipts.get(id), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Goods Received Note',
        documentNumber: receipt.receiptNumber,
        issuedDate: formatDate(receipt.createdAt),
        parties: [{ label: 'Purchase order', name: receipt.purchaseOrder.orderNumber }],
        meta: [{ label: 'Warehouse', value: receipt.warehouse.name }],
        lines: receipt.lines.map((line) => ({ description: `${line.product.sku} — ${line.product.name}`, quantity: line.acceptedQuantity, amount: '' })),
        lineColumns: ['Description', 'Quantity accepted', '', ''],
        totals: [],
        notes: receipt.notes
      })
    );
  }

  async customerInvoice(id: string): Promise<string> {
    const [invoice, brand] = await Promise.all([this.customerInvoices.get(id), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Invoice',
        documentNumber: invoice.invoiceNumber,
        status: invoice.displayStatus.replaceAll('_', ' '),
        issuedDate: formatDate(invoice.issueDate),
        parties: [{ label: 'Bill to', name: invoice.customer.name, lines: [invoice.customer.code] }],
        meta: [
          { label: 'Due date', value: formatDate(invoice.dueDate) },
          { label: 'Sales order', value: invoice.salesOrder.orderNumber }
        ],
        lines: invoice.lines.map((line) => ({ description: `${line.product.sku} — ${line.product.name}`, quantity: line.quantity, unitPrice: line.unitPrice, amount: line.lineTotal })),
        totals: [
          { label: 'Total', value: `${invoice.totalAmount} ${invoice.currency}` },
          { label: 'Paid / credited', value: invoice.appliedAmount },
          { label: 'Balance due', value: invoice.outstandingAmount, emphasis: true }
        ],
        notes: invoice.notes
      })
    );
  }

  /** A credit note is the same shell as an invoice, with the credit's applications as its lines. */
  async creditNote(id: string): Promise<string> {
    const [credit, brand] = await Promise.all([this.customerCredits.get(id), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Credit Note',
        documentNumber: credit.creditNumber,
        issuedDate: formatDate(credit.createdAt),
        parties: [{ label: 'Customer', name: credit.customer.name, lines: [credit.customer.code] }],
        meta: [{ label: 'Source', value: credit.sourceType }],
        lines:
          credit.applications.length > 0
            ? credit.applications.map((application) => ({ description: `Applied to ${application.invoiceNumber}`, amount: application.amount }))
            : [{ description: 'Unapplied credit', amount: credit.amount }],
        lineColumns: ['Description', '', '', 'Amount'],
        totals: [
          { label: 'Original amount', value: credit.amount },
          { label: 'Remaining', value: credit.remaining, emphasis: true }
        ],
        notes: credit.notes
      })
    );
  }

  async customerStatement(customerId: string): Promise<string> {
    const [customer, statement, brand] = await Promise.all([this.customers.get(customerId), this.customers.statement(customerId), this.brand()]);
    return renderToStaticMarkup(
      StatementDocument({
        brand,
        accountName: customer.name,
        accountReference: customer.code,
        asOf: formatDate(statement.asOf),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        lines: statement.lines.map((line) => ({ date: formatDate(line.date), description: line.description, debit: line.debit, credit: line.credit, runningBalance: line.runningBalance }))
      })
    );
  }

  /** A remittance advice — what a supplier payment covered, one line per bill it allocated to. */
  async supplierRemittance(paymentId: string): Promise<string> {
    const [payment, brand] = await Promise.all([this.supplierPayments.get(paymentId), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Remittance Advice',
        documentNumber: payment.paymentNumber,
        status: payment.reversedAt ? 'REVERSED' : 'POSTED',
        issuedDate: formatDate(payment.paidAt),
        parties: [{ label: 'Supplier', name: payment.supplier.name, lines: [payment.supplier.code] }],
        meta: [{ label: 'Method', value: payment.method }, ...(payment.reference ? [{ label: 'Reference', value: payment.reference }] : [])],
        lines: payment.allocations.map((allocation) => ({ description: `Bill ${allocation.billNumber}`, amount: allocation.amount })),
        lineColumns: ['Bill', '', '', 'Amount'],
        totals: [
          { label: 'Total paid', value: `${payment.amount} ${payment.currency}` },
          ...(Number(payment.unappliedAmount) > 0 ? [{ label: 'Unapplied (credit)', value: payment.unappliedAmount }] : [])
        ],
        notes: payment.notes
      })
    );
  }

  async supplierCreditNote(id: string): Promise<string> {
    const [credit, brand] = await Promise.all([this.supplierCredits.get(id), this.brand()]);
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Credit Note',
        documentNumber: credit.creditNumber,
        issuedDate: formatDate(credit.createdAt),
        parties: [{ label: 'Supplier', name: credit.supplier.name, lines: [credit.supplier.code] }],
        meta: [{ label: 'Source', value: credit.sourceType }],
        lines:
          credit.applications.length > 0
            ? credit.applications.map((application) => ({ description: `Applied to ${application.billNumber}`, amount: application.amount }))
            : [{ description: 'Unapplied credit', amount: credit.amount }],
        lineColumns: ['Description', '', '', 'Amount'],
        totals: [
          { label: 'Original amount', value: credit.amount },
          { label: 'Remaining', value: credit.remaining, emphasis: true }
        ],
        notes: credit.notes
      })
    );
  }

  async supplierStatement(supplierId: string): Promise<string> {
    const [supplier, statement, brand] = await Promise.all([this.suppliers.get(supplierId), this.suppliers.statement(supplierId), this.brand()]);
    return renderToStaticMarkup(
      StatementDocument({
        brand,
        accountName: supplier.name,
        accountReference: supplier.code,
        asOf: formatDate(statement.asOf),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        lines: statement.lines.map((line) => ({ date: formatDate(line.date), description: line.description, debit: line.debit, credit: line.credit, runningBalance: line.runningBalance }))
      })
    );
  }

  /** A refund confirmation, for either side of the ledger — the same shell, one line for the refund itself. */
  async customerRefundConfirmation(id: string): Promise<string> {
    const [refunds, brand] = await Promise.all([this.customerCredits.listRefunds(), this.brand()]);
    const refund = refunds.find((candidate) => candidate.id === id);
    if (!refund) throw new Error('Customer refund not found');
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Refund Confirmation',
        documentNumber: refund.refundNumber,
        issuedDate: formatDate(refund.createdAt),
        parties: [{ label: 'Customer', name: refund.customer.name, lines: [refund.customer.code] }],
        meta: [{ label: 'Method', value: refund.method }, ...(refund.reference ? [{ label: 'Reference', value: refund.reference }] : [])],
        lines: [{ description: 'Refund of unapplied credit', amount: refund.amount }],
        lineColumns: ['Description', '', '', 'Amount'],
        totals: [{ label: 'Refunded', value: `${refund.amount} ${refund.currency}`, emphasis: true }],
        notes: refund.notes
      })
    );
  }

  async supplierRefundConfirmation(id: string): Promise<string> {
    const [refunds, brand] = await Promise.all([this.supplierCredits.listRefunds(), this.brand()]);
    const refund = refunds.find((candidate) => candidate.id === id);
    if (!refund) throw new Error('Supplier refund not found');
    return renderToStaticMarkup(
      RecordDocument({
        brand,
        documentType: 'Refund Confirmation',
        documentNumber: refund.refundNumber,
        issuedDate: formatDate(refund.createdAt),
        parties: [{ label: 'Supplier', name: refund.supplier.name, lines: [refund.supplier.code] }],
        meta: [{ label: 'Method', value: refund.method }, ...(refund.reference ? [{ label: 'Reference', value: refund.reference }] : [])],
        lines: [{ description: 'Refund of unapplied credit', amount: refund.amount }],
        lineColumns: ['Description', '', '', 'Amount'],
        totals: [{ label: 'Refunded', value: `${refund.amount} ${refund.currency}`, emphasis: true }],
        notes: refund.notes
      })
    );
  }
}
