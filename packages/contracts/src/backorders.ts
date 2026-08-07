import { z } from 'zod';
import { quantityAmountSchema } from './products.js';

export const backorderStatusSchema = z.enum(['PENDING_STOCK', 'PARTIALLY_AVAILABLE', 'READY_TO_FULFIL', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED']);
export type BackorderStatus = z.infer<typeof backorderStatusSchema>;

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

export const adjustBackorderLineQuantitySchema = z.object({
  quantity: positiveQuantitySchema
});
export type AdjustBackorderLineQuantityInput = z.infer<typeof adjustBackorderLineQuantitySchema>;

export const cancelBackorderLineSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type CancelBackorderLineInput = z.infer<typeof cancelBackorderLineSchema>;

export const cancelBackorderSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type CancelBackorderInput = z.infer<typeof cancelBackorderSchema>;

/** Suggest how newly received stock should be spread across open backorders for one product/warehouse. */
export const planBackorderAllocationQuerySchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  incomingQuantity: positiveQuantitySchema,
  method: z.enum(['OLDEST_FIRST', 'PRIORITY']).default('OLDEST_FIRST')
});
export type PlanBackorderAllocationQuery = z.infer<typeof planBackorderAllocationQuerySchema>;

export const plannedBackorderAllocationSchema = z.object({ backorderLineId: z.string().uuid(), quantity: quantityAmountSchema });
export type PlannedBackorderAllocation = z.infer<typeof plannedBackorderAllocationSchema>;

/**
 * Allocate a specific goods receipt line's incoming stock to open backorder lines. This is the
 * "automatic readiness update after goods receipt" hook `GoodsReceiptsService` calls; it
 * reserves the allocated quantity against each backorder line so it counts in `allocatedQuantity`
 * and available-to-promise without physically moving stock (fulfilment is a later delivery).
 */
export const allocateIncomingStockSchema = z.object({
  sourceType: z.string().trim().min(1).max(60),
  sourceId: z.string().trim().min(1).max(120),
  allocations: z.array(z.object({ backorderLineId: z.string().uuid(), sourceLineId: z.string().trim().min(1).max(120), quantity: positiveQuantitySchema })).min(1)
});
export type AllocateIncomingStockInput = z.infer<typeof allocateIncomingStockSchema>;

/** Generate (or attach to) a purchase order draft covering one or more backorder lines. */
export const generatePurchaseOrderFromBackordersSchema = z.object({
  supplierId: z.string().uuid(),
  backorderLineIds: z.array(z.string().uuid()).min(1)
});
export type GeneratePurchaseOrderFromBackordersInput = z.infer<typeof generatePurchaseOrderFromBackordersSchema>;

const backorderProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const backorderActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const backorderCustomerRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const backorderWarehouseRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const backorderSalesOrderRefSchema = z.object({ id: z.string().uuid(), orderNumber: z.string() });
const backorderPurchaseOrderRefSchema = z.object({ id: z.string().uuid(), orderNumber: z.string() });
const backorderSupplierRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const backorderLineSchema = z.object({
  id: z.string().uuid(),
  salesOrderLineId: z.string().uuid(),
  product: backorderProductRefSchema,
  quantity: quantityAmountSchema,
  allocatedQuantity: quantityAmountSchema,
  fulfilledQuantity: quantityAmountSchema,
  cancelledQuantity: quantityAmountSchema,
  openQuantity: quantityAmountSchema,
  purchaseOrderLineId: z.string().uuid().nullable()
});
export type BackorderLine = z.infer<typeof backorderLineSchema>;

export const backorderSchema = z.object({
  id: z.string().uuid(),
  backorderNumber: z.string(),
  salesOrder: backorderSalesOrderRefSchema,
  customer: backorderCustomerRefSchema,
  warehouse: backorderWarehouseRefSchema,
  status: backorderStatusSchema,
  priority: z.number().int(),
  expectedDate: z.string().datetime().nullable(),
  promisedDate: z.string().datetime().nullable(),
  supplier: backorderSupplierRefSchema.nullable(),
  purchaseOrder: backorderPurchaseOrderRefSchema.nullable(),
  notes: z.string().nullable(),
  createdBy: backorderActorRefSchema,
  cancelledAt: z.string().datetime().nullable(),
  fulfilledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(backorderLineSchema).readonly()
});
export type Backorder = z.infer<typeof backorderSchema>;

export const listBackordersQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status: backorderStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListBackordersQuery = z.infer<typeof listBackordersQuerySchema>;
