import { Controller, Get, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { RequirePermission } from '../../platform.decorators.js';
import { DocumentsService } from './documents.service.js';

function html(response: FastifyReply, body: string): string {
  response.header('Content-Type', 'text/html; charset=utf-8');
  return `<!doctype html>${body}`;
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('sales-orders/:id')
  @RequirePermission('sales.read')
  async salesOrder(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.salesOrder(id));
  }

  @Get('deliveries/:id')
  @RequirePermission('sales.read')
  async deliveryNote(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.deliveryNote(id));
  }

  @Get('purchase-orders/:id')
  @RequirePermission('purchasing.read')
  async purchaseOrder(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.purchaseOrder(id));
  }

  @Get('goods-receipts/:id')
  @RequirePermission('purchasing.read')
  async goodsReceivedNote(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.goodsReceivedNote(id));
  }

  @Get('customer-invoices/:id')
  @RequirePermission('sales.read')
  async customerInvoice(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.customerInvoice(id));
  }

  @Get('customer-credits/:id')
  @RequirePermission('sales.read')
  async creditNote(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.creditNote(id));
  }

  @Get('customers/:id/statement')
  @RequirePermission('customers.read')
  async customerStatement(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.customerStatement(id));
  }

  @Get('supplier-bills/:id')
  @RequirePermission('purchasing.read')
  async supplierBill(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.supplierBill(id));
  }

  @Get('customer-refunds/:id')
  @RequirePermission('sales.read')
  async customerRefundConfirmation(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.customerRefundConfirmation(id));
  }

  @Get('supplier-payments/:id')
  @RequirePermission('purchasing.read')
  async supplierRemittance(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.supplierRemittance(id));
  }

  @Get('supplier-credits/:id')
  @RequirePermission('purchasing.read')
  async supplierCreditNote(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.supplierCreditNote(id));
  }

  @Get('suppliers/:id/statement')
  @RequirePermission('purchasing.read')
  async supplierStatement(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.supplierStatement(id));
  }

  @Get('supplier-refunds/:id')
  @RequirePermission('purchasing.read')
  async supplierRefundConfirmation(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    return html(response, await this.documents.supplierRefundConfirmation(id));
  }
}
