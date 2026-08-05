import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { database } from '@tadpods/database';
import { processOutboxBatch, type OutboxHandlers } from './outbox-worker.js';

const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
const handlers: OutboxHandlers = {
  'system.noop': async () => undefined
};
let stopping = false;

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

async function run(): Promise<void> {
  console.log(`TADPODS worker started as ${workerId}`);
  while (!stopping) {
    const result = await processOutboxBatch(workerId, handlers);
    if (result.failed) console.error('TADPODS outbox events reached terminal failure', result);
    await new Promise((resolve) => setTimeout(resolve, result.completed + result.retried + result.failed > 0 ? 100 : 1_000));
  }
  await database.$disconnect();
  console.log('TADPODS worker stopped');
}

run().catch(async (error: unknown) => {
  console.error('TADPODS worker failed', error);
  await database.$disconnect();
  process.exitCode = 1;
});
