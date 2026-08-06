import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { GoodsReceiptsController } from './goods-receipts.controller.js';
import { GoodsReceiptsService } from './goods-receipts.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
  exports: [GoodsReceiptsService]
})
export class GoodsReceiptsModule {}
