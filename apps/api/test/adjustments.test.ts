import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { postAdjustmentSchema, postOpeningStockSchema } from '@tadpods/contracts';
import { PermissionGuard } from '../src/auth.guards.js';
import { AdjustmentsController } from '../src/modules/inventory/adjustments.controller.js';
import { AdjustmentsService } from '../src/modules/inventory/adjustments.service.js';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { StockQueryService } from '../src/modules/inventory/stock-query.service.js';

const posting = new StockPostingService();
const query = new StockQueryService();
const adjustments = new AdjustmentsService(posting);

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({
    data: { sku: `ADJ-TEST-${suffix}`, name: `Adjustment test product ${suffix}`, unitOfMeasure: 'EA' }
  });
  return product.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({
    data: { code: `AWH-${suffix}`.slice(0, 20), name: `Adjustment test warehouse ${suffix}` }
  });
  return warehouse.id;
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({
    data: {
      email: `adjustments-test-${suffix}@tadpods.local`,
      displayName: `Adjustments test actor ${suffix}`,
      passwordHash: 'not-a-real-hash'
    }
  });
  return user.id;
}

function context(): { requestId: string } {
  return { requestId: randomUUID() };
}

describe('AdjustmentsService', () => {
  let actorId: string;
  let readWriteActor: { id: string; permissions: readonly string[] };

  beforeAll(async () => {
    actorId = await makeUser();
    readWriteActor = { id: actorId, permissions: ['inventory.read', 'inventory.write'] };
  }, 30_000);

  afterAll(async () => {
    await database.$disconnect();
  });

  it('posts opening stock through the generic posting primitive', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();

    const movement = await adjustments.postOpeningStock(
      postOpeningStockSchema.parse({ productId, warehouseId, quantity: '25', idempotencyKey: randomUUID() }),
      readWriteActor,
      context()
    );

    expect(movement.movementType).toBe('OPENING_STOCK');
    expect(movement.sourceType).toBe('opening-stock');
    expect(movement.signedQuantity.toString()).toBe('25');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '25.0000' }]);

    const auditEntry = await database.auditLog.findFirst({ where: { entityType: 'StockMovement', entityId: movement.id } });
    expect(auditEntry?.action).toBe('inventory.movement.post');
  });

  it('posts a positive adjustment with a mandatory reason and stores the reason as the movement notes', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '10');

    const movement = await adjustments.postAdjustment(
      postAdjustmentSchema.parse({
        productId,
        warehouseId,
        direction: 'INCREASE',
        quantity: '4',
        reason: 'Found extra stock during a spot check',
        idempotencyKey: randomUUID()
      }),
      readWriteActor,
      context()
    );

    expect(movement.movementType).toBe('POSITIVE_ADJUSTMENT');
    expect(movement.sourceType).toBe('adjustment');
    expect(movement.signedQuantity.toString()).toBe('4');
    expect(movement.notes).toBe('Found extra stock during a spot check');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '14.0000' }]);
  });

  it('posts a negative adjustment with a mandatory reason', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '10');

    const movement = await adjustments.postAdjustment(
      postAdjustmentSchema.parse({
        productId,
        warehouseId,
        direction: 'DECREASE',
        quantity: '3',
        reason: 'Damaged stock written off',
        idempotencyKey: randomUUID()
      }),
      readWriteActor,
      context()
    );

    expect(movement.movementType).toBe('NEGATIVE_ADJUSTMENT');
    expect(movement.signedQuantity.toString()).toBe('-3');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '7.0000' }]);
  });

  it('rejects a negative adjustment that would take stock below zero — delegated to, not bypassing, StockPostingService', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '2');

    await expect(
      adjustments.postAdjustment(
        postAdjustmentSchema.parse({
          productId,
          warehouseId,
          direction: 'DECREASE',
          quantity: '5',
          reason: 'Attempted over-decrease',
          idempotencyKey: randomUUID()
        }),
        readWriteActor,
        context()
      )
    ).rejects.toThrow(/below zero/);

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '2.0000' }]);
  });

  it('rejects an adjustment with no reason at the contract layer', () => {
    expect(() =>
      postAdjustmentSchema.parse({
        productId: randomUUID(),
        warehouseId: randomUUID(),
        direction: 'INCREASE',
        quantity: '1',
        idempotencyKey: randomUUID()
      })
    ).toThrow();
  });

  it('rejects an adjustment with a reason that is only whitespace', () => {
    expect(() =>
      postAdjustmentSchema.parse({
        productId: randomUUID(),
        warehouseId: randomUUID(),
        direction: 'INCREASE',
        quantity: '1',
        reason: '   ',
        idempotencyKey: randomUUID()
      })
    ).toThrow();
  });

  it('rejects a zero or negative quantity for opening stock and adjustments', () => {
    expect(() => postOpeningStockSchema.parse({ productId: randomUUID(), warehouseId: randomUUID(), quantity: '0', idempotencyKey: randomUUID() })).toThrow();
    expect(() =>
      postAdjustmentSchema.parse({
        productId: randomUUID(),
        warehouseId: randomUUID(),
        direction: 'INCREASE',
        quantity: '-1',
        reason: 'invalid negative magnitude',
        idempotencyKey: randomUUID()
      })
    ).toThrow();
  });

  it('reverses a posted adjustment via the existing generic reversal endpoint, restoring the prior balance', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '20');

    const adjustment = await adjustments.postAdjustment(
      postAdjustmentSchema.parse({
        productId,
        warehouseId,
        direction: 'INCREASE',
        quantity: '6',
        reason: 'Cycle count correction',
        idempotencyKey: randomUUID()
      }),
      readWriteActor,
      context()
    );

    let onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '26.0000' }]);

    const reversal = await posting.reverseMovement(adjustment.id, { idempotencyKey: randomUUID() }, readWriteActor, context());
    expect(reversal.movementType).toBe('REVERSAL');
    expect(reversal.reversalOfId).toBe(adjustment.id);

    onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '20.0000' }]);
  });

  it('lists adjustments with before/after stock on hand and reversal history', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '5');

    const adjustment = await adjustments.postAdjustment(
      postAdjustmentSchema.parse({
        productId,
        warehouseId,
        direction: 'INCREASE',
        quantity: '2',
        reason: 'Listing test adjustment',
        idempotencyKey: randomUUID()
      }),
      readWriteActor,
      context()
    );
    await posting.reverseMovement(adjustment.id, { idempotencyKey: randomUUID() }, readWriteActor, context());

    const result = await adjustments.listAdjustments({ productId, warehouseId, page: 1, pageSize: 50 });
    const listed = result.items.find((item) => item.id === adjustment.id);
    expect(listed).toBeDefined();
    expect(listed?.beforeQuantity).toBe('5.0000');
    expect(listed?.afterQuantity).toBe('7.0000');
    expect(listed?.notes).toBe('Listing test adjustment');
    expect(listed?.actor?.id).toBe(readWriteActor.id);
    expect(listed?.reversal).not.toBeNull();
  });

  async function postOpening(productId: string, warehouseId: string, quantity: string) {
    return adjustments.postOpeningStock(
      postOpeningStockSchema.parse({ productId, warehouseId, quantity, idempotencyKey: randomUUID() }),
      readWriteActor,
      context()
    );
  }
});

async function buildTestApp(permissions: readonly string[]): Promise<NestFastifyApplication> {
  const testingModule = await Test.createTestingModule({
    controllers: [AdjustmentsController],
    providers: [AdjustmentsService, StockPostingService, StockQueryService]
  }).compile();
  const app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const reflector = new Reflector();
  app.getHttpAdapter().getInstance().addHook('onRequest', (fastifyRequest, _reply, done) => {
    (fastifyRequest as unknown as { user?: unknown }).user = {
      id: randomUUID(),
      sessionId: randomUUID(),
      email: `adjustments-permission-test-${randomUUID()}@tadpods.local`,
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

describe('adjustments permission checks', () => {
  it('rejects opening stock, adjustments, and reading the list without inventory permissions', async () => {
    const app = await buildTestApp([]);
    try {
      const openingResponse = await app.inject({
        method: 'POST',
        url: '/inventory/opening-stock',
        payload: { productId: randomUUID(), warehouseId: randomUUID(), quantity: '1', idempotencyKey: randomUUID() }
      });
      expect(openingResponse.statusCode).toBe(403);

      const adjustmentResponse = await app.inject({
        method: 'POST',
        url: '/inventory/adjustments',
        payload: {
          productId: randomUUID(),
          warehouseId: randomUUID(),
          direction: 'INCREASE',
          quantity: '1',
          reason: 'Permission-denied test',
          idempotencyKey: randomUUID()
        }
      });
      expect(adjustmentResponse.statusCode).toBe(403);

      const listResponse = await app.inject({ method: 'GET', url: '/inventory/adjustments' });
      expect(listResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('allows opening stock and adjustment posting once the actor holds inventory.write, and the movements are actually posted', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actorForThisTest = await makeUser();
    // Exercises the controller directly (constructed with the same `AdjustmentsService` the
    // other tests use) rather than through the DI-built Nest test app: the permission
    // *denial* path above already proves the guard wiring; this proves that a permitted
    // request actually reaches `AdjustmentsService` and posts real movements. Mirrors the
    // pattern in `test/inventory.test.ts`'s equivalent controller-level permission-allow test.
    const controller = new AdjustmentsController(adjustments);
    const fakeRequest = { id: randomUUID(), ip: '127.0.0.1', headers: {} } as unknown as Parameters<
      typeof controller.postOpeningStock
    >[1];
    const currentUser = {
      id: actorForThisTest,
      sessionId: randomUUID(),
      email: 'adjustments-controller-test@tadpods.local',
      displayName: 'Adjustments controller test',
      permissions: ['inventory.read', 'inventory.write']
    };

    const openingResult = await controller.postOpeningStock({ productId, warehouseId, quantity: '9', idempotencyKey: randomUUID() }, fakeRequest, currentUser);
    expect(openingResult.movementType).toBe('OPENING_STOCK');

    const adjustmentResult = await controller.postAdjustment(
      { productId, warehouseId, direction: 'DECREASE', quantity: '2', reason: 'Permission-allowed test', idempotencyKey: randomUUID() },
      fakeRequest,
      currentUser
    );
    expect(adjustmentResult.movementType).toBe('NEGATIVE_ADJUSTMENT');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '7.0000' }]);
  }, 30_000);
});
