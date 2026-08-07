import { z } from 'zod';
import { moneyAmountSchema } from './products.js';

const positiveMoneySchema = moneyAmountSchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero');

export const supplierManualAllocationLineInputSchema = z.object({
  supplierBillId: z.string().uuid(),
  amount: positiveMoneySchema
});
export type SupplierManualAllocationLineInput = z.infer<typeof supplierManualAllocationLineInputSchema>;

/**
 * Record a full payment against the supplier account. Omit `allocations` to auto-allocate
 * oldest-bill-first; pass `allocations` for a manual allocation instead — the two are mutually
 * exclusive per payment, mirroring `createCustomerPaymentSchema`.
 */
export const createSupplierPaymentSchema = z.object({
  supplierId: z.string().uuid(),
  amount: positiveMoneySchema,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  method: z.string().trim().min(1).max(60),
  reference: z.string().trim().max(120).nullable().optional(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
  allocations: z.array(supplierManualAllocationLineInputSchema).optional()
});
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;

export const previewSupplierPaymentAllocationQuerySchema = z.object({
  supplierId: z.string().uuid(),
  amount: positiveMoneySchema
});
export type PreviewSupplierPaymentAllocationQuery = z.infer<typeof previewSupplierPaymentAllocationQuerySchema>;

export const supplierPaymentAllocationPreviewLineSchema = z.object({ supplierBillId: z.string().uuid(), billNumber: z.string(), amount: moneyAmountSchema });
export const supplierPaymentAllocationPreviewSchema = z.object({
  allocations: z.array(supplierPaymentAllocationPreviewLineSchema).readonly(),
  unappliedAmount: moneyAmountSchema
});
export type SupplierPaymentAllocationPreview = z.infer<typeof supplierPaymentAllocationPreviewSchema>;

export const reallocateSupplierPaymentSchema = z.object({
  allocations: z.array(supplierManualAllocationLineInputSchema).min(1)
});
export type ReallocateSupplierPaymentInput = z.infer<typeof reallocateSupplierPaymentSchema>;

export const reverseSupplierPaymentSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type ReverseSupplierPaymentInput = z.infer<typeof reverseSupplierPaymentSchema>;

const supplierPaymentActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const supplierPaymentSupplierRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const supplierPaymentAllocationSchema = z.object({
  id: z.string().uuid(),
  supplierBillId: z.string().uuid(),
  billNumber: z.string(),
  amount: moneyAmountSchema,
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type SupplierPaymentAllocation = z.infer<typeof supplierPaymentAllocationSchema>;

export const supplierPaymentSchema = z.object({
  id: z.string().uuid(),
  paymentNumber: z.string(),
  supplier: supplierPaymentSupplierRefSchema,
  amount: moneyAmountSchema,
  currency: z.string(),
  method: z.string(),
  reference: z.string().nullable(),
  paidAt: z.string().datetime(),
  notes: z.string().nullable(),
  createdBy: supplierPaymentActorRefSchema,
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  allocations: z.array(supplierPaymentAllocationSchema).readonly(),
  unappliedAmount: moneyAmountSchema
});
export type SupplierPayment = z.infer<typeof supplierPaymentSchema>;

export const listSupplierPaymentsQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListSupplierPaymentsQuery = z.infer<typeof listSupplierPaymentsQuerySchema>;
