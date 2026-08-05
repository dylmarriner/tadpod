import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthController } from '../src/controllers.js';

async function within<T>(label: string, operation: Promise<T>, timeoutMs = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe('TADPODS API health route', () => {
  let app: NestFastifyApplication | undefined;

  beforeAll(async () => {
    const testingModule = await within(
      'Health testing-module compilation',
      Test.createTestingModule({ controllers: [HealthController] }).compile()
    );
    app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await within('Nest application initialization', app.init());
    await within('Fastify readiness', app.getHttpAdapter().getInstance().ready());
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('reports branded health status through Fastify', async () => {
    if (!app) throw new Error('TADPODS test application was not initialized');
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'TADPODS API'
    });
  });
});
