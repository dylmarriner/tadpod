import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { billableLinesQuerySchema, createSupplierBillSchema, listSupplierBillsQuerySchema, voidSupplierBillSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { SupplierBillsService, type SupplierBillingRequestContext } from './supplier-bills.service.js';

function contextFrom(request: FastifyRequest): SupplierBillingRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('supplier-bills')
export class SupplierBillsController {
  constructor(private readonly bills: SupplierBillsService) {}

  @Get()
  @RequirePermission('purchasing.read')
  list(@Query() query: unknown) {
    return this.bills.list(listSupplierBillsQuerySchema.parse(query));
  }

  @Get('billable-lines')
  @RequirePermission('purchasing.read')
  billableLines(@Query() query: unknown) {
    const { purchaseOrderId } = billableLinesQuerySchema.parse(query);
    return this.bills.billableLines(purchaseOrderId);
  }

  @Post()
  @RequirePermission('purchasing.bill')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createSupplierBillSchema.parse(body);
    return this.bills.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('purchasing.read')
  get(@Param('id') id: string) {
    return this.bills.get(id);
  }

  @Post(':id/void')
  @RequirePermission('purchasing.bill')
  void(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = voidSupplierBillSchema.parse(body ?? {});
    return this.bills.void(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
