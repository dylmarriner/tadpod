import { z } from 'zod';
import { moneyAmountSchema } from './products.js';

const positiveMoneySchema = moneyAmountSchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero');

export const customerCreditSourceTypeSchema = z.enum(['OVERPAYMENT', 'MANUAL', 'RETURN']);
export type CustomerCreditSourceType = z.infer<typeof customerCreditSourceTypeSchema>;

/** A manual (goodwill / return) credit — an overpayment credit is raised automatically by `CustomerPaymentsService`. */
export const createCustomerCreditSchema = z.object({
  customerId: z.string().uuid(),
  amount: positiveMoneySchema,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  sourceType: z.enum(['MANUAL', 'RETURN']).default('MANUAL'),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type CreateCustomerCreditInput = z.infer<typeof createCustomerCreditSchema>;

export const applyCustomerCreditSchema = z.object({
  /** Omit to auto-apply oldest-invoice-first, up to the credit's remaining balance. */
  customerInvoiceId: z.string().uuid().optional(),
  amount: positiveMoneySchema.optional()
});
export type ApplyCustomerCreditInput = z.infer<typeof applyCustomerCreditSchema>;

export const reverseCreditApplicationSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type ReverseCreditApplicationInput = z.infer<typeof reverseCreditApplicationSchema>;

export const createCustomerRefundSchema = z.object({
  customerCreditId: z.string().uuid(),
  amount: positiveMoneySchema,
  method: z.string().trim().min(1).max(60),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type CreateCustomerRefundInput = z.infer<typeof createCustomerRefundSchema>;

const creditActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const creditCustomerRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const creditApplicationSchema = z.object({
  id: z.string().uuid(),
  customerInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  amount: moneyAmountSchema,
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type CreditApplication = z.infer<typeof creditApplicationSchema>;

export const customerCreditSchema = z.object({
  id: z.string().uuid(),
  creditNumber: z.string(),
  customer: creditCustomerRefSchema,
  sourceType: z.string(),
  sourcePaymentId: z.string().uuid().nullable(),
  amount: moneyAmountSchema,
  remaining: moneyAmountSchema,
  currency: z.string(),
  notes: z.string().nullable(),
  createdBy: creditActorRefSchema,
  createdAt: z.string().datetime(),
  applications: z.array(creditApplicationSchema).readonly()
});
export type CustomerCredit = z.infer<typeof customerCreditSchema>;

export const listCustomerCreditsQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListCustomerCreditsQuery = z.infer<typeof listCustomerCreditsQuerySchema>;

export const customerRefundSchema = z.object({
  id: z.string().uuid(),
  refundNumber: z.string(),
  customer: creditCustomerRefSchema,
  customerCreditId: z.string().uuid(),
  amount: moneyAmountSchema,
  currency: z.string(),
  method: z.string(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: creditActorRefSchema,
  createdAt: z.string().datetime()
});
export type CustomerRefund = z.infer<typeof customerRefundSchema>;
