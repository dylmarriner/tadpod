import { z } from 'zod';
import { moneyAmountSchema } from './products.js';

export const supplierAddressTypeSchema = z.enum(['BILLING', 'DELIVERY', 'GENERAL']);
export type SupplierAddressType = z.infer<typeof supplierAddressTypeSchema>;

export const supplierAddressInputSchema = z.object({
  type: supplierAddressTypeSchema,
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional()
});
export type SupplierAddressInput = z.infer<typeof supplierAddressInputSchema>;

export const supplierAddressSchema = supplierAddressInputSchema.extend({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type SupplierAddress = z.infer<typeof supplierAddressSchema>;

export const createSupplierSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  legalName: z.string().trim().max(200).nullable().optional(),
  taxNumber: z.string().trim().max(40).nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('NZD'),
  paymentTermsDays: z.number().int().min(0).max(365).default(20),
  contactName: z.string().trim().max(160).nullable().optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().default(true)
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const supplierSchema = createSupplierSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  addresses: z.array(supplierAddressSchema).readonly().optional()
});
export type Supplier = z.infer<typeof supplierSchema>;

export const listSuppliersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

export const similarSupplierNamesQuerySchema = z.object({
  name: z.string().trim().min(1).max(160)
});
export type SimilarSupplierNamesQuery = z.infer<typeof similarSupplierNamesQuerySchema>;

export const similarSupplierSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
export type SimilarSupplier = z.infer<typeof similarSupplierSchema>;

/**
 * The accounts-payable account projection: `amountOwed`/`overdue`/`dueWithin7Days`/
 * `dueWithin30Days` are computed from posted supplier bills, `unappliedCredit` from posted
 * supplier credits, and `receivedNotBilled` from `PurchaseOrderLine.receivedQuantity -
 * billedQuantity` across open orders — commitments and received-not-billed stay visibly
 * separate from `amountOwed`, which only ever reflects posted bills.
 */
export const supplierAccountSchema = z.object({
  supplierId: z.string().uuid(),
  asOf: z.string().datetime(),
  amountOwed: moneyAmountSchema,
  overdue: moneyAmountSchema,
  dueWithin7Days: moneyAmountSchema,
  dueWithin30Days: moneyAmountSchema,
  unappliedCredit: moneyAmountSchema,
  availableCredit: moneyAmountSchema,
  receivedNotBilled: moneyAmountSchema
});
export type SupplierAccount = z.infer<typeof supplierAccountSchema>;

export const supplierStatementQuerySchema = z.object({
  asOf: z.string().datetime().optional()
});
export type SupplierStatementQuery = z.infer<typeof supplierStatementQuerySchema>;

const supplierStatementLineRefSchema = z.object({ id: z.string().uuid(), number: z.string() });

export const supplierStatementLineSchema = z.object({
  type: z.enum(['BILL', 'PAYMENT', 'CREDIT_APPLICATION', 'REFUND']),
  ref: supplierStatementLineRefSchema,
  date: z.string().datetime(),
  description: z.string(),
  debit: moneyAmountSchema,
  credit: moneyAmountSchema,
  runningBalance: moneyAmountSchema
});
export type SupplierStatementLine = z.infer<typeof supplierStatementLineSchema>;

export const supplierStatementSchema = z.object({
  supplierId: z.string().uuid(),
  asOf: z.string().datetime(),
  openingBalance: moneyAmountSchema,
  closingBalance: moneyAmountSchema,
  lines: z.array(supplierStatementLineSchema).readonly()
});
export type SupplierStatement = z.infer<typeof supplierStatementSchema>;
