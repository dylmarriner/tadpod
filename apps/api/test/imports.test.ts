import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { database } from '@tadpods/database';
import { ProductsService } from '../src/modules/products/products.service.js';
import { CustomersService } from '../src/modules/customers/customers.service.js';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service.js';
import { CustomerPaymentsService } from '../src/modules/customer-payments/customer-payments.service.js';
import { StockPostingService } from '../src/modules/inventory/stock-posting.service.js';
import { ImportsService } from '../src/modules/imports/imports.service.js';
import { parseCsv } from '../src/modules/imports/csv-parse.js';

const posting = new StockPostingService();
const imports = new ImportsService(new ProductsService(), new CustomersService(), new SuppliersService(), new CustomerPaymentsService(), posting);

function ctx() {
  return { requestId: randomUUID() };
}

async function makeUser(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({ data: { email: `imp-test-${suffix}@tadpods.local`, displayName: `Imports test actor ${suffix}`, passwordHash: 'not-a-real-hash' } });
  return user.id;
}

async function makeWarehouse(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await database.warehouse.create({ data: { code: `IMPWH-${suffix}`.slice(0, 20), name: `Import test warehouse ${suffix}`, status: 'ACTIVE' } });
  return warehouse.code;
}

describe('CSV parsing', () => {
  it('parses quoted fields with embedded commas and escaped quotes', () => {
    const { headers, rows } = parseCsv('name,note\r\n"Acme, Inc.","Has a ""quote"""\r\nPlain,simple\r\n');
    expect(headers).toEqual(['name', 'note']);
    expect(rows).toEqual([
      ['Acme, Inc.', 'Has a "quote"'],
      ['Plain', 'simple']
    ]);
  });

  it('ignores trailing blank lines', () => {
    const { rows } = parseCsv('a,b\r\n1,2\r\n\r\n');
    expect(rows).toEqual([['1', '2']]);
  });
});

describe('product import', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('previews with per-row validation errors and flags in-file duplicates', async () => {
    const suffix = randomUUID().slice(0, 8);
    const csv = [
      'sku,name,unitOfMeasure,salesPrice,purchaseCost',
      `IMP-A-${suffix},Widget A,EA,10.00,5.00`,
      `IMP-A-${suffix},Widget A dup,EA,10.00,5.00`,
      `,Missing SKU,EA,10.00,5.00`
    ].join('\n');

    const preview = await imports.previewProducts(csv);
    expect(preview.totalRows).toBe(3);
    expect(preview.validCount).toBe(1);
    expect(preview.invalidCount).toBe(2);
    expect(preview.invalidRows.find((row) => row.rowNumber === 3)?.errors.join(' ')).toContain('Duplicate SKU');
  });

  it('commits valid rows and is idempotent for a retried request with the same file', async () => {
    const suffix = randomUUID().slice(0, 8);
    const csv = ['sku,name,unitOfMeasure,salesPrice,purchaseCost', `IMP-B-${suffix},Widget B,EA,10.00,5.00`].join('\n');
    const idempotencyKey = randomUUID();

    const first = await imports.commitProducts(csv, idempotencyKey);
    expect(first.created).toBe(1);
    expect(first.idempotent).toBe(false);

    const second = await imports.commitProducts(csv, idempotencyKey);
    expect(second.created).toBe(1);
    expect(second.idempotent).toBe(true);

    const count = await database.product.count({ where: { sku: `IMP-B-${suffix}` } });
    expect(count).toBe(1);
  });

  it('rejects reusing an idempotency key with different file content', async () => {
    const suffix = randomUUID().slice(0, 8);
    const idempotencyKey = randomUUID();
    await imports.commitProducts(['sku,name,unitOfMeasure,salesPrice,purchaseCost', `IMP-C1-${suffix},A,EA,1.00,1.00`].join('\n'), idempotencyKey);

    await expect(imports.commitProducts(['sku,name,unitOfMeasure,salesPrice,purchaseCost', `IMP-C2-${suffix},B,EA,1.00,1.00`].join('\n'), idempotencyKey)).rejects.toMatchObject({
      status: 409
    });
  });

  it('refuses to commit a file with invalid rows', async () => {
    const suffix = randomUUID().slice(0, 8);
    const csv = ['sku,name,unitOfMeasure,salesPrice,purchaseCost', `,Missing SKU ${suffix},EA,10.00,5.00`].join('\n');
    await expect(imports.commitProducts(csv, randomUUID())).rejects.toMatchObject({ status: 400 });
  });
});

describe('opening balance import', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('posts an atomic batch of opening stock movements', async () => {
    const userId = await makeUser();
    const warehouseCode = await makeWarehouse();
    const suffix = randomUUID().slice(0, 8);
    const product = await database.product.create({ data: { sku: `IMP-OB-${suffix}`, name: `Opening balance product ${suffix}`, unitOfMeasure: 'EA' } });

    const csv = ['productSku,warehouseCode,quantity', `${product.sku},${warehouseCode},15`].join('\n');
    const result = await imports.commitOpeningBalances(csv, randomUUID(), { id: userId, permissions: [] }, ctx());
    expect(result.created).toBe(1);

    const balance = await database.stockMovement.aggregate({ where: { productId: product.id }, _sum: { signedQuantity: true } });
    expect(balance._sum.signedQuantity?.toString()).toBe('15');
  });

  it('rejects a row referencing an unknown product or warehouse', async () => {
    const warehouseCode = await makeWarehouse();
    const csv = ['productSku,warehouseCode,quantity', `NONEXISTENT-SKU,${warehouseCode},10`].join('\n');
    const preview = await imports.previewOpeningBalances(csv);
    expect(preview.invalidCount).toBe(1);
    expect(preview.invalidRows[0]?.errors.join(' ')).toContain('Unknown product SKU');
  });
});

describe('customer and supplier import', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('imports customers', async () => {
    const suffix = randomUUID().slice(0, 8);
    const csv = ['code,name,currency', `IMP-CUS-${suffix},Import Test Customer,NZD`].join('\n');
    const result = await imports.commitCustomers(csv, randomUUID());
    expect(result.created).toBe(1);
    const customer = await database.customer.findUnique({ where: { code: `IMP-CUS-${suffix}` } });
    expect(customer).not.toBeNull();
  });

  it('imports suppliers', async () => {
    const suffix = randomUUID().slice(0, 8);
    const csv = ['code,name,currency', `IMP-SUP-${suffix},Import Test Supplier,NZD`].join('\n');
    const result = await imports.commitSuppliers(csv, randomUUID());
    expect(result.created).toBe(1);
    const supplier = await database.supplier.findUnique({ where: { code: `IMP-SUP-${suffix}` } });
    expect(supplier).not.toBeNull();
  });
});

describe('bank payment import', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('imports a payment against an existing customer by code', async () => {
    const userId = await makeUser();
    const suffix = randomUUID().slice(0, 8);
    const customer = await database.customer.create({ data: { code: `IMP-PAY-${suffix}`, name: `Payment import customer ${suffix}` } });

    const csv = ['customerCode,amount,method,reference', `${customer.code},75.00,bank-transfer,STMT-001`].join('\n');
    const result = await imports.commitPayments(csv, randomUUID(), { id: userId, permissions: [] }, ctx());
    expect(result.created).toBe(1);

    const payment = await database.customerPayment.findFirst({ where: { customerId: customer.id } });
    expect(payment?.amountMinorUnits.toString()).toBe('7500');
    expect(payment?.reference).toBe('STMT-001');
  });

  it('rejects a row with an unknown customer code at preview time', async () => {
    const csv = ['customerCode,amount,method', 'DOES-NOT-EXIST,50.00,cash'].join('\n');
    const preview = await imports.previewPayments(csv);
    expect(preview.invalidCount).toBe(1);
    expect(preview.invalidRows[0]?.errors.join(' ')).toContain('Unknown customer code');
  });
});
