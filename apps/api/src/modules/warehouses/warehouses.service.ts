import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { database, Prisma, withTransaction, type Warehouse as WarehouseRow } from '@tadpods/database';
import type { CreateWarehouseInput, ListWarehousesQuery, UpdateWarehouseInput, Warehouse } from '@tadpods/contracts';

function toWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    status: row.status,
    isDefault: row.isDefault,
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
 * Warehouse maintenance (Phase 2 Task 6). `isDefault` is guarded by a partial unique index
 * (`Warehouse_single_default_idx`) at the database layer, so this service only needs to
 * unset any existing default inside the same transaction as a new one is set — the index
 * still rejects a race that slips past that read.
 */
@Injectable()
export class WarehousesService {
  async list(query: ListWarehousesQuery): Promise<{ items: Warehouse[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.WarehouseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    };
    const [rows, total] = await Promise.all([
      database.warehouse.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      database.warehouse.count({ where })
    ]);
    return { items: rows.map(toWarehouse), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Warehouse> {
    const row = await database.warehouse.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Warehouse not found');
    return toWarehouse(row);
  }

  async create(input: CreateWarehouseInput): Promise<Warehouse> {
    return withTransaction(async (transaction) => {
      if (input.isDefault) await transaction.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      try {
        const row = await transaction.warehouse.create({ data: this.toData(input) as Prisma.WarehouseUncheckedCreateInput });
        return toWarehouse(row);
      } catch (error) {
        throw this.mapUniqueViolation(error);
      }
    });
  }

  async update(id: string, input: UpdateWarehouseInput): Promise<Warehouse> {
    return withTransaction(async (transaction) => {
      if (input.isDefault) await transaction.warehouse.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      try {
        const row = await transaction.warehouse.update({ where: { id }, data: this.toData(input) });
        return toWarehouse(row);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new NotFoundException('Warehouse not found');
        }
        throw this.mapUniqueViolation(error);
      }
    });
  }

  private toData(input: UpdateWarehouseInput): Prisma.WarehouseUncheckedUpdateInput {
    return {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
      ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {})
    };
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (isUniqueViolation(error, 'code')) return new ConflictException('A warehouse with this code already exists');
    if (isUniqueViolation(error, 'name')) return new ConflictException('A warehouse with this name already exists');
    return error;
  }
}
