import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hasPermission } from '@tadpods/auth';
import { buildReversal, Quantity, validateMovementDirection, type StockMovementType } from '@tadpods/domain';
import { Prisma, withTransaction, type DatabaseTransaction, type StockMovement as StockMovementRow } from '@tadpods/database';
import type { PostStockMovementInput, ReverseStockMovementInput } from '@tadpods/contracts';

export type InventoryRequestContext = {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
};

export type PostingActor = {
  id: string;
  permissions: readonly string[];
};

const NEGATIVE_STOCK_OVERRIDE_PERMISSION = 'inventory.override-negative-stock';
const MAX_SERIALIZATION_RETRIES = 20;

function randomBackoffMs(): number {
  return 5 + Math.floor(Math.random() * 25);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `SERIALIZABLE` transactions can still abort with a serialization failure (Postgres error
 * `40001`, surfaced by Prisma as `P2034`) even though the advisory lock already serializes
 * access to a given (product, warehouse) key — Postgres's serializable snapshot isolation
 * watches for anomalies across the whole transaction, not just the locked key (for example,
 * two concurrent transactions both inserting audit-log rows). Retrying a handful of times is
 * the standard, recommended response to `40001`; the advisory lock keeps retries bounded in
 * practice because it already rules out the specific conflict this table cares about.
 */
async function postWithSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
      lastError = error;
      await sleep(randomBackoffMs());
    }
  }
  throw lastError;
}

type InsertMovementInput = {
  productId: string;
  warehouseId: string;
  movementType: StockMovementType;
  signedQuantity: Quantity;
  sourceType: string;
  sourceId: string;
  sourceLineId: string;
  idempotencyKey: string | null;
  reversalOfId: string | null;
  notes: string | null;
  allowNegativeStockOverride: boolean;
};

@Injectable()
export class StockPostingService {
  /**
   * Post a single stock movement. This is the generic posting primitive — opening stock,
   * adjustments, transfers, and stock counts (Phase 2 Tasks 3-5) all post through this same
   * operation with their own `sourceType`; this service has no opinion about what kind of
   * business event produced the movement.
   */
  async postMovement(
    input: PostStockMovementInput,
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<StockMovementRow> {
    const signedQuantity = this.parseQuantity(input.signedQuantity);
    this.validateDirection(input.movementType, signedQuantity);

    return postWithSerializationRetry(() => withTransaction((transaction) =>
      this.insertMovement(
        transaction,
        {
          productId: input.productId,
          warehouseId: input.warehouseId,
          movementType: input.movementType,
          signedQuantity,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceLineId: input.sourceLineId,
          idempotencyKey: input.idempotencyKey,
          reversalOfId: null,
          notes: input.notes ?? null,
          allowNegativeStockOverride: input.allowNegativeStockOverride
        },
        actor,
        'inventory.movement.post',
        context
      )
    ));
  }

  /**
   * Reverse a posted movement with an equal-and-opposite movement, linked via
   * `reversalOfId`. A movement can only be reversed once: the reversal is posted with
   * `sourceType='stock-movement-reversal'` and `sourceId=sourceLineId=<original id>`, so the
   * ledger's own duplicate-source-line unique constraint rejects a second reversal attempt
   * even under concurrent requests — no separate locking is needed for that guarantee.
   */
  async reverseMovement(
    movementId: string,
    input: ReverseStockMovementInput,
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<StockMovementRow> {
    return postWithSerializationRetry(() => withTransaction((transaction) => this.insertReversal(transaction, movementId, input, actor, context)));
  }

  /**
   * Post several movements as one atomic unit — either all of them post, or none do. This is
   * the primitive behind multi-line workflows that must never post only one side of a linked
   * pair (warehouse transfers: Task 4; stock-count corrections: Task 5). Every distinct
   * `(productId, warehouseId)` key touched by the batch is advisory-locked up front, in a
   * fixed sorted order, before any balance check or insert runs — this prevents two
   * concurrent batches from deadlocking each other by locking the same two keys in opposite
   * order (e.g. two transfers between the same pair of warehouses in opposite directions).
   */
  async postMovements(
    inputs: readonly PostStockMovementInput[],
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<StockMovementRow[]> {
    if (inputs.length === 0) throw new BadRequestException('At least one movement is required');

    const parsed = inputs.map((input) => {
      const signedQuantity = this.parseQuantity(input.signedQuantity);
      this.validateDirection(input.movementType, signedQuantity);
      return { input, signedQuantity };
    });

    return postWithSerializationRetry(() => withTransaction(async (transaction) => {
      await this.lockKeysInOrder(transaction, parsed.map(({ input }) => `${input.productId}:${input.warehouseId}`));

      const results: StockMovementRow[] = [];
      for (const { input, signedQuantity } of parsed) {
        results.push(await this.insertMovement(
          transaction,
          {
            productId: input.productId,
            warehouseId: input.warehouseId,
            movementType: input.movementType,
            signedQuantity,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            sourceLineId: input.sourceLineId,
            idempotencyKey: input.idempotencyKey,
            reversalOfId: null,
            notes: input.notes ?? null,
            allowNegativeStockOverride: input.allowNegativeStockOverride
          },
          actor,
          'inventory.movement.post',
          context,
          undefined,
          /* skipLock */ true
        ));
      }
      return results;
    }));
  }

  /**
   * Reverse several posted movements as one atomic unit — the batch counterpart to
   * `reverseMovement`, used to reverse both sides of a linked pair together (a transfer's
   * out/in movements) rather than leaving one side reversed and the other posted.
   */
  async reverseMovements(
    movementIds: readonly string[],
    input: ReverseStockMovementInput,
    actor: PostingActor,
    context: InventoryRequestContext
  ): Promise<StockMovementRow[]> {
    if (movementIds.length === 0) throw new BadRequestException('At least one movement is required');

    return postWithSerializationRetry(() => withTransaction(async (transaction) => {
      const originals = await transaction.stockMovement.findMany({ where: { id: { in: [...movementIds] } } });
      if (originals.length !== movementIds.length) throw new NotFoundException('Stock movement not found');
      await this.lockKeysInOrder(transaction, originals.map((movement) => `${movement.productId}:${movement.warehouseId}`));

      const results: StockMovementRow[] = [];
      for (const movementId of movementIds) {
        results.push(await this.insertReversal(
          transaction,
          movementId,
          { ...input, idempotencyKey: `${input.idempotencyKey}:${movementId}` },
          actor,
          context,
          /* skipLock */ true
        ));
      }
      return results;
    }));
  }

  private async insertReversal(
    transaction: DatabaseTransaction,
    movementId: string,
    input: ReverseStockMovementInput,
    actor: PostingActor,
    context: InventoryRequestContext,
    skipLock = false
  ): Promise<StockMovementRow> {
    const original = await transaction.stockMovement.findUnique({ where: { id: movementId } });
    if (!original) throw new NotFoundException('Stock movement not found');

    const reversal = buildReversal({
      id: original.id,
      productId: original.productId,
      warehouseId: original.warehouseId,
      signedQuantity: this.parseQuantity(original.signedQuantity.toString())
    });

    return this.insertMovement(
      transaction,
      {
        productId: reversal.productId,
        warehouseId: reversal.warehouseId,
        movementType: reversal.movementType,
        signedQuantity: reversal.signedQuantity,
        sourceType: reversal.sourceType,
        sourceId: reversal.sourceId,
        sourceLineId: reversal.sourceLineId,
        idempotencyKey: input.idempotencyKey,
        reversalOfId: reversal.reversalOfId,
        notes: input.notes ?? null,
        // A reversal is not a discretionary posting the caller opts into going negative
        // on — it is the system correcting the ledger. `insertMovement` still requires
        // the actor to hold the override permission and the system setting to be on
        // before it allows the resulting balance to go negative; this flag just means
        // "evaluate that rule" rather than skip the negative-stock check outright.
        allowNegativeStockOverride: true
      },
      actor,
      'inventory.movement.reverse',
      context,
      'This stock movement has already been reversed',
      skipLock
    );
  }

  /** Acquire a transaction-scoped advisory lock per distinct key, in a fixed sorted order. */
  private async lockKeysInOrder(transaction: DatabaseTransaction, keys: readonly string[]): Promise<void> {
    const distinctSortedKeys = [...new Set(keys)].sort();
    for (const key of distinctSortedKeys) {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    }
  }

  private async insertMovement(
    transaction: DatabaseTransaction,
    input: InsertMovementInput,
    actor: PostingActor,
    auditAction: string,
    context: InventoryRequestContext,
    sourceConflictMessage = 'This source line has already posted a stock effect',
    skipLock = false
  ): Promise<StockMovementRow> {
    // Idempotent retry: the same posting request, resent, returns the original result
    // rather than posting (or failing to post) a second time.
    if (input.idempotencyKey) {
      const existing = await transaction.stockMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }

    // Serialize concurrent posts to the same (product, warehouse) stock key. Stock on hand
    // has no dedicated mutable balance row to `SELECT ... FOR UPDATE` — it is always derived
    // by summing posted movements — so a Postgres transaction-scoped advisory lock, keyed by
    // hashing the (product, warehouse) pair, plays that role instead: it blocks a second
    // concurrent poster to the same key until the first commits or rolls back, without
    // requiring a mutable "current balance" row that would itself need to stay in sync.
    // Batch callers (`postMovements`) lock every key up front in a fixed order and pass
    // `skipLock: true` here to avoid re-acquiring locks out of that order.
    if (!skipLock) {
      const lockKey = `${input.productId}:${input.warehouseId}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    }

    const currentBalance = await transaction.stockMovement.aggregate({
      where: { productId: input.productId, warehouseId: input.warehouseId },
      _sum: { signedQuantity: true }
    });
    const current = this.parseQuantity(currentBalance._sum.signedQuantity?.toString() ?? '0');
    const projected = current.add(input.signedQuantity);

    if (projected.isNegative()) {
      const negativeStockAllowed = await this.negativeStockAllowed(transaction, actor, input.allowNegativeStockOverride);
      if (!negativeStockAllowed) {
        throw new BadRequestException(
          'This posting would take stock on hand below zero, and negative stock is not permitted for this actor'
        );
      }
    }

    let movement: StockMovementRow;
    try {
      movement = await transaction.stockMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          movementType: input.movementType,
          signedQuantity: input.signedQuantity.toDecimalString(),
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceLineId: input.sourceLineId,
          idempotencyKey: input.idempotencyKey,
          reversalOfId: input.reversalOfId,
          actorId: actor.id,
          notes: input.notes
        }
      });
    } catch (error) {
      if (this.isSourceUniqueViolation(error)) {
        throw new ConflictException(sourceConflictMessage);
      }
      if (this.isIdempotencyKeyUniqueViolation(error)) {
        throw new ConflictException('This idempotency key has already been used for a different posting');
      }
      throw error;
    }

    await transaction.auditLog.create({
      data: {
        action: auditAction,
        entityType: 'StockMovement',
        entityId: movement.id,
        metadata: {
          productId: movement.productId,
          warehouseId: movement.warehouseId,
          movementType: movement.movementType,
          signedQuantity: movement.signedQuantity.toString(),
          sourceType: movement.sourceType,
          sourceId: movement.sourceId,
          sourceLineId: movement.sourceLineId,
          reversalOfId: movement.reversalOfId
        },
        requestId: context.requestId,
        userId: actor.id,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
      }
    });

    return movement;
  }

  private async negativeStockAllowed(
    transaction: DatabaseTransaction,
    actor: PostingActor,
    requestedOverride: boolean
  ): Promise<boolean> {
    if (!requestedOverride) return false;
    if (!hasPermission(actor.permissions, NEGATIVE_STOCK_OVERRIDE_PERMISSION)) return false;
    const settings = await transaction.systemSettings.findUniqueOrThrow({ where: { singletonKey: 'default' } });
    return settings.negativeStockEnabled;
  }

  private validateDirection(movementType: StockMovementType, signedQuantity: Quantity): void {
    try {
      validateMovementDirection(movementType, signedQuantity);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid stock movement quantity');
    }
  }

  private parseQuantity(value: string): Quantity {
    try {
      return Quantity.from(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid stock movement quantity');
    }
  }

  private isSourceUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('sourceType')
    );
  }

  private isIdempotencyKeyUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('idempotencyKey')
    );
  }
}
