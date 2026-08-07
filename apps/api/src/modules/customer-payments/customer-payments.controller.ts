import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createCustomerPaymentSchema, listCustomerPaymentsQuerySchema, previewPaymentAllocationQuerySchema, reallocateCustomerPaymentSchema, reverseCustomerPaymentSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { CustomerPaymentsService, type CustomerPaymentsRequestContext } from './customer-payments.service.js';

function contextFrom(request: FastifyRequest): CustomerPaymentsRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('customer-payments')
export class CustomerPaymentsController {
  constructor(private readonly payments: CustomerPaymentsService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.payments.list(listCustomerPaymentsQuerySchema.parse(query));
  }

  @Get('preview-allocation')
  @RequirePermission('sales.read')
  previewAllocation(@Query() query: unknown) {
    return this.payments.previewAllocation(previewPaymentAllocationQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('sales.invoice')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createCustomerPaymentSchema.parse(body);
    return this.payments.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('sales.read')
  get(@Param('id') id: string) {
    return this.payments.get(id);
  }

  @Post(':id/reallocate')
  @RequirePermission('sales.invoice')
  reallocate(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reallocateCustomerPaymentSchema.parse(body);
    return this.payments.reallocate(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/reverse')
  @RequirePermission('sales.invoice')
  reverse(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reverseCustomerPaymentSchema.parse(body ?? {});
    return this.payments.reverse(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
