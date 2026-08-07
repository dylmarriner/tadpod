import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createReservationSchema, listReservationsQuerySchema, runReservationAllocationSchema } from '@tadpods/contracts';
import { CurrentUser, RequirePermission, type AuthenticatedUser } from '../../platform.decorators.js';
import { ReservationsService, type SalesRequestContext } from './reservations.service.js';

function contextFrom(request: FastifyRequest): SalesRequestContext {
  return { requestId: request.id, ipAddress: request.ip };
}

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequirePermission('sales.read')
  list(@Query() query: unknown) {
    return this.reservations.list(listReservationsQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('sales.fulfil')
  create(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = createReservationSchema.parse(body);
    return this.reservations.create(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post(':id/release')
  @RequirePermission('sales.fulfil')
  release(@Param('id') id: string, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.reservations.release(id, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post('run-allocation')
  @RequirePermission('sales.fulfil')
  runAllocation(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = runReservationAllocationSchema.parse(body);
    return this.reservations.runAllocation(input, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
