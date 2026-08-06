import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { createProductSchema, productCategoryInputSchema } from '@tadpods/contracts';
import { PermissionGuard } from '../src/auth.guards.js';
import { ProductsController } from '../src/modules/products/products.controller.js';
import { ProductsService } from '../src/modules/products/products.service.js';

const products = new ProductsService();

function skuFor(label: string): string {
  return `PROD-TEST-${label}-${randomUUID().slice(0, 8)}`;
}

describe('ProductsService', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('creates a product and reads back decimal prices and quantities as strings', async () => {
    const sku = skuFor('CREATE');
    const created = await products.create(
      createProductSchema.parse({ sku, name: 'Test widget', unitOfMeasure: 'EA', salesPrice: '19.99', purchaseCost: '9.50', reorderLevel: '5', reorderQuantity: '20' })
    );
    expect(created.salesPrice).toBe('19.99');
    expect(created.purchaseCost).toBe('9.50');
    expect(created.reorderLevel).toBe('5');
    expect(created.status).toBe('ACTIVE');

    const fetched = await products.get(created.id);
    expect(fetched.sku).toBe(sku);
  });

  it('rejects a duplicate SKU with a conflict, not a raw database error', async () => {
    const sku = skuFor('DUP-SKU');
    await products.create(createProductSchema.parse({ sku, name: 'Original', unitOfMeasure: 'EA', salesPrice: '1.00', purchaseCost: '0.50' }));

    await expect(
      products.create(createProductSchema.parse({ sku, name: 'Duplicate', unitOfMeasure: 'EA', salesPrice: '1.00', purchaseCost: '0.50' }))
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a duplicate barcode with a conflict', async () => {
    const barcode = `BC-${randomUUID().slice(0, 10)}`;
    await products.create(createProductSchema.parse({ sku: skuFor('BC-1'), barcode, name: 'First', unitOfMeasure: 'EA', salesPrice: '1.00', purchaseCost: '0.50' }));

    await expect(
      products.create(createProductSchema.parse({ sku: skuFor('BC-2'), barcode, name: 'Second', unitOfMeasure: 'EA', salesPrice: '1.00', purchaseCost: '0.50' }))
    ).rejects.toMatchObject({ status: 409 });
  });

  it('finds products by SKU, name, and barcode search', async () => {
    const suffix = randomUUID().slice(0, 8);
    const barcode = `SEARCHBC-${suffix}`;
    await products.create(createProductSchema.parse({ sku: `SEARCHSKU-${suffix}`, barcode, name: `Findable widget ${suffix}`, unitOfMeasure: 'EA', salesPrice: '1.00', purchaseCost: '0.50' }));

    const bySku = await products.list({ search: `SEARCHSKU-${suffix}`, page: 1, pageSize: 25 });
    expect(bySku.items).toHaveLength(1);

    const byBarcode = await products.list({ search: barcode, page: 1, pageSize: 25 });
    expect(byBarcode.items).toHaveLength(1);
  });

  it('updates a product and archives it', async () => {
    const created = await products.create(createProductSchema.parse({ sku: skuFor('UPDATE'), name: 'Before update', unitOfMeasure: 'EA', salesPrice: '5.00', purchaseCost: '2.00' }));
    const updated = await products.update(created.id, { name: 'After update', salesPrice: '6.00' });
    expect(updated.name).toBe('After update');
    expect(updated.salesPrice).toBe('6.00');
    expect(updated.purchaseCost).toBe('2.00');

    const archived = await products.archive(created.id);
    expect(archived.status).toBe('ARCHIVED');
  });

  it('creates categories and rejects a duplicate category name', async () => {
    const name = `Category ${randomUUID().slice(0, 8)}`;
    const category = await products.createCategory(productCategoryInputSchema.parse({ name }));
    expect(category.name).toBe(name);

    await expect(products.createCategory(productCategoryInputSchema.parse({ name }))).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a category with a non-existent parent', async () => {
    await expect(
      products.createCategory(productCategoryInputSchema.parse({ name: `Orphan ${randomUUID().slice(0, 8)}`, parentId: randomUUID() }))
    ).rejects.toMatchObject({ status: 404 });
  });
});

async function buildTestApp(permissions: readonly string[]): Promise<NestFastifyApplication> {
  const testingModule = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [ProductsService]
  }).compile();
  const app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const reflector = new Reflector();
  app.getHttpAdapter().getInstance().addHook('onRequest', (fastifyRequest, _reply, done) => {
    (fastifyRequest as unknown as { user?: unknown }).user = {
      id: randomUUID(),
      sessionId: randomUUID(),
      email: `products-permission-test-${randomUUID()}@tadpods.local`,
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

describe('products permission checks', () => {
  it('rejects creating and reading products without inventory permissions', async () => {
    const app = await buildTestApp([]);
    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/products',
        payload: { sku: skuFor('PERM'), name: 'Denied', unitOfMeasure: 'EA', salesPrice: '1.00', purchaseCost: '0.50' }
      });
      expect(createResponse.statusCode).toBe(403);

      const listResponse = await app.inject({ method: 'GET', url: '/products' });
      expect(listResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }, 30_000);
});
