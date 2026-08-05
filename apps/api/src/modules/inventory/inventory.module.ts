import { Module } from '@nestjs/common';
import { AdjustmentsController } from './adjustments.controller.js';
import { AdjustmentsService } from './adjustments.service.js';
import { InventoryController } from './inventory.controller.js';
import { StockPostingService } from './stock-posting.service.js';
import { StockQueryService } from './stock-query.service.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  controllers: [InventoryController, AdjustmentsController, TransfersController],
  providers: [StockPostingService, StockQueryService, AdjustmentsService, TransfersService],
  exports: [StockPostingService, StockQueryService, AdjustmentsService, TransfersService]
})
export class InventoryModule {}
