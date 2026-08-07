import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { generateDepositAndFinalSchedule, generateRecurringSchedule, Money, validateInstallmentSchedule } from '@tadpods/domain';
import { database, Prisma, withTransaction, type Prisma as PrismaNamespace } from '@tadpods/database';
import type { CreateInstallmentPlanInput, InstallmentPlan } from '@tadpods/contracts';
import { computeInvoiceTotalMinorUnits } from './customer-invoice-posting.js';

export type InstallmentPlansActor = { id: string; permissions: readonly string[] };
export type InstallmentPlansRequestContext = { requestId: string; ipAddress?: string };

const planInclude = { lines: { orderBy: { dueDate: 'asc' } } } satisfies PrismaNamespace.InstallmentPlanInclude;
type PlanWithLines = PrismaNamespace.InstallmentPlanGetPayload<{ include: typeof planInclude }>;

function toPlan(row: PlanWithLines, currency: string): InstallmentPlan {
  return {
    id: row.id,
    customerInvoiceId: row.customerInvoiceId,
    frequency: row.frequency,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      dueDate: line.dueDate.toISOString(),
      amount: Money.from(line.amountMinorUnits, currency).toDecimalString(),
      paidAmount: Money.from(line.paidAmountMinorUnits, currency).toDecimalString()
    }))
  };
}

/**
 * Installment plans (Phase 5). A plan is a schedule describing how an invoice is *expected* to
 * be paid — deposit-and-final, a recurring cadence, or a fully custom set of lines — but it
 * never gates `CustomerPaymentsService`: unscheduled partial payments remain allowed against
 * the invoice at any time, and `InstallmentScheduleLine.paidAmountMinorUnits` here is purely
 * informational progress tracking, not a payable record in its own right.
 */
@Injectable()
export class InstallmentPlansService {
  async create(customerInvoiceId: string, input: CreateInstallmentPlanInput, actor: InstallmentPlansActor, context: InstallmentPlansRequestContext): Promise<InstallmentPlan> {
    return withTransaction(async (transaction) => {
      const invoice = await transaction.customerInvoice.findUnique({ where: { id: customerInvoiceId } });
      if (!invoice) throw new NotFoundException('Customer invoice not found');
      if (invoice.status === 'VOIDED') throw new ConflictException('Cannot schedule installments for a voided invoice');

      const existing = await transaction.installmentPlan.findUnique({ where: { customerInvoiceId } });
      if (existing) throw new ConflictException('This invoice already has an installment plan');

      const totalMinorUnits = await computeInvoiceTotalMinorUnits(transaction, customerInvoiceId);

      let scheduleLines: { dueDate: string; amountMinorUnits: bigint }[];
      if (input.frequency === 'CUSTOM') {
        scheduleLines = (input.lines ?? []).map((line) => ({ dueDate: line.dueDate, amountMinorUnits: Money.from(line.amount).minorUnits }));
      } else if (input.depositAmount !== undefined) {
        if (!input.startDate || !input.finalDueDate) throw new BadRequestException('A deposit schedule requires startDate and finalDueDate');
        scheduleLines = generateDepositAndFinalSchedule(Money.from(input.depositAmount).minorUnits, input.startDate, input.finalDueDate, totalMinorUnits);
      } else {
        if (!input.startDate || !input.installmentCount) throw new BadRequestException('A recurring schedule requires startDate and installmentCount');
        scheduleLines = generateRecurringSchedule(input.frequency, new Date(input.startDate), input.installmentCount, totalMinorUnits);
      }

      try {
        validateInstallmentSchedule(scheduleLines, totalMinorUnits);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Invalid installment schedule');
      }

      const created = await transaction.installmentPlan.create({
        data: {
          customerInvoiceId,
          frequency: input.frequency,
          createdById: actor.id,
          lines: { create: scheduleLines.map((line) => ({ dueDate: new Date(line.dueDate), amountMinorUnits: line.amountMinorUnits })) }
        },
        include: planInclude
      });

      await transaction.auditLog.create({
        data: {
          action: 'installment-plan.create',
          entityType: 'InstallmentPlan',
          entityId: created.id,
          metadata: { customerInvoiceId, frequency: input.frequency, lineCount: scheduleLines.length } as Prisma.InputJsonValue,
          requestId: context.requestId,
          userId: actor.id,
          ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
        }
      });

      return toPlan(created, invoice.currency);
    });
  }

  async get(customerInvoiceId: string): Promise<InstallmentPlan> {
    const invoice = await database.customerInvoice.findUnique({ where: { id: customerInvoiceId } });
    if (!invoice) throw new NotFoundException('Customer invoice not found');
    const plan = await database.installmentPlan.findUnique({ where: { customerInvoiceId }, include: planInclude });
    if (!plan) throw new NotFoundException('This invoice has no installment plan');
    return toPlan(plan, invoice.currency);
  }
}
