import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { confirmSalesOrderSchema, createCustomerInvoiceSchema, createCustomerPaymentSchema, createDeliverySchema, createSalesOrderSchema, postDeliverySchema } from '@tadpods/contracts';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { SalesOrdersService } from '../src/modules/sales-orders/sales-orders.service.js';
import { DeliveriesService } from '../src/modules/deliveries/deliveries.service.js';
import { CustomerInvoicesService } from '../src/modules/customer-invoices/customer-invoices.service.js';
import { CustomerPaymentsService } from '../src/modules/customer-payments/customer-payments.service.js';
import { ReportsService } from '../src/modules/reports/reports.service.js';
import { toCsv } from '../src/modules/reports/csv.js';

const posting = new StockPostingService();
const salesOrders = new SalesOrdersService();
const deliveries = new DeliveriesService(posting);
const invoices = new CustomerInvoicesService();
const payments = new CustomerPaymentsService();
const reports = new ReportsService();

const salesActor = { id: '', permissions: ['sales.read', 'sales.write', 'sales.fulfil', 'sales.invoice'] as readonly string[] };

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `rpt-test-${suffix}@tadpods.local`, displayName: `Reports test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeCustomer(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const customer = await database.customer.create({ data: { code: `RPT-CUS-${suffix}`, name: `Reports test customer ${suffix}` } });
  return customer.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({ data: { code: `RWH-${suffix}`.slice(0, 20), name: `Reports test warehouse ${suffix}`, status: 'ACTIVE' } });
  return warehouse.id;
}

async function postOpeningStock(actorId: string, productId: string, warehouseId: string, quantity: string): Promise<void> {
  await posting.postMovement(
    { productId, warehouseId, movementType: 'OPENING_STOCK', signedQuantity: quantity, sourceType: 'test-opening-stock', sourceId: randomUUID(), sourceLineId: randomUUID(), idempotencyKey: randomUUID(), allowNegativeStockOverride: false },
    { id: actorId, permissions: [] },
    ctx()
  );
}

async function makeAndDeliverOrder(userId: string, customerId: string, warehouseId: string, productId: string, quantity: string, unitPrice: string): Promise<string> {
  const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId, unitPrice, orderedQuantity: quantity }] }), { ...salesActor, id: userId }, ctx());
  await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
  const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
  await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
  return order.id;
}

describe('reports', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('reports aged receivables reconciling to the customer account balance', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `RPT-PROD-${suffix}`, name: `Reports test product ${suffix}`, unitOfMeasure: 'EA' } });
    await postOpeningStock(userId, product.id, warehouseId, '10');

    const orderId = await makeAndDeliverOrder(userId, customerId, warehouseId, product.id, '10', '10.00');
    await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: orderId }), { ...salesActor, id: userId }, ctx());

    const rows = await reports.agedReceivables();
    const row = rows.find((entry) => entry.customerId === customerId);
    expect(row).toBeDefined();
    expect(row?.amountOwed).toBe('100.00');
  });

  it('recommends reordering a product below its reorder level', async () => {
    const suffix = randomUUID().slice(0, 8);
    const warehouseId = await makeWarehouse();
    const userId = await makeUser();
    const product = await database.product.create({ data: { sku: `RPT-LOW-${suffix}`, name: `Low stock product ${suffix}`, unitOfMeasure: 'EA', reorderLevel: '10', reorderQuantity: '50' } });
    await postOpeningStock(userId, product.id, warehouseId, '3');

    const rows = await reports.lowStock();
    const row = rows.find((entry) => entry.productId === product.id);
    expect(row).toBeDefined();
    expect(row?.needsReorder).toBe(true);
    expect(row?.suggestedOrderQuantity).toBe('50.0000');
  });

  it('does not recommend reordering a well-stocked product', async () => {
    const suffix = randomUUID().slice(0, 8);
    const warehouseId = await makeWarehouse();
    const userId = await makeUser();
    const product = await database.product.create({ data: { sku: `RPT-OK-${suffix}`, name: `Well stocked product ${suffix}`, unitOfMeasure: 'EA', reorderLevel: '10', reorderQuantity: '50' } });
    await postOpeningStock(userId, product.id, warehouseId, '100');

    const rows = await reports.lowStock();
    expect(rows.find((entry) => entry.productId === product.id)).toBeUndefined();
  });

  it('totals confirmed sales by customer and by product', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `RPT-SALE-${suffix}`, name: `Sales test product ${suffix}`, unitOfMeasure: 'EA' } });
    await postOpeningStock(userId, product.id, warehouseId, '20');
    await makeAndDeliverOrder(userId, customerId, warehouseId, product.id, '4', '15.00');

    const byCustomer = await reports.salesByCustomer({});
    const customerRow = byCustomer.find((entry) => entry.id === customerId);
    expect(customerRow?.totalAmount).toBe('60.00');

    const byProduct = await reports.salesByProduct({});
    const productRow = byProduct.find((entry) => entry.productId === product.id);
    expect(productRow?.totalAmount).toBe('60.00');
    expect(productRow?.quantity).toBe('4.0000');
  });

  it('excludes sales outside a given date range', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `RPT-RANGE-${suffix}`, name: `Range test product ${suffix}`, unitOfMeasure: 'EA' } });
    await postOpeningStock(userId, product.id, warehouseId, '10');
    await makeAndDeliverOrder(userId, customerId, warehouseId, product.id, '2', '10.00');

    const future = await reports.salesByCustomer({ from: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    expect(future.find((entry) => entry.id === customerId)).toBeUndefined();
  });

  it('reports cash received grouped by day and method', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `RPT-CASH-${suffix}`, name: `Cash test product ${suffix}`, unitOfMeasure: 'EA' } });
    await postOpeningStock(userId, product.id, warehouseId, '10');
    const orderId = await makeAndDeliverOrder(userId, customerId, warehouseId, product.id, '5', '10.00');
    await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: orderId }), { ...salesActor, id: userId }, ctx());
    await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '50.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    const rows = await reports.cashReceived({});
    const total = rows.filter((row) => row.method === 'bank-transfer').reduce((sum, row) => sum + Number(row.amountReceived), 0);
    expect(total).toBeGreaterThanOrEqual(50);
  });

  it('excludes VOIDED invoices and their draft-phase cancelled quantity from aged receivables', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `RPT-VOID-${suffix}`, name: `Void test product ${suffix}`, unitOfMeasure: 'EA' } });
    await postOpeningStock(userId, product.id, warehouseId, '10');
    const orderId = await makeAndDeliverOrder(userId, customerId, warehouseId, product.id, '10', '10.00');
    const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: orderId }), { ...salesActor, id: userId }, ctx());
    await invoices.void(invoice.id, { reason: 'test' }, { ...salesActor, id: userId }, ctx());

    const rows = await reports.agedReceivables();
    expect(rows.find((entry) => entry.customerId === customerId)).toBeUndefined();
  });
});

describe('toCsv', () => {
  it('serializes rows with RFC 4180 escaping for commas, quotes, and newlines', () => {
    const csv = toCsv(['name', 'note'], [['Acme, Inc.', 'Has a "quote"'], ['Plain', 'Line1\nLine2']]);
    expect(csv).toBe('name,note\r\n"Acme, Inc.","Has a ""quote"""\r\nPlain,"Line1\nLine2"\r\n');
  });

  it('produces just a header row for no data', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });
});
