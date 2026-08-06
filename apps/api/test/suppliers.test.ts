import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { createSupplierSchema, supplierAddressInputSchema } from '@tadpods/contracts';
import { PermissionGuard } from '../src/auth.guards.js';
import { SuppliersController } from '../src/modules/suppliers/suppliers.controller.js';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service.js';

const suppliers = new SuppliersService();

function codeFor(label: string): string {
  return `SUP-${label}-${randomUUID().slice(0, 8)}`.slice(0, 40);
}

describe('SuppliersService', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('creates a supplier with default currency and payment terms', async () => {
    const code = codeFor('CREATE');
    const created = await suppliers.create(createSupplierSchema.parse({ code, name: 'Test supplier' }));
    expect(created.code).toBe(code);
    expect(created.currency).toBe('NZD');
    expect(created.paymentTermsDays).toBe(20);
    expect(created.active).toBe(true);
  });

  it('rejects a duplicate account code with a conflict', async () => {
    const code = codeFor('DUP');
    await suppliers.create(createSupplierSchema.parse({ code, name: 'First' }));
    await expect(suppliers.create(createSupplierSchema.parse({ code, name: 'Second' }))).rejects.toMatchObject({ status: 409 });
  });

  it('allows duplicate supplier names but surfaces them as similar-name warnings', async () => {
    const name = `Acme Trading ${randomUUID().slice(0, 6)}`;
    const first = await suppliers.create(createSupplierSchema.parse({ code: codeFor('SIM-1'), name }));
    const second = await suppliers.create(createSupplierSchema.parse({ code: codeFor('SIM-2'), name }));
    expect(second.id).not.toBe(first.id);

    const similar = await suppliers.findSimilarNames(name);
    const ids = similar.map((row) => row.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
  });

  it('updates a supplier', async () => {
    const created = await suppliers.create(createSupplierSchema.parse({ code: codeFor('UPD'), name: 'Before update' }));
    const updated = await suppliers.update(created.id, { name: 'After update', paymentTermsDays: 30, active: false });
    expect(updated.name).toBe('After update');
    expect(updated.paymentTermsDays).toBe(30);
    expect(updated.active).toBe(false);
  });

  it('returns 404 for an unknown supplier', async () => {
    await expect(suppliers.get(randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(suppliers.update(randomUUID(), { name: 'Nope' })).rejects.toMatchObject({ status: 404 });
  });

  it('adds, lists, and removes supplier addresses', async () => {
    const created = await suppliers.create(createSupplierSchema.parse({ code: codeFor('ADDR'), name: 'Address test' }));
    const address = await suppliers.addAddress(created.id, supplierAddressInputSchema.parse({ type: 'BILLING', city: 'Auckland', country: 'New Zealand' }));
    expect(address.supplierId).toBe(created.id);

    const listed = await suppliers.listAddresses(created.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.city).toBe('Auckland');

    await suppliers.removeAddress(created.id, address.id);
    expect(await suppliers.listAddresses(created.id)).toHaveLength(0);
  });

  it('rejects adding an address to an unknown supplier', async () => {
    await expect(
      suppliers.addAddress(randomUUID(), supplierAddressInputSchema.parse({ type: 'GENERAL' }))
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns an all-zero account projection before any bills exist', async () => {
    const created = await suppliers.create(createSupplierSchema.parse({ code: codeFor('ACCT'), name: 'Account test' }));
    const account = await suppliers.account(created.id);
    expect(account.amountOwed).toBe('0.00');
    expect(account.overdue).toBe('0.00');
    expect(account.dueWithin7Days).toBe('0.00');
    expect(account.dueWithin30Days).toBe('0.00');
    expect(account.availableCredit).toBe('0.00');
    expect(account.receivedNotBilled).toBe('0.00');
  });
});

async function buildTestApp(permissions: readonly string[]): Promise<NestFastifyApplication> {
  const testingModule = await Test.createTestingModule({
    controllers: [SuppliersController],
    providers: [SuppliersService]
  }).compile();
  const app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const reflector = new Reflector();
  app.getHttpAdapter().getInstance().addHook('onRequest', (fastifyRequest, _reply, done) => {
    (fastifyRequest as unknown as { user?: unknown }).user = {
      id: randomUUID(),
      sessionId: randomUUID(),
      email: `suppliers-permission-test-${randomUUID()}@tadpods.local`,
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

describe('suppliers permission checks', () => {
  it('rejects creating and reading suppliers without suppliers permissions', async () => {
    const app = await buildTestApp([]);
    try {
      const createResponse = await app.inject({ method: 'POST', url: '/suppliers', payload: { code: codeFor('PERM'), name: 'Denied supplier' } });
      expect(createResponse.statusCode).toBe(403);

      const listResponse = await app.inject({ method: 'GET', url: '/suppliers' });
      expect(listResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }, 30_000);
});
