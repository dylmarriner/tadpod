import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { createSupplierSchema, listSuppliersQuerySchema, similarSupplierNamesQuerySchema, supplierAddressInputSchema, updateSupplierSchema } from '@tadpods/contracts';
import { RequirePermission } from '../../platform.decorators.js';
import { SuppliersService } from './suppliers.service.js';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers.read')
  list(@Query() query: unknown) {
    return this.suppliers.list(listSuppliersQuerySchema.parse(query));
  }

  @Get('similar-names')
  @RequirePermission('suppliers.read')
  similarNames(@Query() query: unknown) {
    const { name } = similarSupplierNamesQuerySchema.parse(query);
    return this.suppliers.findSimilarNames(name);
  }

  @Post()
  @RequirePermission('suppliers.write')
  create(@Body() body: unknown) {
    return this.suppliers.create(createSupplierSchema.parse(body));
  }

  @Get(':id')
  @RequirePermission('suppliers.read')
  get(@Param('id') id: string) {
    return this.suppliers.get(id);
  }

  @Patch(':id')
  @RequirePermission('suppliers.write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.suppliers.update(id, updateSupplierSchema.parse(body));
  }

  @Get(':id/account')
  @RequirePermission('suppliers.read')
  account(@Param('id') id: string) {
    return this.suppliers.account(id);
  }

  @Get(':id/addresses')
  @RequirePermission('suppliers.read')
  listAddresses(@Param('id') id: string) {
    return this.suppliers.listAddresses(id);
  }

  @Post(':id/addresses')
  @RequirePermission('suppliers.write')
  addAddress(@Param('id') id: string, @Body() body: unknown) {
    return this.suppliers.addAddress(id, supplierAddressInputSchema.parse(body));
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermission('suppliers.write')
  removeAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    return this.suppliers.removeAddress(id, addressId);
  }
}
