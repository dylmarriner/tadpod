import { z } from 'zod';
import { moneyAmountSchema } from './products.js';

export const installmentFrequencySchema = z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'CUSTOM']);
export type InstallmentFrequency = z.infer<typeof installmentFrequencySchema>;

const positiveMoneySchema = moneyAmountSchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero');

export const customScheduleLineInputSchema = z.object({
  dueDate: z.string().datetime(),
  amount: positiveMoneySchema
});
export type CustomScheduleLineInput = z.infer<typeof customScheduleLineInputSchema>;

/**
 * Either a recurring schedule (`WEEKLY`/`FORTNIGHTLY`/`MONTHLY`, evenly split across
 * `installmentCount` starting `startDate`), a deposit-and-final schedule (`depositAmount` due
 * `startDate`, remainder due `finalDueDate`), or `CUSTOM` with an explicit `lines` array —
 * exactly one shape per `frequency`.
 */
export const createInstallmentPlanSchema = z
  .object({
    frequency: installmentFrequencySchema,
    startDate: z.string().datetime().optional(),
    installmentCount: z.number().int().min(1).max(52).optional(),
    depositAmount: positiveMoneySchema.optional(),
    finalDueDate: z.string().datetime().optional(),
    lines: z.array(customScheduleLineInputSchema).optional()
  })
  .refine((value) => value.frequency !== 'CUSTOM' || (value.lines && value.lines.length > 0), { message: 'CUSTOM requires at least one schedule line', path: ['lines'] })
  .refine((value) => value.frequency === 'CUSTOM' || value.depositAmount === undefined || (value.startDate && value.finalDueDate), {
    message: 'A deposit schedule requires startDate and finalDueDate',
    path: ['finalDueDate']
  })
  .refine((value) => value.frequency === 'CUSTOM' || value.depositAmount !== undefined || (value.startDate && value.installmentCount), {
    message: 'A recurring schedule requires startDate and installmentCount',
    path: ['installmentCount']
  });
export type CreateInstallmentPlanInput = z.infer<typeof createInstallmentPlanSchema>;

export const installmentScheduleLineSchema = z.object({
  id: z.string().uuid(),
  dueDate: z.string().datetime(),
  amount: moneyAmountSchema,
  paidAmount: moneyAmountSchema
});
export type InstallmentScheduleLine = z.infer<typeof installmentScheduleLineSchema>;

export const installmentPlanSchema = z.object({
  id: z.string().uuid(),
  customerInvoiceId: z.string().uuid(),
  frequency: installmentFrequencySchema,
  createdAt: z.string().datetime(),
  lines: z.array(installmentScheduleLineSchema).readonly()
});
export type InstallmentPlan = z.infer<typeof installmentPlanSchema>;
