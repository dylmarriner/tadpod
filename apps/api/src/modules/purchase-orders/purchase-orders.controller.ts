import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { cancelPurchaseOrderSchema, createPurchaseOrderSchema, listPurchaseOrdersQuerySchema, updatePurchaseOrderSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { PurchaseOrdersService, type PurchasingRequestContext } from './purchase-orders.service.js';

function contextFrom(request: FastifyRequest): PurchasingRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  @RequirePermission('purchasing.read')
  list(@Query() query: unknown) {
    return this.purchaseOrders.list(listPurchaseOrdersQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('purchasing.write')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createPurchaseOrderSchema.parse(body);
    return this.purchaseOrders.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get(':id')
  @RequirePermission('purchasing.read')
  get(@Param('id') id: string) {
    return this.purchaseOrders.get(id);
  }

  @Patch(':id')
  @RequirePermission('purchasing.write')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = updatePurchaseOrderSchema.parse(body);
    return this.purchaseOrders.update(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/submit')
  @RequirePermission('purchasing.write')
  submit(@Param('id') id: string, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrders.submit(id, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/approve')
  @RequirePermission('purchasing.write')
  approve(@Param('id') id: string, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrders.approve(id, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/confirm')
  @RequirePermission('purchasing.write')
  confirm(@Param('id') id: string, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrders.confirm(id, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/cancel')
  @RequirePermission('purchasing.write')
  cancel(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = cancelPurchaseOrderSchema.parse(body ?? {});
    return this.purchaseOrders.cancel(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/duplicate')
  @RequirePermission('purchasing.write')
  duplicate(@Param('id') id: string, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrders.duplicate(id, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
