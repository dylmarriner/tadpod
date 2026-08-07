import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';
import { CustomerPaymentsModule } from '../customer-payments/customer-payments.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [ProductsModule, CustomersModule, SuppliersModule, CustomerPaymentsModule, InventoryModule],
  controllers: [ImportsController],
  providers: [ImportsService]
})
export class ImportsModule {}
