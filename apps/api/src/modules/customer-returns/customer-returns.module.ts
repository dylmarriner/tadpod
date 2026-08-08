import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { CustomerReturnsController } from './customer-returns.controller.js';
import { CustomerReturnsService } from './customer-returns.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [CustomerReturnsController],
  providers: [CustomerReturnsService],
  exports: [CustomerReturnsService]
})
export class CustomerReturnsModule {}
