import { z } from 'zod';

export const productStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

/** Decimal amount matching the `Money` domain primitive: up to two fractional digits. */
export const moneyAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal amount with up to two decimal places');

/** Decimal quantity matching the `Quantity` domain primitive's default scale: up to four fractional digits. */
export const quantityAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a decimal quantity with up to four decimal places');

const leadTimeDaysSchema = z.number().int().min(0).max(3650);

export const productCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  parentId: z.string().uuid().nullable().optional()
});
export type ProductCategoryInput = z.infer<typeof productCategoryInputSchema>;

export const productCategorySchema = productCategoryInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const productSupplierInputSchema = z.object({
  supplierId: z.string().uuid(),
  supplierProductCode: z.string().trim().min(1).max(80),
  purchaseCost: moneyAmountSchema,
  preferred: z.boolean().default(false),
  leadTimeDays: leadTimeDaysSchema.default(0)
});
export type ProductSupplierInput = z.infer<typeof productSupplierInputSchema>;

export const productSupplierSchema = productSupplierInputSchema.extend({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ProductSupplier = z.infer<typeof productSupplierSchema>;

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().min(1).max(64).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  unitOfMeasure: z.string().trim().min(1).max(20),
  salesPrice: moneyAmountSchema,
  purchaseCost: moneyAmountSchema,
  taxRateId: z.string().uuid().nullable().optional(),
  reorderLevel: quantityAmountSchema.default('0'),
  reorderQuantity: quantityAmountSchema.default('0'),
  leadTimeDays: leadTimeDaysSchema.default(0),
  preferredSupplierId: z.string().uuid().nullable().optional(),
  status: productStatusSchema.default('ACTIVE')
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productSchema = createProductSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  suppliers: z.array(productSupplierSchema).readonly().optional()
});
export type Product = z.infer<typeof productSchema>;
