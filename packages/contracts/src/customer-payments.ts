import { z } from 'zod';
import { moneyAmountSchema } from './products.js';

const positiveMoneySchema = moneyAmountSchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero');

export const manualAllocationLineInputSchema = z.object({
  customerInvoiceId: z.string().uuid(),
  amount: positiveMoneySchema
});
export type ManualAllocationLineInput = z.infer<typeof manualAllocationLineInputSchema>;

/**
 * Record a full payment against the customer account. Omit `allocations` to auto-allocate
 * oldest-invoice-first (the default "Customer Payment Posting" workflow); pass `allocations`
 * for a manual allocation instead — the two are mutually exclusive per payment.
 */
export const createCustomerPaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: positiveMoneySchema,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  method: z.string().trim().min(1).max(60),
  reference: z.string().trim().max(120).nullable().optional(),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
  allocations: z.array(manualAllocationLineInputSchema).optional()
});
export type CreateCustomerPaymentInput = z.infer<typeof createCustomerPaymentSchema>;

/** Preview how a payment amount would allocate oldest-first, without posting anything. */
export const previewPaymentAllocationQuerySchema = z.object({
  customerId: z.string().uuid(),
  amount: positiveMoneySchema
});
export type PreviewPaymentAllocationQuery = z.infer<typeof previewPaymentAllocationQuerySchema>;

export const paymentAllocationPreviewLineSchema = z.object({ customerInvoiceId: z.string().uuid(), invoiceNumber: z.string(), amount: moneyAmountSchema });
export const paymentAllocationPreviewSchema = z.object({
  allocations: z.array(paymentAllocationPreviewLineSchema).readonly(),
  unappliedAmount: moneyAmountSchema
});
export type PaymentAllocationPreview = z.infer<typeof paymentAllocationPreviewSchema>;

/** Reassign a payment's un-reversed allocations to a different set of invoices in one step. */
export const reallocateCustomerPaymentSchema = z.object({
  allocations: z.array(manualAllocationLineInputSchema).min(1)
});
export type ReallocateCustomerPaymentInput = z.infer<typeof reallocateCustomerPaymentSchema>;

export const reverseCustomerPaymentSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional()
});
export type ReverseCustomerPaymentInput = z.infer<typeof reverseCustomerPaymentSchema>;

const paymentActorRefSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const paymentCustomerRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const paymentAllocationSchema = z.object({
  id: z.string().uuid(),
  customerInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  amount: moneyAmountSchema,
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

export const customerPaymentSchema = z.object({
  id: z.string().uuid(),
  paymentNumber: z.string(),
  customer: paymentCustomerRefSchema,
  amount: moneyAmountSchema,
  currency: z.string(),
  method: z.string(),
  reference: z.string().nullable(),
  receivedAt: z.string().datetime(),
  notes: z.string().nullable(),
  createdBy: paymentActorRefSchema,
  reversedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  allocations: z.array(paymentAllocationSchema).readonly(),
  unappliedAmount: moneyAmountSchema
});
export type CustomerPayment = z.infer<typeof customerPaymentSchema>;

export const listCustomerPaymentsQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListCustomerPaymentsQuery = z.infer<typeof listCustomerPaymentsQuerySchema>;
