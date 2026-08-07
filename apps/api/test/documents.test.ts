import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { confirmSalesOrderSchema, createCustomerInvoiceSchema, createDeliverySchema, createSalesOrderSchema, postDeliverySchema } from '@tadpods/contracts';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { SalesOrdersService } from '../src/modules/sales-orders/sales-orders.service.js';
import { DeliveriesService } from '../src/modules/deliveries/deliveries.service.js';
import { CustomerInvoicesService } from '../src/modules/customer-invoices/customer-invoices.service.js';
import { DocumentsService } from '../src/modules/documents/documents.service.js';

const posting = new StockPostingService();
const salesOrders = new SalesOrdersService();
const deliveries = new DeliveriesService(posting);
const invoices = new CustomerInvoicesService();
const documents = new DocumentsService(salesOrders, deliveries, undefined as never, undefined as never, invoices, undefined as never, undefined as never);

const salesActor = { id: '', permissions: ['sales.read', 'sales.write', 'sales.fulfil', 'sales.invoice'] as readonly string[] };

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
});
