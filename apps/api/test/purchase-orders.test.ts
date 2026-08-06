import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from '@tadpods/contracts';
import { PermissionGuard } from '../src/auth.guards.js';
import { PurchaseOrdersController } from '../src/modules/purchase-orders/purchase-orders.controller.js';
import { PurchaseOrdersService } from '../src/modules/purchase-orders/purchase-orders.service.js';

const purchaseOrders = new PurchaseOrdersService();

const writer = { id: '', permissions: ['purchasing.read', 'purchasing.write'] as readonly string[] };
const approver = { id: '', permissions: ['purchasing.read', 'purchasing.write', 'purchasing.approve'] as readonly string[] };

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `po-test-${suffix}@tadpods.local`, displayName: `PO test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeSupplier(active = true): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const supplier = await database.supplier.create({ data: { code: `PO-SUP-${suffix}`, name: `PO test supplier ${suffix}`, active } });
  return supplier.id;
}

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({ data: { sku: `PO-PROD-${suffix}`, name: `PO test product ${suffix}`, unitOfMeasure: 'EA' } });
  return product.id;
}

describe('PurchaseOrdersService', () => {
  afterEach(async () => {
    await database.systemSettings.update({ where: { singletonKey: 'default' }, data: { purchaseOrderApprovalThresholdMinorUnits: null } });
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it('creates a purchase order with a sequential PO- order number and a computed total', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '10.00', orderedQuantity: '3' }] }),
      actor,
      ctx()
    );

    expect(order.orderNumber).toMatch(/^PO-\d+$/);
    expect(order.status).toBe('DRAFT');
    expect(order.totalAmount).toBe('30.00');
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]?.outstandingQuantity).toBe('3.0000');
  });

  it('rejects creating a purchase order for an unknown supplier', async () => {
    const userId = await makeUser();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };

    await expect(
      purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId: randomUUID(), lines: [{ productId, unitCost: '1.00', orderedQuantity: '1' }] }), actor, ctx())
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects creating a purchase order for an inactive supplier', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier(false);
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };

    await expect(
      purchaseOrders.create(createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '1.00', orderedQuantity: '1' }] }), actor, ctx())
    ).rejects.toMatchObject({ status: 400 });
  });

  it('allows editing a draft order and rejects editing once confirmed', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '5.00', orderedQuantity: '2' }] }),
      actor,
      ctx()
    );
    const updated = await purchaseOrders.update(order.id, updatePurchaseOrderSchema.parse({ notes: 'Updated notes' }), actor, ctx());
    expect(updated.notes).toBe('Updated notes');

    const confirmed = await purchaseOrders.confirm(order.id, actor, ctx());
    expect(confirmed.status).toBe('CONFIRMED');

    await expect(purchaseOrders.update(order.id, updatePurchaseOrderSchema.parse({ notes: 'Too late' }), actor, ctx())).rejects.toMatchObject({ status: 409 });
  });

  it('confirms a draft order directly when no approval threshold is set', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '100.00', orderedQuantity: '1' }] }),
      actor,
      ctx()
    );
    const confirmed = await purchaseOrders.confirm(order.id, actor, ctx());
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it('submits then approves a purchase order, requiring purchasing.approve to approve', async () => {
    const userId = await makeUser();
    const approverId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };
    const approvingActor = { ...approver, id: approverId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '10.00', orderedQuantity: '1' }] }),
      actor,
      ctx()
    );
    const submitted = await purchaseOrders.submit(order.id, actor, ctx());
    expect(submitted.status).toBe('AWAITING_APPROVAL');
    expect(submitted.submittedAt).not.toBeNull();

    await expect(purchaseOrders.approve(order.id, actor, ctx())).rejects.toMatchObject({ status: 403 });

    const approved = await purchaseOrders.approve(order.id, approvingActor, ctx());
    expect(approved.status).toBe('CONFIRMED');
    expect(approved.approvedBy?.id).toBe(approverId);
  });

  it('blocks a direct confirm above the approval threshold without purchasing.approve, but allows submit/approve instead', async () => {
    await database.systemSettings.update({ where: { singletonKey: 'default' }, data: { purchaseOrderApprovalThresholdMinorUnits: 50_00n } });

    const userId = await makeUser();
    const approverId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };
    const approvingActor = { ...approver, id: approverId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '100.00', orderedQuantity: '1' }] }),
      actor,
      ctx()
    );

    await expect(purchaseOrders.confirm(order.id, actor, ctx())).rejects.toMatchObject({ status: 403 });

    const submitted = await purchaseOrders.submit(order.id, actor, ctx());
    expect(submitted.status).toBe('AWAITING_APPROVAL');
    const approved = await purchaseOrders.approve(order.id, approvingActor, ctx());
    expect(approved.status).toBe('CONFIRMED');
  });

  it('allows an approver to confirm directly above the threshold', async () => {
    await database.systemSettings.update({ where: { singletonKey: 'default' }, data: { purchaseOrderApprovalThresholdMinorUnits: 50_00n } });

    const approverId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const approvingActor = { ...approver, id: approverId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '100.00', orderedQuantity: '1' }] }),
      approvingActor,
      ctx()
    );
    const confirmed = await purchaseOrders.confirm(order.id, approvingActor, ctx());
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.approvedBy?.id).toBe(approverId);
  });

  it('cancels a draft order but rejects cancelling once anything has been received or billed', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '10.00', orderedQuantity: '1' }] }),
      actor,
      ctx()
    );
    const cancelled = await purchaseOrders.cancel(order.id, { reason: 'No longer needed' }, actor, ctx());
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.notes).toContain('No longer needed');

    const secondOrder = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, lines: [{ productId, unitCost: '10.00', orderedQuantity: '1' }] }),
      actor,
      ctx()
    );
    await purchaseOrders.confirm(secondOrder.id, actor, ctx());
    await database.purchaseOrderLine.updateMany({ where: { purchaseOrderId: secondOrder.id }, data: { receivedQuantity: '1' } });
    await expect(purchaseOrders.cancel(secondOrder.id, {}, actor, ctx())).rejects.toMatchObject({ status: 409 });
  });

  it('duplicates a purchase order into a new draft with the same supplier and lines', async () => {
    const userId = await makeUser();
    const supplierId = await makeSupplier();
    const productId = await makeProduct();
    const actor = { ...writer, id: userId };

    const order = await purchaseOrders.create(
      createPurchaseOrderSchema.parse({ supplierId, notes: 'Original', lines: [{ productId, unitCost: '7.50', orderedQuantity: '4' }] }),
      actor,
      ctx()
    );
    const duplicate = await purchaseOrders.duplicate(order.id, actor, ctx());
    expect(duplicate.id).not.toBe(order.id);
    expect(duplicate.status).toBe('DRAFT');
    expect(duplicate.supplier.id).toBe(supplierId);
    expect(duplicate.totalAmount).toBe(order.totalAmount);
  });
});

async function buildTestApp(permissions: readonly string[]): Promise<NestFastifyApplication> {
  const testingModule = await Test.createTestingModule({
    controllers: [PurchaseOrdersController],
    providers: [PurchaseOrdersService]
  }).compile();
  const app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const reflector = new Reflector();
  app.getHttpAdapter().getInstance().addHook('onRequest', (fastifyRequest, _reply, done) => {
    (fastifyRequest as unknown as { user?: unknown }).user = {
      id: randomUUID(),
      sessionId: randomUUID(),
      email: `po-permission-test-${randomUUID()}@tadpods.local`,
      displayName: 'Permission test actor',
      permissions
    };
    done();
  });
  app.useGlobalGuards(new PermissionGuard(reflector));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('purchase orders permission checks', () => {
  it('rejects creating and reading purchase orders without purchasing permissions', async () => {
    const app = await buildTestApp([]);
    try {
      const createResponse = await app.inject({ method: 'POST', url: '/purchase-orders', payload: { supplierId: randomUUID(), lines: [{ productId: randomUUID(), unitCost: '1.00', orderedQuantity: '1' }] } });
      expect(createResponse.statusCode).toBe(403);

      const listResponse = await app.inject({ method: 'GET', url: '/purchase-orders' });
      expect(listResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }, 30_000);
});
