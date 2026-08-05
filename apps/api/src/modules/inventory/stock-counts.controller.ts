import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  createStockCountSchema,
  listStockCountsQuerySchema,
  postStockCountSchema,
  updateStockCountLineSchema
} from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import type { InventoryRequestContext } from './stock-posting.service.js';
import { StockCountsService } from './stock-counts.service.js';

function contextFrom(request: FastifyRequest): InventoryRequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

/**
 * Stock count workflows (Phase 2 Task 5). Posting is a thin wrapper around
 * `StockPostingService.postMovements` (Task 2/4) via `StockCountsService` — this controller
 * performs no locking, idempotency, or negative-stock logic itself.
 */
@Controller('inventory/stock-counts')
export class StockCountsController {
  constructor(private readonly stockCounts: StockCountsService) {}

  @Post()
  @RequirePermission('inventory.write')
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = createStockCountSchema.parse(body);
    return this.stockCounts.create(input, { id: user.id, permissions: user.permissions });
  }

  @Get()
  @RequirePermission('inventory.read')
  listStockCounts(@Query() query: unknown) {
    return this.stockCounts.listStockCounts(listStockCountsQuerySchema.parse(query));
  }

  /** Read-only pickers for the guided "new stock count" form, namespaced to avoid anticipating Task 6's canonical API. */
  @Get('warehouses')
  @RequirePermission('inventory.read')
  listWarehouseOptions() {
    return this.stockCounts.listActiveWarehouses();
  }

  @Get('categories')
  @RequirePermission('inventory.read')
  listCategoryOptions() {
    return this.stockCounts.listCategories();
  }

  @Get(':id')
  @RequirePermission('inventory.read')
  get(@Param('id') id: string) {
    return this.stockCounts.get(id);
  }

  @Patch('lines/:lineId')
  @RequirePermission('inventory.write')
  updateLine(@Param('lineId') lineId: string, @Body() body: unknown) {
    const input = updateStockCountLineSchema.parse(body);
    return this.stockCounts.updateLine(lineId, input);
  }

  @Post(':id/post')
  @RequirePermission('inventory.write')
  post(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = postStockCountSchema.parse(body);
    return this.stockCounts.post(id, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
