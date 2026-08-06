import { z } from 'zod';
import { quantityAmountSchema } from './products.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

export const goodsReceiptLineInputSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  receivedQuantity: positiveQuantitySchema,
  rejectedQuantity: quantityAmountSchema.default('0')
});
export type GoodsReceiptLineInput = z.infer<typeof goodsReceiptLineInputSchema>;

export const createGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
  allowToleranceOverride: z.boolean().default(false),
  lines: z.array(goodsReceiptLineInputSchema).min(1, 'A goods receipt needs at least one line')
});
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;

export const reverseGoodsReceiptSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type ReverseGoodsReceiptInput = z.infer<typeof reverseGoodsReceiptSchema>;

const goodsReceiptProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const goodsReceiptActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const goodsReceiptWarehouseRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const goodsReceiptPurchaseOrderRefSchema = z.object({ id: z.string().uuid(), orderNumber: z.string() });

export const goodsReceiptLineSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid(),
  product: goodsReceiptProductRefSchema,
  receivedQuantity: quantityAmountSchema,
  rejectedQuantity: quantityAmountSchema,
  acceptedQuantity: quantityAmountSchema
});
export type GoodsReceiptLine = z.infer<typeof goodsReceiptLineSchema>;

export const goodsReceiptSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.string(),
  purchaseOrder: goodsReceiptPurchaseOrderRefSchema,
  warehouse: goodsReceiptWarehouseRefSchema,
  notes: z.string().nullable(),
  receivedBy: goodsReceiptActorRefSchema,
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  lines: z.array(goodsReceiptLineSchema).readonly()
});
export type GoodsReceipt = z.infer<typeof goodsReceiptSchema>;

export const listGoodsReceiptsQuerySchema = paginationQuerySchema.extend({
  purchaseOrderId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional()
});
export type ListGoodsReceiptsQuery = z.infer<typeof listGoodsReceiptsQuerySchema>;
