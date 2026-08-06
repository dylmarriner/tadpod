import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { createWarehouseSchema } from '@tadpods/contracts';
import { PermissionGuard } from '../src/auth.guards.js';
import { WarehousesController } from '../src/modules/warehouses/warehouses.controller.js';
import { WarehousesService } from '../src/modules/warehouses/warehouses.service.js';

const warehouses = new WarehousesService();

function codeFor(label: string): string {
  return `WH-${label}-${randomUUID().slice(0, 6)}`.slice(0, 20);
}

describe('WarehousesService', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('creates and reads back a warehouse', async () => {
    const code = codeFor('CREATE');
    const created = await warehouses.create(createWarehouseSchema.parse({ code, name: `Test warehouse ${code}` }));
    expect(created.code).toBe(code);
    expect(created.status).toBe('ACTIVE');
    expect(created.isDefault).toBe(false);

    const fetched = await warehouses.get(created.id);
    expect(fetched.code).toBe(code);
  });

  it('rejects a duplicate warehouse code with a conflict', async () => {
    const code = codeFor('DUP');
    await warehouses.create(createWarehouseSchema.parse({ code, name: `First ${code}` }));

    await expect(warehouses.create(createWarehouseSchema.parse({ code, name: `Second ${code}` }))).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a duplicate warehouse name with a conflict', async () => {
    const name = `Unique name ${randomUUID().slice(0, 8)}`;
    await warehouses.create(createWarehouseSchema.parse({ code: codeFor('NAME-1'), name }));

    await expect(warehouses.create(createWarehouseSchema.parse({ code: codeFor('NAME-2'), name }))).rejects.toMatchObject({ status: 409 });
  });

  it('only ever leaves one warehouse marked as default', async () => {
    const first = await warehouses.create(createWarehouseSchema.parse({ code: codeFor('DEF-1'), name: `Default one ${randomUUID().slice(0, 6)}`, isDefault: true }));
    expect(first.isDefault).toBe(true);

    const second = await warehouses.create(createWarehouseSchema.parse({ code: codeFor('DEF-2'), name: `Default two ${randomUUID().slice(0, 6)}`, isDefault: true }));
    expect(second.isDefault).toBe(true);

    const refetchedFirst = await warehouses.get(first.id);
    expect(refetchedFirst.isDefault).toBe(false);

    const third = await warehouses.update(first.id, { isDefault: true });
    expect(third.isDefault).toBe(true);
    const refetchedSecond = await warehouses.get(second.id);
    expect(refetchedSecond.isDefault).toBe(false);
  });

  it('updates and archives a warehouse', async () => {
    const created = await warehouses.create(createWarehouseSchema.parse({ code: codeFor('UPD'), name: `Before update ${randomUUID().slice(0, 6)}` }));
    const updated = await warehouses.update(created.id, { city: 'Auckland', status: 'ARCHIVED' });
    expect(updated.city).toBe('Auckland');
    expect(updated.status).toBe('ARCHIVED');
  });

  it('returns 404 for an unknown warehouse', async () => {
    await expect(warehouses.get(randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(warehouses.update(randomUUID(), { name: 'Does not exist' })).rejects.toMatchObject({ status: 404 });
  });
});

async function buildTestApp(permissions: readonly string[]): Promise<NestFastifyApplication> {
  const testingModule = await Test.createTestingModule({
    controllers: [WarehousesController],
    providers: [WarehousesService]
  }).compile();
  const app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const reflector = new Reflector();
  app.getHttpAdapter().getInstance().addHook('onRequest', (fastifyRequest, _reply, done) => {
    (fastifyRequest as unknown as { user?: unknown }).user = {
      id: randomUUID(),
      sessionId: randomUUID(),
      email: `warehouses-permission-test-${randomUUID()}@tadpods.local`,
      displayName: 'Permission test actor',
      permissions
    };
    done();
  });
  app.useGlobalGuards(new PermissionGuard(reflector));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('warehouses permission checks', () => {
  it('rejects creating and reading warehouses without inventory permissions', async () => {
    const app = await buildTestApp([]);
    try {
      const createResponse = await app.inject({ method: 'POST', url: '/warehouses', payload: { code: codeFor('PERM'), name: 'Denied warehouse' } });
      expect(createResponse.statusCode).toBe(403);

      const listResponse = await app.inject({ method: 'GET', url: '/warehouses' });
      expect(listResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }, 30_000);
});
