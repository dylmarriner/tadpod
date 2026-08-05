import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { createStockCountSchema, postStockCountSchema, updateStockCountLineSchema } from '@tadpods/contracts';
import { StockCountsService } from '../src/modules/inventory/stock-counts.service.js';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { StockQueryService } from '../src/modules/inventory/stock-query.service.js';

const posting = new StockPostingService();
const query = new StockQueryService();
const stockCounts = new StockCountsService(posting);

async function makeProduct(status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE'): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({
    data: { sku: `COUNT-TEST-${suffix}`, name: `Stock count test product ${suffix}`, unitOfMeasure: 'EA', status }
  });
  return product.id;
}

async function makeCategory(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const category = await database.productCategory.create({ data: { name: `Count category ${suffix}` } });
  return category.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({
    data: { code: `CWH-${suffix}`.slice(0, 20), name: `Stock count test warehouse ${suffix}` }
  });
  return warehouse.id;
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({
    data: {
      email: `stock-counts-test-${suffix}@tadpods.local`,
      displayName: `Stock counts test actor ${suffix}`,
      passwordHash: 'not-a-real-hash'
    }
  });
  return user.id;
}

function context(): { requestId: string } {
  return { requestId: randomUUID() };
}

describe('StockCountsService', () => {
  let actorId: string;
  let actor: { id: string; permissions: readonly string[] };

  beforeAll(async () => {
    actorId = await makeUser();
    actor = { id: actorId, permissions: ['inventory.read', 'inventory.write'] };
  }, 30_000);

  afterAll(async () => {
    await database.$disconnect();
  });

  async function openingStock(productId: string, warehouseId: string, quantity: string): Promise<void> {
    await posting.postMovement(
      {
        productId,
        warehouseId,
        movementType: 'OPENING_STOCK',
        signedQuantity: quantity,
        sourceType: 'opening-stock',
        sourceId: randomUUID(),
        sourceLineId: randomUUID(),
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: false
      },
      actor,
      context()
    );
  }

  it('creates a draft count with an explicit product list, freezing expected quantity from the ledger', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '17');

    const count = await stockCounts.create(
      createStockCountSchema.parse({ warehouseId, productIds: [productId] }),
      actor
    );

    expect(count.status).toBe('DRAFT');
    expect(count.lines).toHaveLength(1);
    expect(count.lines[0]?.expectedQuantity).toBe('17.0000');
    expect(count.lines[0]?.countedQuantity).toBeNull();
  });

  it('creates a draft count scoped to a category', async () => {
    const categoryId = await makeCategory();
    const warehouseId = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const inCategory = await database.product.create({
      data: { sku: `CAT-IN-${suffix}`, name: 'In category', unitOfMeasure: 'EA', categoryId }
    });
    const outOfCategory = await makeProduct();

    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, categoryId }), actor);

    const productIds = count.lines.map((line) => line.product.id);
    expect(productIds).toContain(inCategory.id);
    expect(productIds).not.toContain(outOfCategory);
  });

  it('creates a full-warehouse draft count when neither productIds nor categoryId is given, excluding archived products', async () => {
    const warehouseId = await makeWarehouse();
    const active = await makeProduct('ACTIVE');
    const archived = await makeProduct('ARCHIVED');

    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId }), actor);

    const productIds = count.lines.map((line) => line.product.id);
    expect(productIds).toContain(active);
    expect(productIds).not.toContain(archived);
  });

  it('rejects a count with both productIds and categoryId', () => {
    expect(() =>
      createStockCountSchema.parse({
        warehouseId: randomUUID(),
        productIds: [randomUUID()],
        categoryId: randomUUID()
      })
    ).toThrow();
  });

  it('rejects an explicit productIds list containing an archived product', async () => {
    const warehouseId = await makeWarehouse();
    const archived = await makeProduct('ARCHIVED');

    await expect(
      stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [archived] }), actor)
    ).rejects.toThrow();
  });

  it('does not change stock on hand until the count is posted', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '10');

    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [productId] }), actor);
    await stockCounts.updateLine(count.lines[0]!.id, updateStockCountLineSchema.parse({ countedQuantity: '7' }));

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '10.0000' }]);
  });

  it('rejects posting a count with an uncounted line', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '10');
    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [productId] }), actor);

    await expect(
      stockCounts.post(count.id, postStockCountSchema.parse({ idempotencyKey: randomUUID() }), actor, context())
    ).rejects.toThrow();
  });

  it('posts a stock count correction transactionally and reflects the counted quantity in stock on hand', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '10');
    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [productId] }), actor);
    await stockCounts.updateLine(count.lines[0]!.id, updateStockCountLineSchema.parse({ countedQuantity: '6' }));

    const posted = await stockCounts.post(
      count.id,
      postStockCountSchema.parse({ idempotencyKey: randomUUID() }),
      actor,
      context()
    );

    expect(posted.status).toBe('POSTED');
    expect(posted.lines[0]?.variance).toBe('-4.0000');

    const onHand = await query.stockOnHand({ productId, warehouseId });
    expect(onHand.total).toEqual([{ productId, quantity: '6.0000' }]);

    const movement = await database.stockMovement.findFirst({ where: { sourceType: 'stock-count', sourceId: count.id } });
    expect(movement?.movementType).toBe('STOCK_COUNT_CORRECTION');
    expect(movement?.signedQuantity.toString()).toBe('-4');
  });

  it('posts no movement for a line whose counted quantity matches the expected quantity', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '10');
    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [productId] }), actor);
    await stockCounts.updateLine(count.lines[0]!.id, updateStockCountLineSchema.parse({ countedQuantity: '10' }));

    await stockCounts.post(count.id, postStockCountSchema.parse({ idempotencyKey: randomUUID() }), actor, context());

    const movementCount = await database.stockMovement.count({ where: { sourceType: 'stock-count', sourceId: count.id } });
    expect(movementCount).toBe(0);
  });

  it('posts every line of a multi-line count atomically — all or nothing', async () => {
    const warehouseId = await makeWarehouse();
    const productA = await makeProduct();
    const productB = await makeProduct();
    await openingStock(productA, warehouseId, '5');
    await openingStock(productB, warehouseId, '5');

    const count = await stockCounts.create(
      createStockCountSchema.parse({ warehouseId, productIds: [productA, productB] }),
      actor
    );
    const lineA = count.lines.find((line) => line.product.id === productA)!;
    const lineB = count.lines.find((line) => line.product.id === productB)!;
    await stockCounts.updateLine(lineA.id, updateStockCountLineSchema.parse({ countedQuantity: '2' }));
    await stockCounts.updateLine(lineB.id, updateStockCountLineSchema.parse({ countedQuantity: '9' }));

    await stockCounts.post(count.id, postStockCountSchema.parse({ idempotencyKey: randomUUID() }), actor, context());

    const onHandA = await query.stockOnHand({ productId: productA, warehouseId });
    const onHandB = await query.stockOnHand({ productId: productB, warehouseId });
    expect(onHandA.total).toEqual([{ productId: productA, quantity: '2.0000' }]);
    expect(onHandB.total).toEqual([{ productId: productB, quantity: '9.0000' }]);
  });

  it('prevents a stock count from posting twice', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '10');
    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [productId] }), actor);
    await stockCounts.updateLine(count.lines[0]!.id, updateStockCountLineSchema.parse({ countedQuantity: '6' }));
    await stockCounts.post(count.id, postStockCountSchema.parse({ idempotencyKey: randomUUID() }), actor, context());

    await expect(
      stockCounts.post(count.id, postStockCountSchema.parse({ idempotencyKey: randomUUID() }), actor, context())
    ).rejects.toThrow();
  });

  it('locks a posted count against further line edits', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '10');
    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [productId] }), actor);
    await stockCounts.updateLine(count.lines[0]!.id, updateStockCountLineSchema.parse({ countedQuantity: '6' }));
    await stockCounts.post(count.id, postStockCountSchema.parse({ idempotencyKey: randomUUID() }), actor, context());

    await expect(
      stockCounts.updateLine(count.lines[0]!.id, updateStockCountLineSchema.parse({ countedQuantity: '99' }))
    ).rejects.toThrow();
  });

  it('rejects a correction that would take stock negative, without posting any line in the batch', async () => {
    const warehouseId = await makeWarehouse();
    const productA = await makeProduct();
    const productB = await makeProduct();
    await openingStock(productA, warehouseId, '5');
    await openingStock(productB, warehouseId, '2');

    const count = await stockCounts.create(
      createStockCountSchema.parse({ warehouseId, productIds: [productA, productB] }),
      actor
    );
    const lineA = count.lines.find((line) => line.product.id === productA)!;
    const lineB = count.lines.find((line) => line.product.id === productB)!;
    // A sale happens after the count was created but before it posts, so the live balance
    // for productB is now below the frozen expected quantity used to compute variance.
    await posting.postMovement(
      {
        productId: productB,
        warehouseId,
        movementType: 'SALES_DELIVERY',
        signedQuantity: '-2',
        sourceType: 'sales-delivery',
        sourceId: randomUUID(),
        sourceLineId: randomUUID(),
        idempotencyKey: randomUUID(),
        allowNegativeStockOverride: false
      },
      actor,
      context()
    );

    await stockCounts.updateLine(lineA.id, updateStockCountLineSchema.parse({ countedQuantity: '3' }));
    await stockCounts.updateLine(lineB.id, updateStockCountLineSchema.parse({ countedQuantity: '0' }));

    await expect(
      stockCounts.post(count.id, postStockCountSchema.parse({ idempotencyKey: randomUUID() }), actor, context())
    ).rejects.toThrow();

    const onHandA = await query.stockOnHand({ productId: productA, warehouseId });
    expect(onHandA.total).toEqual([{ productId: productA, quantity: '5.0000' }]);
  });

  it('lists stock counts with line and counted-line totals', async () => {
    const productId = await makeProduct();
    const warehouseId = await makeWarehouse();
    await openingStock(productId, warehouseId, '10');
    const count = await stockCounts.create(createStockCountSchema.parse({ warehouseId, productIds: [productId] }), actor);
    await stockCounts.updateLine(count.lines[0]!.id, updateStockCountLineSchema.parse({ countedQuantity: '10' }));

    const page = await stockCounts.listStockCounts({ page: 1, pageSize: 50, warehouseId });
    const row = page.items.find((item) => item.id === count.id);
    expect(row).toBeDefined();
    expect(row?.lineCount).toBe(1);
    expect(row?.countedLineCount).toBe(1);
    expect(row?.status).toBe('DRAFT');
  });
});
