import { z } from 'zod';

export const stockMovementTypeSchema = z.enum([
  'OPENING_STOCK',
  'GOODS_RECEIPT',
  'SALES_DELIVERY',
  'CUSTOMER_RETURN',
  'SUPPLIER_RETURN',
  'WAREHOUSE_TRANSFER_OUT',
  'WAREHOUSE_TRANSFER_IN',
  'POSITIVE_ADJUSTMENT',
  'NEGATIVE_ADJUSTMENT',
  'STOCK_COUNT_CORRECTION',
  'REVERSAL'
]);
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

/** Signed decimal quantity matching the `Quantity` domain primitive: an optional leading `-`, up to four decimal places. */
export const signedQuantityAmountSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a signed decimal quantity with up to four decimal places');

/**
 * The generic stock-posting primitive. This is intentionally movement-type agnostic:
 * opening stock, adjustments, transfers, and stock counts (Tasks 3-5) all post through this
 * same shape rather than each inventing their own endpoint contract. `REVERSAL` movements
 * are never posted directly through this contract — they are only created by
 * `POST /inventory/movements/:id/reverse`.
 */
export const postStockMovementSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  movementType: stockMovementTypeSchema.exclude(['REVERSAL']),
  signedQuantity: signedQuantityAmountSchema,
  sourceType: z.string().trim().min(1).max(60),
  sourceId: z.string().trim().min(1).max(120),
  sourceLineId: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Requested only; honoured solely when system settings and the actor's permissions both allow it. */
  allowNegativeStockOverride: z.boolean().default(false)
});
export type PostStockMovementInput = z.infer<typeof postStockMovementSchema>;

export const reverseStockMovementSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type ReverseStockMovementInput = z.infer<typeof reverseStockMovementSchema>;

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  movementType: stockMovementTypeSchema,
  signedQuantity: signedQuantityAmountSchema,
  postedAt: z.string().datetime(),
  sourceType: z.string(),
  sourceId: z.string(),
  sourceLineId: z.string(),
  idempotencyKey: z.string().nullable(),
  reversalOfId: z.string().uuid().nullable(),
  actorId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const listStockMovementsQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  movementType: stockMovementTypeSchema.optional(),
  sourceType: z.string().trim().min(1).max(60).optional(),
  sourceId: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});
export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;

export const stockOnHandQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional()
});
export type StockOnHandQuery = z.infer<typeof stockOnHandQuerySchema>;

export const stockOnHandRowSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: signedQuantityAmountSchema
});
export type StockOnHandRow = z.infer<typeof stockOnHandRowSchema>;

export const stockOnHandResponseSchema = z.object({
  byWarehouse: z.array(stockOnHandRowSchema).readonly(),
  total: z.array(z.object({ productId: z.string().uuid(), quantity: signedQuantityAmountSchema })).readonly()
});
export type StockOnHandResponse = z.infer<typeof stockOnHandResponseSchema>;
