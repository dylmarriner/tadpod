import { z } from 'zod';

export const warehouseStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type WarehouseStatus = z.infer<typeof warehouseStatusSchema>;

export const createWarehouseSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(160),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  status: warehouseStatusSchema.default('ACTIVE'),
  isDefault: z.boolean().default(false)
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = createWarehouseSchema.partial();
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

export const warehouseSchema = createWarehouseSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Warehouse = z.infer<typeof warehouseSchema>;
