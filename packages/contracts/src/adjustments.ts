import { z } from 'zod';
import { signedQuantityAmountSchema, stockMovementTypeSchema } from './inventory.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

/** Unsigned decimal magnitude matching the `Quantity` domain primitive: up to four decimal places, strictly greater than zero. */
export const quantityMagnitudeSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a positive decimal quantity with up to four decimal places')
  .refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

/**
 * Guided opening-stock entry. Each submission is its own source line — there is no
 * external system generating one — so `AdjustmentsService` generates the source id itself
 * rather than accepting one from the caller. Notes are optional: opening stock is
 * establishing a starting balance, not correcting one, so there is nothing to justify.
 */
export const postOpeningStockSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: quantityMagnitudeSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200)
});
export type PostOpeningStockInput = z.infer<typeof postOpeningStockSchema>;

export const adjustmentDirectionSchema = z.enum(['INCREASE', 'DECREASE']);
export type AdjustmentDirection = z.infer<typeof adjustmentDirectionSchema>;

/**
 * Positive/negative adjustment. `reason` is mandatory — a bare stock-affecting write with
 * no justification is rejected before it ever reaches `StockPostingService`. `quantity` is
 * an unsigned magnitude; `direction` determines the sign and the resulting movement type
 * (`POSITIVE_ADJUSTMENT` / `NEGATIVE_ADJUSTMENT`).
 */
export const postAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  direction: adjustmentDirectionSchema,
  quantity: quantityMagnitudeSchema,
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(1).max(200),
  /** Requested only; honoured solely when system settings and the actor's permissions both allow it (see `StockPostingService`). */
  allowNegativeStockOverride: z.boolean().default(false)
});
export type PostAdjustmentInput = z.infer<typeof postAdjustmentSchema>;

export const listAdjustmentsQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional()
});
export type ListAdjustmentsQuery = z.infer<typeof listAdjustmentsQuerySchema>;

const adjustmentActorSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const adjustmentProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const adjustmentWarehouseRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

/**
 * One row on the adjustments list: the posted movement plus the before/after stock-on-hand
 * quantities it produced, and — when present — the reversal that later undid it.
 */
export const adjustmentListItemSchema = z.object({
  id: z.string().uuid(),
  movementType: stockMovementTypeSchema,
  product: adjustmentProductRefSchema,
  warehouse: adjustmentWarehouseRefSchema,
  signedQuantity: signedQuantityAmountSchema,
  beforeQuantity: signedQuantityAmountSchema,
  afterQuantity: signedQuantityAmountSchema,
  postedAt: z.string().datetime(),
  sourceType: z.string(),
  sourceId: z.string(),
  notes: z.string().nullable(),
  actor: adjustmentActorSchema.nullable(),
  reversal: z.object({ id: z.string().uuid(), postedAt: z.string().datetime() }).nullable()
});
export type AdjustmentListItem = z.infer<typeof adjustmentListItemSchema>;

export const adjustmentProductSearchQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type AdjustmentProductSearchQuery = z.infer<typeof adjustmentProductSearchQuerySchema>;

export const adjustmentProductPickerSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  barcode: z.string().nullable(),
  unitOfMeasure: z.string()
});
export type AdjustmentProductPicker = z.infer<typeof adjustmentProductPickerSchema>;

export const adjustmentWarehousePickerSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean()
});
export type AdjustmentWarehousePicker = z.infer<typeof adjustmentWarehousePickerSchema>;
