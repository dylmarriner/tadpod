import { z } from 'zod';
import { quantityAmountSchema } from './products.js';

export const reservationStatusSchema = z.enum(['ACTIVE', 'RELEASED', 'CONSUMED']);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const reservationMethodSchema = z.enum(['IMMEDIATE', 'MANUAL', 'PRIORITY', 'PROMISED_DATE', 'OLDEST_FIRST']);
export type ReservationMethod = z.infer<typeof reservationMethodSchema>;

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

const reservationProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const reservationActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });

export const reservationSchema = z.object({
  id: z.string().uuid(),
  salesOrderId: z.string().uuid(),
  salesOrderLineId: z.string().uuid(),
  product: reservationProductRefSchema,
  warehouseId: z.string().uuid(),
  quantity: quantityAmountSchema,
  status: reservationStatusSchema,
  method: reservationMethodSchema,
  backorderLineId: z.string().uuid().nullable(),
  createdBy: reservationActorRefSchema,
  releasedAt: z.string().datetime().nullable(),
  consumedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type Reservation = z.infer<typeof reservationSchema>;

export const listReservationsQuerySchema = z.object({
  salesOrderId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status: reservationStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;

/**
 * Manually reserve a specific quantity against one sales order line ("reserve manually"). A
 * reservation is a soft claim, not a stock movement (see `StockReservation` in the schema), so
 * it carries no idempotency key: retrying this call is always safe — it either reserves more
 * of what is still genuinely available, or is rejected by the within-stock check, never
 * double-posts a ledger effect the way a stock movement or delivery would.
 */
export const createReservationSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  quantity: positiveQuantitySchema,
  notes: z.string().trim().max(2000).nullable().optional()
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const releaseReservationSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;

/**
 * Run a reservation allocation across all open demand for one product/warehouse — the
 * "reserve by priority", "reserve by promised date", and "reserve oldest order first" rules.
 */
export const runReservationAllocationSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  method: z.enum(['PRIORITY', 'PROMISED_DATE', 'OLDEST_FIRST'])
});
export type RunReservationAllocationInput = z.infer<typeof runReservationAllocationSchema>;

export const reservationAllocationResultSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  method: z.string(),
  reservations: z.array(reservationSchema).readonly(),
  backordersCreated: z.array(z.string().uuid()).readonly()
});
export type ReservationAllocationResult = z.infer<typeof reservationAllocationResultSchema>;
