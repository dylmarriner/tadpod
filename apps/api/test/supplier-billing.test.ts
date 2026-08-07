import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import {
  createGoodsReceiptSchema,
  createPurchaseOrderSchema,
  createSupplierBillSchema,
  createSupplierPaymentSchema,
  createSupplierCreditSchema,
  createSupplierRefundSchema,
  reallocateSupplierPaymentSchema,
  reverseSupplierPaymentSchema
} from '@tadpods/contracts';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { GoodsReceiptsService } from '../src/modules/goods-receipts/goods-receipts.service.js';
import { PurchaseOrdersService } from '../src/modules/purchase-orders/purchase-orders.service.js';
import { SupplierBillsService } from '../src/modules/supplier-bills/supplier-bills.service.js';
import { SupplierPaymentsService } from '../src/modules/supplier-payments/supplier-payments.service.js';
import { SupplierCreditsService } from '../src/modules/supplier-credits/supplier-credits.service.js';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service.js';

const posting = new StockPostingService();
const goodsReceipts = new GoodsReceiptsService(posting);
const purchaseOrders = new PurchaseOrdersService();
const bills = new SupplierBillsService();
const payments = new SupplierPaymentsService();
const credits = new SupplierCreditsService();
const suppliersService = new SuppliersService();

const purchasingActor = { id: '', permissions: ['purchasing.read', 'purchasing.write', 'purchasing.approve', 'purchasing.bill'] as readonly string[] };

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `bill-test-${suffix}@tadpods.local`, displayName: `Billing test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeSupplier(paymentTermsDays = 20): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const supplier = await database.supplier.create({ data: { code: `BILL-SUP-${suffix}`, name: `Billing test supplier ${suffix}`, paymentTermsDays } });
  return supplier.id;
}

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({ data: { sku: `BILL-PROD-${suffix}`, name: `Billing test product ${suffix}`, unitOfMeasure: 'EA' } });
  return product.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({ data: { code: `BWH-${suffix}`.slice(0, 20), name: `Billing test warehouse ${suffix}`, status: 'ACTIVE' } });
  return warehouse.id;
}

/** Creates a supplier, warehouse, product, confirms and fully receives a purchase order, and returns its id. */
async function makeReceivedOrder(userId: string, quantity: string, unitCost: string, paymentTermsDays = 20): Promise<{ orderId: string; supplierId: string }> {
  const supplierId = await makeSupplier(paymentTermsDays);
  const warehouseId = await makeWarehouse();
  const productId = await makeProduct();
  const actor = { ...purchasingActor, id: userId };

  const order = await purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost, orderedQuantity: quantity }] }), actor, ctx());
  await purchaseOrders.confirm(order.id, actor, ctx());
  await goodsReceipts.create(
    createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: quantity }] }),
    actor,
    ctx()
  );

  return { orderId: order.id, supplierId };
}

async function makeBill(userId: string, orderId: string): Promise<string> {
  const bill = await bills.create(createSupplierBillSchema.parse({ purchaseOrderId: orderId }), { ...purchasingActor, id: userId }, ctx());
  return bill.id;
}

describe('supplier bills', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('raises a bill from received quantity and prevents billing the same line twice (duplicate supplier invoice prevention)', async () => {
    const userId = await makeUser();
    const { orderId } = await makeReceivedOrder(userId, '10', '25.00');
    const bill = await bills.create(createSupplierBillSchema.parse({ purchaseOrderId: orderId }), { ...purchasingActor, id: userId }, ctx());

    expect(bill.billNumber).toMatch(/^BILL-\d+$/);
    expect(bill.status).toBe('UNPAID');
    expect(bill.totalAmount).toBe('250.00');

    await expect(bills.create(createSupplierBillSchema.parse({ purchaseOrderId: orderId }), { ...purchasingActor, id: userId }, ctx())).rejects.toMatchObject({ status: 400 });

    const order = await database.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('BILLED');
  });

  it('supports partial and multiple bills against one order', async () => {
    const userId = await makeUser();
    const { orderId } = await makeReceivedOrder(userId, '10', '10.00');
    const lineId = (await purchaseOrders.get(orderId)).lines[0]!.id;

    const first = await bills.create(createSupplierBillSchema.parse({ purchaseOrderId: orderId, lines: [{ purchaseOrderLineId: lineId, quantity: '4' }] }), { ...purchasingActor, id: userId }, ctx());
    expect(first.totalAmount).toBe('40.00');
    let order = await purchaseOrders.get(orderId);
    expect(order.status).toBe('PARTIALLY_BILLED');

    const second = await bills.create(createSupplierBillSchema.parse({ purchaseOrderId: orderId, lines: [{ purchaseOrderLineId: lineId, quantity: '6' }] }), { ...purchasingActor, id: userId }, ctx());
    expect(second.totalAmount).toBe('60.00');
    order = await purchaseOrders.get(orderId);
    expect(order.status).toBe('BILLED');
  });

  it('voids an unpaid bill, restoring the purchase order line as unbilled', async () => {
    const userId = await makeUser();
    const { orderId } = await makeReceivedOrder(userId, '5', '10.00');
    const bill = await bills.create(createSupplierBillSchema.parse({ purchaseOrderId: orderId }), { ...purchasingActor, id: userId }, ctx());

    const voided = await bills.void(bill.id, { reason: 'Billed in error' }, { ...purchasingActor, id: userId }, ctx());
    expect(voided.status).toBe('VOIDED');

    const order = await database.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('RECEIVED');
  });
});

describe('supplier payments', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('records a full payment covering a single bill (full payment)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    const billId = await makeBill(userId, orderId);

    const payment = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '100.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());
    expect(payment.allocations).toHaveLength(1);
    expect(payment.unappliedAmount).toBe('0.00');

    const bill = await bills.get(billId);
    expect(bill.status).toBe('PAID');
    expect(bill.outstandingAmount).toBe('0.00');
  });

  it('records a partial payment, leaving the bill partially paid (partial payment)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    const billId = await makeBill(userId, orderId);

    await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());

    const bill = await bills.get(billId);
    expect(bill.status).toBe('PARTIALLY_PAID');
    expect(bill.outstandingAmount).toBe('60.00');
  });

  it('applies one payment across multiple bills, oldest first (one payment covering multiple bills)', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    const actor = { ...purchasingActor, id: userId };

    async function receiveAndBill(): Promise<string> {
      const order = await purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '10.00', orderedQuantity: '5' }] }), actor, ctx());
      await purchaseOrders.confirm(order.id, actor, ctx());
      await goodsReceipts.create(createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '5' }] }), actor, ctx());
      const bill = await bills.create(createSupplierBillSchema.parse({ purchaseOrderId: order.id }), actor, ctx());
      return bill.id;
    }

    const firstBillId = await receiveAndBill();
    const secondBillId = await receiveAndBill();

    const payment = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '75.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), actor, ctx());
    expect(payment.allocations).toHaveLength(2);

    const first = await bills.get(firstBillId);
    const second = await bills.get(secondBillId);
    expect(first.status).toBe('PAID');
    expect(second.status).toBe('PARTIALLY_PAID');
    expect(second.outstandingAmount).toBe('25.00');
  });

  it('covers one bill with multiple payments (multiple payments covering one bill)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    const billId = await makeBill(userId, orderId);

    await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '60.00', method: 'cash', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());
    await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());

    const bill = await bills.get(billId);
    expect(bill.status).toBe('PAID');
    expect(bill.appliedAmount).toBe('100.00');
  });

  it('leaves an advance payment as unapplied account credit (advance payment and unallocated credit)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    await makeBill(userId, orderId);

    const payment = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '150.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());
    expect(payment.unappliedAmount).toBe('50.00');

    const creditList = await credits.list({ supplierId, page: 1, pageSize: 10 });
    expect(creditList.items).toHaveLength(1);
    expect(creditList.items[0]?.sourceType).toBe('OVERPAYMENT');
    expect(creditList.items[0]?.remaining).toBe('50.00');
  });

  it('reverses a payment allocation, restoring the bill balance (allocation reversal)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    const billId = await makeBill(userId, orderId);

    const payment = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '100.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());
    expect((await bills.get(billId)).status).toBe('PAID');

    const reversed = await payments.reverse(payment.id, reverseSupplierPaymentSchema.parse({ reason: 'Payment bounced' }), { ...purchasingActor, id: userId }, ctx());
    expect(reversed.reversedAt).not.toBeNull();

    const bill = await bills.get(billId);
    expect(bill.status).toBe('UNPAID');
    expect(bill.outstandingAmount).toBe('100.00');
  });

  it('reallocates a payment to a different bill', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    const actor = { ...purchasingActor, id: userId };

    async function receiveAndBill(): Promise<string> {
      const order = await purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '10.00', orderedQuantity: '5' }] }), actor, ctx());
      await purchaseOrders.confirm(order.id, actor, ctx());
      await goodsReceipts.create(createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '5' }] }), actor, ctx());
      const bill = await bills.create(createSupplierBillSchema.parse({ purchaseOrderId: order.id }), actor, ctx());
      return bill.id;
    }

    const billA = await receiveAndBill();
    const billB = await receiveAndBill();
    const payment = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '50.00', method: 'cash', idempotencyKey: randomUUID(), allocations: [{ supplierBillId: billA, amount: '50.00' }] }), actor, ctx());
    expect((await bills.get(billA)).status).toBe('PAID');

    const reallocated = await payments.reallocate(payment.id, reallocateSupplierPaymentSchema.parse({ allocations: [{ supplierBillId: billB, amount: '50.00' }] }), actor, ctx());
    expect(reallocated.allocations.filter((allocation) => !allocation.reversedAt)).toHaveLength(1);

    expect((await bills.get(billA)).status).toBe('UNPAID');
    expect((await bills.get(billB)).status).toBe('PAID');
  });

  it('rejects a duplicate payment retried with the same idempotency key', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    await makeBill(userId, orderId);

    const idempotencyKey = randomUUID();
    const first = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '50.00', method: 'cash', idempotencyKey }), { ...purchasingActor, id: userId }, ctx());
    const second = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '50.00', method: 'cash', idempotencyKey }), { ...purchasingActor, id: userId }, ctx());

    expect(second.id).toBe(first.id);
    const paymentCount = await database.supplierPayment.count({ where: { supplierId } });
    expect(paymentCount).toBe(1);
  });

  it('applies concurrent payments against the same bill without losing an allocation (concurrent allocation)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    const billId = await makeBill(userId, orderId);

    await Promise.all([
      payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx()),
      payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '60.00', method: 'cash', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx())
    ]);

    const bill = await bills.get(billId);
    expect(bill.status).toBe('PAID');
    expect(bill.appliedAmount).toBe('100.00');
  });
});

describe('supplier credits and refunds', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('applies a manual supplier credit that fully covers a bill (supplier credit and refund)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    const billId = await makeBill(userId, orderId);

    const credit = await credits.create(createSupplierCreditSchema.parse({ supplierId, amount: '100.00', sourceType: 'MANUAL' }), { ...purchasingActor, id: userId }, ctx());
    const applied = await credits.apply(credit.id, { supplierBillId: billId }, { ...purchasingActor, id: userId }, ctx());
    expect(applied.remaining).toBe('0.00');

    const bill = await bills.get(billId);
    expect(bill.status).toBe('CREDITED');
    expect(bill.outstandingAmount).toBe('0.00');
  });

  it('refunds an unapplied supplier credit', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    await makeBill(userId, orderId);

    const payment = await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '150.00', method: 'bank-transfer', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());
    const credit = (await credits.list({ supplierId, page: 1, pageSize: 10 })).items[0]!;
    expect(credit.remaining).toBe('50.00');

    const refund = await credits.createRefund(createSupplierRefundSchema.parse({ supplierCreditId: credit.id, amount: '50.00', method: 'bank-transfer' }), { ...purchasingActor, id: userId }, ctx());
    expect(refund.refundNumber).toMatch(/^SRF-\d+$/);

    const refreshedCredit = await credits.get(credit.id);
    expect(refreshedCredit.remaining).toBe('0.00');

    await expect(payments.reverse(payment.id, {}, { ...purchasingActor, id: userId }, ctx())).rejects.toMatchObject({ status: 409 });
  });
});

describe('supplier account, aging, and received-not-billed', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('reports aged payables correctly (supplier balance / aged payables)', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00', 0);
    const bill = await bills.create(
      createSupplierBillSchema.parse({ purchaseOrderId: orderId, issueDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }),
      { ...purchasingActor, id: userId },
      ctx()
    );

    const account = await suppliersService.account(supplierId);
    expect(account.amountOwed).toBe('100.00');
    expect(account.overdue).toBe('100.00');
    expect(bill.displayStatus).toBe('OVERDUE');
  });

  it('shows received-not-billed separately from amountOwed until a bill is raised (received-not-billed)', async () => {
    const userId = await makeUser();
    const { supplierId } = await makeReceivedOrder(userId, '10', '10.00');

    const account = await suppliersService.account(supplierId);
    expect(account.amountOwed).toBe('0.00');
    expect(account.receivedNotBilled).toBe('100.00');
  });

  it('reproduces the account balance exactly in the statement', async () => {
    const userId = await makeUser();
    const { orderId, supplierId } = await makeReceivedOrder(userId, '10', '10.00');
    await makeBill(userId, orderId);
    await payments.create(createSupplierPaymentSchema.parse({ supplierId, amount: '40.00', method: 'cash', idempotencyKey: randomUUID() }), { ...purchasingActor, id: userId }, ctx());

    const account = await suppliersService.account(supplierId);
    const statement = await suppliersService.statement(supplierId);
    expect(statement.closingBalance).toBe(account.amountOwed);
  });
});
