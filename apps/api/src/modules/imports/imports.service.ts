import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  createCustomerSchema,
  createProductSchema,
  createSupplierSchema,
  createCustomerPaymentSchema,
  type CreateCustomerInput,
  type CreateProductInput,
  type CreateSupplierInput
} from '@tadpods/contracts';
import { database, withTransaction, type DatabaseTransaction } from '@tadpods/database';
import { parseCsv, rowToRecord } from './csv-parse.js';
import { ProductsService } from '../products/products.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { SuppliersService } from '../suppliers/suppliers.service.js';
import { CustomerPaymentsService } from '../customer-payments/customer-payments.service.js';
import { StockPostingService, type InventoryRequestContext, type PostingActor } from '../inventory/stock-posting.service.js';

export type RowIssue = { rowNumber: number; errors: string[] };
export type PreviewResult<T> = { totalRows: number; validCount: number; invalidCount: number; validRows: { rowNumber: number; data: T }[]; invalidRows: RowIssue[] };
export type CommitResult = { created: number; skipped: RowIssue[]; idempotent: boolean };

const IMPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * CSV imports (Phase 6). Every import follows the same two-step shape: `preview` parses and
 * validates without writing anything — schema validation, plus duplicate-within-the-file and
 * duplicate-against-the-database checks, so what `commit` will do is fully knowable beforehand
 * — and `commit` re-validates (the database may have changed between preview and commit) before
 * writing. `idempotencyKey` is checked against the generic `IdempotencyKey` table exactly like
 * `PlatformService.nextSequence` does: the same key with the same file content returns the
 * original result rather than importing twice; the same key with different content is rejected.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly products: ProductsService,
    private readonly customers: CustomersService,
    private readonly suppliers: SuppliersService,
    private readonly payments: CustomerPaymentsService,
    private readonly posting: StockPostingService
  ) {}

  // ---------------------------------------------------------------- products

  async previewProducts(csv: string): Promise<PreviewResult<CreateProductInput>> {
    const { headers, rows } = parseCsv(csv);
    const seenSkus = new Set<string>();
    const existingSkus = new Set((await database.product.findMany({ select: { sku: true } })).map((row) => row.sku));

    return this.validateRows(headers, rows, (record) => {
      const parsed = createProductSchema.safeParse({
        sku: record.sku,
        name: record.name,
        unitOfMeasure: record.unitOfMeasure,
        salesPrice: record.salesPrice || '0',
        purchaseCost: record.purchaseCost || '0',
        barcode: record.barcode || undefined,
        description: record.description || undefined,
        reorderLevel: record.reorderLevel || undefined,
        reorderQuantity: record.reorderQuantity || undefined
      });
      if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
      const errors: string[] = [];
      if (seenSkus.has(parsed.data.sku)) errors.push(`Duplicate SKU ${parsed.data.sku} within this file`);
      if (existingSkus.has(parsed.data.sku)) errors.push(`SKU ${parsed.data.sku} already exists`);
      seenSkus.add(parsed.data.sku);
      return errors.length > 0 ? { ok: false, errors } : { ok: true, data: parsed.data };
    });
  }

  async commitProducts(csv: string, idempotencyKey: string): Promise<CommitResult> {
    return this.withIdempotency('import:products', idempotencyKey, csv, async () => {
      const preview = await this.previewProducts(csv);
      if (preview.invalidRows.length > 0) throw new BadRequestException({ message: 'This file has invalid rows; fix them and preview again before committing', invalidRows: preview.invalidRows });

      const skipped: RowIssue[] = [];
      let created = 0;
      for (const row of preview.validRows) {
        try {
          await this.products.create(row.data);
          created += 1;
        } catch (error) {
          skipped.push({ rowNumber: row.rowNumber, errors: [errorMessage(error)] });
        }
      }
      return { created, skipped, idempotent: false };
    });
  }

  // --------------------------------------------------------------- customers

  async previewCustomers(csv: string): Promise<PreviewResult<CreateCustomerInput>> {
    const { headers, rows } = parseCsv(csv);
    const seenCodes = new Set<string>();
    const existingCodes = new Set((await database.customer.findMany({ select: { code: true } })).map((row) => row.code));

    return this.validateRows(headers, rows, (record) => {
      const parsed = createCustomerSchema.safeParse({
        code: record.code,
        name: record.name,
        currency: record.currency || undefined,
        paymentTermsDays: record.paymentTermsDays ? Number(record.paymentTermsDays) : undefined,
        creditLimit: record.creditLimit || undefined,
        contactEmail: record.contactEmail || undefined
      });
      if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
      const errors: string[] = [];
      if (seenCodes.has(parsed.data.code)) errors.push(`Duplicate code ${parsed.data.code} within this file`);
      if (existingCodes.has(parsed.data.code)) errors.push(`Code ${parsed.data.code} already exists`);
      seenCodes.add(parsed.data.code);
      return errors.length > 0 ? { ok: false, errors } : { ok: true, data: parsed.data };
    });
  }

  async commitCustomers(csv: string, idempotencyKey: string): Promise<CommitResult> {
    return this.withIdempotency('import:customers', idempotencyKey, csv, async () => {
      const preview = await this.previewCustomers(csv);
      if (preview.invalidRows.length > 0) throw new BadRequestException({ message: 'This file has invalid rows; fix them and preview again before committing', invalidRows: preview.invalidRows });

      const skipped: RowIssue[] = [];
      let created = 0;
      for (const row of preview.validRows) {
        try {
          await this.customers.create(row.data);
          created += 1;
        } catch (error) {
          skipped.push({ rowNumber: row.rowNumber, errors: [errorMessage(error)] });
        }
      }
      return { created, skipped, idempotent: false };
    });
  }

  // --------------------------------------------------------------- suppliers

  async previewSuppliers(csv: string): Promise<PreviewResult<CreateSupplierInput>> {
    const { headers, rows } = parseCsv(csv);
    const seenCodes = new Set<string>();
    const existingCodes = new Set((await database.supplier.findMany({ select: { code: true } })).map((row) => row.code));

    return this.validateRows(headers, rows, (record) => {
      const parsed = createSupplierSchema.safeParse({
        code: record.code,
        name: record.name,
        currency: record.currency || undefined,
        paymentTermsDays: record.paymentTermsDays ? Number(record.paymentTermsDays) : undefined,
        contactEmail: record.contactEmail || undefined
      });
      if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
      const errors: string[] = [];
      if (seenCodes.has(parsed.data.code)) errors.push(`Duplicate code ${parsed.data.code} within this file`);
      if (existingCodes.has(parsed.data.code)) errors.push(`Code ${parsed.data.code} already exists`);
      seenCodes.add(parsed.data.code);
      return errors.length > 0 ? { ok: false, errors } : { ok: true, data: parsed.data };
    });
  }

  async commitSuppliers(csv: string, idempotencyKey: string): Promise<CommitResult> {
    return this.withIdempotency('import:suppliers', idempotencyKey, csv, async () => {
      const preview = await this.previewSuppliers(csv);
      if (preview.invalidRows.length > 0) throw new BadRequestException({ message: 'This file has invalid rows; fix them and preview again before committing', invalidRows: preview.invalidRows });

      const skipped: RowIssue[] = [];
      let created = 0;
      for (const row of preview.validRows) {
        try {
          await this.suppliers.create(row.data);
          created += 1;
        } catch (error) {
          skipped.push({ rowNumber: row.rowNumber, errors: [errorMessage(error)] });
        }
      }
      return { created, skipped, idempotent: false };
    });
  }

  // --------------------------------------------------------- opening balances

  private openingBalanceRowSchema = z.object({
    productSku: z.string().trim().min(1),
    warehouseCode: z.string().trim().min(1),
    quantity: z.string().trim().refine((value) => Number(value) > 0, 'Quantity must be greater than zero')
  });

  async previewOpeningBalances(csv: string): Promise<PreviewResult<{ productSku: string; warehouseCode: string; quantity: string }>> {
    const { headers, rows } = parseCsv(csv);
    const [products, warehouses] = await Promise.all([
      database.product.findMany({ select: { sku: true } }),
      database.warehouse.findMany({ select: { code: true } })
    ]);
    const productSkus = new Set(products.map((row) => row.sku));
    const warehouseCodes = new Set(warehouses.map((row) => row.code));

    return this.validateRows(headers, rows, (record) => {
      const parsed = this.openingBalanceRowSchema.safeParse({ productSku: record.productSku, warehouseCode: record.warehouseCode, quantity: record.quantity });
      if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
      const errors: string[] = [];
      if (!productSkus.has(parsed.data.productSku)) errors.push(`Unknown product SKU ${parsed.data.productSku}`);
      if (!warehouseCodes.has(parsed.data.warehouseCode)) errors.push(`Unknown warehouse code ${parsed.data.warehouseCode}`);
      return errors.length > 0 ? { ok: false, errors } : { ok: true, data: parsed.data };
    });
  }

  /**
   * Opening-balance import posts through the same `StockPostingService.postMovements` batch
   * primitive every other multi-line stock workflow uses, so it is genuinely all-or-nothing —
   * unlike the master-data imports above, one bad row here cannot leave half the file posted.
   */
  async commitOpeningBalances(csv: string, idempotencyKey: string, actor: PostingActor, context: InventoryRequestContext): Promise<CommitResult> {
    return this.withIdempotency('import:opening-balances', idempotencyKey, csv, async () => {
      const preview = await this.previewOpeningBalances(csv);
      if (preview.invalidRows.length > 0) throw new BadRequestException({ message: 'This file has invalid rows; fix them and preview again before committing', invalidRows: preview.invalidRows });
      if (preview.validRows.length === 0) return { created: 0, skipped: [], idempotent: false };

      const products = await database.product.findMany({ where: { sku: { in: preview.validRows.map((row) => row.data.productSku) } } });
      const warehouses = await database.warehouse.findMany({ where: { code: { in: preview.validRows.map((row) => row.data.warehouseCode) } } });
      const productBySku = new Map(products.map((product) => [product.sku, product.id]));
      const warehouseByCode = new Map(warehouses.map((warehouse) => [warehouse.code, warehouse.id]));

      const movements = preview.validRows.map((row) => ({
        productId: productBySku.get(row.data.productSku)!,
        warehouseId: warehouseByCode.get(row.data.warehouseCode)!,
        movementType: 'OPENING_STOCK' as const,
        signedQuantity: row.data.quantity,
        sourceType: 'opening-balance-import',
        sourceId: idempotencyKey,
        sourceLineId: `row-${row.rowNumber}`,
        idempotencyKey: `${idempotencyKey}:row-${row.rowNumber}`,
        allowNegativeStockOverride: false
      }));

      await this.posting.postMovements(movements, actor, context);
      return { created: movements.length, skipped: [], idempotent: false };
    });
  }

  // ------------------------------------------------------- bank payment import

  async previewPayments(csv: string): Promise<PreviewResult<{ customerCode: string; amount: string; method: string; reference?: string | null; receivedAt?: string }>> {
    const { headers, rows } = parseCsv(csv);
    const customers = await database.customer.findMany({ select: { code: true } });
    const customerCodes = new Set(customers.map((row) => row.code));

    return this.validateRows(headers, rows, (record) => {
      const errors: string[] = [];
      if (!record.customerCode) errors.push('customerCode is required');
      else if (!customerCodes.has(record.customerCode)) errors.push(`Unknown customer code ${record.customerCode}`);
      if (!record.amount || Number(record.amount) <= 0) errors.push('amount must be a positive number');
      if (!record.method) errors.push('method is required');
      if (record.receivedAt && Number.isNaN(Date.parse(record.receivedAt))) errors.push('receivedAt must be a valid date');
      if (errors.length > 0) return { ok: false, errors };
      return {
        ok: true,
        data: {
          customerCode: record.customerCode as string,
          amount: record.amount as string,
          method: record.method as string,
          reference: record.reference || null,
          ...(record.receivedAt ? { receivedAt: record.receivedAt } : {})
        }
      };
    });
  }

  async commitPayments(csv: string, idempotencyKey: string, actor: { id: string; permissions: readonly string[] }, context: { requestId: string; ipAddress?: string }): Promise<CommitResult> {
    return this.withIdempotency('import:payments', idempotencyKey, csv, async () => {
      const preview = await this.previewPayments(csv);
      if (preview.invalidRows.length > 0) throw new BadRequestException({ message: 'This file has invalid rows; fix them and preview again before committing', invalidRows: preview.invalidRows });

      const customers = await database.customer.findMany({ where: { code: { in: preview.validRows.map((row) => row.data.customerCode) } } });
      const customerByCode = new Map(customers.map((customer) => [customer.code, customer.id]));

      const skipped: RowIssue[] = [];
      let created = 0;
      for (const row of preview.validRows) {
        const customerId = customerByCode.get(row.data.customerCode);
        if (!customerId) {
          skipped.push({ rowNumber: row.rowNumber, errors: [`Unknown customer code ${row.data.customerCode}`] });
          continue;
        }
        try {
          const input = createCustomerPaymentSchema.parse({
            customerId,
            amount: row.data.amount,
            method: row.data.method,
            reference: row.data.reference,
            receivedAt: row.data.receivedAt ? new Date(row.data.receivedAt).toISOString() : undefined,
            idempotencyKey: `${idempotencyKey}:row-${row.rowNumber}`
          });
          await this.payments.create(input, actor, context);
          created += 1;
        } catch (error) {
          skipped.push({ rowNumber: row.rowNumber, errors: [errorMessage(error)] });
        }
      }
      return { created, skipped, idempotent: false };
    });
  }

  // ------------------------------------------------------------------ shared

  private async validateRows<T>(
    headers: readonly string[],
    rows: readonly string[][],
    validate: (record: Record<string, string>) => { ok: true; data: T } | { ok: false; errors: string[] }
  ): Promise<PreviewResult<T>> {
    const validRows: { rowNumber: number; data: T }[] = [];
    const invalidRows: RowIssue[] = [];
    rows.forEach((row, index) => {
      const rowNumber = index + 2; // header is row 1
      const record = rowToRecord(headers, row);
      const result = validate(record);
      if (result.ok) validRows.push({ rowNumber, data: result.data });
      else invalidRows.push({ rowNumber, errors: result.errors });
    });
    return { totalRows: rows.length, validCount: validRows.length, invalidCount: invalidRows.length, validRows, invalidRows };
  }

  /**
   * Reuses the generic `IdempotencyKey` table exactly like `PlatformService.nextSequence`: the
   * same `(scope, key)` with a matching content hash returns the stored result instead of
   * re-running `operation`; a matching key with a different hash is rejected outright.
   */
  private async withIdempotency(scope: string, key: string, csv: string, operation: () => Promise<CommitResult>): Promise<CommitResult> {
    const requestHash = createHash('sha256').update(csv).digest('hex');
    return withTransaction(async (transaction: DatabaseTransaction) => {
      const existing = await transaction.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException('This idempotency key has already been used for a different file');
        return { ...(existing.responseBody as unknown as CommitResult), idempotent: true };
      }

      const result = await operation();

      await transaction.idempotencyKey.create({
        data: { scope, key, requestHash, responseStatus: 201, responseBody: result as unknown as object, expiresAt: new Date(Date.now() + IMPORT_TTL_MS) }
      });
      return result;
    });
  }
}

function zodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`);
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Import failed for this row';
}
