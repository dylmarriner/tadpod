import { Card, EmptyState } from '@tadpods/ui';
import Link from 'next/link';
import { CreateInvoiceForm } from '../../../../../../components/customer-invoice-forms';
import { serverApi } from '../../../../../../lib/server-api';
import { ApiError } from '../../../../../../lib/api';

type InvoiceableLine = { salesOrderLineId: string; product: { sku: string; name: string }; unitPrice: string; uninvoicedQuantity: string };
type SalesOrder = { id: string; orderNumber: string; customer: { code: string; name: string } };

export const metadata = { title: 'Create invoice' };

export default async function CreateInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: SalesOrder | null = null;
  let lines: InvoiceableLine[] = [];
  let loadError = '';
  try {
    [order, lines] = await Promise.all([
      serverApi<SalesOrder>(`/sales-orders/${id}`),
      serverApi<InvoiceableLine[]>(`/customer-invoices/invoiceable-lines?salesOrderId=${id}`)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this sales order.';
  }

  if (loadError || !order) return <div className="form-message" role="alert">{loadError || 'Sales order not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>Create invoice — {order.orderNumber}</h1>
        <p>{order.customer.code} — {order.customer.name}</p>
      </div>
    </header>
    <Card title="Uninvoiced lines">
      {lines.length === 0
        ? <EmptyState title="Nothing to invoice" description="Every delivered line on this order has already been invoiced." action={<Link href={`/sales/orders/${order.id}`}>Back to order</Link>} />
        : <CreateInvoiceForm salesOrderId={order.id} lines={lines} />}
    </Card>
  </>;
}
