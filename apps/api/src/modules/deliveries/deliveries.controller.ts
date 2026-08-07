import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createDeliverySchema, listDeliveriesQuerySchema, postDeliverySchema, reverseDeliverySchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { DeliveriesService } from './deliveries.service.js';
import type { InventoryRequestContext } from '../inventory/stock-posting.service.js';

function contextFrom(request: FastifyRequest): InventoryRequestContext {
  const userAgent = request.headers['user-agent'];
  return { requestId: request.id, ipAddress: request.ip, ...(typeof userAgent === 'string' ? { userAgent } : {}) };
}

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.deliveries.list(listDeliveriesQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermission('sales.read')
  get(@Param('id') id: string) {
    return this.deliveries.get(id);
  }

  @Post()
  @RequirePermission('sales.fulfil')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createDeliverySchema.parse(body);
    return this.deliveries.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/post')
  @RequirePermission('sales.fulfil')
  post(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = postDeliverySchema.parse(body);
    return this.deliveries.post(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/reverse')
  @RequirePermission('sales.fulfil')
  reverse(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reverseDeliverySchema.parse(body);
    return this.deliveries.reverse(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
