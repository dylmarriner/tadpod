import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { createWarehouseSchema, listWarehousesQuerySchema, updateWarehouseSchema } from '@tadpods/contracts';
import { RequirePermission } from '../../platform.decorators.js';
import { WarehousesService } from './warehouses.service.js';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermission('inventory.read')
  list(@Query() query: unknown) {
    return this.warehouses.list(listWarehousesQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('inventory.write')
  create(@Body() body: unknown) {
    return this.warehouses.create(createWarehouseSchema.parse(body));
  }

  @Get(':id')
  @RequirePermission('inventory.read')
  get(@Param('id') id: string) {
    return this.warehouses.get(id);
  }

  @Patch(':id')
  @RequirePermission('inventory.write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.warehouses.update(id, updateWarehouseSchema.parse(body));
  }
}
