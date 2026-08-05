import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  adjustmentProductSearchQuerySchema,
  listAdjustmentsQuerySchema,
  postAdjustmentSchema,
  postOpeningStockSchema
} from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { AdjustmentsService } from './adjustments.service.js';
import type { InventoryRequestContext } from './stock-posting.service.js';

function contextFrom(request: FastifyRequest): InventoryRequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

/**
 * Guided opening-stock entry and mandatory-reason adjustment workflows (Phase 2 Task 3).
 * Every stock-affecting action here is a thin wrapper around `StockPostingService` — posted
 * through `AdjustmentsService`, which shapes movement type and source metadata but performs
 * no locking, idempotency, or negative-stock logic of its own. Reversal reuses the existing
 * generic `POST /inventory/movements/:id/reverse` (Task 2) unchanged — there is no
 * adjustment-specific reversal endpoint here.
 */
@Controller('inventory')
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsService) {}

  @Post('opening-stock')
  @RequirePermission('inventory.write')
  postOpeningStock(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = postOpeningStockSchema.parse(body);
    return this.adjustments.postOpeningStock(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post('adjustments')
  @RequirePermission('inventory.write')
  postAdjustment(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = postAdjustmentSchema.parse(body);
    return this.adjustments.postAdjustment(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get('adjustments')
  @RequirePermission('inventory.read')
  listAdjustments(@Query() query: unknown) {
    return this.adjustments.listAdjustments(listAdjustmentsQuerySchema.parse(query));
  }

  /**
   * Minimal, read-only pickers for the guided opening-stock/adjustment forms. Deliberately
   * narrow (id/code/name only, no CRUD) and namespaced under `/inventory/adjustments` rather
   * than `/products` or `/warehouses` so they do not anticipate or collide with the full
   * product/warehouse API that Phase 2 Task 6 adds separately.
   */
  @Get('adjustments/warehouses')
  @RequirePermission('inventory.read')
  listWarehouseOptions() {
    return this.adjustments.listActiveWarehouses();
  }

  @Get('adjustments/products')
  @RequirePermission('inventory.read')
  listProductOptions(@Query() query: unknown) {
    return this.adjustments.searchActiveProducts(adjustmentProductSearchQuerySchema.parse(query));
  }
}
