import { z } from 'zod';
import { moneyAmountSchema, quantityAmountSchema } from './products.js';

export const salesOrderStatusSchema = z.enum([
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_ALLOCATED',
  'ALLOCATED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'BACKORDERED',
  'CANCELLED',
  'CLOSED'
]);
export type SalesOrderStatus = z.infer<typeof salesOrderStatusSchema>;

export const salesOrderInvoicingStatusSchema = z.enum(['NOT_INVOICED', 'PARTIALLY_INVOICED', 'INVOICED']);
export type SalesOrderInvoicingStatus = z.infer<typeof salesOrderInvoicingStatusSchema>;

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');
const discountBasisSchema = z.number().int().min(0).max(1_000_000).default(0);

export const salesOrderLineInputSchema = z.object({
  productId: z.string().uuid(),
  unitPrice: moneyAmountSchema,
  orderedQuantity: positiveQuantitySchema,
  discountPercentBasis: discountBasisSchema
});
export type SalesOrderLineInput = z.infer<typeof salesOrderLineInputSchema>;

export const createSalesOrderSchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  priority: z.number().int().min(1).max(9).default(5),
  promisedDate: z.string().datetime().nullable().optional(),
  customerReference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(salesOrderLineInputSchema).min(1, 'A sales order needs at least one line')
});
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;

export const updateSalesOrderSchema = z.object({
  priority: z.number().int().min(1).max(9).optional(),
  promisedDate: z.string().datetime().nullable().optional(),
  customerReference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(salesOrderLineInputSchema).min(1, 'A sales order needs at least one line').optional()
});
export type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;

export const confirmSalesOrderSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  allowCreditLimitOverride: z.boolean().default(false),
  reservationMethod: z.enum(['IMMEDIATE']).default('IMMEDIATE')
});
export type ConfirmSalesOrderInput = z.infer<typeof confirmSalesOrderSchema>;

export const cancelSalesOrderSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type CancelSalesOrderInput = z.infer<typeof cancelSalesOrderSchema>;

export const cancelSalesOrderLineSchema = z.object({
  quantity: positiveQuantitySchema.optional(),
  reason: z.string().trim().max(500).nullable().optional()
});
export type CancelSalesOrderLineInput = z.infer<typeof cancelSalesOrderLineSchema>;

const salesOrderProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const salesOrderActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const salesOrderCustomerRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const salesOrderWarehouseRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const salesOrderLineSchema = z.object({
  id: z.string().uuid(),
  product: salesOrderProductRefSchema,
  unitPrice: moneyAmountSchema,
  discountPercentBasis: z.number().int(),
  orderedQuantity: quantityAmountSchema,
  reservedQuantity: quantityAmountSchema,
  deliveredQuantity: quantityAmountSchema,
  cancelledQuantity: quantityAmountSchema,
  backorderedQuantity: quantityAmountSchema,
  invoicedQuantity: quantityAmountSchema,
  outstandingQuantity: quantityAmountSchema,
  unreservedQuantity: quantityAmountSchema,
  deliverableQuantity: quantityAmountSchema,
  uninvoicedQuantity: quantityAmountSchema,
  lineTotal: moneyAmountSchema,
  /** Live availability at the line's warehouse, populated on `get`/`create`, omitted on list rows. */
  stockOnHand: quantityAmountSchema.optional(),
  availableStock: quantityAmountSchema.optional()
});
export type SalesOrderLine = z.infer<typeof salesOrderLineSchema>;

export const salesOrderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  customer: salesOrderCustomerRefSchema,
  warehouse: salesOrderWarehouseRefSchema,
  status: salesOrderStatusSchema,
  invoicingStatus: salesOrderInvoicingStatusSchema,
  currency: z.string(),
  priority: z.number().int(),
  promisedDate: z.string().datetime().nullable(),
  customerReference: z.string().nullable(),
  notes: z.string().nullable(),
  totalAmount: moneyAmountSchema,
  createdBy: salesOrderActorRefSchema,
  confirmedBy: salesOrderActorRefSchema.nullable(),
  confirmedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  closedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(salesOrderLineSchema).readonly()
});
export type SalesOrder = z.infer<typeof salesOrderSchema>;

export const listSalesOrdersQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status: salesOrderStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListSalesOrdersQuery = z.infer<typeof listSalesOrdersQuerySchema>;

/** What order entry shows before anything is committed, for one product at one warehouse. */
export const salesOrderAvailabilityQuerySchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid()
});
export type SalesOrderAvailabilityQuery = z.infer<typeof salesOrderAvailabilityQuerySchema>;

export const salesOrderAvailabilitySchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  stockOnHand: quantityAmountSchema,
  activeReserved: quantityAmountSchema,
  availableStock: quantityAmountSchema,
  incoming: quantityAmountSchema,
  openBackordered: quantityAmountSchema,
  availableToPromise: quantityAmountSchema
});
export type SalesOrderAvailability = z.infer<typeof salesOrderAvailabilitySchema>;
