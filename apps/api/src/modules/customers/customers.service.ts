import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Money } from '@tadpods/domain';
import { database, Prisma, withTransaction, type Customer as CustomerRow, type CustomerAddress as CustomerAddressRow } from '@tadpods/database';
import type {
  Customer,
  CustomerAccount,
  CustomerAddress,
  CustomerAddressInput,
  CreateCustomerInput,
  ListCustomersQuery,
  SimilarCustomer,
  UpdateCustomerInput
} from '@tadpods/contracts';

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    legalName: row.legalName,
    taxNumber: row.taxNumber,
    currency: row.currency,
    paymentTermsDays: row.paymentTermsDays,
    creditLimit: Money.from(row.creditLimitMinorUnits, row.currency).toDecimalString(),
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toAddress(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customerId,
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
 * Customer master records and account model (Phase 4). Mirrors `SuppliersService` exactly:
 * `account` only ever sums posted customer invoices/payments, so it reads zero for every
 * component until Phase 5 introduces those tables, rather than inventing a balance.
 */
@Injectable()
export class CustomersService {
  async list(query: ListCustomersQuery): Promise<{ items: Customer[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.CustomerWhereInput = {
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
      database.customer.findMany({ where, orderBy: [{ name: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      database.customer.count({ where })
    ]);
    return { items: rows.map(toCustomer), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Customer> {
    const row = await database.customer.findUnique({ where: { id }, include: { addresses: true } });
    if (!row) throw new NotFoundException('Customer not found');
    return { ...toCustomer(row), addresses: row.addresses.map(toAddress) };
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    try {
      const row = await database.customer.create({ data: this.toUpdateData(input) as Prisma.CustomerUncheckedCreateInput });
      return toCustomer(row);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    try {
      const row = await database.customer.update({ where: { id }, data: this.toUpdateData(input) });
      return toCustomer(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Customer not found');
      }
      throw this.mapUniqueViolation(error);
    }
  }

  /** Advisory-only duplicate-name warning, matching `SuppliersService.findSimilarNames`. */
  async findSimilarNames(name: string): Promise<SimilarCustomer[]> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return [];
    const rows = await database.$queryRaw<SimilarCustomer[]>(Prisma.sql`
      SELECT "id", "code", "name" FROM "Customer"
      WHERE lower("name") = ${normalized} OR lower("name") LIKE ${`%${normalized}%`}
      ORDER BY "name" ASC
      LIMIT 10
    `);
    return rows;
  }

  async listAddresses(customerId: string): Promise<CustomerAddress[]> {
    await this.get(customerId);
    const rows = await database.customerAddress.findMany({ where: { customerId }, orderBy: [{ type: 'asc' }] });
    return rows.map(toAddress);
  }

  async addAddress(customerId: string, input: CustomerAddressInput): Promise<CustomerAddress> {
    return withTransaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundException('Customer not found');
      const row = await transaction.customerAddress.create({
        data: {
          customerId,
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

  async removeAddress(customerId: string, addressId: string): Promise<{ removed: true }> {
    const result = await database.customerAddress.deleteMany({ where: { id: addressId, customerId } });
    if (result.count === 0) throw new NotFoundException('Customer address not found');
    return { removed: true };
  }

  async account(customerId: string, asOf: Date = new Date()): Promise<CustomerAccount> {
    const customer = await database.customer.findUnique({ where: { id: customerId }, select: { id: true, currency: true, creditLimitMinorUnits: true } });
    if (!customer) throw new NotFoundException('Customer not found');

    // No customer-invoice table exists yet (Phase 5) — the projection reads zero for every
    // owed/overdue component rather than inventing a balance.
    const zero = Money.from(0n, customer.currency).toDecimalString();
    const creditLimit = Money.from(customer.creditLimitMinorUnits, customer.currency).toDecimalString();
    return {
      customerId,
      asOf: asOf.toISOString(),
      amountOwed: zero,
      overdue: zero,
      creditLimit,
      availableCredit: creditLimit
    };
  }

  private toUpdateData(input: UpdateCustomerInput): Prisma.CustomerUpdateInput {
    return {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
      ...(input.creditLimit !== undefined ? { creditLimitMinorUnits: Money.from(input.creditLimit).minorUnits } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    };
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (isUniqueViolation(error, 'code')) return new ConflictException('A customer with this account code already exists');
    return error;
  }
}
