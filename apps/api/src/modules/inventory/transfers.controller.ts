import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  adjustmentProductSearchQuerySchema,
  listTransfersQuerySchema,
  postTransferSchema,
  reverseTransferSchema
} from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { AdjustmentsService } from './adjustments.service.js';
import type { InventoryRequestContext } from './stock-posting.service.js';
import { TransfersService } from './transfers.service.js';

function contextFrom(request: FastifyRequest): InventoryRequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

/**
 * Warehouse transfer workflows (Phase 2 Task 4). Every posting is a thin wrapper around
 * `StockPostingService.postMovements`/`reverseMovements` (Task 2) — this controller and
 * `TransfersService` shape linked out/in movement pairs and read them back, but perform no
 * locking, idempotency, or negative-stock logic themselves.
 */
@Controller('inventory')
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly adjustments: AdjustmentsService
  ) {}

  @Post('transfers')
  @RequirePermission('inventory.write')
  postTransfer(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = postTransferSchema.parse(body);
    return this.transfers.postTransfer(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post('transfers/:transferId/reverse')
  @RequirePermission('inventory.write')
  reverseTransfer(
    @Param('transferId') transferId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const input = reverseTransferSchema.parse(body);
    return this.transfers.reverseTransfer(transferId, input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Get('transfers')
  @RequirePermission('inventory.read')
  listTransfers(@Query() query: unknown) {
    return this.transfers.listTransfers(listTransfersQuerySchema.parse(query));
  }

  /**
   * Read-only pickers for the guided transfer form. Deliberately reuses
   * `AdjustmentsService`'s warehouse/product lookups rather than duplicating them, and stays
   * namespaced under `/inventory/transfers` so it does not anticipate Task 6's canonical
   * `/warehouses`/`/products` API.
   */
  @Get('transfers/warehouses')
  @RequirePermission('inventory.read')
  listWarehouseOptions() {
    return this.adjustments.listActiveWarehouses();
  }

  @Get('transfers/products')
  @RequirePermission('inventory.read')
  listProductOptions(@Query() query: unknown) {
    return this.adjustments.searchActiveProducts(adjustmentProductSearchQuerySchema.parse(query));
  }
}
