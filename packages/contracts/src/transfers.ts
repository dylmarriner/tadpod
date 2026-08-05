import { z } from 'zod';
import { quantityMagnitudeSchema } from './adjustments.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

/** One product moved between the two warehouses of a transfer. */
export const transferLineInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: quantityMagnitudeSchema
});
export type TransferLineInput = z.infer<typeof transferLineInputSchema>;

/**
 * A completed warehouse transfer: one or more product lines moved from one warehouse to
 * another in a single atomic posting (Phase 2 Task 4). Each line becomes a linked
 * `WAREHOUSE_TRANSFER_OUT`/`WAREHOUSE_TRANSFER_IN` movement pair — either every line's pair
 * posts, or none does. `idempotencyKey` covers the whole transfer, not an individual line.
 */
export const postTransferSchema = z
  .object({
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    lines: z.array(transferLineInputSchema).min(1).max(200),
    notes: z.string().trim().max(2000).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(200)
  })
  .refine((value) => value.fromWarehouseId !== value.toWarehouseId, {
    message: 'Source and destination warehouse must be different',
    path: ['toWarehouseId']
  });
export type PostTransferInput = z.infer<typeof postTransferSchema>;

export const reverseTransferSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional()
});
export type ReverseTransferInput = z.infer<typeof reverseTransferSchema>;

export const listTransfersQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  fromWarehouseId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional()
});
export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;

const transferActorSchema = z.object({ id: z.string().uuid(), displayName: z.string(), email: z.string() });
const transferProductRefSchema = z.object({ id: z.string().uuid(), sku: z.string(), name: z.string() });
const transferWarehouseRefSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

/** One line of a posted transfer: the product, quantity, and both warehouses it moved between. */
export const transferListItemSchema = z.object({
  transferId: z.string(),
  outMovementId: z.string().uuid(),
  inMovementId: z.string().uuid(),
  product: transferProductRefSchema,
  fromWarehouse: transferWarehouseRefSchema,
  toWarehouse: transferWarehouseRefSchema,
  quantity: quantityMagnitudeSchema,
  postedAt: z.string().datetime(),
  notes: z.string().nullable(),
  actor: transferActorSchema.nullable(),
  reversed: z.boolean()
});
export type TransferListItem = z.infer<typeof transferListItemSchema>;
