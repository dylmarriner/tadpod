import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { computeLineTotalMinorUnits, computeSupplierAccount, Money, netAccountsPayable, Quantity } from '@tadpods/domain';
import { database, Prisma, withTransaction, type Supplier as SupplierRow, type SupplierAddress as SupplierAddressRow } from '@tadpods/database';
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  SimilarSupplier,
  Supplier,
  SupplierAccount,
  SupplierAddress,
  SupplierAddressInput,
  SupplierStatement,
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

  /**
   * The accounts-payable account projection: posted bills only (never a purchase-order-style
   * commitment) drive `amountOwed`/aging, unapplied `SupplierCredit` balances net off
   * `amountOwed`, and `receivedNotBilled` sums `PurchaseOrderLine.receivedQuantity -
   * billedQuantity` across every non-terminal order — visibly separate from `amountOwed`.
   */
  async account(supplierId: string, asOf: Date = new Date()): Promise<SupplierAccount> {
    const supplier = await database.supplier.findUnique({ where: { id: supplierId }, select: { id: true, currency: true } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const [billsForAccount, unappliedCredit, receivedNotBilledMinorUnits] = await Promise.all([
      this.loadBillsForAccount(supplierId),
      this.sumUnappliedCredit(supplierId),
      this.sumReceivedNotBilled(supplierId)
    ]);
    const projection = computeSupplierAccount(billsForAccount, asOf);
    const netOwed = netAccountsPayable(projection.amountOwedMinorUnits, unappliedCredit);

    return {
      supplierId,
      asOf: asOf.toISOString(),
      amountOwed: Money.from(projection.amountOwedMinorUnits, supplier.currency).toDecimalString(),
      overdue: Money.from(projection.overdueMinorUnits, supplier.currency).toDecimalString(),
      dueWithin7Days: Money.from(projection.dueWithin7DaysMinorUnits, supplier.currency).toDecimalString(),
      dueWithin30Days: Money.from(projection.dueWithin30DaysMinorUnits, supplier.currency).toDecimalString(),
      unappliedCredit: Money.from(unappliedCredit, supplier.currency).toDecimalString(),
      availableCredit: Money.from(unappliedCredit > netOwed ? unappliedCredit - netOwed : 0n, supplier.currency).toDecimalString(),
      receivedNotBilled: Money.from(receivedNotBilledMinorUnits, supplier.currency).toDecimalString()
    };
  }

  /** A chronological statement of every bill, payment allocation, credit application, and refund, with a running balance. */
  async statement(supplierId: string, asOf: Date = new Date()): Promise<SupplierStatement> {
    const supplier = await database.supplier.findUnique({ where: { id: supplierId }, select: { id: true, currency: true } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const [bills, payments, creditApplications, refunds] = await Promise.all([
      database.supplierBill.findMany({ where: { supplierId, status: { not: 'VOIDED' }, issueDate: { lte: asOf } }, include: { lines: true } }),
      database.supplierPayment.findMany({ where: { supplierId, reversedAt: null, paidAt: { lte: asOf } }, include: { allocations: { where: { reversedAt: null } } } }),
      database.supplierCreditApplication.findMany({ where: { supplierBill: { supplierId }, reversedAt: null, createdAt: { lte: asOf } }, include: { supplierBill: { select: { billNumber: true } } } }),
      database.supplierRefund.findMany({ where: { supplierId, createdAt: { lte: asOf } } })
    ]);

    type RawLine = { type: 'BILL' | 'PAYMENT' | 'CREDIT_APPLICATION' | 'REFUND'; id: string; number: string; date: Date; description: string; debitMinorUnits: bigint; creditMinorUnits: bigint };
    const rawLines: RawLine[] = [
      ...bills.map((bill) => ({
        type: 'BILL' as const,
        id: bill.id,
        number: bill.billNumber,
        date: bill.issueDate,
        description: `Bill ${bill.billNumber}`,
        debitMinorUnits: bill.lines.reduce((sum, line) => sum + computeLineTotalMinorUnits(line.unitCostMinorUnits, line.quantity.toString()), 0n),
        creditMinorUnits: 0n
      })),
      ...payments.map((payment) => ({
        type: 'PAYMENT' as const,
        id: payment.id,
        number: payment.paymentNumber,
        date: payment.paidAt,
        description: `Payment ${payment.paymentNumber}`,
        debitMinorUnits: 0n,
        creditMinorUnits: payment.allocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n)
      })),
      ...creditApplications.map((application) => ({
        type: 'CREDIT_APPLICATION' as const,
        id: application.id,
        number: application.supplierBill.billNumber,
        date: application.createdAt,
        description: `Credit applied to ${application.supplierBill.billNumber}`,
        debitMinorUnits: 0n,
        creditMinorUnits: application.amountMinorUnits
      })),
      ...refunds.map((refund) => ({
        type: 'REFUND' as const,
        id: refund.id,
        number: refund.refundNumber,
        date: refund.createdAt,
        description: `Refund ${refund.refundNumber}`,
        debitMinorUnits: refund.amountMinorUnits,
        creditMinorUnits: 0n
      }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = 0n;
    const lines = rawLines.map((line) => {
      if (line.type !== 'REFUND') running += line.debitMinorUnits - line.creditMinorUnits;
      return {
        type: line.type,
        ref: { id: line.id, number: line.number },
        date: line.date.toISOString(),
        description: line.description,
        debit: Money.from(line.debitMinorUnits, supplier.currency).toDecimalString(),
        credit: Money.from(line.creditMinorUnits, supplier.currency).toDecimalString(),
        runningBalance: Money.from(running, supplier.currency).toDecimalString()
      };
    });

    return { supplierId, asOf: asOf.toISOString(), openingBalance: Money.from(0n, supplier.currency).toDecimalString(), closingBalance: Money.from(running, supplier.currency).toDecimalString(), lines };
  }

  private async loadBillsForAccount(supplierId: string) {
    const bills = await database.supplierBill.findMany({
      where: { supplierId, status: { not: 'VOIDED' } },
      include: { lines: true, paymentAllocations: { where: { reversedAt: null } }, creditApplications: { where: { reversedAt: null } } }
    });
    return bills.map((bill) => ({
      amountMinorUnits: bill.lines.reduce((sum, line) => sum + computeLineTotalMinorUnits(line.unitCostMinorUnits, line.quantity.toString()), 0n),
      paidMinorUnits: bill.paymentAllocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n),
      creditedMinorUnits: bill.creditApplications.reduce((sum, application) => sum + application.amountMinorUnits, 0n),
      dueDate: bill.dueDate
    }));
  }

  private async sumUnappliedCredit(supplierId: string): Promise<bigint> {
    const result = await database.supplierCredit.aggregate({ where: { supplierId }, _sum: { remainingMinorUnits: true } });
    return result._sum.remainingMinorUnits ?? 0n;
  }

  /** Received-not-billed: PurchaseOrderLine.receivedQuantity - billedQuantity, priced at unit cost, across this supplier's non-terminal orders. */
  private async sumReceivedNotBilled(supplierId: string): Promise<bigint> {
    const lines = await database.purchaseOrderLine.findMany({
      where: { purchaseOrder: { supplierId, status: { notIn: ['DRAFT', 'AWAITING_APPROVAL', 'CANCELLED'] } } }
    });
    return lines.reduce((sum, line) => {
      const unbilled = Quantity.from(line.receivedQuantity.toString()).subtract(Quantity.from(line.billedQuantity.toString()));
      if (!unbilled.isPositive()) return sum;
      return sum + computeLineTotalMinorUnits(line.unitCostMinorUnits, unbilled.toDecimalString());
    }, 0n);
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
