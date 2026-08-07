import { z } from 'zod';
import { moneyAmountSchema, quantityAmountSchema } from './products.js';

export const supplierBillStatusSchema = z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'CREDITED']);
export type SupplierBillStatus = z.infer<typeof supplierBillStatusSchema>;

export const supplierBillDisplayStatusSchema = z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'CREDITED', 'OVERDUE']);
export type SupplierBillDisplayStatus = z.infer<typeof supplierBillDisplayStatusSchema>;

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

export const billLineInputSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  quantity: positiveQuantitySchema
});
export type BillLineInput = z.infer<typeof billLineInputSchema>;

export const createSupplierBillSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  /** Omit to bill every line's full unbilled (received-not-billed) quantity. */
  lines: z.array(billLineInputSchema).optional(),
  supplierReference: z.string().trim().max(120).nullable().optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type CreateSupplierBillInput = z.infer<typeof createSupplierBillSchema>;

export const voidSupplierBillSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type VoidSupplierBillInput = z.infer<typeof voidSupplierBillSchema>;

const billProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const billActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const billSupplierRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const billPurchaseOrderRefSchema = z.object({ id: z.string().uuid(), orderNumber: z.string() });

export const supplierBillLineSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid(),
  product: billProductRefSchema,
  unitCost: moneyAmountSchema,
  quantity: quantityAmountSchema,
  lineTotal: moneyAmountSchema
});
export type SupplierBillLine = z.infer<typeof supplierBillLineSchema>;

export const supplierBillSchema = z.object({
  id: z.string().uuid(),
  billNumber: z.string(),
  supplier: billSupplierRefSchema,
  purchaseOrder: billPurchaseOrderRefSchema,
  status: supplierBillStatusSchema,
  displayStatus: supplierBillDisplayStatusSchema,
  currency: z.string(),
  supplierReference: z.string().nullable(),
  issueDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  notes: z.string().nullable(),
  totalAmount: moneyAmountSchema,
  appliedAmount: moneyAmountSchema,
  outstandingAmount: moneyAmountSchema,
  createdBy: billActorRefSchema,
  voidedBy: billActorRefSchema.nullable(),
  voidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(supplierBillLineSchema).readonly()
});
export type SupplierBill = z.infer<typeof supplierBillSchema>;

export const listSupplierBillsQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  status: supplierBillStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListSupplierBillsQuery = z.infer<typeof listSupplierBillsQuerySchema>;

/** What order-to-bill screens show before creating a bill: every unbilled (received-not-billed) line on the order. */
export const billableLinesQuerySchema = z.object({ purchaseOrderId: z.string().uuid() });
export type BillableLinesQuery = z.infer<typeof billableLinesQuerySchema>;

export const billableLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  product: billProductRefSchema,
  unitCost: moneyAmountSchema,
  unbilledQuantity: quantityAmountSchema
});
export type BillableLine = z.infer<typeof billableLineSchema>;
