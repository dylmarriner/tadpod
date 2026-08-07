import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { ReverseSupplierPaymentButton } from '../../../../../components/supplier-bill-forms';
import { serverApi } from '../../../../../lib/server-api';
import { apiUrl, ApiError } from '../../../../../lib/api';

type Allocation = { id: string; supplierBillId: string; billNumber: string; amount: string; reversedAt: string | null };
type Payment = {
  id: string; paymentNumber: string; amount: string; currency: string; method: string; reference: string | null;
  paidAt: string; notes: string | null; reversedAt: string | null; unappliedAmount: string;
  supplier: { id: string; code: string; name: string };
  createdBy: { displayName: string };
  allocations: readonly Allocation[];
};

export const metadata = { title: 'Supplier payment detail' };

export default async function SupplierPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let payment: Payment | null = null;
  let loadError = '';
  try {
    payment = await serverApi<Payment>(`/supplier-payments/${id}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this payment.';
  }

  if (loadError || !payment) return <div className="form-message" role="alert">{loadError || 'Payment not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{payment.paymentNumber}</h1>
        <p>{payment.supplier.code} — {payment.supplier.name} · {payment.amount} {payment.currency} via {payment.method}</p>
      </div>
      <div className="inline">
        <a href={`${apiUrl}/documents/supplier-payments/${payment.id}`} target="_blank" rel="noreferrer">Print remittance</a>
        <Badge tone={payment.reversedAt ? 'danger' : 'success'}>{payment.reversedAt ? 'Reversed' : 'Posted'}</Badge>
      </div>
    </header>
    <div className="grid grid--2">
      <Card title="Summary">
        <dl className="definition-list">
          <div><dt>Paid</dt><dd>{new Date(payment.paidAt).toLocaleString('en-NZ')}</dd></div>
          <div><dt>Reference</dt><dd>{payment.reference ?? '—'}</dd></div>
          <div><dt>Recorded by</dt><dd>{payment.createdBy.displayName}</dd></div>
          <div><dt>Unapplied (credit)</dt><dd>{payment.unappliedAmount}</dd></div>
        </dl>
        {payment.notes ? <p className="muted">{payment.notes}</p> : null}
      </Card>
      <Card title="Actions">
        {payment.reversedAt ? <p className="muted">This payment has already been reversed.</p> : <ReverseSupplierPaymentButton paymentId={payment.id} />}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Allocations">
        {payment.allocations.length === 0
          ? <EmptyState title="No allocations" description="This payment was recorded entirely as unapplied credit." />
          : <DataTable label="Payment allocations" headings={['Bill', 'Amount', 'Status']}>
              {payment.allocations.map((allocation) => <tr key={allocation.id}>
                <td><Link href={`/purchasing/bills/${allocation.supplierBillId}`}>{allocation.billNumber}</Link></td>
                <td>{allocation.amount}</td>
                <td><Badge tone={allocation.reversedAt ? 'neutral' : 'success'}>{allocation.reversedAt ? 'Reversed' : 'Active'}</Badge></td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
