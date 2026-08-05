import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller.js';
import { StockPostingService } from './stock-posting.service.js';
import { StockQueryService } from './stock-query.service.js';

@Module({
  controllers: [InventoryController],
  providers: [StockPostingService, StockQueryService],
  exports: [StockPostingService, StockQueryService]
})
export class InventoryModule {}
