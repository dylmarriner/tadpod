import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import {
  confirmSalesOrderSchema,
  createCustomerInvoiceSchema,
  createDeliverySchema,
  createSalesOrderSchema,
  postDeliverySchema,
  createGoodsReceiptSchema,
  createPurchaseOrderSchema,
  createSupplierBillSchema,
  createSupplierPaymentSchema
} from '@tadpods/contracts';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { SalesOrdersService } from '../src/modules/sales-orders/sales-orders.service.js';
import { DeliveriesService } from '../src/modules/deliveries/deliveries.service.js';
import { CustomerInvoicesService } from '../src/modules/customer-invoices/customer-invoices.service.js';
import { GoodsReceiptsService } from '../src/modules/goods-receipts/goods-receipts.service.js';
import { PurchaseOrdersService } from '../src/modules/purchase-orders/purchase-orders.service.js';
import { SupplierBillsService } from '../src/modules/supplier-bills/supplier-bills.service.js';
import { SupplierPaymentsService } from '../src/modules/supplier-payments/supplier-payments.service.js';
import { SupplierCreditsService } from '../src/modules/supplier-credits/supplier-credits.service.js';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service.js';
import { SupplierBillsService } from '../src/modules/supplier-bills/supplier-bills.service.js';
import { DocumentsService } from '../src/modules/documents/documents.service.js';

const posting = new StockPostingService();
const salesOrders = new SalesOrdersService();
const deliveries = new DeliveriesService(posting);
const invoices = new CustomerInvoicesService();
const goodsReceipts = new GoodsReceiptsService(posting);
const purchaseOrders = new PurchaseOrdersService();
const supplierBills = new SupplierBillsService();
const supplierPayments = new SupplierPaymentsService();
const supplierCredits = new SupplierCreditsService();
const suppliersService = new SuppliersService();
const documents = new DocumentsService(salesOrders, deliveries, purchaseOrders, goodsReceipts, invoices, undefined as never, undefined as never, suppliersService, supplierPayments, supplierCredits, supplierBills);

const salesActor = { id: '', permissions: ['sales.read', 'sales.write', 'sales.fulfil', 'sales.invoice'] as readonly string[] };
const purchasingActor = { id: '', permissions: ['purchasing.read', 'purchasing.write', 'purchasing.approve', 'purchasing.bill'] as readonly string[] };

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `doc-test-${suffix}@tadpods.local`, displayName: `Documents test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeCustomer(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const customer = await database.customer.create({ data: { code: `DOC-CUS-${suffix}`, name: `Documents test customer ${suffix}` } });
  return customer.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({ data: { code: `DWH-${suffix}`.slice(0, 20), name: `Documents test warehouse ${suffix}`, status: 'ACTIVE' } });
  return warehouse.id;
}

async function makeSupplier(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const supplier = await database.supplier.create({ data: { code: `DOC-SUP-${suffix}`, name: `Documents test supplier ${suffix}`, paymentTermsDays: 20 } });
  return supplier.id;
}

async function postOpeningStock(actorId: string, productId: string, warehouseId: string, quantity: string): Promise<void> {
  await posting.postMovement(
    { productId, warehouseId, movementType: 'OPENING_STOCK', signedQuantity: quantity, sourceType: 'test-opening-stock', sourceId: randomUUID(), sourceLineId: randomUUID(), idempotencyKey: randomUUID(), allowNegativeStockOverride: false },
    { id: actorId, permissions: [] },
    ctx()
  );
}

describe('documents', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('renders a branded sales order document matching the source record', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `DOC-PROD-${suffix}`, name: `Documents test product ${suffix}`, unitOfMeasure: 'EA' } });

    const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId: product.id, unitPrice: '20.00', orderedQuantity: '3' }] }), { ...salesActor, id: userId }, ctx());

    const brand = await database.brandSettings.findUniqueOrThrow({ where: { singletonKey: 'default' } });
    const html = await documents.salesOrder(order.id);

    expect(html).toContain(order.orderNumber);
    expect(html).toContain(product.sku);
    expect(html).toContain('60.00');
    expect(html).toContain(brand.displayName);
    expect(html).toContain('<html>');
  });

  it('renders a delivery note listing shipped quantities', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `DOC-DN-${suffix}`, name: `Delivery note product ${suffix}`, unitOfMeasure: 'EA' } });
    await postOpeningStock(userId, product.id, warehouseId, '10');

    const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId: product.id, unitPrice: '5.00', orderedQuantity: '10' }] }), { ...salesActor, id: userId }, ctx());
    await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    const posted = await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());

    const html = await documents.deliveryNote(posted.id);
    expect(html).toContain(posted.deliveryNumber);
    expect(html).toContain(product.sku);
    expect(html).toContain('10');
  });

  it('renders a customer invoice document with the outstanding balance', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `DOC-INV-${suffix}`, name: `Invoice document product ${suffix}`, unitOfMeasure: 'EA' } });
    await postOpeningStock(userId, product.id, warehouseId, '10');

    const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId: product.id, unitPrice: '10.00', orderedQuantity: '10' }] }), { ...salesActor, id: userId }, ctx());
    await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: order.id }), { ...salesActor, id: userId }, ctx());

    const html = await documents.customerInvoice(invoice.id);
    expect(html).toContain(invoice.invoiceNumber);
    expect(html).toContain('100.00');
    expect(html).toContain('UNPAID');
  });

  it('renders a supplier bill document with the outstanding balance', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `DOC-SBL-${suffix}`, name: `Supplier bill product ${suffix}`, unitOfMeasure: 'EA' } });
    const actor = { ...purchasingActor, id: userId };

    const order = await purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId: product.id, unitCost: '10.00', orderedQuantity: '5' }] }), actor, ctx());
    await purchaseOrders.confirm(order.id, actor, ctx());
    await goodsReceipts.create(
      createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '5' }] }),
      actor,
      ctx()
    );
    const bill = await supplierBills.create(createSupplierBillSchema.parse({ purchaseOrderId: order.id }), actor, ctx());

    const html = await documents.supplierBill(bill.id);
    expect(html).toContain(bill.billNumber);
    expect(html).toContain('50.00');
    expect(html).toContain('UNPAID');
  });

  it('renders a supplier remittance advice listing bill allocations', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `DOC-REM-${suffix}`, name: `Remittance product ${suffix}`, unitOfMeasure: 'EA' } });
    const actor = { ...purchasingActor, id: userId };

    const order = await purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId: product.id, unitCost: '10.00', orderedQuantity: '5' }] }), actor, ctx());
    await purchaseOrders.confirm(order.id, actor, ctx());
    await goodsReceipts.create(
      createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '5' }] }),
      actor,
      ctx()
    );
    const bill = await supplierBills.create(createSupplierBillSchema.parse({ purchaseOrderId: order.id }), actor, ctx());
    const payment = await supplierPayments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '50.00', currency: 'NZD', method: 'BANK_TRANSFER', idempotencyKey: randomUUID() }), actor, ctx());

    const html = await documents.supplierRemittance(payment.id);
    expect(html).toContain(payment.paymentNumber);
    expect(html).toContain(bill.billNumber);
    expect(html).toContain('50.00');
  });

  it('renders a supplier statement with a running balance', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `DOC-SST-${suffix}`, name: `Statement product ${suffix}`, unitOfMeasure: 'EA' } });
    const actor = { ...purchasingActor, id: userId };

    const order = await purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId: product.id, unitCost: '10.00', orderedQuantity: '5' }] }), actor, ctx());
    await purchaseOrders.confirm(order.id, actor, ctx());
    await goodsReceipts.create(
      createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '5' }] }),
      actor,
      ctx()
    );
    await supplierBills.create(createSupplierBillSchema.parse({ purchaseOrderId: order.id }), actor, ctx());

    const html = await documents.supplierStatement(supplierId);
    const supplier = await database.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(html).toContain(supplier.name);
    expect(html).toContain('50.00');
  });
});
