import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Money, Quantity } from '@tadpods/domain';
import { database, Prisma, withTransaction, type Product as ProductRow } from '@tadpods/database';
import type {
  CreateProductInput,
  ListProductsQuery,
  Product,
  ProductCategory,
  ProductCategoryInput,
  UpdateProductInput
} from '@tadpods/contracts';

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    unitOfMeasure: row.unitOfMeasure,
    salesPrice: Money.from(row.salesPriceMinorUnits).toDecimalString(),
    purchaseCost: Money.from(row.purchaseCostMinorUnits).toDecimalString(),
    taxRateId: row.taxRateId,
    reorderLevel: row.reorderLevel.toString(),
    reorderQuantity: row.reorderQuantity.toString(),
    leadTimeDays: row.leadTimeDays,
    preferredSupplierId: row.preferredSupplierId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function isUniqueViolation(error: unknown, column: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    (error.meta?.target as string[]).includes(column)
  );
}

/**
 * Product and category maintenance (Phase 2 Task 6). Prices and quantities are validated
 * through the same `Money`/`Quantity` domain primitives the inventory ledger uses, so a
 * product's stored `salesPriceMinorUnits`/`reorderLevel` can never diverge from what those
 * primitives consider a valid decimal amount.
 */
@Injectable()
export class ProductsService {
  async list(query: ListProductsQuery): Promise<{ items: Product[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { barcode: { contains: query.search, mode: 'insensitive' as const } },
              { suppliers: { some: { supplierProductCode: { contains: query.search, mode: 'insensitive' as const } } } }
            ]
          }
        : {})
    };
    const [rows, total] = await Promise.all([
      database.product.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.product.count({ where })
    ]);
    return { items: rows.map(toProduct), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Product> {
    const row = await database.product.findUnique({ where: { id }, include: { suppliers: true } });
    if (!row) throw new NotFoundException('Product not found');
    return {
      ...toProduct(row),
      suppliers: row.suppliers.map((supplier) => ({
        id: supplier.id,
        productId: supplier.productId,
        supplierId: supplier.supplierId,
        supplierProductCode: supplier.supplierProductCode,
        purchaseCost: Money.from(supplier.purchaseCostMinorUnits).toDecimalString(),
        preferred: supplier.preferred,
        leadTimeDays: supplier.leadTimeDays,
        createdAt: supplier.createdAt.toISOString(),
        updatedAt: supplier.updatedAt.toISOString()
      }))
    };
  }

  async create(input: CreateProductInput): Promise<Product> {
    try {
      const row = await database.product.create({ data: this.toData(input) as Prisma.ProductUncheckedCreateInput });
      return toProduct(row);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    try {
      const row = await database.product.update({ where: { id }, data: this.toData(input) });
      return toProduct(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Product not found');
      }
      throw this.mapUniqueViolation(error);
    }
  }

  async archive(id: string): Promise<Product> {
    try {
      const row = await database.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
      return toProduct(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  async listTaxRates(): Promise<{ id: string; code: string; name: string; rateBasis: number }[]> {
    return database.taxRate.findMany({ where: { active: true }, orderBy: [{ code: 'asc' }], select: { id: true, code: true, name: true, rateBasis: true } });
  }

  async listCategories(): Promise<ProductCategory[]> {
    const rows = await database.productCategory.findMany({ orderBy: [{ name: 'asc' }] });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async createCategory(input: ProductCategoryInput): Promise<ProductCategory> {
    return withTransaction(async (transaction) => {
      if (input.parentId) {
        const parent = await transaction.productCategory.findUnique({ where: { id: input.parentId } });
        if (!parent) throw new NotFoundException('Parent category not found');
      }
      try {
        const row = await transaction.productCategory.create({ data: { name: input.name, parentId: input.parentId ?? null } });
        return {
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString()
        };
      } catch (error) {
        if (isUniqueViolation(error, 'name')) throw new ConflictException('A category with this name already exists');
        throw error;
      }
    });
  }

  private toData(input: UpdateProductInput): Prisma.ProductUncheckedUpdateInput {
    return {
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.unitOfMeasure !== undefined ? { unitOfMeasure: input.unitOfMeasure } : {}),
      ...(input.salesPrice !== undefined ? { salesPriceMinorUnits: Money.from(input.salesPrice).minorUnits } : {}),
      ...(input.purchaseCost !== undefined ? { purchaseCostMinorUnits: Money.from(input.purchaseCost).minorUnits } : {}),
      ...(input.taxRateId !== undefined ? { taxRateId: input.taxRateId } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: Quantity.from(input.reorderLevel).toDecimalString() } : {}),
      ...(input.reorderQuantity !== undefined ? { reorderQuantity: Quantity.from(input.reorderQuantity).toDecimalString() } : {}),
      ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
      ...(input.preferredSupplierId !== undefined ? { preferredSupplierId: input.preferredSupplierId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    };
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (isUniqueViolation(error, 'sku')) return new ConflictException('A product with this SKU already exists');
    if (isUniqueViolation(error, 'barcode')) return new ConflictException('A product with this barcode already exists');
    return error;
  }
}
