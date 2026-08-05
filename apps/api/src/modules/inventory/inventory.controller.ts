import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  listStockMovementsQuerySchema,
  postStockMovementSchema,
  reverseStockMovementSchema,
  stockOnHandQuerySchema
} from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { StockPostingService, type InventoryRequestContext } from './stock-posting.service.js';
import { StockQueryService } from './stock-query.service.js';

function contextFrom(request: FastifyRequest): InventoryRequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

/**
 * Exposes only the generic stock-posting primitive and generic queries — proving that
 * `StockPostingService`/`StockQueryService` work, not opening-stock/adjustment/transfer/
 * stock-count specific endpoints. Those business workflows are Phase 2 Tasks 3-5 and post
 * through `POST /inventory/movements` with their own `sourceType`.
 */
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly posting: StockPostingService,
    private readonly query: StockQueryService
  ) {}

  @Get('stock-on-hand')
  @RequirePermission('inventory.read')
  stockOnHand(@Query() query: unknown) {
    return this.query.stockOnHand(stockOnHandQuerySchema.parse(query));
  }

  @Get('movements')
  @RequirePermission('inventory.read')
  listMovements(@Query() query: unknown) {
    return this.query.listMovements(listStockMovementsQuerySchema.parse(query));
  }

  @Post('movements')
  @RequirePermission('inventory.write')
  postMovement(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const input = postStockMovementSchema.parse(body);
    return this.posting.postMovement(
      input,
      { id: user.id, permissions: user.permissions },
      contextFrom(request)
    );
  }

  @Post('movements/:id/reverse')
  @RequirePermission('inventory.write')
  reverseMovement(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const input = reverseStockMovementSchema.parse(body);
    return this.posting.reverseMovement(
      id,
      input,
      { id: user.id, permissions: user.permissions },
      contextFrom(request)
    );
  }
}
