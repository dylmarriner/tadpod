import { Module } from '@nestjs/common';
import { CustomerInvoicesController } from './customer-invoices.controller.js';
import { CustomerInvoicesService } from './customer-invoices.service.js';
import { InstallmentPlansService } from './installment-plans.service.js';

@Module({
  controllers: [CustomerInvoicesController],
  providers: [CustomerInvoicesService, InstallmentPlansService],
  exports: [CustomerInvoicesService, InstallmentPlansService]
})
export class CustomerInvoicesModule {}
