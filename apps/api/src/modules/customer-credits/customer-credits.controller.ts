import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { applyCustomerCreditSchema, createCustomerCreditSchema, createCustomerRefundSchema, listCustomerCreditsQuerySchema, reverseCreditApplicationSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { CustomerCreditsService, type CustomerCreditsRequestContext } from './customer-credits.service.js';

function contextFrom(request: FastifyRequest): CustomerCreditsRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('customer-credits')
export class CustomerCreditsController {
  constructor(private readonly credits: CustomerCreditsService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.credits.list(listCustomerCreditsQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('sales.invoice')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createCustomerCreditSchema.parse(body);
    return this.credits.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('sales.read')
  get(@Param('id') id: string) {
    return this.credits.get(id);
  }

  @Post(':id/apply')
  @RequirePermission('sales.invoice')
  apply(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = applyCustomerCreditSchema.parse(body ?? {});
    return this.credits.apply(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/applications/:applicationId/reverse')
  @RequirePermission('sales.invoice')
  reverseApplication(@Param('id') id: string, @Param('applicationId') applicationId: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reverseCreditApplicationSchema.parse(body ?? {});
    return this.credits.reverseApplication(id, applicationId, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}

@Controller('customer-refunds')
export class CustomerRefundsController {
  constructor(private readonly credits: CustomerCreditsService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query('customerId') customerId?: string) {
    return this.credits.listRefunds(customerId);
  }

  @Post()
  @RequirePermission('sales.invoice')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createCustomerRefundSchema.parse(body);
    return this.credits.createRefund(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
