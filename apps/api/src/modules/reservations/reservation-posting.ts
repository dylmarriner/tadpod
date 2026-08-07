import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Quantity, validateReservationWithinStock, type ReservationMethod } from '@tadpods/domain';
import type { DatabaseTransaction, StockReservation as StockReservationRow } from '@tadpods/database';
import { refreshBackorderStatus } from '../backorders/backorder-posting.js';

/**
 * Shared reservation-posting primitives, used directly (not through Nest DI) by
 * `SalesOrdersService.confirm`, `ReservationsService`'s manual and allocation-run endpoints,
 * and `DeliveriesService` — mirroring how `GoodsReceiptsService` writes `PurchaseOrderLine`
 * rows directly rather than depending on a `PurchaseOrdersService` method. Every reservation
 * write happens under the same `pg_advisory_xact_lock((productId, warehouseId))` key
 * `StockPostingService` takes before posting a movement, so a reservation and a concurrent
 * stock posting — or two concurrent reservation attempts — can never both pass the
 * within-stock check against the same (product, warehouse) balance.
 */

export async function lockStockKey(transaction: DatabaseTransaction, productId: string, warehouseId: string): Promise<void> {
  const key = `${productId}:${warehouseId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function stockOnHandFor(transaction: DatabaseTransaction, productId: string, warehouseId: string): Promise<Quantity> {
  const result = await transaction.stockMovement.aggregate({
    where: { productId, warehouseId },
    _sum: { signedQuantity: true }
  });
  return Quantity.from(result._sum.signedQuantity?.toString() ?? '0');
}

export async function activeReservedFor(transaction: DatabaseTransaction, productId: string, warehouseId: string): Promise<Quantity> {
  const result = await transaction.stockReservation.aggregate({
    where: { productId, warehouseId, status: 'ACTIVE' },
    _sum: { quantity: true }
  });
  return Quantity.from(result._sum.quantity?.toString() ?? '0');
}

export type CreateReservationInput = {
  salesOrderId: string;
  salesOrderLineId: string;
  productId: string;
  warehouseId: string;
  quantity: Quantity;
  method: ReservationMethod;
  createdById: string;
  backorderLineId?: string | null;
  notes?: string | null;
};

/**
 * Create one reservation for one line, after the caller has already locked the
 * (product, warehouse) key. Guards the invariant that active reservations can never exceed
 * stock on hand, and increments `SalesOrderLine.reservedQuantity` in the same write.
 */
export async function createReservation(transaction: DatabaseTransaction, input: CreateReservationInput): Promise<StockReservationRow> {
  if (!input.quantity.isPositive()) throw new BadRequestException('Reservation quantity must be greater than zero');

  const [stockOnHand, activeReserved] = await Promise.all([
    stockOnHandFor(transaction, input.productId, input.warehouseId),
    activeReservedFor(transaction, input.productId, input.warehouseId)
  ]);
  try {
    validateReservationWithinStock(stockOnHand.toDecimalString(), activeReserved.toDecimalString(), input.quantity.toDecimalString());
  } catch (error) {
    throw new ConflictException(error instanceof Error ? error.message : 'Reservation would oversubscribe stock on hand');
  }

  const reservation = await transaction.stockReservation.create({
    data: {
      salesOrderId: input.salesOrderId,
      salesOrderLineId: input.salesOrderLineId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity.toDecimalString(),
      method: input.method,
      backorderLineId: input.backorderLineId ?? null,
      createdById: input.createdById,
      notes: input.notes ?? null
    }
  });

  await transaction.salesOrderLine.update({
    where: { id: input.salesOrderLineId },
    data: { reservedQuantity: { increment: input.quantity.toDecimalString() } }
  });

  return reservation;
}

/** Release an active reservation, freeing the stock it claimed back to the available pool. */
export async function releaseReservation(transaction: DatabaseTransaction, reservationId: string): Promise<StockReservationRow> {
  const reservation = await transaction.stockReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw new NotFoundException('Reservation not found');
  if (reservation.status !== 'ACTIVE') throw new ConflictException(`Only an active reservation can be released (this one is ${reservation.status})`);

  await lockStockKey(transaction, reservation.productId, reservation.warehouseId);

  const updated = await transaction.stockReservation.update({
    where: { id: reservationId },
    data: { status: 'RELEASED', releasedAt: new Date() }
  });
  await transaction.salesOrderLine.update({
    where: { id: reservation.salesOrderLineId },
    data: { reservedQuantity: { decrement: reservation.quantity.toString() } }
  });
  return updated;
}

/**
 * Mark an active reservation consumed because the stock it claimed has now physically shipped
 * — called by `DeliveriesService` when a delivery line's quantity is covered by a reservation.
 * Consumption does not touch `reservedQuantity`'s counterpart on the line beyond what the
 * delivery itself already decremented via `deliveredQuantity`; it only retires the claim so it
 * stops counting against `activeReservedFor`.
 */
export async function consumeReservation(transaction: DatabaseTransaction, reservationId: string, quantity: Quantity): Promise<void> {
  const reservation = await transaction.stockReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw new NotFoundException('Reservation not found');
  if (reservation.status !== 'ACTIVE') throw new ConflictException(`Only an active reservation can be consumed (this one is ${reservation.status})`);

  const reservedQuantity = Quantity.from(reservation.quantity.toString());
  if (quantity.greaterThan(reservedQuantity)) {
    throw new ConflictException('Cannot consume more than the reservation holds');
  }

  await transaction.salesOrderLine.update({
    where: { id: reservation.salesOrderLineId },
    data: { reservedQuantity: { decrement: quantity.toDecimalString() } }
  });

  // A backorder is only ever fulfilled by stock actually shipping — consuming a reservation
  // that was earmarked against a backorder line (via `absorbBackorderForReservation`) is
  // exactly that moment, so the same quantity moves from that line's `allocatedQuantity` to
  // its `fulfilledQuantity` here.
  if (reservation.backorderLineId) {
    await transaction.backorderLine.update({
      where: { id: reservation.backorderLineId },
      data: { fulfilledQuantity: { increment: quantity.toDecimalString() } }
    });
    const backorderLine = await transaction.backorderLine.findUniqueOrThrow({ where: { id: reservation.backorderLineId } });
    await refreshBackorderStatus(transaction, backorderLine.backorderId);
  }

  if (quantity.compare(reservedQuantity) === 0) {
    await transaction.stockReservation.update({ where: { id: reservationId }, data: { status: 'CONSUMED', consumedAt: new Date() } });
    return;
  }

  // Partial consumption: shrink this reservation to what remains active and spin off a
  // consumed record for the shipped portion, so the audit trail always shows the exact
  // quantity that was consumed rather than mutating history in place.
  await transaction.stockReservation.update({
    where: { id: reservationId },
    data: { quantity: reservedQuantity.subtract(quantity).toDecimalString() }
  });
  await transaction.stockReservation.create({
    data: {
      salesOrderId: reservation.salesOrderId,
      salesOrderLineId: reservation.salesOrderLineId,
      productId: reservation.productId,
      warehouseId: reservation.warehouseId,
      quantity: quantity.toDecimalString(),
      status: 'CONSUMED',
      method: reservation.method,
      backorderLineId: reservation.backorderLineId,
      createdById: reservation.createdById,
      consumedAt: new Date(),
      notes: reservation.notes
    }
  });
}
