import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { createGoodsReceiptSchema, createPurchaseOrderSchema, reverseGoodsReceiptSchema } from '@tadpods/contracts';
import { GoodsReceiptsService } from '../src/modules/goods-receipts/goods-receipts.service.js';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { StockQueryService } from '../src/modules/inventory/stock-query.service.js';
import { PurchaseOrdersService } from '../src/modules/purchase-orders/purchase-orders.service.js';

const posting = new StockPostingService();
const query = new StockQueryService();
const goodsReceipts = new GoodsReceiptsService(posting);
const purchaseOrders = new PurchaseOrdersService();

const writer = { id: '', permissions: ['purchasing.read', 'purchasing.write'] as readonly string[] };
const approver = { id: '', permissions: ['purchasing.read', 'purchasing.write', 'purchasing.approve'] as readonly string[] };

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `grn-test-${suffix}@tadpods.local`, displayName: `GRN test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeSupplier(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const supplier = await database.supplier.create({ data: { code: `GRN-SUP-${suffix}`, name: `GRN test supplier ${suffix}` } });
  return supplier.id;
}

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({ data: { sku: `GRN-PROD-${suffix}`, name: `GRN test product ${suffix}`, unitOfMeasure: 'EA' } });
  return product.id;
}

async function makeWarehouse(status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE'): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({ data: { code: `GWH-${suffix}`.slice(0, 20), name: `GRN test warehouse ${suffix}`, status } });
  return warehouse.id;
}

/**
 * Confirms using an actor holding `purchasing.approve` so this suite's orders confirm
 * regardless of an approval threshold another test file may have concurrently set on the
 * shared `SystemSettings` singleton row.
 */
async function makeConfirmedOrder(actorId: string, productId: string, supplierId: string, orderedQuantity: string, unitCost = '10.00') {
  const actor = { ...approver, id: actorId };
  const order = await purchaseOrders.create(
    createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost, orderedQuantity }] }),
    actor,
    ctx()
  );
  return purchaseOrders.confirm(order.id, actor, ctx());
}

describe('GoodsReceiptsService', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('receives a full order, posts stock once, and moves the order to RECEIVED', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '10');

    const receipt = await goodsReceipts.create(
      createGoodsReceiptSchema.parse({
        purchaseOrderId: order.id,
        warehouseId,
        idempotencyKey: randomUUID(),
        lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '10' }]
      }),
      actor,
      ctx()
    );

    expect(receipt.receiptNumber).toMatch(/^GRN-\d+$/);
    expect(receipt.lines[0]?.acceptedQuantity).toBe('10.0000');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '10.0000' }]);

    const movements = await database.stockMovement.findMany({ where: { sourceType: 'goods-receipt-line', sourceId: receipt.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.movementType).toBe('GOODS_RECEIPT');

    const updatedOrder = await purchaseOrders.get(order.id);
    expect(updatedOrder.status).toBe('RECEIVED');
    expect(updatedOrder.lines[0]?.receivedQuantity).toBe('10');
    expect(updatedOrder.lines[0]?.outstandingQuantity).toBe('0.0000');
  });

  it('supports a partial receipt followed by a second receipt that completes the order', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '10');
    const lineId = order.lines[0]!.id;

    const first = await goodsReceipts.create(
      createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: lineId, receivedQuantity: '4' }] }),
      actor,
      ctx()
    );
    expect(first.lines[0]?.acceptedQuantity).toBe('4.0000');

    const afterFirst = await purchaseOrders.get(order.id);
    expect(afterFirst.status).toBe('PARTIALLY_RECEIVED');

    await goodsReceipts.create(
      createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: lineId, receivedQuantity: '6' }] }),
      actor,
      ctx()
    );

    const afterSecond = await purchaseOrders.get(order.id);
    expect(afterSecond.status).toBe('RECEIVED');
    expect(afterSecond.lines[0]?.receivedQuantity).toBe('10');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '10.0000' }]);
  });

  it('accepts only the net of received minus rejected quantity into stock and onto the order line', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '10');

    const receipt = await goodsReceipts.create(
      createGoodsReceiptSchema.parse({
        purchaseOrderId: order.id,
        warehouseId,
        idempotencyKey: randomUUID(),
        lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '10', rejectedQuantity: '3' }]
      }),
      actor,
      ctx()
    );
    expect(receipt.lines[0]?.acceptedQuantity).toBe('7.0000');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '7.0000' }]);
  });

  it('rejects a receipt line that does not belong to the purchase order', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '10');

    await expect(
      goodsReceipts.create(
        createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: randomUUID(), receivedQuantity: '1' }] }),
        actor,
        ctx()
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects receiving above the ordered quantity without a tolerance override, and rejects the override without purchasing.approve', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '5');
    const lineId = order.lines[0]!.id;

    await expect(
      goodsReceipts.create(
        createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: lineId, receivedQuantity: '6' }] }),
        actor,
        ctx()
      )
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      goodsReceipts.create(
        createGoodsReceiptSchema.parse({
          purchaseOrderId: order.id,
          warehouseId,
          idempotencyKey: randomUUID(),
          allowToleranceOverride: true,
          lines: [{ purchaseOrderLineId: lineId, receivedQuantity: '6' }]
        }),
        actor,
        ctx()
      )
    ).rejects.toMatchObject({ status: 403 });

    const approverId = await makeUser();
    const approvingActor = { ...approver, id: approverId };
    const overReceipt = await goodsReceipts.create(
      createGoodsReceiptSchema.parse({
        purchaseOrderId: order.id,
        warehouseId,
        idempotencyKey: randomUUID(),
        allowToleranceOverride: true,
        lines: [{ purchaseOrderLineId: lineId, receivedQuantity: '6' }]
      }),
      approvingActor,
      ctx()
    );
    expect(overReceipt.lines[0]?.acceptedQuantity).toBe('6.0000');
  });

  it('rejects receiving into an inactive warehouse', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse('ARCHIVED');
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '5');

    await expect(
      goodsReceipts.create(
        createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '1' }] }),
        actor,
        ctx()
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a rejectedQuantity greater than receivedQuantity', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '10');

    await expect(
      goodsReceipts.create(
        createGoodsReceiptSchema.parse({
          purchaseOrderId: order.id,
          warehouseId,
          idempotencyKey: randomUUID(),
          lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '2', rejectedQuantity: '3' }]
        }),
        actor,
        ctx()
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a receipt against a draft or cancelled purchase order', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const draft = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '10.00', orderedQuantity: '1' }] }),
      actor,
      ctx()
    );

    await expect(
      goodsReceipts.create(
        createGoodsReceiptSchema.parse({ purchaseOrderId: draft.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: draft.lines[0]!.id, receivedQuantity: '1' }] }),
        actor,
        ctx()
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it('reverses a receipt: stock returns to zero and the order line re-opens', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '10');
    const receipt = await goodsReceipts.create(
      createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '10' }] }),
      actor,
      ctx()
    );

    const reversed = await goodsReceipts.reverse(receipt.id, reverseGoodsReceiptSchema.parse({ idempotencyKey: randomUUID() }), actor, ctx());
    expect(reversed.reversedAt).not.toBeNull();

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '0.0000' }]);

    const updatedOrder = await purchaseOrders.get(order.id);
    expect(updatedOrder.status).toBe('CONFIRMED');
    expect(updatedOrder.lines[0]?.receivedQuantity).toBe('0');
  });

  it('rejects reversing an already-reversed receipt', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actor = { ...writer, id: userId };

    const order = await makeConfirmedOrder(userId, productId, supplierId, '5');
    const receipt = await goodsReceipts.create(
      createGoodsReceiptSchema.parse({ purchaseOrderId: order.id, warehouseId, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: order.lines[0]!.id, receivedQuantity: '5' }] }),
      actor,
      ctx()
    );

    await goodsReceipts.reverse(receipt.id, reverseGoodsReceiptSchema.parse({ idempotencyKey: randomUUID() }), actor, ctx());

    await expect(
      goodsReceipts.reverse(receipt.id, reverseGoodsReceiptSchema.parse({ idempotencyKey: randomUUID() }), actor, ctx())
    ).rejects.toMatchObject({ status: 409 });
  });
});
