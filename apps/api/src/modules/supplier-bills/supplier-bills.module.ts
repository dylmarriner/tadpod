import { Module } from '@nestjs/common';
import { SupplierBillsController } from './supplier-bills.controller.js';
import { SupplierBillsService } from './supplier-bills.service.js';

@Module({
  controllers: [SupplierBillsController],
  providers: [SupplierBillsService],
  exports: [SupplierBillsService]
})
export class SupplierBillsModule {}
