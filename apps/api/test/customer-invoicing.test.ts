import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import {
  confirmSalesOrderSchema,
  createCustomerInvoiceSchema,
  createCustomerPaymentSchema,
  createCustomerCreditSchema,
  createCustomerRefundSchema,
  createDeliverySchema,
  createInstallmentPlanSchema,
  createSalesOrderSchema,
  postDeliverySchema,
  reallocateCustomerPaymentSchema,
  reverseCustomerPaymentSchema
} from '@tadpods/contracts';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { SalesOrdersService } from '../src/modules/sales-orders/sales-orders.service.js';
import { DeliveriesService } from '../src/modules/deliveries/deliveries.service.js';
import { CustomerInvoicesService } from '../src/modules/customer-invoices/customer-invoices.service.js';
import { InstallmentPlansService } from '../src/modules/customer-invoices/installment-plans.service.js';
import { CustomerPaymentsService } from '../src/modules/customer-payments/customer-payments.service.js';
import { CustomerCreditsService } from '../src/modules/customer-credits/customer-credits.service.js';
import { CustomersService } from '../src/modules/customers/customers.service.js';

const posting = new StockPostingService();
const salesOrders = new SalesOrdersService();
const deliveries = new DeliveriesService(posting);
const invoices = new CustomerInvoicesService();
const installmentPlans = new InstallmentPlansService();
const payments = new CustomerPaymentsService();
const credits = new CustomerCreditsService();
const customersService = new CustomersService();

const salesActor = { id: '', permissions: ['sales.read', 'sales.write', 'sales.fulfil', 'sales.invoice'] as readonly string[] };

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `inv-test-${suffix}@tadpods.local`, displayName: `Invoicing test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeCustomer(paymentTermsDays = 20): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const customer = await database.customer.create({ data: { code: `INV-CUS-${suffix}`, name: `Invoicing test customer ${suffix}`, paymentTermsDays } });
  return customer.id;
}

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({ data: { sku: `INV-PROD-${suffix}`, name: `Invoicing test product ${suffix}`, unitOfMeasure: 'EA' } });
  return product.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({ data: { code: `IWH-${suffix}`.slice(0, 20), name: `Invoicing test warehouse ${suffix}`, status: 'ACTIVE' } });
  return warehouse.id;
}

async function postOpeningStock(actorId: string, productId: string, warehouseId: string, quantity: string): Promise<void> {
  await posting.postMovement(
    { productId, warehouseId, movementType: 'OPENING_STOCK', signedQuantity: quantity, sourceType: 'test-opening-stock', sourceId: randomUUID(), sourceLineId: randomUUID(), idempotencyKey: randomUUID(), allowNegativeStockOverride: false },
    { id: actorId, permissions: [] },
    ctx()
  );
}

/** Creates a customer, warehouse, product, confirms and fully delivers a sales order, and returns its id. */
async function makeDeliveredOrder(userId: string, quantity: string, unitPrice: string, paymentTermsDays = 20): Promise<{ orderId: string; customerId: string }> {
  const customerId = await makeCustomer(paymentTermsDays);
  const warehouseId = await makeWarehouse();
  const productId = await makeProduct();
  await postOpeningStock(userId, productId, warehouseId, quantity);

  const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId, unitPrice, orderedQuantity: quantity }] }), { ...salesActor, id: userId }, ctx());
  await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
  const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
  await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());

  return { orderId: order.id, customerId };
}

async function makeInvoice(userId: string, orderId: string): Promise<string> {
  const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: orderId }), { ...salesActor, id: userId }, ctx());
  return invoice.id;
}

describe('customer invoices', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('raises an invoice from delivered quantity and prevents invoicing the same line twice', async () => {
    const userId = await makeUser();
    const { orderId } = await makeDeliveredOrder(userId, '10', '25.00');
    const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: orderId }), { ...salesActor, id: userId }, ctx());

    expect(invoice.invoiceNumber).toMatch(/^INV-\d+$/);
    expect(invoice.status).toBe('UNPAID');
    expect(invoice.totalAmount).toBe('250.00');

    await expect(invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: orderId }), { ...salesActor, id: userId }, ctx())).rejects.toMatchObject({ status: 400 });

    const order = await database.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.invoicingStatus).toBe('INVOICED');
  });

  it('voids an unpaid invoice, restoring the sales order line as uninvoiced', async () => {
    const userId = await makeUser();
    const { orderId } = await makeDeliveredOrder(userId, '5', '10.00');
    const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: orderId }), { ...salesActor, id: userId }, ctx());

    const voided = await invoices.void(invoice.id, { reason: 'Billed in error' }, { ...salesActor, id: userId }, ctx());
    expect(voided.status).toBe('VOIDED');

    const order = await database.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.invoicingStatus).toBe('NOT_INVOICED');
  });
});

describe('customer payments', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('records a full payment covering a single invoice (full payment)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    const payment = await payments.create(
      createCustomerPaymentSchema.parse({ customerId, amount: '100.00', method: 'bank-transfer', idempotencyKey: randomUUID() }),
      { ...salesActor, id: userId },
      ctx()
    );
    expect(payment.allocations).toHaveLength(1);
    expect(payment.allocations[0]?.amount).toBe('100.00');
    expect(payment.unappliedAmount).toBe('0.00');

    const invoice = await invoices.get(invoiceId);
    expect(invoice.status).toBe('PAID');
    expect(invoice.outstandingAmount).toBe('0.00');
  });

  it('records a partial payment, leaving the invoice partially paid (partial payment)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    const invoice = await invoices.get(invoiceId);
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.outstandingAmount).toBe('60.00');
  });

  it('applies one payment across multiple invoices, oldest first (one payment covering multiple invoices)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '20');

    async function deliverAndInvoice(): Promise<string> {
      const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId, unitPrice: '10.00', orderedQuantity: '5' }] }), { ...salesActor, id: userId }, ctx());
      await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
      const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
      await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
      const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: order.id }), { ...salesActor, id: userId }, ctx());
      return invoice.id;
    }

    const firstInvoiceId = await deliverAndInvoice();
    const secondInvoiceId = await deliverAndInvoice();

    const payment = await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '75.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    expect(payment.allocations).toHaveLength(2);

    const first = await invoices.get(firstInvoiceId);
    const second = await invoices.get(secondInvoiceId);
    expect(first.status).toBe('PAID');
    expect(second.status).toBe('PARTIALLY_PAID');
    expect(second.outstandingAmount).toBe('25.00');
  });

  it('covers one invoice with multiple payments (multiple payments covering one invoice)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '60.00', method: 'cash', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    const invoice = await invoices.get(invoiceId);
    expect(invoice.status).toBe('PAID');
    expect(invoice.appliedAmount).toBe('100.00');
  });

  it('leaves an overpayment as unapplied account credit (overpayment creating credit)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    await makeInvoice(userId, orderId);

    const payment = await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '150.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    expect(payment.unappliedAmount).toBe('50.00');

    const creditList = await credits.list({ customerId, page: 1, pageSize: 10 });
    expect(creditList.items).toHaveLength(1);
    expect(creditList.items[0]?.sourceType).toBe('OVERPAYMENT');
    expect(creditList.items[0]?.remaining).toBe('50.00');
  });

  it('applies a manual allocation across specific invoices (manual allocation)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '20');

    async function deliverAndInvoice(qty: string): Promise<string> {
      const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId, unitPrice: '10.00', orderedQuantity: qty }] }), { ...salesActor, id: userId }, ctx());
      await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
      const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
      await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
      const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: order.id }), { ...salesActor, id: userId }, ctx());
      return invoice.id;
    }

    const invoiceA = await deliverAndInvoice('5');
    const invoiceB = await deliverAndInvoice('5');

    // Manually pay the *newer* invoice first, opposite of the oldest-first default.
    const payment = await payments.create(
      createCustomerPaymentSchema.parse({ customerId, amount: '50.00', method: 'bank-transfer', idempotencyKey: randomUUID(), allocations: [{ customerInvoiceId: invoiceB, amount: '50.00' }] }),
      { ...salesActor, id: userId },
      ctx()
    );
    expect(payment.allocations).toHaveLength(1);
    expect(payment.allocations[0]?.customerInvoiceId).toBe(invoiceB);

    expect((await invoices.get(invoiceB)).status).toBe('PAID');
    expect((await invoices.get(invoiceA)).status).toBe('UNPAID');
  });

  it('reverses a payment allocation, restoring the invoice balance (allocation reversal)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    const payment = await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '100.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    expect((await invoices.get(invoiceId)).status).toBe('PAID');

    const reversed = await payments.reverse(payment.id, reverseCustomerPaymentSchema.parse({ reason: 'Payment bounced' }), { ...salesActor, id: userId }, ctx());
    expect(reversed.reversedAt).not.toBeNull();

    const invoice = await invoices.get(invoiceId);
    expect(invoice.status).toBe('UNPAID');
    expect(invoice.outstandingAmount).toBe('100.00');
  });

  it('reallocates a payment to a different invoice', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '20');

    async function deliverAndInvoice(): Promise<string> {
      const order = await salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId, unitPrice: '10.00', orderedQuantity: '5' }] }), { ...salesActor, id: userId }, ctx());
      await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
      const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
      await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
      const invoice = await invoices.create(createCustomerInvoiceSchema.parse({ salesOrderId: order.id }), { ...salesActor, id: userId }, ctx());
      return invoice.id;
    }

    const invoiceA = await deliverAndInvoice();
    const invoiceB = await deliverAndInvoice();
    const payment = await payments.create(
      createCustomerPaymentSchema.parse({ customerId, amount: '50.00', method: 'cash', idempotencyKey: randomUUID(), allocations: [{ customerInvoiceId: invoiceA, amount: '50.00' }] }),
      { ...salesActor, id: userId },
      ctx()
    );
    expect((await invoices.get(invoiceA)).status).toBe('PAID');

    const reallocated = await payments.reallocate(payment.id, reallocateCustomerPaymentSchema.parse({ allocations: [{ customerInvoiceId: invoiceB, amount: '50.00' }] }), { ...salesActor, id: userId }, ctx());
    expect(reallocated.allocations.filter((allocation) => !allocation.reversedAt)).toHaveLength(1);

    expect((await invoices.get(invoiceA)).status).toBe('UNPAID');
    expect((await invoices.get(invoiceB)).status).toBe('PAID');
  });

  it('rejects a duplicate payment retried with the same idempotency key (duplicate payment prevention)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    await makeInvoice(userId, orderId);

    const idempotencyKey = randomUUID();
    const first = await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '50.00', method: 'cash', idempotencyKey }), { ...salesActor, id: userId }, ctx());
    const second = await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '50.00', method: 'cash', idempotencyKey }), { ...salesActor, id: userId }, ctx());

    expect(second.id).toBe(first.id);
    const paymentCount = await database.customerPayment.count({ where: { customerId } });
    expect(paymentCount).toBe(1);
  });

  it('applies concurrent payments against the same invoice without losing an allocation (concurrent allocation)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    await Promise.all([
      payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx()),
      payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '60.00', method: 'cash', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx())
    ]);

    const invoice = await invoices.get(invoiceId);
    expect(invoice.status).toBe('PAID');
    expect(invoice.appliedAmount).toBe('100.00');
  });
});

describe('customer credits and refunds', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('applies a manual credit that fully covers an invoice (credit applied later)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    const credit = await credits.create(createCustomerCreditSchema.parse({ customerId, amount: '100.00', sourceType: 'MANUAL' }), { ...salesActor, id: userId }, ctx());
    const applied = await credits.apply(credit.id, { customerInvoiceId: invoiceId }, { ...salesActor, id: userId }, ctx());
    expect(applied.remaining).toBe('0.00');

    const invoice = await invoices.get(invoiceId);
    // Fully settled with no cash payment applied at all — CREDITED rather than PAID.
    expect(invoice.status).toBe('CREDITED');
    expect(invoice.outstandingAmount).toBe('0.00');
  });

  it('applies a partial manual credit, leaving the invoice partially paid', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    const credit = await credits.create(createCustomerCreditSchema.parse({ customerId, amount: '30.00', sourceType: 'MANUAL' }), { ...salesActor, id: userId }, ctx());
    const applied = await credits.apply(credit.id, { customerInvoiceId: invoiceId }, { ...salesActor, id: userId }, ctx());
    expect(applied.remaining).toBe('0.00');

    const invoice = await invoices.get(invoiceId);
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.outstandingAmount).toBe('70.00');
  });

  it('refunds an unapplied credit (refund)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    await makeInvoice(userId, orderId);

    const payment = await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '150.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    const credit = (await credits.list({ customerId, page: 1, pageSize: 10 })).items[0]!;
    expect(credit.remaining).toBe('50.00');

    const refund = await credits.createRefund(createCustomerRefundSchema.parse({ customerCreditId: credit.id, amount: '50.00', method: 'bank-transfer' }), { ...salesActor, id: userId }, ctx());
    expect(refund.refundNumber).toMatch(/^RF-\d+$/);

    const refreshedCredit = await credits.get(credit.id);
    expect(refreshedCredit.remaining).toBe('0.00');

    // A fully-refunded overpayment credit cannot be reversed away by reversing its source payment.
    await expect(payments.reverse(payment.id, {}, { ...salesActor, id: userId }, ctx())).rejects.toMatchObject({ status: 409 });
  });
});

describe('installment plans', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('splits an invoice into weekly installments summing to the total (multiple installments)', async () => {
    const userId = await makeUser();
    const { orderId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    const plan = await installmentPlans.create(
      invoiceId,
      createInstallmentPlanSchema.parse({ frequency: 'WEEKLY', startDate: new Date().toISOString(), installmentCount: 4 }),
      { ...salesActor, id: userId },
      ctx()
    );
    expect(plan.lines).toHaveLength(4);
    const total = plan.lines.reduce((sum, line) => sum + Number(line.amount), 0);
    expect(total.toFixed(2)).toBe('100.00');

    // Unscheduled partial payments remain allowed regardless of the plan.
    const invoiceRow = await database.customerInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    await payments.create(createCustomerPaymentSchema.parse({ customerId: invoiceRow.customerId, amount: '25.00', method: 'cash', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    expect((await invoices.get(invoiceId)).status).toBe('PARTIALLY_PAID');
  });

  it('supports a deposit-and-final schedule', async () => {
    const userId = await makeUser();
    const { orderId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    const plan = await installmentPlans.create(
      invoiceId,
      createInstallmentPlanSchema.parse({ frequency: 'CUSTOM', lines: [{ dueDate: new Date().toISOString(), amount: '25.00' }, { dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), amount: '75.00' }] }),
      { ...salesActor, id: userId },
      ctx()
    );
    expect(plan.lines.map((line) => line.amount)).toEqual(['25.00', '75.00']);
  });

  it('rejects a custom schedule that does not sum to the invoice total', async () => {
    const userId = await makeUser();
    const { orderId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    await expect(
      installmentPlans.create(invoiceId, createInstallmentPlanSchema.parse({ frequency: 'CUSTOM', lines: [{ dueDate: new Date().toISOString(), amount: '50.00' }] }), { ...salesActor, id: userId }, ctx())
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a second installment plan for the same invoice', async () => {
    const userId = await makeUser();
    const { orderId } = await makeDeliveredOrder(userId, '10', '10.00');
    const invoiceId = await makeInvoice(userId, orderId);

    await installmentPlans.create(invoiceId, createInstallmentPlanSchema.parse({ frequency: 'WEEKLY', startDate: new Date().toISOString(), installmentCount: 2 }), { ...salesActor, id: userId }, ctx());
    await expect(
      installmentPlans.create(invoiceId, createInstallmentPlanSchema.parse({ frequency: 'WEEKLY', startDate: new Date().toISOString(), installmentCount: 2 }), { ...salesActor, id: userId }, ctx())
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('customer account and statements', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('reports aged receivables correctly (aged receivables)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00', 0);
    const invoice = await invoices.create(
      createCustomerInvoiceSchema.parse({ salesOrderId: orderId, issueDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }),
      { ...salesActor, id: userId },
      ctx()
    );

    const account = await customersService.account(customerId);
    expect(account.amountOwed).toBe('100.00');
    expect(account.overdue).toBe('100.00');
    expect(invoice.displayStatus).toBe('OVERDUE');
  });

  it('reproduces the account balance exactly in the statement (statement balance)', async () => {
    const userId = await makeUser();
    const { orderId, customerId } = await makeDeliveredOrder(userId, '10', '10.00');
    await makeInvoice(userId, orderId);
    await payments.create(createCustomerPaymentSchema.parse({ customerId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    const account = await customersService.account(customerId);
    const statement = await customersService.statement(customerId);
    expect(statement.closingBalance).toBe(account.amountOwed);
  });
});
