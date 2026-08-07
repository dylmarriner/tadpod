import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { loadEnvironment } from '@tadpods/config';
import { AuthenticationGuard, PermissionGuard } from './auth.guards.js';
import { AuditController, AuthController, BrandController, DashboardController, HealthController, RolesController, SequenceController, UsersController } from './controllers.js';
import { HttpErrorFilter } from './http-error.filter.js';
import { GoodsReceiptsModule } from './modules/goods-receipts/goods-receipts.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { SalesOrdersModule } from './modules/sales-orders/sales-orders.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { DeliveriesModule } from './modules/deliveries/deliveries.module.js';
import { BackordersModule } from './modules/backorders/backorders.module.js';
import { CustomerInvoicesModule } from './modules/customer-invoices/customer-invoices.module.js';
import { CustomerPaymentsModule } from './modules/customer-payments/customer-payments.module.js';
import { CustomerCreditsModule } from './modules/customer-credits/customer-credits.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { WarehousesModule } from './modules/warehouses/warehouses.module.js';
import { PlatformService } from './platform.service.js';
import { APP_ENVIRONMENT } from './platform.tokens.js';

@Module({
  imports: [
    InventoryModule,
    ProductsModule,
    WarehousesModule,
    SuppliersModule,
    PurchaseOrdersModule,
    GoodsReceiptsModule,
    CustomersModule,
    SalesOrdersModule,
    ReservationsModule,
    DeliveriesModule,
    BackordersModule,
    CustomerInvoicesModule,
    CustomerPaymentsModule,
    CustomerCreditsModule,
    ReportsModule,
    DocumentsModule,
    ImportsModule
  ],
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
