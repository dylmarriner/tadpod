import { Module } from '@nestjs/common';
import { BackordersController } from './backorders.controller.js';
import { BackordersService } from './backorders.service.js';

@Module({
  controllers: [BackordersController],
  providers: [BackordersService],
  exports: [BackordersService]
})
export class BackordersModule {}
