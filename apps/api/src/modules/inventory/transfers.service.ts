import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { database, Prisma } from '@tadpods/database';
import type {
  ListTransfersQuery,
  PostTransferInput,
  ReverseTransferInput,
  TransferListItem
} from '@tadpods/contracts';
import { StockPostingService, type InventoryRequestContext, type PostingActor } from './stock-posting.service.js';

const TRANSFER_SOURCE_TYPE = 'warehouse-transfer';

type TransferJoinRow = {
  transferId: string;
  outId: string;
  inId: string;
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: string;
  postedAt: Date;
  notes: string | null;
  actorId: string | null;
};

/**
 * Warehouse transfers (Phase 2 Task 4): one or more product lines moved between two
 * warehouses, represented as linked `WAREHOUSE_TRANSFER_OUT`/`WAREHOUSE_TRANSFER_IN`
 * movements posted atomically through `StockPostingService.postMovements` — either every
 * line's pair posts, or none does. This service owns no locking, idempotency, or
 * negative-stock logic; it only shapes the linked movement pairs and reads the ledger back.
 */
@Injectable()
export class TransfersService {
  constructor(private readonly posting: StockPostingService) {}

  async postTransfer(
    input: PostTransferInput,
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<{ transferId: string }> {
    const transferId = randomUUID();

    const movements = input.lines.flatMap((line, index) => [
      {
        productId: line.productId,
        warehouseId: input.fromWarehouseId,
        movementType: 'WAREHOUSE_TRANSFER_OUT' as const,
        signedQuantity: `-${line.quantity}`,
        sourceType: TRANSFER_SOURCE_TYPE,
        sourceId: transferId,
        sourceLineId: `${index}:out`,
        idempotencyKey: `${input.idempotencyKey}:${index}:out`,
        notes: input.notes ?? null,
        allowNegativeStockOverride: false
      },
      {
        productId: line.productId,
        warehouseId: input.toWarehouseId,
        movementType: 'WAREHOUSE_TRANSFER_IN' as const,
        signedQuantity: line.quantity,
        sourceType: TRANSFER_SOURCE_TYPE,
        sourceId: transferId,
        sourceLineId: `${index}:in`,
        idempotencyKey: `${input.idempotencyKey}:${index}:in`,
        notes: input.notes ?? null,
        allowNegativeStockOverride: false
      }
    ]);

    await this.posting.postMovements(movements, actor, context);
    return { transferId };
  }

  /**
   * Reverse every movement a transfer posted, atomically — a transfer is never left with
   * only one side reversed. Resolves the transfer's own posted movements first (excluding
   * any prior reversals, which carry `sourceType='stock-movement-reversal'`) so a bad or
   * already-fully-reversed transfer id is rejected before any reversal is attempted.
   */
  async reverseTransfer(
    transferId: string,
    input: ReverseTransferInput,
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<{ transferId: string }> {
    const movements = await database.stockMovement.findMany({
      where: { sourceType: TRANSFER_SOURCE_TYPE, sourceId: transferId },
      select: { id: true }
    });
    if (movements.length === 0) throw new NotFoundException('Transfer not found');

    await this.posting.reverseMovements(movements.map((movement) => movement.id), input, actor, context);
    return { transferId };
  }

  /**
   * One row per transfer line: the posted out/in pair joined together, plus product,
   * warehouse, actor, and reversal status. The join condition pairs each `..._OUT` movement
   * with its `..._IN` counterpart by sharing `sourceId` (the transfer id) and
   * `sourceLineId` differing only in its `:out`/`:in` suffix — the same pairing
   * `postTransfer` establishes when it posts them.
   */
  async listTransfers(query: ListTransfersQuery): Promise<{ items: TransferListItem[]; total: number; page: number; pageSize: number }> {
    const conditions: Prisma.Sql[] = [];
    if (query.productId) conditions.push(Prisma.sql`o."productId" = ${query.productId}::uuid`);
    if (query.fromWarehouseId) conditions.push(Prisma.sql`o."warehouseId" = ${query.fromWarehouseId}::uuid`);
    if (query.toWarehouseId) conditions.push(Prisma.sql`i."warehouseId" = ${query.toWarehouseId}::uuid`);
    const extraWhere = conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const joinSql = Prisma.sql`
      FROM "StockMovement" o
      JOIN "StockMovement" i
        ON i."sourceType" = 'warehouse-transfer'
       AND i."sourceId" = o."sourceId"
       AND i."sourceLineId" = replace(o."sourceLineId", ':out', ':in')
       AND i."movementType" = 'WAREHOUSE_TRANSFER_IN'
      WHERE o."sourceType" = 'warehouse-transfer'
        AND o."movementType" = 'WAREHOUSE_TRANSFER_OUT'
        ${extraWhere}
    `;

    const [rows, totalRows] = await Promise.all([
      database.$queryRaw<TransferJoinRow[]>(Prisma.sql`
        SELECT
          o."sourceId" AS "transferId", o.id AS "outId", i.id AS "inId",
          o."productId", o."warehouseId" AS "fromWarehouseId", i."warehouseId" AS "toWarehouseId",
          (-o."signedQuantity")::text AS quantity, o."postedAt", o.notes, o."actorId"
        ${joinSql}
        ORDER BY o."postedAt" DESC, o.id DESC
        OFFSET ${(query.page - 1) * query.pageSize} LIMIT ${query.pageSize}
      `),
      database.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count ${joinSql}`)
    ]);

    const total = Number(totalRows[0]?.count ?? 0n);
    if (rows.length === 0) return { items: [], total, page: query.page, pageSize: query.pageSize };

    const outIds = rows.map((row) => row.outId);
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => id !== null))];
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const warehouseIds = [...new Set(rows.flatMap((row) => [row.fromWarehouseId, row.toWarehouseId]))];

    const [actors, products, warehouses, reversals] = await Promise.all([
      database.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, email: true } }),
      database.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true } }),
      database.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, code: true, name: true } }),
      database.stockMovement.findMany({ where: { reversalOfId: { in: outIds } }, select: { reversalOfId: true } })
    ]);

    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const reversedOutIds = new Set(reversals.map((reversal) => reversal.reversalOfId as string));

    const items: TransferListItem[] = rows.map((row) => {
      const product = productById.get(row.productId);
      const fromWarehouse = warehouseById.get(row.fromWarehouseId);
      const toWarehouse = warehouseById.get(row.toWarehouseId);
      const actor = row.actorId ? (actorById.get(row.actorId) ?? null) : null;
      return {
        transferId: row.transferId,
        outMovementId: row.outId,
        inMovementId: row.inId,
        product: product ?? { id: row.productId, sku: '(unknown)', name: '(unknown product)' },
        fromWarehouse: fromWarehouse ?? { id: row.fromWarehouseId, code: '(unknown)', name: '(unknown warehouse)' },
        toWarehouse: toWarehouse ?? { id: row.toWarehouseId, code: '(unknown)', name: '(unknown warehouse)' },
        quantity: row.quantity,
        postedAt: row.postedAt.toISOString(),
        notes: row.notes,
        actor,
        reversed: reversedOutIds.has(row.outId)
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
