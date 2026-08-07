import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  cancelSalesOrderLineSchema,
  cancelSalesOrderSchema,
  confirmSalesOrderSchema,
  createSalesOrderSchema,
  listSalesOrdersQuerySchema,
  salesOrderAvailabilityQuerySchema,
  updateSalesOrderSchema
} from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { SalesOrdersService, type SalesRequestContext } from './sales-orders.service.js';

function contextFrom(request: FastifyRequest): SalesRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrders: SalesOrdersService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.salesOrders.list(listSalesOrdersQuerySchema.parse(query));
  }

  @Get('availability')
  @RequirePermission('sales.read')
  availability(@Query() query: unknown) {
    return this.salesOrders.availability(salesOrderAvailabilityQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('sales.write')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createSalesOrderSchema.parse(body);
    return this.salesOrders.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('sales.read')
  get(@Param('id') id: string) {
    return this.salesOrders.get(id);
  }

  @Patch(':id')
  @RequirePermission('sales.write')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = updateSalesOrderSchema.parse(body);
    return this.salesOrders.update(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/confirm')
  @RequirePermission('sales.write')
  confirm(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = confirmSalesOrderSchema.parse(body);
    return this.salesOrders.confirm(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/cancel')
  @RequirePermission('sales.write')
  cancel(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = cancelSalesOrderSchema.parse(body ?? {});
    return this.salesOrders.cancel(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/lines/:lineId/cancel')
  @RequirePermission('sales.write')
  cancelLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = cancelSalesOrderLineSchema.parse(body ?? {});
    return this.salesOrders.cancelLine(id, lineId, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/duplicate')
  @RequirePermission('sales.write')
  duplicate(@Param('id') id: string, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.salesOrders.duplicate(id, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
