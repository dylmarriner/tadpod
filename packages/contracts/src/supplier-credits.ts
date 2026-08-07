import { z } from 'zod';
import { moneyAmountSchema } from './products.js';

const positiveMoneySchema = moneyAmountSchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero');

export const supplierCreditSourceTypeSchema = z.enum(['OVERPAYMENT', 'MANUAL', 'RETURN']);
export type SupplierCreditSourceType = z.infer<typeof supplierCreditSourceTypeSchema>;

/** A manual (supplier-issued goodwill / return) credit — an overpayment credit is raised automatically by `SupplierPaymentsService`. */
export const createSupplierCreditSchema = z.object({
  supplierId: z.string().uuid(),
  amount: positiveMoneySchema,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  sourceType: z.enum(['MANUAL', 'RETURN']).default('MANUAL'),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type CreateSupplierCreditInput = z.infer<typeof createSupplierCreditSchema>;

export const applySupplierCreditSchema = z.object({
  /** Omit to auto-apply oldest-bill-first, up to the credit's remaining balance. */
  supplierBillId: z.string().uuid().optional(),
  amount: positiveMoneySchema.optional()
});
export type ApplySupplierCreditInput = z.infer<typeof applySupplierCreditSchema>;

export const reverseSupplierCreditApplicationSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type ReverseSupplierCreditApplicationInput = z.infer<typeof reverseSupplierCreditApplicationSchema>;

export const createSupplierRefundSchema = z.object({
  supplierCreditId: z.string().uuid(),
  amount: positiveMoneySchema,
  method: z.string().trim().min(1).max(60),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type CreateSupplierRefundInput = z.infer<typeof createSupplierRefundSchema>;

const supplierCreditActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const supplierCreditSupplierRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const supplierCreditApplicationSchema = z.object({
  id: z.string().uuid(),
  supplierBillId: z.string().uuid(),
  billNumber: z.string(),
  amount: moneyAmountSchema,
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type SupplierCreditApplication = z.infer<typeof supplierCreditApplicationSchema>;

export const supplierCreditSchema = z.object({
  id: z.string().uuid(),
  creditNumber: z.string(),
  supplier: supplierCreditSupplierRefSchema,
  sourceType: z.string(),
  sourcePaymentId: z.string().uuid().nullable(),
  amount: moneyAmountSchema,
  remaining: moneyAmountSchema,
  currency: z.string(),
  notes: z.string().nullable(),
  createdBy: supplierCreditActorRefSchema,
  createdAt: z.string().datetime(),
  applications: z.array(supplierCreditApplicationSchema).readonly()
});
export type SupplierCredit = z.infer<typeof supplierCreditSchema>;

export const listSupplierCreditsQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListSupplierCreditsQuery = z.infer<typeof listSupplierCreditsQuerySchema>;

export const supplierRefundSchema = z.object({
  id: z.string().uuid(),
  refundNumber: z.string(),
  supplier: supplierCreditSupplierRefSchema,
  supplierCreditId: z.string().uuid(),
  amount: moneyAmountSchema,
  currency: z.string(),
  method: z.string(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: supplierCreditActorRefSchema,
  createdAt: z.string().datetime()
});
export type SupplierRefund = z.infer<typeof supplierRefundSchema>;
