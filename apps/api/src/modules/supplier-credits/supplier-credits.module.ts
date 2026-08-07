import { Module } from '@nestjs/common';
import { SupplierCreditsController, SupplierRefundsController } from './supplier-credits.controller.js';
import { SupplierCreditsService } from './supplier-credits.service.js';

@Module({
  controllers: [SupplierCreditsController, SupplierRefundsController],
  providers: [SupplierCreditsService],
  exports: [SupplierCreditsService]
})
export class SupplierCreditsModule {}
