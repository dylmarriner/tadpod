import { z } from 'zod';
import { signedQuantityAmountSchema } from './inventory.js';
import { quantityMagnitudeSchema } from './adjustments.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

/**
 * A customer return against one already-posted delivery line. `deliveryLineId` ties it to the
 * exact shipment being returned; the service derives product and warehouse from that line
 * rather than accepting them from the caller, so a return can never be posted to the wrong
 * warehouse. `reason` is mandatory for the same audit reason `postAdjustmentSchema` requires one.
 */
export const postCustomerReturnSchema = z.object({
  deliveryLineId: z.string().uuid(),
  quantity: quantityMagnitudeSchema,
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(1).max(200)
});
export type PostCustomerReturnInput = z.infer<typeof postCustomerReturnSchema>;

export const listCustomerReturnsQuerySchema = paginationQuerySchema.extend({
  deliveryLineId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional()
});
export type ListCustomerReturnsQuery = z.infer<typeof listCustomerReturnsQuerySchema>;

const customerReturnActorSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const customerReturnProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const customerReturnWarehouseRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const customerReturnDeliveryRefSchema = z.object({ id: z.string().uuid(), deliveryNumber: z.string() });

/** One posted `CUSTOMER_RETURN` movement, shaped for the returns list/history screen. */
export const customerReturnListItemSchema = z.object({
  id: z.string().uuid(),
  delivery: customerReturnDeliveryRefSchema,
  deliveryLineId: z.string().uuid(),
  product: customerReturnProductRefSchema,
  warehouse: customerReturnWarehouseRefSchema,
  quantity: signedQuantityAmountSchema,
  reason: z.string().nullable(),
  postedAt: z.string().datetime(),
  actor: customerReturnActorSchema.nullable()
});
export type CustomerReturnListItem = z.infer<typeof customerReturnListItemSchema>;

/** How much of one delivery line can still be returned: delivered minus already-returned. */
export const deliveryLineReturnableSchema = z.object({
  deliveryLineId: z.string().uuid(),
  deliveredQuantity: signedQuantityAmountSchema,
  returnedQuantity: signedQuantityAmountSchema,
  returnableQuantity: signedQuantityAmountSchema
});
export type DeliveryLineReturnable = z.infer<typeof deliveryLineReturnableSchema>;
