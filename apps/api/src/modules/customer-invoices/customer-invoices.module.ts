import { Module } from '@nestjs/common';
import { CustomerInvoicesController } from './customer-invoices.controller.js';
import { CustomerInvoicesService } from './customer-invoices.service.js';

@Module({
  controllers: [CustomerInvoicesController],
  providers: [CustomerInvoicesService],
  exports: [CustomerInvoicesService]
})
export class CustomerInvoicesModule {}
