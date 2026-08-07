import { z } from 'zod';
import { quantityAmountSchema } from './products.js';

export const deliveryStatusSchema = z.enum(['DRAFT', 'POSTED', 'REVERSED']);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const deliveryModeSchema = z.enum(['ALL', 'AVAILABLE', 'SELECTED']);
export type DeliveryMode = z.infer<typeof deliveryModeSchema>;

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

export const deliveryLineSelectionSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  quantity: positiveQuantitySchema
});
export type DeliveryLineSelection = z.infer<typeof deliveryLineSelectionSchema>;

export const createDeliverySchema = z
  .object({
    salesOrderId: z.string().uuid(),
    mode: deliveryModeSchema,
    selections: z.array(deliveryLineSelectionSchema).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(200)
  })
  .refine((value) => value.mode !== 'SELECTED' || (value.selections && value.selections.length > 0), {
    message: 'SELECTED mode requires at least one line selection',
    path: ['selections']
  });
export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;

export const postDeliverySchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200)
});
export type PostDeliveryInput = z.infer<typeof postDeliverySchema>;

export const reverseDeliverySchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type ReverseDeliveryInput = z.infer<typeof reverseDeliverySchema>;

const deliveryProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const deliveryActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const deliveryWarehouseRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const deliverySalesOrderRefSchema = z.object({ id: z.string().uuid(), orderNumber: z.string() });

export const deliveryLineSchema = z.object({
  id: z.string().uuid(),
  salesOrderLineId: z.string().uuid(),
  product: deliveryProductRefSchema,
  quantity: quantityAmountSchema
});
export type DeliveryLine = z.infer<typeof deliveryLineSchema>;

export const deliverySchema = z.object({
  id: z.string().uuid(),
  deliveryNumber: z.string(),
  salesOrder: deliverySalesOrderRefSchema,
  warehouse: deliveryWarehouseRefSchema,
  status: deliveryStatusSchema,
  notes: z.string().nullable(),
  createdBy: deliveryActorRefSchema,
  postedBy: deliveryActorRefSchema.nullable(),
  postedAt: z.string().datetime().nullable(),
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  lines: z.array(deliveryLineSchema).readonly()
});
export type Delivery = z.infer<typeof deliverySchema>;

export const listDeliveriesQuerySchema = z.object({
  salesOrderId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status: deliveryStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;
