import { NotFoundException } from '@nestjs/common';
import { deriveBackorderStatus, planIncomingAllocation, Quantity } from '@tadpods/domain';
import { nextDocumentNumber, type Backorder as BackorderRow, type DatabaseTransaction } from '@tadpods/database';

export type CreateBackorderForShortfallInput = {
  salesOrderId: string;
  salesOrderLineId: string;
  productId: string;
  customerId: string;
  warehouseId: string;
  quantity: Quantity;
  priority: number;
  promisedDate: Date | null;
  createdById: string;
};

/**
 * Raise a backorder (or add a line to today's open backorder for this order, if one already
 * exists) covering demand a reservation could not satisfy — mirrors how
 * `ReservationsService`/`SalesOrdersService.confirm` call this directly rather than through a
 * `BackordersService` method, the same "write the sibling table directly" pattern
 * `GoodsReceiptsService` uses for `PurchaseOrderLine`.
 */
export async function createBackorderForShortfall(transaction: DatabaseTransaction, input: CreateBackorderForShortfallInput): Promise<BackorderRow> {
  const existing = await transaction.backorder.findFirst({
    where: { salesOrderId: input.salesOrderId, status: { not: 'CANCELLED' } }
  });

  if (existing) {
    await transaction.backorderLine.upsert({
      where: { backorderId_salesOrderLineId: { backorderId: existing.id, salesOrderLineId: input.salesOrderLineId } },
      update: { quantity: { increment: input.quantity.toDecimalString() } },
      create: {
        backorderId: existing.id,
        salesOrderLineId: input.salesOrderLineId,
        productId: input.productId,
        quantity: input.quantity.toDecimalString()
      }
    });
    return existing;
  }

  const backorderNumber = await nextDocumentNumber('backorder');
  return transaction.backorder.create({
    data: {
      backorderNumber,
      salesOrderId: input.salesOrderId,
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      priority: input.priority,
      promisedDate: input.promisedDate,
      createdById: input.createdById,
      lines: {
        create: [{ salesOrderLineId: input.salesOrderLineId, productId: input.productId, quantity: input.quantity.toDecimalString() }]
      }
    }
  });
}

/**
 * Shrink a sales order line's open backorder demand by `quantity` because that much is about
 * to be reserved, marking the same amount `allocatedQuantity` on the backorder line — earmarked
 * stock, not yet delivered — rather than `cancelledQuantity` (which means withdrawn demand, not
 * "now covered by a reservation"). Must run *before* the caller increments
 * `SalesOrderLine.reservedQuantity`: `reservedQuantity` and `backorderedQuantity` both count
 * toward the `SalesOrderLine_quantity_balance` check constraint, so incrementing one before
 * shrinking the other would momentarily claim more than was ordered and the write would be
 * rejected. Returns the backorder line the reservation should link to (`StockReservation.
 * backorderLineId`), so `DeliveriesService` can later mark that same quantity fulfilled once it
 * actually ships — a backorder is only ever `FULFILLED` by a real delivery, not by a reservation.
 */
export async function absorbBackorderForReservation(transaction: DatabaseTransaction, salesOrderLineId: string, quantity: Quantity): Promise<string | null> {
  if (!quantity.isPositive()) return null;

  let remaining = quantity;
  let firstBackorderLineId: string | null = null;
  const backorderLines = await transaction.backorderLine.findMany({
    where: { salesOrderLineId, backorder: { status: { not: 'CANCELLED' } } },
    orderBy: { createdAt: 'asc' }
  });
  for (const line of backorderLines) {
    if (!remaining.isPositive()) break;
    const open = Quantity.from(line.quantity.toString()).subtract(Quantity.from(line.fulfilledQuantity.toString())).subtract(Quantity.from(line.cancelledQuantity.toString()));
    const alreadyAllocated = Quantity.from(line.allocatedQuantity.toString());
    const available = alreadyAllocated.greaterThan(open) ? Quantity.zero() : open.subtract(alreadyAllocated);
    if (!available.isPositive()) continue;
    const absorbed = available.lessThan(remaining) ? available : remaining;

    await transaction.backorderLine.update({ where: { id: line.id }, data: { allocatedQuantity: { increment: absorbed.toDecimalString() } } });
    await transaction.salesOrderLine.update({ where: { id: salesOrderLineId }, data: { backorderedQuantity: { decrement: absorbed.toDecimalString() } } });
    await refreshBackorderStatus(transaction, line.backorderId);
    firstBackorderLineId ??= line.id;
    remaining = remaining.subtract(absorbed);
  }
  return firstBackorderLineId;
}

/** Re-derive a backorder's status purely from its lines' current quantities. */
export async function refreshBackorderStatus(transaction: DatabaseTransaction, backorderId: string): Promise<void> {
  const lines = await transaction.backorderLine.findMany({ where: { backorderId } });
  const status = deriveBackorderStatus(
    lines.map((line) => ({
      quantity: line.quantity.toString(),
      allocatedQuantity: line.allocatedQuantity.toString(),
      fulfilledQuantity: line.fulfilledQuantity.toString(),
      cancelledQuantity: line.cancelledQuantity.toString()
    }))
  );
  await transaction.backorder.update({
    where: { id: backorderId },
    data: {
      status,
      fulfilledAt: status === 'FULFILLED' ? new Date() : null
    }
  });
}

export async function getBackorderLineOrThrow(transaction: DatabaseTransaction, backorderLineId: string) {
  const line = await transaction.backorderLine.findUnique({ where: { id: backorderLineId } });
  if (!line) throw new NotFoundException('Backorder line not found');
  return line;
}

/**
 * The "automatic readiness update after goods receipt" rule: called by `GoodsReceiptsService`
 * right after it posts a `GOODS_RECEIPT` movement for one line, spreading that line's accepted
 * quantity across the product's open backorders at the same warehouse, oldest first. This only
 * ever increments `allocatedQuantity` — it earmarks incoming stock against a promise, it does
 * not deliver it — so a backorder still needs an explicit delivery to actually ship.
 * `(backorderLineId, sourceLineId)` is unique, so re-running this for the same goods-receipt
 * line (a retried request) allocates nothing a second time.
 */
export async function autoAllocateIncomingStock(
  transaction: DatabaseTransaction,
  input: { productId: string; warehouseId: string; quantity: Quantity; sourceType: string; sourceId: string; sourceLineId: string; createdById: string }
): Promise<void> {
  if (!input.quantity.isPositive()) return;

  const openLines = await transaction.backorderLine.findMany({
    where: { productId: input.productId, backorder: { warehouseId: input.warehouseId, status: { notIn: ['CANCELLED', 'FULFILLED'] } } },
    include: { backorder: true }
  });
  const demands = openLines
    .map((line) => ({
      backorderLineId: line.id,
      outstandingQuantity: Quantity.from(line.quantity.toString())
        .subtract(Quantity.from(line.allocatedQuantity.toString()))
        .subtract(Quantity.from(line.fulfilledQuantity.toString()))
        .subtract(Quantity.from(line.cancelledQuantity.toString()))
        .toDecimalString(),
      priority: line.backorder.priority,
      createdAt: line.createdAt.toISOString()
    }))
    .filter((demand) => Quantity.from(demand.outstandingQuantity).isPositive());
  if (demands.length === 0) return;

  const allocations = planIncomingAllocation(input.quantity.toDecimalString(), demands, 'OLDEST_FIRST');
  const backorderIdsTouched = new Set<string>();
  for (const allocation of allocations) {
    const line = openLines.find((candidate) => candidate.id === allocation.backorderLineId);
    if (!line) continue;
    try {
      await transaction.backorderAllocation.create({
        data: {
          backorderLineId: line.id,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceLineId: input.sourceLineId,
          quantity: allocation.quantity,
          createdById: input.createdById
        }
      });
    } catch {
      continue;
    }
    await transaction.backorderLine.update({ where: { id: line.id }, data: { allocatedQuantity: { increment: allocation.quantity } } });
    backorderIdsTouched.add(line.backorderId);
  }

  for (const backorderId of backorderIdsTouched) {
    await refreshBackorderStatus(transaction, backorderId);
  }
}
