import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { applySupplierCreditSchema, createSupplierCreditSchema, createSupplierRefundSchema, listSupplierCreditsQuerySchema, reverseSupplierCreditApplicationSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { SupplierCreditsService, type SupplierCreditsRequestContext } from './supplier-credits.service.js';

function contextFrom(request: FastifyRequest): SupplierCreditsRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('supplier-credits')
export class SupplierCreditsController {
  constructor(private readonly credits: SupplierCreditsService) {}

  @Get()
  @RequirePermission('purchasing.read')
  list(@Query() query: unknown) {
    return this.credits.list(listSupplierCreditsQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('purchasing.bill')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createSupplierCreditSchema.parse(body);
    return this.credits.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('purchasing.read')
  get(@Param('id') id: string) {
    return this.credits.get(id);
  }

  @Post(':id/apply')
  @RequirePermission('purchasing.bill')
  apply(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = applySupplierCreditSchema.parse(body ?? {});
    return this.credits.apply(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/applications/:applicationId/reverse')
  @RequirePermission('purchasing.bill')
  reverseApplication(@Param('id') id: string, @Param('applicationId') applicationId: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reverseSupplierCreditApplicationSchema.parse(body ?? {});
    return this.credits.reverseApplication(id, applicationId, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}

@Controller('supplier-refunds')
export class SupplierRefundsController {
  constructor(private readonly credits: SupplierCreditsService) {}

  @Get()
  @RequirePermission('purchasing.read')
  list(@Query('supplierId') supplierId?: string) {
    return this.credits.listRefunds(supplierId);
  }

  @Post()
  @RequirePermission('purchasing.bill')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createSupplierRefundSchema.parse(body);
    return this.credits.createRefund(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
