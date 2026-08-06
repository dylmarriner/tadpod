import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { loadEnvironment } from '@tadpods/config';
import { AuthenticationGuard, PermissionGuard } from './auth.guards.js';
import { AuditController, AuthController, BrandController, DashboardController, HealthController, RolesController, SequenceController, UsersController } from './controllers.js';
import { HttpErrorFilter } from './http-error.filter.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { WarehousesModule } from './modules/warehouses/warehouses.module.js';
import { PlatformService } from './platform.service.js';
import { APP_ENVIRONMENT } from './platform.tokens.js';

@Module({
  imports: [InventoryModule, ProductsModule, WarehousesModule, SuppliersModule],
  controllers: [HealthController, AuthController, BrandController, DashboardController, UsersController, RolesController, AuditController, SequenceController],
  providers: [
    PlatformService,
    { provide: APP_ENVIRONMENT, useValue: loadEnvironment(process.env) },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: HttpErrorFilter }
  ]
})
export class AppModule {}
