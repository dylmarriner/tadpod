import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { ApplySupplierCreditButton, CreateSupplierRefundForm } from '../../../../../components/supplier-bill-forms';
import { serverApi } from '../../../../../lib/server-api';
import { apiUrl, ApiError } from '../../../../../lib/api';

type Application = { id: string; supplierBillId: string; billNumber: string; amount: string; reversedAt: string | null };
type Credit = {
  id: string; creditNumber: string; sourceType: string; amount: string; remaining: string; currency: string; notes: string | null;
  supplier: { id: string; code: string; name: string };
  createdBy: { displayName: string };
  applications: readonly Application[];
};

export const metadata = { title: 'Supplier credit detail' };

export default async function SupplierCreditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let credit: Credit | null = null;
  let loadError = '';
  try {
    credit = await serverApi<Credit>(`/supplier-credits/${id}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this credit.';
  }

  if (loadError || !credit) return <div className="form-message" role="alert">{loadError || 'Credit not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{credit.creditNumber}</h1>
        <p>{credit.supplier.code} — {credit.supplier.name} · {credit.amount} {credit.currency}</p>
      </div>
      <div className="inline">
        <a href={`${apiUrl}/documents/supplier-credits/${credit.id}`} target="_blank" rel="noreferrer">Print</a>
        <Badge tone="info">{credit.sourceType}</Badge>
      </div>
    </header>
    <div className="grid grid--2">
      <Card title="Summary">
        <dl className="definition-list">
          <div><dt>Original amount</dt><dd>{credit.amount}</dd></div>
          <div><dt>Remaining</dt><dd>{credit.remaining}</dd></div>
          <div><dt>Created by</dt><dd>{credit.createdBy.displayName}</dd></div>
        </dl>
        {credit.notes ? <p className="muted">{credit.notes}</p> : null}
      </Card>
      <Card title="Actions">
        {Number(credit.remaining) > 0 ? <div className="form-stack">
          <ApplySupplierCreditButton creditId={credit.id} />
          <CreateSupplierRefundForm creditId={credit.id} maxAmount={credit.remaining} />
        </div> : <p className="muted">This credit has no remaining balance.</p>}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Applications">
        {credit.applications.length === 0
          ? <EmptyState title="Not yet applied" description="This credit has not been applied to any bill." />
          : <DataTable label="Credit applications" headings={['Bill', 'Amount', 'Status']}>
              {credit.applications.map((application) => <tr key={application.id}>
                <td><Link href={`/purchasing/bills/${application.supplierBillId}`}>{application.billNumber}</Link></td>
                <td>{application.amount}</td>
                <td><Badge tone={application.reversedAt ? 'neutral' : 'success'}>{application.reversedAt ? 'Reversed' : 'Active'}</Badge></td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
