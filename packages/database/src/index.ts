import { PrismaClient, Prisma } from '@prisma/client';

const globalDatabase = globalThis as unknown as { tadpodsDatabase?: PrismaClient };

export const database = globalDatabase.tadpodsDatabase ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

if (process.env.NODE_ENV !== 'production') globalDatabase.tadpodsDatabase = database;

export type DatabaseTransaction = Prisma.TransactionClient;

const MAX_SERIALIZATION_RETRIES = 20;

function randomBackoffMs(): number {
  return 5 + Math.floor(Math.random() * 25);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `SERIALIZABLE` transactions can abort with a serialization failure (Postgres error
 * `40001`) any time two concurrent transactions' read/write sets conflict — surfaced by
 * Prisma either as `P2034` (the whole interactive transaction) or as a `P2010` raw-query
 * error whose `meta.code` is `40001` (a `$queryRaw` inside the transaction, e.g. a
 * document-sequence `UPDATE ... RETURNING`). Every write-heavy transaction in this codebase
 * shares this risk, so `withTransaction` retries it here once, rather than each caller
 * (`StockPostingService`, `PurchaseOrdersService`'s document numbering, ...) reimplementing
 * the same retry loop.
 */
function isSerializationFailure(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  return error.code === 'P2010' && (error.meta as { code?: string } | undefined)?.code === '40001';
}

export async function withTransaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await database.$transaction((transaction) => operation(transaction), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000
      });
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
      lastError = error;
      await sleep(randomBackoffMs());
    }
  }
  throw lastError;
}

export function formatDocumentNumber(prefix: string, value: bigint, padding: number): string {
  if (!prefix.trim()) throw new Error('Document prefix cannot be empty');
  if (value < 1n) throw new Error('Document sequence value must be positive');
  if (!Number.isSafeInteger(padding) || padding < 1 || padding > 20) throw new Error('Padding must be between 1 and 20');
  return `${prefix}${value.toString().padStart(padding, '0')}`;
}

export async function nextDocumentNumber(key: string): Promise<string> {
  return withTransaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ prefix: string; value: bigint; padding: number }>>`
      UPDATE "DocumentSequence"
      SET "nextValue" = "nextValue" + 1, "updatedAt" = NOW()
      WHERE "key" = ${key}
      RETURNING "prefix", "nextValue" - 1 AS "value", "padding"
    `;
    const row = rows[0];
    if (!row) throw new Error(`Unknown document sequence: ${key}`);
    return formatDocumentNumber(row.prefix, row.value, row.padding);
  });
}

export { Prisma, PrismaClient } from '@prisma/client';
export * from '@prisma/client';
