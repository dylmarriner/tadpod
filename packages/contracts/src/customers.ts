import { z } from 'zod';
import { moneyAmountSchema } from './products.js';

export const customerAddressTypeSchema = z.enum(['BILLING', 'DELIVERY', 'GENERAL']);
export type CustomerAddressType = z.infer<typeof customerAddressTypeSchema>;

export const customerAddressInputSchema = z.object({
  type: customerAddressTypeSchema,
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional()
});
export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;

export const customerAddressSchema = customerAddressInputSchema.extend({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type CustomerAddress = z.infer<typeof customerAddressSchema>;

export const createCustomerSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  legalName: z.string().trim().max(200).nullable().optional(),
  taxNumber: z.string().trim().max(40).nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('NZD'),
  paymentTermsDays: z.number().int().min(0).max(365).default(20),
  creditLimit: moneyAmountSchema.default('0'),
  contactName: z.string().trim().max(160).nullable().optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().default(true)
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerSchema = createCustomerSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  addresses: z.array(customerAddressSchema).readonly().optional()
});
export type Customer = z.infer<typeof customerSchema>;

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const similarCustomerNamesQuerySchema = z.object({
  name: z.string().trim().min(1).max(160)
});
export type SimilarCustomerNamesQuery = z.infer<typeof similarCustomerNamesQuerySchema>;

export const similarCustomerSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
export type SimilarCustomer = z.infer<typeof similarCustomerSchema>;

/**
 * The customer account projection. Phase 4 has no invoices yet (Phase 5 owns
 * `customer_invoices`/`customer_payments`), so `amountOwed`/`overdue`/`availableCredit` all
 * read zero until then — mirroring how `SuppliersService.account` reported zero before Phase 3
 * Task 4 introduced supplier bills.
 */
export const customerAccountSchema = z.object({
  customerId: z.string().uuid(),
  asOf: z.string().datetime(),
  amountOwed: moneyAmountSchema,
  overdue: moneyAmountSchema,
  dueWithin7Days: moneyAmountSchema,
  dueWithin30Days: moneyAmountSchema,
  creditLimit: moneyAmountSchema,
  unappliedCredit: moneyAmountSchema,
  availableCredit: moneyAmountSchema
});
export type CustomerAccount = z.infer<typeof customerAccountSchema>;

/** A statement's closing balance must reproduce exactly: owed minus unapplied credit. */
export const customerStatementQuerySchema = z.object({
  asOf: z.string().datetime().optional()
});
export type CustomerStatementQuery = z.infer<typeof customerStatementQuerySchema>;

const statementLineRefSchema = z.object({ id: z.string().uuid(), number: z.string() });

export const customerStatementLineSchema = z.object({
  type: z.enum(['INVOICE', 'PAYMENT', 'CREDIT_APPLICATION', 'REFUND']),
  ref: statementLineRefSchema,
  date: z.string().datetime(),
  description: z.string(),
  debit: moneyAmountSchema,
  credit: moneyAmountSchema,
  runningBalance: moneyAmountSchema
});
export type CustomerStatementLine = z.infer<typeof customerStatementLineSchema>;

export const customerStatementSchema = z.object({
  customerId: z.string().uuid(),
  asOf: z.string().datetime(),
  openingBalance: moneyAmountSchema,
  closingBalance: moneyAmountSchema,
  lines: z.array(customerStatementLineSchema).readonly()
});
export type CustomerStatement = z.infer<typeof customerStatementSchema>;
