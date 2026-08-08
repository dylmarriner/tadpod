import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Invoice = {
  id: string; invoiceNumber: string; displayStatus: string; totalAmount: string; outstandingAmount: string; currency: string; dueDate: string;
  customer: { id: string; code: string; name: string };
};

export const metadata = { title: 'Customer invoices' };

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (status === 'VOIDED' || status === 'OVERDUE') return 'danger';
  if (status === 'UNPAID' || status === 'PARTIALLY_PAID') return 'warning';
  return 'success';
}

export default async function CustomerInvoicesPage() {
  let invoices: { items: Invoice[]; total: number } | null = null;
  let loadError = '';
  try {
    invoices = await serverApi<{ items: Invoice[]; total: number }>('/customer-invoices');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load customer invoices.';
  }

  return <>
    <PageHeader kicker="Sales" title="Customer invoices" description="Invoices bill delivered-but-uninvoiced quantities from sales orders and expose the outstanding balance at a glance." />
    <Card kicker="Receivables" title="Invoice register">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : invoices === null || invoices.items.length === 0
          ? <EmptyState title="No invoices yet" description="Deliver a sales order, then create its invoice from the order detail page." />
          : <DataTable label="Customer invoices" headings={['Invoice', 'Customer', 'Status', 'Total', 'Outstanding', 'Due']}>
              {invoices.items.map((invoice) => <tr key={invoice.id}>
                <td><Link href={`/sales/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></td>
                <td>{invoice.customer.code} — {invoice.customer.name}</td>
                <td><Badge tone={statusTone(invoice.displayStatus)}>{invoice.displayStatus.replaceAll('_', ' ')}</Badge></td>
                <td data-money>{invoice.totalAmount} {invoice.currency}</td>
                <td data-money>{invoice.outstandingAmount}</td>
                <td>{new Date(invoice.dueDate).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
