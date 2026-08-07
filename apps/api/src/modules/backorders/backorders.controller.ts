import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  adjustBackorderLineQuantitySchema,
  allocateIncomingStockSchema,
  cancelBackorderLineSchema,
  cancelBackorderSchema,
  generatePurchaseOrderFromBackordersSchema,
  listBackordersQuerySchema,
  planBackorderAllocationQuerySchema
} from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { BackordersService, type SalesRequestContext } from './backorders.service.js';

function contextFrom(request: FastifyRequest): SalesRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('backorders')
export class BackordersController {
  constructor(private readonly backorders: BackordersService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.backorders.list(listBackordersQuerySchema.parse(query));
  }

  @Get('plan-allocation')
  @RequirePermission('sales.read')
  planAllocation(@Query() query: unknown) {
    return this.backorders.planAllocation(planBackorderAllocationQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermission('sales.read')
  get(@Param('id') id: string) {
    return this.backorders.get(id);
  }

  @Post(':id/cancel')
  @RequirePermission('sales.fulfil')
  cancel(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = cancelBackorderSchema.parse(body ?? {});
    return this.backorders.cancel(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/lines/:lineId/cancel')
  @RequirePermission('sales.fulfil')
  cancelLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = cancelBackorderLineSchema.parse(body ?? {});
    return this.backorders.cancelLine(id, lineId, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/lines/:lineId/adjust-quantity')
  @RequirePermission('sales.fulfil')
  adjustLineQuantity(@Param('id') id: string, @Param('lineId') lineId: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = adjustBackorderLineQuantitySchema.parse(body);
    return this.backorders.adjustLineQuantity(id, lineId, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post('allocate-incoming')
  @RequirePermission('sales.fulfil')
  allocateIncoming(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = allocateIncomingStockSchema.parse(body);
    return this.backorders.allocateIncoming(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post('generate-purchase-order')
  @RequirePermission('purchasing.write')
  generatePurchaseOrder(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = generatePurchaseOrderFromBackordersSchema.parse(body);
    return this.backorders.generatePurchaseOrder(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
