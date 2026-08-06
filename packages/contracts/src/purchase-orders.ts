import { z } from 'zod';
import { moneyAmountSchema, quantityAmountSchema } from './products.js';

export const purchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'AWAITING_APPROVAL',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'PARTIALLY_BILLED',
  'BILLED',
  'CANCELLED',
  'CLOSED'
]);
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

export const purchaseOrderLineInputSchema = z.object({
  productId: z.string().uuid(),
  unitCost: moneyAmountSchema,
  orderedQuantity: positiveQuantitySchema
});
export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineInputSchema>;

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1, 'A purchase order needs at least one line')
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const updatePurchaseOrderSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1, 'A purchase order needs at least one line').optional()
});
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type CancelPurchaseOrderInput = z.infer<typeof cancelPurchaseOrderSchema>;

const purchaseOrderProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });

export const purchaseOrderLineSchema = z.object({
  id: z.string().uuid(),
  product: purchaseOrderProductRefSchema,
  unitCost: moneyAmountSchema,
  orderedQuantity: quantityAmountSchema,
  receivedQuantity: quantityAmountSchema,
  returnedQuantity: quantityAmountSchema,
  billedQuantity: quantityAmountSchema,
  outstandingQuantity: quantityAmountSchema,
  unbilledQuantity: quantityAmountSchema,
  lineTotal: moneyAmountSchema
});
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;

const purchaseOrderActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const purchaseOrderSupplierRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const purchaseOrderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  supplier: purchaseOrderSupplierRefSchema,
  status: purchaseOrderStatusSchema,
  currency: z.string(),
  notes: z.string().nullable(),
  totalAmount: moneyAmountSchema,
  createdBy: purchaseOrderActorRefSchema,
  submittedAt: z.string().datetime().nullable(),
  approvedBy: purchaseOrderActorRefSchema.nullable(),
  approvedAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  closedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(purchaseOrderLineSchema).readonly()
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export const listPurchaseOrdersQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  status: purchaseOrderStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;
