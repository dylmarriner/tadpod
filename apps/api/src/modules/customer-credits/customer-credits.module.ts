import { Module } from '@nestjs/common';
import { CustomerCreditsController, CustomerRefundsController } from './customer-credits.controller.js';
import { CustomerCreditsService } from './customer-credits.service.js';

@Module({
  controllers: [CustomerCreditsController, CustomerRefundsController],
  providers: [CustomerCreditsService],
  exports: [CustomerCreditsService]
})
export class CustomerCreditsModule {}
