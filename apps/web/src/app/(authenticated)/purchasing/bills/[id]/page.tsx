import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { VoidSupplierBillButton } from '../../../../../components/supplier-bill-forms';
import { serverApi } from '../../../../../lib/server-api';
import { apiUrl, ApiError } from '../../../../../lib/api';

type Line = { id: string; product: { sku: string; name: string }; unitCost: string; quantity: string; lineTotal: string };
type Bill = {
  id: string; billNumber: string; status: string; displayStatus: string; currency: string; issueDate: string; dueDate: string; notes: string | null;
  totalAmount: string; appliedAmount: string; outstandingAmount: string;
  supplier: { id: string; code: string; name: string };
  purchaseOrder: { id: string; orderNumber: string };
  createdBy: { displayName: string };
  voidedBy: { displayName: string } | null;
  voidedAt: string | null;
  lines: readonly Line[];
};

export const metadata = { title: 'Supplier bill detail' };

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (status === 'VOIDED' || status === 'OVERDUE') return 'danger';
  if (status === 'UNPAID' || status === 'PARTIALLY_PAID') return 'warning';
  return 'success';
}

export default async function SupplierBillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let bill: Bill | null = null;
  let loadError = '';
  try {
    bill = await serverApi<Bill>(`/supplier-bills/${id}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this bill.';
  }

  if (loadError || !bill) return <div className="form-message" role="alert">{loadError || 'Bill not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{bill.billNumber}</h1>
        <p>{bill.supplier.code} — {bill.supplier.name} · Order <Link href={`/purchasing/orders/${bill.purchaseOrder.id}`}>{bill.purchaseOrder.orderNumber}</Link></p>
      </div>
      <Badge tone={statusTone(bill.displayStatus)}>{bill.displayStatus.replaceAll('_', ' ')}</Badge>
    </header>
    <p><a href={`${apiUrl}/documents/supplier-bills/${bill.id}`} target="_blank" rel="noreferrer">Print</a></p>
    <div className="grid grid--2">
      <Card title="Summary">
        <dl className="definition-list">
          <div><dt>Total</dt><dd>{bill.totalAmount} {bill.currency}</dd></div>
          <div><dt>Applied (paid + credited)</dt><dd>{bill.appliedAmount}</dd></div>
          <div><dt>Outstanding</dt><dd>{bill.outstandingAmount}</dd></div>
          <div><dt>Issue date</dt><dd>{new Date(bill.issueDate).toLocaleDateString('en-NZ')}</dd></div>
          <div><dt>Due date</dt><dd>{new Date(bill.dueDate).toLocaleDateString('en-NZ')}</dd></div>
          <div><dt>Created by</dt><dd>{bill.createdBy.displayName}</dd></div>
          {bill.voidedBy ? <div><dt>Voided by</dt><dd>{bill.voidedBy.displayName}</dd></div> : null}
        </dl>
        {bill.notes ? <p className="muted">{bill.notes}</p> : null}
      </Card>
      <Card title="Actions">
        {bill.status === 'UNPAID' ? <VoidSupplierBillButton billId={bill.id} /> : <p className="muted">Only an unpaid bill with no payments or credits applied can be voided.</p>}
        <p className="muted" style={{ marginTop: '1rem' }}>
          <Link href={`/purchasing/payments/new?supplierId=${bill.supplier.id}`}>Record a payment</Link> for {bill.supplier.name}.
        </p>
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Lines">
        {bill.lines.length === 0
          ? <EmptyState title="No lines" description="This bill has no lines." />
          : <DataTable label="Bill lines" headings={['Product', 'Unit cost', 'Quantity', 'Line total']}>
              {bill.lines.map((line) => <tr key={line.id}>
                <td><strong>{line.product.sku}</strong><div className="muted">{line.product.name}</div></td>
                <td>{line.unitCost}</td>
                <td>{line.quantity}</td>
                <td>{line.lineTotal}</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
