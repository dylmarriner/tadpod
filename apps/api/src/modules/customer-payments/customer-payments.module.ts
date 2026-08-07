import { Module } from '@nestjs/common';
import { CustomerPaymentsController } from './customer-payments.controller.js';
import { CustomerPaymentsService } from './customer-payments.service.js';

@Module({
  controllers: [CustomerPaymentsController],
  providers: [CustomerPaymentsService],
  exports: [CustomerPaymentsService]
})
export class CustomerPaymentsModule {}
