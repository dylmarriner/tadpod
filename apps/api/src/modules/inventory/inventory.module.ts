import { Module } from '@nestjs/common';
import { AdjustmentsController } from './adjustments.controller.js';
import { AdjustmentsService } from './adjustments.service.js';
import { InventoryController } from './inventory.controller.js';
import { StockPostingService } from './stock-posting.service.js';
import { StockQueryService } from './stock-query.service.js';

@Module({
  controllers: [InventoryController, AdjustmentsController],
  providers: [StockPostingService, StockQueryService, AdjustmentsService],
  exports: [StockPostingService, StockQueryService, AdjustmentsService]
})
export class InventoryModule {}
