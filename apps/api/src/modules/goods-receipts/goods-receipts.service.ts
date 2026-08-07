import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasPermission } from '@tadpods/auth';
import { deriveFulfillmentStatus, Quantity } from '@tadpods/domain';
import { database, Prisma, withTransaction, type DatabaseTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type { CreateGoodsReceiptInput, GoodsReceipt, GoodsReceiptLine, ListGoodsReceiptsQuery, ReverseGoodsReceiptInput } from '@tadpods/contracts';
import { StockPostingService, type InventoryRequestContext, type PostingActor } from '../inventory/stock-posting.service.js';
import { autoAllocateIncomingStock } from '../backorders/backorder-posting.js';

const RECEIPT_SOURCE_TYPE = 'goods-receipt-line';
const TOLERANCE_OVERRIDE_PERMISSION = 'purchasing.approve';

/**
 * Purchase-order statuses a goods receipt may still be posted against. `DRAFT` and
 * `AWAITING_APPROVAL` orders are not yet a supplier commitment; `CANCELLED` and `CLOSED`
 * orders are finished. Everything in between — including `BILLED`, since a bill can post
 * before every physically-ordered unit has arrived — can still receive more stock.
 */
const RECEIVABLE_STATUSES = new Set(['CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'PARTIALLY_BILLED', 'BILLED']);

const receiptInclude = {
  purchaseOrder: { select: { id: true, orderNumber: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  receivedBy: { select: { id: true, displayName: true, email: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true } } } }
} satisfies PrismaNamespace.GoodsReceiptInclude;

type ReceiptWithRelations = PrismaNamespace.GoodsReceiptGetPayload<{ include: typeof receiptInclude }>;

function toReceiptLine(row: ReceiptWithRelations['lines'][number]): GoodsReceiptLine {
  const accepted = Quantity.from(row.receivedQuantity.toString()).subtract(Quantity.from(row.rejectedQuantity.toString()));
  return {
    id: row.id,
    purchaseOrderLineId: row.purchaseOrderLineId,
    product: row.product,
    receivedQuantity: row.receivedQuantity.toString(),
    rejectedQuantity: row.rejectedQuantity.toString(),
    acceptedQuantity: accepted.toDecimalString()
  };
}

function toReceipt(row: ReceiptWithRelations): GoodsReceipt {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    purchaseOrder: row.purchaseOrder,
    warehouse: row.warehouse,
    notes: row.notes,
    receivedBy: row.receivedBy,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map(toReceiptLine)
  };
}

type PreparedLine = {
  id: string;
  purchaseOrderLineId: string;
  productId: string;
  received: Quantity;
  rejected: Quantity;
  accepted: Quantity;
  exceedsOrdered: boolean;
};

/**
 * Goods receipts (Phase 3 Task 3). A receipt posts stock through the Phase 2
 * `StockPostingService` exactly like every other movement source: each line posts one
 * `GOODS_RECEIPT` movement with `sourceType='goods-receipt-line'` and
 * `sourceLineId=<that line's id>` — pre-generated before either write, so the ledger's own
 * duplicate-source-line constraint is what actually prevents a line from ever increasing
 * stock twice, not application logic here. Movements post first, exactly as
 * `StockCountsService.post` and `TransfersService.postTransfer` already do, so a receipt
 * record is only ever created for stock that has genuinely posted.
 */
@Injectable()
export class GoodsReceiptsService {
  constructor(private readonly posting: StockPostingService) {}

  async list(query: ListGoodsReceiptsQuery): Promise<{ items: GoodsReceipt[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.GoodsReceiptWhereInput = {
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {})
    };
    const [rows, total] = await Promise.all([
      database.goodsReceipt.findMany({
        where,
        include: receiptInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.goodsReceipt.count({ where })
    ]);
    return { items: rows.map(toReceipt), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<GoodsReceipt> {
    const row = await database.goodsReceipt.findUnique({ where: { id }, include: receiptInclude });
    if (!row) throw new NotFoundException('Goods receipt not found');
    return toReceipt(row);
  }

  async create(input: CreateGoodsReceiptInput, actor: PostingActor, context: InventoryRequestContext): Promise<GoodsReceipt> {
    const order = await database.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { lines: true } });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (!RECEIVABLE_STATUSES.has(order.status)) {
      throw new ConflictException(`A purchase order with status ${order.status} cannot receive goods`);
    }

    const warehouse = await database.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    if (warehouse.status !== 'ACTIVE') throw new BadRequestException('Cannot receive goods into an inactive warehouse');

    const linesById = new Map(order.lines.map((line) => [line.id, line]));
    const preparedLines: PreparedLine[] = input.lines.map((line) => {
      const orderLine = linesById.get(line.purchaseOrderLineId);
      if (!orderLine) throw new BadRequestException(`Purchase order line ${line.purchaseOrderLineId} does not belong to this order`);

      const received = Quantity.from(line.receivedQuantity);
      const rejected = Quantity.from(line.rejectedQuantity);
      if (rejected.isNegative()) throw new BadRequestException('Rejected quantity cannot be negative');
      if (rejected.greaterThan(received)) throw new BadRequestException('Rejected quantity cannot exceed received quantity');
      const accepted = received.subtract(rejected);

      const ordered = Quantity.from(orderLine.orderedQuantity.toString());
      const alreadyReceived = Quantity.from(orderLine.receivedQuantity.toString());
      const exceedsOrdered = alreadyReceived.add(accepted).greaterThan(ordered);

      return { id: randomUUID(), purchaseOrderLineId: orderLine.id, productId: orderLine.productId, received, rejected, accepted, exceedsOrdered };
    });

    if (preparedLines.some((line) => line.exceedsOrdered)) {
      if (!input.allowToleranceOverride) {
        throw new BadRequestException('Receiving this quantity would exceed the ordered quantity for at least one line; use the tolerance override to proceed');
      }
      if (!hasPermission(actor.permissions, TOLERANCE_OVERRIDE_PERMISSION)) {
        throw new ForbiddenException('Receiving beyond the ordered quantity requires the purchasing.approve permission');
      }
    }

    const receiptId = randomUUID();
    const movementInputs = preparedLines
      .filter((line) => line.accepted.isPositive())
      .map((line) => ({
        productId: line.productId,
        warehouseId: input.warehouseId,
        movementType: 'GOODS_RECEIPT' as const,
        signedQuantity: line.accepted.toDecimalString(),
        sourceType: RECEIPT_SOURCE_TYPE,
        sourceId: receiptId,
        sourceLineId: line.id,
        idempotencyKey: `${input.idempotencyKey}:${line.id}`,
        notes: input.notes ?? null,
        allowNegativeStockOverride: false
      }));

    if (movementInputs.length > 0) {
      await this.posting.postMovements(movementInputs, actor, context);
    }

    return withTransaction(async (transaction) => {
      const created = await transaction.goodsReceipt.create({
        data: {
          id: receiptId,
          receiptNumber: await this.nextReceiptNumber(transaction),
          purchaseOrderId: order.id,
          warehouseId: input.warehouseId,
          notes: input.notes ?? null,
          receivedById: actor.id,
          lines: {
            create: preparedLines.map((line) => ({
              id: line.id,
              purchaseOrderLineId: line.purchaseOrderLineId,
              productId: line.productId,
              receivedQuantity: line.received.toDecimalString(),
              rejectedQuantity: line.rejected.toDecimalString()
            }))
          }
        },
        include: receiptInclude
      });

      for (const line of preparedLines) {
        if (line.accepted.isZero()) continue;
        await transaction.purchaseOrderLine.update({
          where: { id: line.purchaseOrderLineId },
          data: { receivedQuantity: { increment: line.accepted.toDecimalString() } }
        });
        // Phase 4's "automatic readiness update after goods receipt" rule: spread this
        // line's accepted quantity across open backorders for the same product/warehouse.
        await autoAllocateIncomingStock(transaction, {
          productId: line.productId,
          warehouseId: input.warehouseId,
          quantity: line.accepted,
          sourceType: RECEIPT_SOURCE_TYPE,
          sourceId: receiptId,
          sourceLineId: line.id,
          createdById: actor.id
        });
      }

      await this.refreshOrderStatus(transaction, order.id);
      await this.audit(transaction, 'goods-receipt.create', created.id, actor, context, {
        purchaseOrderId: order.id,
        warehouseId: input.warehouseId,
        lineCount: preparedLines.length,
        toleranceOverridden: preparedLines.some((line) => line.exceedsOrdered)
      });

      return toReceipt(created);
    });
  }

  /**
   * Reverse every stock effect a receipt posted, atomically, then re-open the
   * purchase-order lines it advanced and re-derive the order's status — mirroring
   * `TransfersService.reverseTransfer`. A receipt can only be reversed once: `reversedAt`
   * marks it, checked up front under the same read that finds its lines.
   */
  async reverse(id: string, input: ReverseGoodsReceiptInput, actor: PostingActor, context: InventoryRequestContext): Promise<GoodsReceipt> {
    const receipt = await database.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
    if (!receipt) throw new NotFoundException('Goods receipt not found');
    if (receipt.reversedAt) throw new ConflictException('This goods receipt has already been reversed');

    const movements = await database.stockMovement.findMany({
      where: { sourceType: RECEIPT_SOURCE_TYPE, sourceId: id },
      select: { id: true }
    });
    if (movements.length > 0) {
      await this.posting.reverseMovements(movements.map((movement) => movement.id), input, actor, context);
    }

    return withTransaction(async (transaction) => {
      for (const line of receipt.lines) {
        const accepted = Quantity.from(line.receivedQuantity.toString()).subtract(Quantity.from(line.rejectedQuantity.toString()));
        if (accepted.isZero()) continue;
        await transaction.purchaseOrderLine.update({
          where: { id: line.purchaseOrderLineId },
          data: { receivedQuantity: { decrement: accepted.toDecimalString() } }
        });
      }

      await this.refreshOrderStatus(transaction, receipt.purchaseOrderId);
      const updated = await transaction.goodsReceipt.update({
        where: { id },
        data: { reversedAt: new Date() },
        include: receiptInclude
      });
      await this.audit(transaction, 'goods-receipt.reverse', id, actor, context, { reason: input.notes ?? null });

      return toReceipt(updated);
    });
  }

  /** Re-derive a purchase order's fulfillment status purely from its lines' current quantities. */
  private async refreshOrderStatus(transaction: DatabaseTransaction, purchaseOrderId: string): Promise<void> {
    const lines = await transaction.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
    const status = deriveFulfillmentStatus(
      lines.map((line) => ({
        orderedQuantity: line.orderedQuantity.toString(),
        receivedQuantity: line.receivedQuantity.toString(),
        billedQuantity: line.billedQuantity.toString()
      }))
    );
    await transaction.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status } });
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    entityId: string,
    actor: PostingActor,
    context: InventoryRequestContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: 'GoodsReceipt',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });
  }

  private async nextReceiptNumber(transaction: DatabaseTransaction): Promise<string> {
    const rows = await transaction.$queryRaw<Array<{ prefix: string; value: bigint; padding: number }>>`
      UPDATE "DocumentSequence"
      SET "nextValue" = "nextValue" + 1, "updatedAt" = NOW()
      WHERE "key" = 'goods-receipt'
      RETURNING "prefix", "nextValue" - 1 AS "value", "padding"
    `;
    const row = rows[0];
    if (!row) throw new Error('Unknown document sequence: goods-receipt');
    return `${row.prefix}${row.value.toString().padStart(row.padding, '0')}`;
  }
}
