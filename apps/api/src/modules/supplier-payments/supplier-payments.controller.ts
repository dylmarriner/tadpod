import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createSupplierPaymentSchema, listSupplierPaymentsQuerySchema, previewSupplierPaymentAllocationQuerySchema, reallocateSupplierPaymentSchema, reverseSupplierPaymentSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { SupplierPaymentsService, type SupplierPaymentsRequestContext } from './supplier-payments.service.js';

function contextFrom(request: FastifyRequest): SupplierPaymentsRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly payments: SupplierPaymentsService) {}

  @Get()
  @RequirePermission('purchasing.read')
  list(@Query() query: unknown) {
    return this.payments.list(listSupplierPaymentsQuerySchema.parse(query));
  }

  @Get('preview-allocation')
  @RequirePermission('purchasing.read')
  previewAllocation(@Query() query: unknown) {
    return this.payments.previewAllocation(previewSupplierPaymentAllocationQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('purchasing.bill')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createSupplierPaymentSchema.parse(body);
    return this.payments.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('purchasing.read')
  get(@Param('id') id: string) {
    return this.payments.get(id);
  }

  @Post(':id/reallocate')
  @RequirePermission('purchasing.bill')
  reallocate(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reallocateSupplierPaymentSchema.parse(body);
    return this.payments.reallocate(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/reverse')
  @RequirePermission('purchasing.bill')
  reverse(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reverseSupplierPaymentSchema.parse(body ?? {});
    return this.payments.reverse(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
