import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { VoidInvoiceButton } from '../../../../../components/customer-invoice-forms';
import { serverApi } from '../../../../../lib/server-api';
import { apiUrl, ApiError } from '../../../../../lib/api';

type Line = { id: string; product: { sku: string; name: string }; unitPrice: string; quantity: string; lineTotal: string };
type Invoice = {
  id: string; invoiceNumber: string; status: string; displayStatus: string; currency: string; issueDate: string; dueDate: string; notes: string | null;
  totalAmount: string; appliedAmount: string; outstandingAmount: string;
  customer: { id: string; code: string; name: string };
  salesOrder: { id: string; orderNumber: string };
  createdBy: { displayName: string };
  voidedBy: { displayName: string } | null;
  voidedAt: string | null;
  lines: readonly Line[];
};
type InstallmentLine = { id: string; dueDate: string; amount: string; paidAmount: string };
type InstallmentPlan = { frequency: string; lines: readonly InstallmentLine[] };

export const metadata = { title: 'Customer invoice detail' };

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (status === 'VOIDED' || status === 'OVERDUE') return 'danger';
  if (status === 'UNPAID' || status === 'PARTIALLY_PAID') return 'warning';
  return 'success';
}

export default async function CustomerInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let invoice: Invoice | null = null;
  let installmentPlan: InstallmentPlan | null = null;
  let loadError = '';
  try {
    invoice = await serverApi<Invoice>(`/customer-invoices/${id}`);
    installmentPlan = await serverApi<InstallmentPlan>(`/customer-invoices/${id}/installment-plan`).catch(() => null);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this invoice.';
  }

  if (loadError || !invoice) return <div className="form-message" role="alert">{loadError || 'Invoice not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{invoice.invoiceNumber}</h1>
        <p>{invoice.customer.code} — {invoice.customer.name} · Order <Link href={`/sales/orders/${invoice.salesOrder.id}`}>{invoice.salesOrder.orderNumber}</Link></p>
      </div>
      <div className="inline">
        <a href={`${apiUrl}/documents/customer-invoices/${invoice.id}`} target="_blank" rel="noreferrer">Print</a>
        <Badge tone={statusTone(invoice.displayStatus)}>{invoice.displayStatus.replaceAll('_', ' ')}</Badge>
      </div>
    </header>
    <div className="grid grid--2">
      <Card title="Summary">
        <dl className="definition-list">
          <div><dt>Total</dt><dd>{invoice.totalAmount} {invoice.currency}</dd></div>
          <div><dt>Applied (paid + credited)</dt><dd>{invoice.appliedAmount}</dd></div>
          <div><dt>Outstanding</dt><dd>{invoice.outstandingAmount}</dd></div>
          <div><dt>Issue date</dt><dd>{new Date(invoice.issueDate).toLocaleDateString('en-NZ')}</dd></div>
          <div><dt>Due date</dt><dd>{new Date(invoice.dueDate).toLocaleDateString('en-NZ')}</dd></div>
          <div><dt>Created by</dt><dd>{invoice.createdBy.displayName}</dd></div>
          {invoice.voidedBy ? <div><dt>Voided by</dt><dd>{invoice.voidedBy.displayName}</dd></div> : null}
        </dl>
        {invoice.notes ? <p className="muted">{invoice.notes}</p> : null}
      </Card>
      <Card title="Actions">
        {invoice.status === 'UNPAID' ? <VoidInvoiceButton invoiceId={invoice.id} /> : <p className="muted">Only an unpaid invoice with no payments or credits applied can be voided.</p>}
        <p className="muted" style={{ marginTop: '1rem' }}>
          <Link href={`/sales/payments/new?customerId=${invoice.customer.id}`}>Record a payment</Link> for {invoice.customer.name}.
        </p>
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Lines">
        {invoice.lines.length === 0
          ? <EmptyState title="No lines" description="This invoice has no lines." />
          : <DataTable label="Invoice lines" headings={['Product', 'Unit price', 'Quantity', 'Line total']}>
              {invoice.lines.map((line) => <tr key={line.id}>
                <td><strong>{line.product.sku}</strong><div className="muted">{line.product.name}</div></td>
                <td>{line.unitPrice}</td>
                <td>{line.quantity}</td>
                <td>{line.lineTotal}</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
    {installmentPlan ? <div style={{ marginTop: '1rem' }}>
      <Card title={`Installment plan (${installmentPlan.frequency.toLowerCase()})`}>
        <DataTable label="Installments" headings={['Due date', 'Amount', 'Paid']}>
          {installmentPlan.lines.map((line) => <tr key={line.id}>
            <td>{new Date(line.dueDate).toLocaleDateString('en-NZ')}</td>
            <td>{line.amount}</td>
            <td>{line.paidAmount}</td>
          </tr>)}
        </DataTable>
      </Card>
    </div> : null}
  </>;
}
