import { Controller, Get, Param, Post, Body, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { listCustomerReturnsQuerySchema, postCustomerReturnSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { CustomerReturnsService } from './customer-returns.service.js';
import type { InventoryRequestContext } from '../inventory/stock-posting.service.js';

function contextFrom(request: FastifyRequest): InventoryRequestContext {
  const userAgent = request.headers['user-agent'];
  return { requestId: request.id, ipAddress: request.ip, ...(typeof userAgent === 'string' ? { userAgent } : {}) };
}

@Controller('customer-returns')
export class CustomerReturnsController {
  constructor(private readonly returns: CustomerReturnsService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.returns.list(listCustomerReturnsQuerySchema.parse(query));
  }

  @Get('delivery-lines/:deliveryLineId/returnable')
  @RequirePermission('sales.read')
  returnable(@Param('deliveryLineId') deliveryLineId: string) {
    return this.returns.returnable(deliveryLineId);
  }

  @Post()
  @RequirePermission('sales.fulfil')
  post(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = postCustomerReturnSchema.parse(body);
    return this.returns.post(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
