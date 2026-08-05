import { Module } from '@nestjs/common';
import { AdjustmentsController } from './adjustments.controller.js';
import { AdjustmentsService } from './adjustments.service.js';
import { InventoryController } from './inventory.controller.js';
import { StockCountsController } from './stock-counts.controller.js';
import { StockCountsService } from './stock-counts.service.js';
import { StockPostingService } from './stock-posting.service.js';
import { StockQueryService } from './stock-query.service.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  controllers: [InventoryController, AdjustmentsController, TransfersController, StockCountsController],
  providers: [StockPostingService, StockQueryService, AdjustmentsService, TransfersService, StockCountsService],
  exports: [StockPostingService, StockQueryService, AdjustmentsService, TransfersService, StockCountsService]
})
export class InventoryModule {}
