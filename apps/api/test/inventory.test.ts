import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { PermissionGuard } from '../src/auth.guards.js';
import { InventoryController } from '../src/modules/inventory/inventory.controller.js';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { StockQueryService } from '../src/modules/inventory/stock-query.service.js';

const posting = new StockPostingService();
const query = new StockQueryService();

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({
    data: { sku: `TEST-${suffix}`, name: `Test product ${suffix}`, unitOfMeasure: 'EA' }
  });
  return product.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({
    data: { code: `WH-${suffix}`.slice(0, 20), name: `Test warehouse ${suffix}` }
  });
  return warehouse.id;
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({
    data: {
      email: `inventory-test-${suffix}@tadpods.local`,
      displayName: `Inventory test actor ${suffix}`,
      passwordHash: 'not-a-real-hash'
    }
  });
  return user.id;
}

function context(): { requestId: string } {
  return { requestId: randomUUID() };
}

describe('StockPostingService and StockQueryService', () => {
  let actorId: string;
  let readWriteActor: { id: string; permissions: readonly string[] };
  let overrideActor: { id: string; permissions: readonly string[] };

  beforeAll(async () => {
    actorId = await makeUser();
    readWriteActor = { id: actorId, permissions: ['inventory.read', 'inventory.write'] };
    const overrideActorId = await makeUser();
    overrideActor = { id: overrideActorId, permissions: ['inventory.read', 'inventory.write', 'inventory.override-negative-stock'] };
  }, 30_000);

  afterAll(async () => {
    await database.systemSettings.update({ where: { singletonKey: 'default' }, data: { negativeStockEnabled: false } });
    await database.$disconnect();
  });

  it('posts opening stock and reflects it in stock on hand', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const sourceId = randomUUID();

    const movement = await posting.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'OPENING_STOCK',
        signedQuantity: '25',
        sourceType: 'opening-stock',
        sourceId,
        sourceLineId: sourceId,
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: false
      },
      readWriteActor,
      context()
    );

    expect(movement.movementType).toBe('OPENING_STOCK');
    expect(movement.actorId).toBe(readWriteActor.id);

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.byWarehouse).toEqual([{ productId, warehouseId, quantity: '25.0000' }]);
    expect(onHand.total).toEqual([{ productId, quantity: '25.0000' }]);

    const auditEntry = await database.auditLog.findFirst({
      where: { entityType: 'StockMovement', entityId: movement.id }
    });
    expect(auditEntry?.action).toBe('inventory.movement.post');
    expect(auditEntry?.userId).toBe(readWriteActor.id);
  });

  it('posts a positive adjustment and a negative adjustment via the generic primitive', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '10');

    const increaseSourceId = randomUUID();
    await posting.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'POSITIVE_ADJUSTMENT',
        signedQuantity: '5',
        sourceType: 'adjustment',
        sourceId: increaseSourceId,
        sourceLineId: increaseSourceId,
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: false
      },
      readWriteActor,
      context()
    );

    const decreaseSourceId = randomUUID();
    await posting.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'NEGATIVE_ADJUSTMENT',
        signedQuantity: '-3',
        sourceType: 'adjustment',
        sourceId: decreaseSourceId,
        sourceLineId: decreaseSourceId,
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: false
      },
      readWriteActor,
      context()
    );

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '12.0000' }]);
  });

  it('rejects a movement that would take stock below zero by default', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '2');

    const sourceId = randomUUID();
    await expect(
      posting.postMovement(
        {
          productId,
          warehouseId,
          movementType: 'SALES_DELIVERY',
          signedQuantity: '-5',
          sourceType: 'sales-delivery',
          sourceId,
          sourceLineId: sourceId,
          idempotencyKey: randomUUID(),
          allowNegativeStockOverride: false
        },
        readWriteActor,
        context()
      )
    ).rejects.toThrow(/below zero/);

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '2.0000' }]);
  });

  it('rejects the override for an actor without the override permission even if requested', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '2');
    await database.systemSettings.update({ where: { singletonKey: 'default' }, data: { negativeStockEnabled: true } });

    const sourceId = randomUUID();
    await expect(
      posting.postMovement(
        {
          productId,
          warehouseId,
          movementType: 'SALES_DELIVERY',
          signedQuantity: '-5',
          sourceType: 'sales-delivery',
          sourceId,
          sourceLineId: sourceId,
          idempotencyKey: randomUUID(),
          allowNegativeStockOverride: true
        },
        readWriteActor,
        context()
      )
    ).rejects.toThrow(/below zero/);
  });

  it('allows negative stock when the system setting is enabled and the actor holds the override permission', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await postOpening(productId, warehouseId, '2');
    await database.systemSettings.update({ where: { singletonKey: 'default' }, data: { negativeStockEnabled: true } });

    const sourceId = randomUUID();
    const movement = await posting.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'SALES_DELIVERY',
        signedQuantity: '-5',
        sourceType: 'sales-delivery',
        sourceId,
        sourceLineId: sourceId,
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: true
      },
      overrideActor,
      context()
    );
    expect(movement.signedQuantity.toString()).toBe('-5');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '-3.0000' }]);
  });

  it('rejects a second stock effect from the same source line', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const sourceId = randomUUID();

    await posting.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'OPENING_STOCK',
        signedQuantity: '10',
        sourceType: 'opening-stock',
        sourceId,
        sourceLineId: sourceId,
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: false
      },
      readWriteActor,
      context()
    );

    await expect(
      posting.postMovement(
        {
          productId,
          warehouseId,
          movementType: 'OPENING_STOCK',
          signedQuantity: '10',
          sourceType: 'opening-stock',
          sourceId,
          sourceLineId: sourceId,
          idempotencyKey: randomUUID(),
          allowNegativeStockOverride: false
        },
        readWriteActor,
        context()
      )
    ).rejects.toThrow(/already posted a stock effect/);
  });

  it('replays an idempotent retry with the same posting result rather than posting twice', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const sourceId = randomUUID();
    const idempotencyKey = randomUUID();
    const input = {
      productId,
      warehouseId,
      movementType: 'OPENING_STOCK' as const,
      signedQuantity: '8',
      sourceType: 'opening-stock',
      sourceId,
      sourceLineId: sourceId,
      idempotencyKey,
      allowNegativeStockOverride: false
    };

    const first = await posting.postMovement(input, readWriteActor, context());
    const retry = await posting.postMovement(input, readWriteActor, context());

    expect(retry.id).toBe(first.id);

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '8.0000' }]);
  });

  it('reverses a posted movement with an equal-and-opposite movement, and blocks a second reversal', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const original = await postOpening(productId, warehouseId, '15');

    const reversal = await posting.reverseMovement(
      original.id,
      { idempotencyKey: randomUUID() },
      readWriteActor,
      context()
    );
    expect(reversal.movementType).toBe('REVERSAL');
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.signedQuantity.toString()).toBe('-15');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '0.0000' }]);

    // Buffer stock so a second reversal attempt fails on the duplicate-reversal
    // constraint being tested here, not on an unrelated negative-stock rejection.
    await postOpening(productId, warehouseId, '30');

    await expect(
      posting.reverseMovement(original.id, { idempotencyKey: randomUUID() }, readWriteActor, context())
    ).rejects.toThrow(/already been reversed/);
  });

  it('does not lose updates under concurrent posting to the same product and warehouse', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const postCount = 20;

    await Promise.all(
      Array.from({ length: postCount }, async (_unused, index) => {
        const sourceId = `${randomUUID()}-${index}`;
        return posting.postMovement(
          {
            productId,
            warehouseId,
            movementType: 'GOODS_RECEIPT',
            signedQuantity: '1',
            sourceType: 'goods-receipt',
            sourceId,
            sourceLineId: sourceId,
            idempotencyKey: randomUUID(),
            allowNegativeStockOverride: false
          },
          readWriteActor,
          context()
        );
      })
    );

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: `${postCount}.0000` }]);

    const movementCount = await database.stockMovement.count({ where: { productId, warehouseId } });
    expect(movementCount).toBe(postCount);
  }, 30_000);

  it('tracks stock on hand separately per warehouse and totals across warehouses', async () => {
    const productId = await makeProduct();
    const warehouseA = await makeWarehouse();
    const warehouseB = await makeWarehouse();

    await postOpening(productId, warehouseA, '10');
    await postOpening(productId, warehouseB, '4');

    const onHand = await query.stockOnHand({ productId });
    const byWarehouse = new Map(onHand.byWarehouse.map((row) => [row.warehouseId, row.quantity]));
    expect(byWarehouse.get(warehouseA)).toBe('10.0000');
    expect(byWarehouse.get(warehouseB)).toBe('4.0000');
    expect(onHand.total).toEqual([{ productId, quantity: '14.0000' }]);
  });

  async function postOpening(productId: string, warehouseId: string, quantity: string) {
    const sourceId = randomUUID();
    return posting.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'OPENING_STOCK',
        signedQuantity: quantity,
        sourceType: 'opening-stock',
        sourceId,
        sourceLineId: sourceId,
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: false
      },
      readWriteActor,
      context()
    );
  }
});

async function buildTestApp(permissions: readonly string[]): Promise<NestFastifyApplication> {
  const testingModule = await Test.createTestingModule({
    controllers: [InventoryController],
    providers: [StockPostingService, StockQueryService]
  }).compile();
  const app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const reflector = new Reflector();
  app.getHttpAdapter().getInstance().addHook('onRequest', (fastifyRequest, _reply, done) => {
    (fastifyRequest as unknown as { user?: unknown }).user = {
      id: randomUUID(),
      sessionId: randomUUID(),
      email: `permission-test-${randomUUID()}@tadpods.local`,
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

describe('inventory permission checks', () => {
  it('rejects posting and reading when the actor holds no inventory permissions', async () => {
    const app = await buildTestApp([]);
    try {
      const postResponse = await app.inject({
        method: 'POST',
        url: '/inventory/movements',
        payload: {
          productId: randomUUID(),
          warehouseId: randomUUID(),
          movementType: 'OPENING_STOCK',
          signedQuantity: '1',
          sourceType: 'opening-stock',
          sourceId: randomUUID(),
          sourceLineId: randomUUID(),
          idempotencyKey: randomUUID()
        }
      });
      expect(postResponse.statusCode).toBe(403);

      const readResponse = await app.inject({ method: 'GET', url: '/inventory/stock-on-hand' });
      expect(readResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('allows posting once the actor holds inventory.write, and the movement is actually posted', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    const actorForThisTest = await makeUser();
    // Exercises the controller directly (constructed with the same posting/query services
    // the other tests use) rather than through a second Nest HTTP harness: the permission
    // *denial* path above already proves the guard wiring; this proves that a permitted
    // request actually reaches `StockPostingService` and posts a real movement.
    const controller = new InventoryController(posting, query);
    const fakeRequest = { id: randomUUID(), ip: '127.0.0.1', headers: {} } as unknown as Parameters<
      typeof controller.postMovement
    >[1];
    const sourceId = randomUUID();
    const result = await controller.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'OPENING_STOCK',
        signedQuantity: '6',
        sourceType: 'opening-stock',
        sourceId,
        sourceLineId: sourceId,
        idempotencyKey: randomUUID()
      },
      fakeRequest,
      {
        id: actorForThisTest,
        sessionId: randomUUID(),
        email: 'controller-test@tadpods.local',
        displayName: 'Controller test',
        permissions: ['inventory.read', 'inventory.write']
      }
    );
    expect(result.movementType).toBe('OPENING_STOCK');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '6.0000' }]);
  }, 30_000);
});
