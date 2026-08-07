import { Body, Controller, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RequirePermission, CurrentUser, type AuthenticatedUser } from '../../platform.decorators.js';
import { ImportsService } from './imports.service.js';

const previewSchema = z.object({ csv: z.string().min(1) });
const commitSchema = z.object({ csv: z.string().min(1), idempotencyKey: z.string().trim().min(1).max(200) });

function contextFrom(request: FastifyRequest) {
  return { requestId: request.id, ipAddress: request.ip };
}

/**
 * CSV imports (Phase 6). Every resource follows the same `POST .../preview` (validate, write
 * nothing) then `POST .../commit` (idempotent, requires an `idempotencyKey`) shape.
 */
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('products/preview')
  @RequirePermission('inventory.write')
  previewProducts(@Body() body: unknown) {
    return this.imports.previewProducts(previewSchema.parse(body).csv);
  }

  @Post('products/commit')
  @RequirePermission('inventory.write')
  commitProducts(@Body() body: unknown) {
    const input = commitSchema.parse(body);
    return this.imports.commitProducts(input.csv, input.idempotencyKey);
  }

  @Post('customers/preview')
  @RequirePermission('customers.write')
  previewCustomers(@Body() body: unknown) {
    return this.imports.previewCustomers(previewSchema.parse(body).csv);
  }

  @Post('customers/commit')
  @RequirePermission('customers.write')
  commitCustomers(@Body() body: unknown) {
    const input = commitSchema.parse(body);
    return this.imports.commitCustomers(input.csv, input.idempotencyKey);
  }

  @Post('suppliers/preview')
  @RequirePermission('suppliers.write')
  previewSuppliers(@Body() body: unknown) {
    return this.imports.previewSuppliers(previewSchema.parse(body).csv);
  }

  @Post('suppliers/commit')
  @RequirePermission('suppliers.write')
  commitSuppliers(@Body() body: unknown) {
    const input = commitSchema.parse(body);
    return this.imports.commitSuppliers(input.csv, input.idempotencyKey);
  }

  @Post('opening-balances/preview')
  @RequirePermission('inventory.write')
  previewOpeningBalances(@Body() body: unknown) {
    return this.imports.previewOpeningBalances(previewSchema.parse(body).csv);
  }

  @Post('opening-balances/commit')
  @RequirePermission('inventory.write')
  commitOpeningBalances(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = commitSchema.parse(body);
    return this.imports.commitOpeningBalances(input.csv, input.idempotencyKey, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }

  @Post('payments/preview')
  @RequirePermission('sales.invoice')
  previewPayments(@Body() body: unknown) {
    return this.imports.previewPayments(previewSchema.parse(body).csv);
  }

  @Post('payments/commit')
  @RequirePermission('sales.invoice')
  commitPayments(@Body() body: unknown, @Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const input = commitSchema.parse(body);
    return this.imports.commitPayments(input.csv, input.idempotencyKey, { id: user.id, permissions: user.permissions }, contextFrom(request));
  }
}
