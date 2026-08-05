import { z } from 'zod';
import { quantityMagnitudeSchema } from './adjustments.js';

export const stockCountStatusSchema = z.enum(['DRAFT', 'POSTED']);
export type StockCountStatus = z.infer<typeof stockCountStatusSchema>;

/**
 * Draft creation supports the three selection modes Phase 2 Task 5 asks for: an explicit
 * `productIds` list, every active product in a `categoryId`, or — when neither is given —
 * every active product (a full-warehouse count). Exactly one of `productIds`/`categoryId`
 * may be supplied; passing both is ambiguous and rejected.
 */
export const createStockCountSchema = z
  .object({
    warehouseId: z.string().uuid(),
    productIds: z.array(z.string().uuid()).min(1).max(1000).optional(),
    categoryId: z.string().uuid().optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  })
  .refine((value) => !(value.productIds && value.categoryId), {
    message: 'Provide either productIds or categoryId, not both',
    path: ['categoryId']
  });
export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

/** Unsigned decimal, matching a physical count — zero is a valid count (e.g. a stockout). */
export const countedQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a positive decimal quantity with up to four decimal places');

export const updateStockCountLineSchema = z.object({
  countedQuantity: countedQuantitySchema
});
export type UpdateStockCountLineInput = z.infer<typeof updateStockCountLineSchema>;

export const postStockCountSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200)
});
export type PostStockCountInput = z.infer<typeof postStockCountSchema>;

export const listStockCountsQuerySchema = z.object({
  warehouseId: z.string().uuid().optional(),
  status: stockCountStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListStockCountsQuery = z.infer<typeof listStockCountsQuerySchema>;

const stockCountLineProductSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  barcode: z.string().nullable(),
  unitOfMeasure: z.string()
});

export const stockCountLineSchema = z.object({
  id: z.string().uuid(),
  product: stockCountLineProductSchema,
  expectedQuantity: quantityMagnitudeSchema.or(z.literal('0.0000')),
  countedQuantity: quantityMagnitudeSchema.or(z.literal('0.0000')).nullable(),
  variance: quantityMagnitudeSchema.or(z.literal('0.0000')).nullable()
});
export type StockCountLine = z.infer<typeof stockCountLineSchema>;

const stockCountWarehouseSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const stockCountCreatedBySchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });

export const stockCountSchema = z.object({
  id: z.string().uuid(),
  warehouse: stockCountWarehouseSchema,
  status: stockCountStatusSchema,
  notes: z.string().nullable(),
  createdBy: stockCountCreatedBySchema,
  postedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  lines: z.array(stockCountLineSchema).readonly()
});
export type StockCount = z.infer<typeof stockCountSchema>;

export const stockCountListItemSchema = z.object({
  id: z.string().uuid(),
  warehouse: stockCountWarehouseSchema,
  status: stockCountStatusSchema,
  lineCount: z.number().int(),
  countedLineCount: z.number().int(),
  createdBy: stockCountCreatedBySchema,
  postedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type StockCountListItem = z.infer<typeof stockCountListItemSchema>;
