import { database, withTransaction, type OutboxEvent } from '@tadpods/database';

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;
export type OutboxHandlers = Readonly<Record<string, OutboxHandler>>;

export function retryDelayMs(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error('Attempt must be a positive integer');
  return Math.min(1_000 * 2 ** (attempt - 1), 60 * 60 * 1_000);
}

export async function claimOutboxBatch(workerId: string, limit = 20): Promise<OutboxEvent[]> {
  if (!workerId.trim()) throw new Error('Worker ID is required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Batch limit must be between 1 and 100');
  return withTransaction((transaction) => transaction.$queryRaw<OutboxEvent[]>`
    WITH candidates AS (
      SELECT "id" FROM "OutboxEvent"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= NOW()
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "OutboxEvent" AS event
    SET "status" = 'PROCESSING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event.*
  `);
}

export async function processOutboxBatch(workerId: string, handlers: OutboxHandlers): Promise<{ completed: number; retried: number; failed: number }> {
  const events = await claimOutboxBatch(workerId);
  const result = { completed: 0, retried: 0, failed: 0 };
  for (const event of events) {
    try {
      const handler = handlers[event.topic];
      if (!handler) throw new Error(`No outbox handler registered for ${event.topic}`);
      await handler(event);
      await database.outboxEvent.update({ where: { id: event.id }, data: { status: 'COMPLETED', completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
      result.completed += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown worker failure';
      const terminal = event.attempts >= 5;
      await database.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: terminal ? 'FAILED' : 'PENDING',
          nextAttemptAt: new Date(Date.now() + retryDelayMs(event.attempts)),
          lockedAt: null,
          lockedBy: null,
          lastError: message.slice(0, 10_000)
        }
      });
      if (terminal) result.failed += 1; else result.retried += 1;
    }
  }
  return result;
}
