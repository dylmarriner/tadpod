import { Controller, Get, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { RequirePermission } from '../../platform.decorators.js';
import { ReportsService, type DateRangeQuery } from './reports.service.js';
import { toCsv } from './csv.js';

const reportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

function respond<Row extends Record<string, string | number | boolean>>(response: FastifyReply, format: 'json' | 'csv', filename: string, rows: readonly Row[]): Row[] | string {
  if (format !== 'csv') return [...rows];
  const headings = rows.length > 0 ? Object.keys(rows[0]!) : [];
  response.header('Content-Type', 'text/csv; charset=utf-8');
  response.header('Content-Disposition', `attachment; filename="${filename}.csv"`);
  return toCsv(headings, rows.map((row) => headings.map((heading) => String(row[heading]))));
}

function dateRange(from: string | undefined, to: string | undefined): DateRangeQuery {
  return { ...(from ? { from: new Date(from) } : {}), ...(to ? { to: new Date(to) } : {}) };
}

/**
 * Reports (Phase 6). Every endpoint accepts `?format=csv` for a spreadsheet-compatible export
 * alongside its default JSON response — the roadmap's "export filters saved in URLs" rule is
 * satisfied by these being ordinary `GET` query parameters, so a report's URL is itself the
 * saved filter.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('aged-receivables')
  @RequirePermission('reports.read')
  async agedReceivables(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format } = reportQuerySchema.parse(query);
    return respond(response, format, 'aged-receivables', await this.reports.agedReceivables());
  }

  @Get('aged-payables')
  @RequirePermission('reports.read')
  async agedPayables(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format } = reportQuerySchema.parse(query);
    return respond(response, format, 'aged-payables', await this.reports.agedPayables());
  }

  @Get('received-not-billed')
  @RequirePermission('reports.read')
  async receivedNotBilled(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format } = reportQuerySchema.parse(query);
    return respond(response, format, 'received-not-billed', await this.reports.receivedNotBilled());
  }

  @Get('purchase-commitments')
  @RequirePermission('reports.read')
  async purchaseCommitments(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format } = reportQuerySchema.parse(query);
    return respond(response, format, 'purchase-commitments', await this.reports.purchaseCommitments());
  }

  @Get('supplier-bills')
  @RequirePermission('reports.read')
  async supplierBillRegister(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'supplier-bills', await this.reports.supplierBillRegister(dateRange(from, to)));
  }

  @Get('supplier-payments')
  @RequirePermission('reports.read')
  async supplierPaymentRegister(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'supplier-payments', await this.reports.supplierPaymentRegister(dateRange(from, to)));
  }

  @Get('supplier-credits')
  @RequirePermission('reports.read')
  async supplierCreditsRegister(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format } = reportQuerySchema.parse(query);
    return respond(response, format, 'supplier-credits', await this.reports.supplierCreditsRegister());
  }

  @Get('customer-invoices')
  @RequirePermission('reports.read')
  async customerInvoiceRegister(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'customer-invoices', await this.reports.customerInvoiceRegister(dateRange(from, to)));
  }

  @Get('customer-payments')
  @RequirePermission('reports.read')
  async customerPaymentRegister(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'customer-payments', await this.reports.customerPaymentRegister(dateRange(from, to)));
  }

  @Get('customer-credits')
  @RequirePermission('reports.read')
  async customerCreditsRegister(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format } = reportQuerySchema.parse(query);
    return respond(response, format, 'customer-credits', await this.reports.customerCreditsRegister());
  }

  @Get('low-stock')
  @RequirePermission('reports.read')
  async lowStock(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format } = reportQuerySchema.parse(query);
    return respond(response, format, 'low-stock', await this.reports.lowStock());
  }

  @Get('sales-by-customer')
  @RequirePermission('reports.read')
  async salesByCustomer(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'sales-by-customer', await this.reports.salesByCustomer(dateRange(from, to)));
  }

  @Get('sales-by-product')
  @RequirePermission('reports.read')
  async salesByProduct(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'sales-by-product', await this.reports.salesByProduct(dateRange(from, to)));
  }

  @Get('tax-summary')
  @RequirePermission('reports.read')
  async taxSummary(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'tax-summary', await this.reports.taxSummary(dateRange(from, to)));
  }

  @Get('cash-received')
  @RequirePermission('reports.read')
  async cashReceived(@Query() query: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const { format, from, to } = reportQuerySchema.parse(query);
    return respond(response, format, 'cash-received', await this.reports.cashReceived(dateRange(from, to)));
  }
}
