import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createGoodsReceiptSchema, listGoodsReceiptsQuerySchema, reverseGoodsReceiptSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { GoodsReceiptsService } from './goods-receipts.service.js';
import type { InventoryRequestContext } from '../inventory/stock-posting.service.js';

function contextFrom(request: FastifyRequest): InventoryRequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly goodsReceipts: GoodsReceiptsService) {}

  @Get()
  @RequirePermission('purchasing.read')
  list(@Query() query: unknown) {
    return this.goodsReceipts.list(listGoodsReceiptsQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermission('purchasing.read')
  get(@Param('id') id: string) {
    return this.goodsReceipts.get(id);
  }

  @Post()
  @RequirePermission('purchasing.write')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createGoodsReceiptSchema.parse(body);
    return this.goodsReceipts.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/reverse')
  @RequirePermission('purchasing.write')
  reverse(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = reverseGoodsReceiptSchema.parse(body);
    return this.goodsReceipts.reverse(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
