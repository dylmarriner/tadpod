import { z } from 'zod';
import { moneyAmountSchema, quantityAmountSchema } from './products.js';

export const customerInvoiceStatusSchema = z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'CREDITED']);
export type CustomerInvoiceStatus = z.infer<typeof customerInvoiceStatusSchema>;

export const customerInvoiceDisplayStatusSchema = z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'CREDITED', 'OVERDUE']);
export type CustomerInvoiceDisplayStatus = z.infer<typeof customerInvoiceDisplayStatusSchema>;

const positiveQuantitySchema = quantityAmountSchema.refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

export const invoiceLineInputSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  quantity: positiveQuantitySchema
});
export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>;

export const createCustomerInvoiceSchema = z.object({
  salesOrderId: z.string().uuid(),
  /** Omit to invoice every line's full uninvoiced quantity. */
  lines: z.array(invoiceLineInputSchema).optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type CreateCustomerInvoiceInput = z.infer<typeof createCustomerInvoiceSchema>;

export const voidCustomerInvoiceSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type VoidCustomerInvoiceInput = z.infer<typeof voidCustomerInvoiceSchema>;

const invoiceProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const invoiceActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const invoiceCustomerRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const invoiceSalesOrderRefSchema = z.object({ id: z.string().uuid(), orderNumber: z.string() });

export const customerInvoiceLineSchema = z.object({
  id: z.string().uuid(),
  salesOrderLineId: z.string().uuid(),
  product: invoiceProductRefSchema,
  unitPrice: moneyAmountSchema,
  discountPercentBasis: z.number().int(),
  quantity: quantityAmountSchema,
  lineTotal: moneyAmountSchema
});
export type CustomerInvoiceLine = z.infer<typeof customerInvoiceLineSchema>;

export const customerInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  customer: invoiceCustomerRefSchema,
  salesOrder: invoiceSalesOrderRefSchema,
  status: customerInvoiceStatusSchema,
  displayStatus: customerInvoiceDisplayStatusSchema,
  currency: z.string(),
  issueDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  notes: z.string().nullable(),
  totalAmount: moneyAmountSchema,
  appliedAmount: moneyAmountSchema,
  outstandingAmount: moneyAmountSchema,
  createdBy: invoiceActorRefSchema,
  voidedBy: invoiceActorRefSchema.nullable(),
  voidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(customerInvoiceLineSchema).readonly()
});
export type CustomerInvoice = z.infer<typeof customerInvoiceSchema>;

export const listCustomerInvoicesQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  salesOrderId: z.string().uuid().optional(),
  status: customerInvoiceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListCustomerInvoicesQuery = z.infer<typeof listCustomerInvoicesQuerySchema>;

/** What order-to-invoice screens show before creating an invoice: every uninvoiced line on the order. */
export const invoiceableLinesQuerySchema = z.object({ salesOrderId: z.string().uuid() });
export type InvoiceableLinesQuery = z.infer<typeof invoiceableLinesQuerySchema>;

export const invoiceableLineSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  product: invoiceProductRefSchema,
  unitPrice: moneyAmountSchema,
  discountPercentBasis: z.number().int(),
  uninvoicedQuantity: quantityAmountSchema
});
export type InvoiceableLine = z.infer<typeof invoiceableLineSchema>;
