import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { createProductSchema, listProductsQuerySchema, productCategoryInputSchema, updateProductSchema } from '@tadpods/contracts';
import { RequirePermission } from '../../platform.decorators.js';
import { ProductsService } from './products.service.js';

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  @RequirePermission('inventory.read')
  list(@Query() query: unknown) {
    return this.products.list(listProductsQuerySchema.parse(query));
  }

  @Post('products')
  @RequirePermission('inventory.write')
  create(@Body() body: unknown) {
    return this.products.create(createProductSchema.parse(body));
  }

  @Get('products/:id')
  @RequirePermission('inventory.read')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Patch('products/:id')
  @RequirePermission('inventory.write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.products.update(id, updateProductSchema.parse(body));
  }

  @Post('products/:id/archive')
  @RequirePermission('inventory.write')
  archive(@Param('id') id: string) {
    return this.products.archive(id);
  }

  @Get('tax-rates')
  @RequirePermission('inventory.read')
  listTaxRates() {
    return this.products.listTaxRates();
  }

  @Get('product-categories')
  @RequirePermission('inventory.read')
  listCategories() {
    return this.products.listCategories();
  }

  @Post('product-categories')
  @RequirePermission('inventory.write')
  createCategory(@Body() body: unknown) {
    return this.products.createCategory(productCategoryInputSchema.parse(body));
  }
}
