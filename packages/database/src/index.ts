import { PrismaClient, Prisma } from '@prisma/client';

const globalDatabase = globalThis as unknown as { tadpodsDatabase?: PrismaClient };

export const database = globalDatabase.tadpodsDatabase ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

if (process.env.NODE_ENV !== 'production') globalDatabase.tadpodsDatabase = database;

export type DatabaseTransaction = Prisma.TransactionClient;

export function withTransaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
  return database.$transaction((transaction) => operation(transaction), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 15_000
  });
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
