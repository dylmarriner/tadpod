import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { postTransferSchema, reverseTransferSchema } from '@tadpods/contracts';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { StockQueryService } from '../src/modules/inventory/stock-query.service.js';
import { TransfersService } from '../src/modules/inventory/transfers.service.js';

const posting = new StockPostingService();
const query = new StockQueryService();
const transfers = new TransfersService(posting);

async function makeProduct(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await database.product.create({
    data: { sku: `XFER-TEST-${suffix}`, name: `Transfer test product ${suffix}`, unitOfMeasure: 'EA' }
  });
  return product.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({
    data: { code: `XWH-${suffix}`.slice(0, 20), name: `Transfer test warehouse ${suffix}` }
  });
  return warehouse.id;
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({
    data: {
      email: `transfers-test-${suffix}@tadpods.local`,
      displayName: `Transfers test actor ${suffix}`,
      passwordHash: 'not-a-real-hash'
    }
  });
  return user.id;
}

function context(): { requestId: string } {
  return { requestId: randomUUID() };
}

describe('TransfersService', () => {
  let actorId: string;
  let readWriteActor: { id: string; permissions: readonly string[] };
  let readOnlyActor: { id: string; permissions: readonly string[] };

  beforeAll(async () => {
    actorId = await makeUser();
    readWriteActor = { id: actorId, permissions: ['inventory.read', 'inventory.write'] };
    readOnlyActor = { id: actorId, permissions: ['inventory.read'] };
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
      readWriteActor,
      context()
    );
  }

  it('posts a single-line transfer as a linked out/in pair', async () => {
    const productId = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productId, fromWarehouseId, '20');

    const result = await transfers.postTransfer(
      postTransferSchema.parse({
        fromWarehouseId,
        toWarehouseId,
        lines: [{ productId, quantity: '5' }],
        idempotencyKey: randomUUID()
      }),
      readWriteActor,
      context()
    );

    const fromOnHand = await query.stockOnHand({ productId, warehouseId: fromWarehouseId });
    const toOnHand = await query.stockOnHand({ productId, warehouseId: toWarehouseId });
    expect(fromOnHand.total).toEqual([{ productId, quantity: '15.0000' }]);
    expect(toOnHand.total).toEqual([{ productId, quantity: '5.0000' }]);

    const movements = await database.stockMovement.findMany({ where: { sourceType: 'warehouse-transfer', sourceId: result.transferId } });
    expect(movements).toHaveLength(2);
    expect(movements.map((movement) => movement.movementType).sort()).toEqual(['WAREHOUSE_TRANSFER_IN', 'WAREHOUSE_TRANSFER_OUT']);
  });

  it('posts a multi-line transfer atomically', async () => {
    const productA = await makeProduct();
    const productB = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productA, fromWarehouseId, '10');
    await openingStock(productB, fromWarehouseId, '10');

    const result = await transfers.postTransfer(
      postTransferSchema.parse({
        fromWarehouseId,
        toWarehouseId,
        lines: [
          { productId: productA, quantity: '4' },
          { productId: productB, quantity: '6' }
        ],
        idempotencyKey: randomUUID()
      }),
      readWriteActor,
      context()
    );

    const movements = await database.stockMovement.findMany({ where: { sourceType: 'warehouse-transfer', sourceId: result.transferId } });
    expect(movements).toHaveLength(4);
  });

  it('rejects a transfer with the same source and destination warehouse at the contract layer', () => {
    expect(() =>
      postTransferSchema.parse({
        fromWarehouseId: '11111111-1111-1111-1111-111111111111',
        toWarehouseId: '11111111-1111-1111-1111-111111111111',
        lines: [{ productId: '22222222-2222-2222-2222-222222222222', quantity: '1' }],
        idempotencyKey: randomUUID()
      })
    ).toThrow();
  });

  it('rejects a transfer that would take the source warehouse below zero, and posts neither side of the failing line', async () => {
    const productId = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productId, fromWarehouseId, '3');

    await expect(
      transfers.postTransfer(
        postTransferSchema.parse({
          fromWarehouseId,
          toWarehouseId,
          lines: [{ productId, quantity: '10' }],
          idempotencyKey: randomUUID()
        }),
        readWriteActor,
        context()
      )
    ).rejects.toThrow();

    const fromOnHand = await query.stockOnHand({ productId, warehouseId: fromWarehouseId });
    const toOnHand = await query.stockOnHand({ productId, warehouseId: toWarehouseId });
    expect(fromOnHand.total).toEqual([{ productId, quantity: '3.0000' }]);
    expect(toOnHand.total).toEqual([]);
  });

  it('does not post only one side of a multi-line transfer when a later line fails — full atomicity', async () => {
    const productA = await makeProduct();
    const productB = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productA, fromWarehouseId, '10');
    await openingStock(productB, fromWarehouseId, '2');

    await expect(
      transfers.postTransfer(
        postTransferSchema.parse({
          fromWarehouseId,
          toWarehouseId,
          lines: [
            { productId: productA, quantity: '4' },
            { productId: productB, quantity: '10' }
          ],
          idempotencyKey: randomUUID()
        }),
        readWriteActor,
        context()
      )
    ).rejects.toThrow();

    const aFrom = await query.stockOnHand({ productId: productA, warehouseId: fromWarehouseId });
    const aTo = await query.stockOnHand({ productId: productA, warehouseId: toWarehouseId });
    expect(aFrom.total).toEqual([{ productId: productA, quantity: '10.0000' }]);
    expect(aTo.total).toEqual([]);
  });

  it('reverses every movement a transfer posted, atomically', async () => {
    const productA = await makeProduct();
    const productB = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productA, fromWarehouseId, '10');
    await openingStock(productB, fromWarehouseId, '10');

    const result = await transfers.postTransfer(
      postTransferSchema.parse({
        fromWarehouseId,
        toWarehouseId,
        lines: [
          { productId: productA, quantity: '4' },
          { productId: productB, quantity: '6' }
        ],
        idempotencyKey: randomUUID()
      }),
      readWriteActor,
      context()
    );

    await transfers.reverseTransfer(
      result.transferId,
      reverseTransferSchema.parse({ idempotencyKey: randomUUID() }),
      readWriteActor,
      context()
    );

    const aFrom = await query.stockOnHand({ productId: productA, warehouseId: fromWarehouseId });
    const bFrom = await query.stockOnHand({ productId: productB, warehouseId: fromWarehouseId });
    const aTo = await query.stockOnHand({ productId: productA, warehouseId: toWarehouseId });
    const bTo = await query.stockOnHand({ productId: productB, warehouseId: toWarehouseId });
    expect(aFrom.total).toEqual([{ productId: productA, quantity: '10.0000' }]);
    expect(bFrom.total).toEqual([{ productId: productB, quantity: '10.0000' }]);
    // The to-warehouse still has two posted rows (the transfer-in and its reversal) that net
    // to zero — `stockOnHand` groups from posted movements, so the group still exists with a
    // zero total; it is not the same as no movements ever having posted there.
    expect(aTo.total).toEqual([{ productId: productA, quantity: '0.0000' }]);
    expect(bTo.total).toEqual([{ productId: productB, quantity: '0.0000' }]);

    const reversalCount = await database.stockMovement.count({ where: { sourceType: 'stock-movement-reversal' } });
    expect(reversalCount).toBeGreaterThanOrEqual(4);
  });

  it('rejects reversing an already-reversed transfer', async () => {
    const productId = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productId, fromWarehouseId, '10');

    const result = await transfers.postTransfer(
      postTransferSchema.parse({ fromWarehouseId, toWarehouseId, lines: [{ productId, quantity: '3' }], idempotencyKey: randomUUID() }),
      readWriteActor,
      context()
    );

    await transfers.reverseTransfer(result.transferId, reverseTransferSchema.parse({ idempotencyKey: randomUUID() }), readWriteActor, context());

    await expect(
      transfers.reverseTransfer(result.transferId, reverseTransferSchema.parse({ idempotencyKey: randomUUID() }), readWriteActor, context())
    ).rejects.toThrow();
  });

  it('rejects reversing an unknown transfer id', async () => {
    await expect(
      transfers.reverseTransfer(randomUUID(), reverseTransferSchema.parse({ idempotencyKey: randomUUID() }), readWriteActor, context())
    ).rejects.toThrow();
  });

  it('lists posted transfer lines with from/to warehouses and reversal status', async () => {
    const productId = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productId, fromWarehouseId, '10');

    const result = await transfers.postTransfer(
      postTransferSchema.parse({ fromWarehouseId, toWarehouseId, lines: [{ productId, quantity: '2' }], idempotencyKey: randomUUID() }),
      readWriteActor,
      context()
    );

    const page = await transfers.listTransfers({ page: 1, pageSize: 50 });
    const row = page.items.find((item) => item.transferId === result.transferId);
    expect(row).toBeDefined();
    expect(row?.fromWarehouse.id).toBe(fromWarehouseId);
    expect(row?.toWarehouse.id).toBe(toWarehouseId);
    expect(row?.quantity).toBe('2.0000');
    expect(row?.reversed).toBe(false);
  });

  it('does not bypass StockPostingService permission checks for negative-stock override on the source side', async () => {
    const productId = await makeProduct();
    const fromWarehouseId = await makeWarehouse();
    const toWarehouseId = await makeWarehouse();
    await openingStock(productId, fromWarehouseId, '1');

    await expect(
      transfers.postTransfer(
        postTransferSchema.parse({ fromWarehouseId, toWarehouseId, lines: [{ productId, quantity: '100' }], idempotencyKey: randomUUID() }),
        readOnlyActor,
        context()
      )
    ).rejects.toThrow();
  });
});
