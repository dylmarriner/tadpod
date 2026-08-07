import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { createCustomerSchema, customerAddressInputSchema, listCustomersQuerySchema, similarCustomerNamesQuerySchema, updateCustomerSchema } from '@tadpods/contracts';
import { RequirePermission } from '../../platform.decorators.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission('customers.read')
  list(@Query() query: unknown) {
    return this.customers.list(listCustomersQuerySchema.parse(query));
  }

  @Get('similar-names')
  @RequirePermission('customers.read')
  similarNames(@Query() query: unknown) {
    const { name } = similarCustomerNamesQuerySchema.parse(query);
    return this.customers.findSimilarNames(name);
  }

  @Post()
  @RequirePermission('customers.write')
  create(@Body() body: unknown) {
    return this.customers.create(createCustomerSchema.parse(body));
  }

  @Get(':id')
  @RequirePermission('customers.read')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Patch(':id')
  @RequirePermission('customers.write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.customers.update(id, updateCustomerSchema.parse(body));
  }

  @Get(':id/account')
  @RequirePermission('customers.read')
  account(@Param('id') id: string) {
    return this.customers.account(id);
  }

  @Get(':id/addresses')
  @RequirePermission('customers.read')
  listAddresses(@Param('id') id: string) {
    return this.customers.listAddresses(id);
  }

  @Post(':id/addresses')
  @RequirePermission('customers.write')
  addAddress(@Param('id') id: string, @Body() body: unknown) {
    return this.customers.addAddress(id, customerAddressInputSchema.parse(body));
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermission('customers.write')
  removeAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    return this.customers.removeAddress(id, addressId);
  }
}
