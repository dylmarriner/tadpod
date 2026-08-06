import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { computeSupplierAccount, Money } from '@tadpods/domain';
import { database, Prisma, withTransaction, type Supplier as SupplierRow, type SupplierAddress as SupplierAddressRow } from '@tadpods/database';
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  SimilarSupplier,
  Supplier,
  SupplierAccount,
  SupplierAddress,
  SupplierAddressInput,
  UpdateSupplierInput
} from '@tadpods/contracts';

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    legalName: row.legalName,
    taxNumber: row.taxNumber,
    currency: row.currency,
    paymentTermsDays: row.paymentTermsDays,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toAddress(row: SupplierAddressRow): SupplierAddress {
  return {
    id: row.id,
    supplierId: row.supplierId,
    type: row.type,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
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
 * Supplier master records and account model (Phase 3 Task 1). The account projection here
 * only ever sums posted supplier bills through `computeSupplierAccount` — no purchase order
 * or goods receipt is ever treated as a payable, so commitments and received-not-billed stay
 * mathematically separate from `amountOwed` even once Tasks 2-6 add those tables. Until then
 * there are no bills to sum, and every projected field reads zero rather than inventing data.
 */
@Injectable()
export class SuppliersService {
  async list(query: ListSuppliersQuery): Promise<{ items: Supplier[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.SupplierWhereInput = {
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { legalName: { contains: query.search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    };
    const [rows, total] = await Promise.all([
      database.supplier.findMany({ where, orderBy: [{ name: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      database.supplier.count({ where })
    ]);
    return { items: rows.map(toSupplier), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Supplier> {
    const row = await database.supplier.findUnique({ where: { id }, include: { addresses: true } });
    if (!row) throw new NotFoundException('Supplier not found');
    return { ...toSupplier(row), addresses: row.addresses.map(toAddress) };
  }

  async create(input: CreateSupplierInput): Promise<Supplier> {
    try {
      const row = await database.supplier.create({ data: this.toUpdateData(input) as Prisma.SupplierUncheckedCreateInput });
      return toSupplier(row);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async update(id: string, input: UpdateSupplierInput): Promise<Supplier> {
    try {
      const row = await database.supplier.update({ where: { id }, data: this.toUpdateData(input) });
      return toSupplier(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Supplier not found');
      }
      throw this.mapUniqueViolation(error);
    }
  }

  /**
   * Advisory-only: existing suppliers whose normalized name matches, so staff can be warned
   * before creating what may be a duplicate. Never blocks creation — `name` has no unique
   * constraint, only `code` does.
   */
  async findSimilarNames(name: string): Promise<SimilarSupplier[]> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return [];
    const rows = await database.$queryRaw<SimilarSupplier[]>(Prisma.sql`
      SELECT "id", "code", "name" FROM "Supplier"
      WHERE lower("name") = ${normalized} OR lower("name") LIKE ${`%${normalized}%`}
      ORDER BY "name" ASC
      LIMIT 10
    `);
    return rows;
  }

  async listAddresses(supplierId: string): Promise<SupplierAddress[]> {
    await this.get(supplierId);
    const rows = await database.supplierAddress.findMany({ where: { supplierId }, orderBy: [{ type: 'asc' }] });
    return rows.map(toAddress);
  }

  async addAddress(supplierId: string, input: SupplierAddressInput): Promise<SupplierAddress> {
    return withTransaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
      const row = await transaction.supplierAddress.create({
        data: {
          supplierId,
          type: input.type,
          ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
          ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
          ...(input.country !== undefined ? { country: input.country } : {})
        }
      });
      return toAddress(row);
    });
  }

  async removeAddress(supplierId: string, addressId: string): Promise<{ removed: true }> {
    const result = await database.supplierAddress.deleteMany({ where: { id: addressId, supplierId } });
    if (result.count === 0) throw new NotFoundException('Supplier address not found');
    return { removed: true };
  }

  async account(supplierId: string, asOf: Date = new Date()): Promise<SupplierAccount> {
    const supplier = await database.supplier.findUnique({ where: { id: supplierId }, select: { id: true, currency: true } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    // No supplier-bill table exists yet (Task 4) — the projection reads zero for every
    // component rather than inventing a balance, exactly as Phase 2 Task 8 did for
    // reservations/incoming-stock before those tables existed.
    const projection = computeSupplierAccount([], asOf);
    const zero = Money.from(0n, supplier.currency).toDecimalString();
    return {
      supplierId,
      asOf: asOf.toISOString(),
      amountOwed: Money.from(projection.amountOwedMinorUnits, supplier.currency).toDecimalString(),
      overdue: Money.from(projection.overdueMinorUnits, supplier.currency).toDecimalString(),
      dueWithin7Days: Money.from(projection.dueWithin7DaysMinorUnits, supplier.currency).toDecimalString(),
      dueWithin30Days: Money.from(projection.dueWithin30DaysMinorUnits, supplier.currency).toDecimalString(),
      availableCredit: zero,
      receivedNotBilled: zero
    };
  }

  private toUpdateData(input: UpdateSupplierInput): Prisma.SupplierUpdateInput {
    return {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    };
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (isUniqueViolation(error, 'code')) return new ConflictException('A supplier with this account code already exists');
    return error;
  }
}
