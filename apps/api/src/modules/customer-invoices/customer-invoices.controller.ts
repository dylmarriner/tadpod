import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createCustomerInvoiceSchema, createInstallmentPlanSchema, invoiceableLinesQuerySchema, listCustomerInvoicesQuerySchema, voidCustomerInvoiceSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { CustomerInvoicesService, type CustomerInvoicingRequestContext } from './customer-invoices.service.js';
import { InstallmentPlansService } from './installment-plans.service.js';

function contextFrom(request: FastifyRequest): CustomerInvoicingRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('customer-invoices')
export class CustomerInvoicesController {
  constructor(
    private readonly invoices: CustomerInvoicesService,
    private readonly installmentPlans: InstallmentPlansService
  ) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.invoices.list(listCustomerInvoicesQuerySchema.parse(query));
  }

  @Get('invoiceable-lines')
  @RequirePermission('sales.read')
  invoiceableLines(@Query() query: unknown) {
    const { salesOrderId } = invoiceableLinesQuerySchema.parse(query);
    return this.invoices.invoiceableLines(salesOrderId);
  }

  @Post()
  @RequirePermission('sales.invoice')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createCustomerInvoiceSchema.parse(body);
    return this.invoices.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('sales.read')
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post(':id/void')
  @RequirePermission('sales.invoice')
  void(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = voidCustomerInvoiceSchema.parse(body ?? {});
    return this.invoices.void(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id/installment-plan')
  @RequirePermission('sales.read')
  getInstallmentPlan(@Param('id') id: string) {
    return this.installmentPlans.get(id);
  }

  @Post(':id/installment-plan')
  @RequirePermission('sales.invoice')
  createInstallmentPlan(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createInstallmentPlanSchema.parse(body);
    return this.installmentPlans.create(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
