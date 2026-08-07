import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { createSalesOrderSchema, confirmSalesOrderSchema, createDeliverySchema, postDeliverySchema, createReservationSchema, runReservationAllocationSchema } from '@tadpods/contracts';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { SalesOrdersService } from '../src/modules/sales-orders/sales-orders.service.js';
import { ReservationsService } from '../src/modules/reservations/reservations.service.js';
import { DeliveriesService } from '../src/modules/deliveries/deliveries.service.js';
import { BackordersService } from '../src/modules/backorders/backorders.service.js';

const posting = new StockPostingService();
const salesOrders = new SalesOrdersService();
const reservations = new ReservationsService();
const deliveries = new DeliveriesService(posting);
const backorders = new BackordersService();

const salesActor = { id: '', permissions: ['sales.read', 'sales.write', 'sales.fulfil'] as readonly string[] };

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `so-test-${suffix}@tadpods.local`, displayName: `SO test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeCustomer(overrides: { creditLimitMinorUnits?: bigint; active?: boolean } = {}): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const customer = await database.customer.create({
    data: { code: `SO-CUS-${suffix}`, name: `SO test customer ${suffix}`, active: overrides.active ?? true, creditLimitMinorUnits: overrides.creditLimitMinorUnits ?? 0n }
  });
  return customer.id;
}

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({ data: { sku: `SO-PROD-${suffix}`, name: `SO test product ${suffix}`, unitOfMeasure: 'EA', reorderQuantity: '10' } });
  return product.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({ data: { code: `SWH-${suffix}`.slice(0, 20), name: `SO test warehouse ${suffix}`, status: 'ACTIVE' } });
  return warehouse.id;
}

async function makeSupplier(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const supplier = await database.supplier.create({ data: { code: `SO-SUP-${suffix}`, name: `SO test supplier ${suffix}` } });
  return supplier.id;
}

async function postOpeningStock(actorId: string, productId: string, warehouseId: string, quantity: string): Promise<void> {
  await posting.postMovement(
    {
      productId,
      warehouseId,
      movementType: 'OPENING_STOCK',
      signedQuantity: quantity,
      sourceType: 'test-opening-stock',
      sourceId: randomUUID(),
      sourceLineId: randomUUID(),
      idempotencyKey: randomUUID(),
      allowNegativeStockOverride: false
    },
    { id: actorId, permissions: [] },
    ctx()
  );
}

async function makeDraftOrder(actorId: string, customerId: string, warehouseId: string, productId: string, quantity: string, unitPrice = '10.00') {
  const actor = { ...salesActor, id: actorId };
  return salesOrders.create(createSalesOrderSchema.parse({ customerId, warehouseId, lines: [{ productId, unitPrice, orderedQuantity: quantity }] }), actor, ctx());
}

describe('sales order confirmation and reservation', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('reserves in full when stock fully covers demand (full stock availability)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '20');

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '10');
    const confirmed = await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    expect(confirmed.status).toBe('ALLOCATED');
    expect(confirmed.lines[0]?.reservedQuantity).toBe('10');
    expect(confirmed.lines[0]?.backorderedQuantity).toBe('0');
  });

  it('reserves what is available and backorders the rest (partial availability / partial backorder)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '4');

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '10');
    const confirmed = await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    expect(confirmed.status).toBe('PARTIALLY_ALLOCATED');
    expect(confirmed.lines[0]?.reservedQuantity).toBe('4');
    expect(confirmed.lines[0]?.backorderedQuantity).toBe('6');

    const backorder = await database.backorder.findFirst({ where: { salesOrderId: order.id } });
    expect(backorder).not.toBeNull();
    expect(backorder?.status).toBe('PENDING_STOCK');
  });

  it('backorders in full when no stock is available (full backorder)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '5');
    const confirmed = await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    expect(confirmed.status).toBe('BACKORDERED');
    expect(confirmed.lines[0]?.reservedQuantity).toBe('0');
    expect(confirmed.lines[0]?.backorderedQuantity).toBe('5');
  });

  it('rejects confirming an order that exceeds the customer credit limit without an override', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer({ creditLimitMinorUnits: 50_00n });
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '10', '10.00');
    await expect(
      salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx())
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID(), allowCreditLimitOverride: true }), { ...salesActor, id: userId }, ctx())
    ).rejects.toMatchObject({ status: 403 });

    const overrideActor = { id: userId, permissions: [...salesActor.permissions, 'sales.override-credit-limit'] };
    const confirmed = await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID(), allowCreditLimitOverride: true }), overrideActor, ctx());
    expect(confirmed.status).toBe('BACKORDERED');
  });

  it('cancels a confirmed order, releasing reservations and backorders (cancellation)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '3');

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '10');
    await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    const cancelled = await salesOrders.cancel(order.id, { reason: 'Customer changed mind' }, { ...salesActor, id: userId }, ctx());
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.lines[0]?.cancelledQuantity).toBe('10');

    const activeReservationCount = await database.stockReservation.count({ where: { salesOrderId: order.id, status: 'ACTIVE' } });
    expect(activeReservationCount).toBe(0);
    const backorder = await database.backorder.findFirst({ where: { salesOrderId: order.id } });
    expect(backorder?.status).toBe('CANCELLED');
  });
});

describe('reservation allocation and manual reservation', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('reserves manually against a specific line, absorbing any existing backorder (reserve manually)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '5');
    const confirmed = await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    expect(confirmed.lines[0]?.backorderedQuantity).toBe('5');

    await postOpeningStock(userId, productId, warehouseId, '5');
    const lineId = confirmed.lines[0]!.id;
    const reservation = await reservations.create(createReservationSchema.parse({ salesOrderLineId: lineId, quantity: '5' }), { ...salesActor, id: userId }, ctx());
    expect(reservation.status).toBe('ACTIVE');
    expect(reservation.method).toBe('MANUAL');

    const updatedLine = await database.salesOrderLine.findUniqueOrThrow({ where: { id: lineId } });
    expect(updatedLine.reservedQuantity.toString()).toBe('5');
    expect(updatedLine.backorderedQuantity.toString()).toBe('0');
  });

  it('rejects a manual reservation that would oversubscribe stock on hand (concurrent reservation guard)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '3');

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '3');
    const confirmed = await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    expect(confirmed.lines[0]?.reservedQuantity).toBe('3');

    const secondOrder = await makeDraftOrder(userId, customerId, warehouseId, productId, '1');
    await expect(
      reservations.create(createReservationSchema.parse({ salesOrderLineId: secondOrder.lines[0]!.id, quantity: '1' }), { ...salesActor, id: userId }, ctx())
    ).rejects.toMatchObject({ status: 409 });
  });

  it('runs a priority allocation across competing orders, giving the highest-priority order the stock first', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();

    const lowPriorityOrder = await salesOrders.create(
      createSalesOrderSchema.parse({ customerId, warehouseId, priority: 9, lines: [{ productId, unitPrice: '10.00', orderedQuantity: '5' }] }),
      { ...salesActor, id: userId },
      ctx()
    );
    const highPriorityOrder = await salesOrders.create(
      createSalesOrderSchema.parse({ customerId, warehouseId, priority: 1, lines: [{ productId, unitPrice: '10.00', orderedQuantity: '5' }] }),
      { ...salesActor, id: userId },
      ctx()
    );
    await salesOrders.confirm(lowPriorityOrder.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    await salesOrders.confirm(highPriorityOrder.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    await postOpeningStock(userId, productId, warehouseId, '6');
    const result = await reservations.runAllocation(
      runReservationAllocationSchema.parse({ productId, warehouseId, method: 'PRIORITY' }),
      { ...salesActor, id: userId },
      ctx()
    );

    const highLine = await database.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: highPriorityOrder.id } });
    const lowLine = await database.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: lowPriorityOrder.id } });
    expect(highLine.reservedQuantity.toString()).toBe('5');
    expect(lowLine.reservedQuantity.toString()).toBe('1');
    expect(result.reservations.length).toBeGreaterThan(0);
  });
});

describe('deliveries', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('delivers reserved stock, consuming the reservation and decreasing stock exactly once', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '10');

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '10');
    await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    expect(draft.status).toBe('DRAFT');

    const idempotencyKey = randomUUID();
    const posted = await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey }), { id: userId, permissions: [] }, ctx());
    expect(posted.status).toBe('POSTED');

    // Duplicate delivery prevention: posting the same delivery again is rejected.
    await expect(deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx())).rejects.toMatchObject({ status: 409 });

    const movementCount = await database.stockMovement.count({ where: { sourceType: 'delivery-line', sourceId: draft.id, movementType: 'SALES_DELIVERY' } });
    expect(movementCount).toBe(1);

    const orderLine = await database.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: order.id } });
    expect(orderLine.deliveredQuantity.toString()).toBe('10');
    expect(orderLine.reservedQuantity.toString()).toBe('0');

    const updatedOrder = await salesOrders.get(order.id);
    expect(updatedOrder.status).toBe('DELIVERED');
  });

  it('delivers only what is available in AVAILABLE mode, leaving the backordered remainder for a later fulfilment (partial delivery)', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '4');

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '10');
    await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());

    const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'AVAILABLE', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    expect(draft.lines[0]?.quantity).toBe('4');
    const posted = await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    expect(posted.status).toBe('POSTED');

    const updatedOrder = await salesOrders.get(order.id);
    expect(updatedOrder.status).toBe('PARTIALLY_DELIVERED');
    expect(updatedOrder.lines[0]?.deliveredQuantity).toBe('4');
    expect(updatedOrder.lines[0]?.backorderedQuantity).toBe('6');

    // Multiple fulfilments: receive more stock, allocate it to the backorder, then deliver again.
    await postOpeningStock(userId, productId, warehouseId, '6');
    const backorder = await database.backorder.findFirstOrThrow({ where: { salesOrderId: order.id } });
    await reservations.runAllocation(runReservationAllocationSchema.parse({ productId, warehouseId, method: 'OLDEST_FIRST' }), { ...salesActor, id: userId }, ctx());

    const secondDraft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'AVAILABLE', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    expect(secondDraft.lines[0]?.quantity).toBe('6');
    const secondPosted = await deliveries.post(secondDraft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    expect(secondPosted.status).toBe('POSTED');

    const finalOrder = await salesOrders.get(order.id);
    expect(finalOrder.status).toBe('DELIVERED');
    const refreshedBackorder = await database.backorder.findUniqueOrThrow({ where: { id: backorder.id } });
    expect(refreshedBackorder.status).toBe('FULFILLED');
  });

  it('reverses a posted delivery, restoring the sales order line and the stock ledger', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    await postOpeningStock(userId, productId, warehouseId, '5');

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '5');
    await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    const draft = await deliveries.create(createDeliverySchema.parse({ salesOrderId: order.id, mode: 'ALL', idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());
    const posted = await deliveries.post(draft.id, postDeliverySchema.parse({ idempotencyKey: randomUUID() }), { id: userId, permissions: [] }, ctx());

    const reversed = await deliveries.reverse(posted.id, { idempotencyKey: randomUUID(), notes: 'Customer refused delivery' }, { id: userId, permissions: [] }, ctx());
    expect(reversed.status).toBe('REVERSED');

    const orderLine = await database.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: order.id } });
    expect(orderLine.deliveredQuantity.toString()).toBe('0');
  });
});

describe('backorders', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('generates a purchase order from open backorder lines, netting off the product reorder quantity', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();
    const supplierId = await makeSupplier();

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '3');
    const confirmed = await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    const backorder = await database.backorder.findFirstOrThrow({ where: { salesOrderId: order.id }, include: { lines: true } });

    const result = await backorders.generatePurchaseOrder({ supplierId, backorderLineIds: [backorder.lines[0]!.id] }, { ...salesActor, id: userId }, ctx());
    const purchaseOrder = await database.purchaseOrder.findUniqueOrThrow({ where: { id: result.purchaseOrderId }, include: { lines: true } });
    // Reorder quantity (10) floors the purchase quantity above the 3-unit shortage.
    expect(purchaseOrder.lines[0]?.orderedQuantity.toString()).toBe('10');

    const refreshedBackorder = await database.backorder.findUniqueOrThrow({ where: { id: backorder.id } });
    expect(refreshedBackorder.purchaseOrderId).toBe(purchaseOrder.id);
    expect(confirmed.status).toBe('BACKORDERED');
  });

  it('cancels a backorder line, withdrawing the demand from the sales order line', async () => {
    const userId = await makeUser();
    const customerId = await makeCustomer();
    const warehouseId = await makeWarehouse();
    const productId = await makeProduct();

    const order = await makeDraftOrder(userId, customerId, warehouseId, productId, '3');
    await salesOrders.confirm(order.id, confirmSalesOrderSchema.parse({ idempotencyKey: randomUUID() }), { ...salesActor, id: userId }, ctx());
    const backorder = await database.backorder.findFirstOrThrow({ where: { salesOrderId: order.id }, include: { lines: true } });

    const cancelled = await backorders.cancelLine(backorder.id, backorder.lines[0]!.id, { reason: 'Customer no longer wants it' }, { ...salesActor, id: userId }, ctx());
    expect(cancelled.status).toBe('CANCELLED');

    const orderLine = await database.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: order.id } });
    expect(orderLine.backorderedQuantity.toString()).toBe('0');
    expect(orderLine.cancelledQuantity.toString()).toBe('3');
  });
});
