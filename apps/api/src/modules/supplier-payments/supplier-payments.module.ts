import { Module } from '@nestjs/common';
import { SupplierPaymentsController } from './supplier-payments.controller.js';
import { SupplierPaymentsService } from './supplier-payments.service.js';

@Module({
  controllers: [SupplierPaymentsController],
  providers: [SupplierPaymentsService],
  exports: [SupplierPaymentsService]
})
export class SupplierPaymentsModule {}
