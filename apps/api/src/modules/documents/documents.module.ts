import { Module } from '@nestjs/common';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module.js';
import { GoodsReceiptsModule } from '../goods-receipts/goods-receipts.module.js';
import { CustomerInvoicesModule } from '../customer-invoices/customer-invoices.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { CustomerCreditsModule } from '../customer-credits/customer-credits.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';
import { SupplierPaymentsModule } from '../supplier-payments/supplier-payments.module.js';
import { SupplierCreditsModule } from '../supplier-credits/supplier-credits.module.js';
import { SupplierBillsModule } from '../supplier-bills/supplier-bills.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [
    SalesOrdersModule,
    DeliveriesModule,
    PurchaseOrdersModule,
    GoodsReceiptsModule,
    CustomerInvoicesModule,
    CustomersModule,
    CustomerCreditsModule,
    SuppliersModule,
    SupplierPaymentsModule,
    SupplierCreditsModule,
    SupplierBillsModule
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService]
})
export class DocumentsModule {}
