import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { ApplyCreditButton, CreateRefundForm } from '../../../../../components/customer-invoice-forms';
import { serverApi } from '../../../../../lib/server-api';
import { apiUrl, ApiError } from '../../../../../lib/api';

type Application = { id: string; customerInvoiceId: string; invoiceNumber: string; amount: string; reversedAt: string | null };
type Credit = {
  id: string; creditNumber: string; sourceType: string; amount: string; remaining: string; currency: string; notes: string | null;
  customer: { id: string; code: string; name: string };
  createdBy: { displayName: string };
  applications: readonly Application[];
};

export const metadata = { title: 'Customer credit detail' };

export default async function CustomerCreditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let credit: Credit | null = null;
  let loadError = '';
  try {
    credit = await serverApi<Credit>(`/customer-credits/${id}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this credit.';
  }

  if (loadError || !credit) return <div className="form-message" role="alert">{loadError || 'Credit not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{credit.creditNumber}</h1>
        <p>{credit.customer.code} — {credit.customer.name} · {credit.amount} {credit.currency}</p>
      </div>
      <div className="inline">
        <a href={`${apiUrl}/documents/customer-credits/${credit.id}`} target="_blank" rel="noreferrer">Print</a>
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
          <ApplyCreditButton creditId={credit.id} />
          <CreateRefundForm creditId={credit.id} maxAmount={credit.remaining} />
        </div> : <p className="muted">This credit has no remaining balance.</p>}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Applications">
        {credit.applications.length === 0
          ? <EmptyState title="Not yet applied" description="This credit has not been applied to any invoice." />
          : <DataTable label="Credit applications" headings={['Invoice', 'Amount', 'Status']}>
              {credit.applications.map((application) => <tr key={application.id}>
                <td><Link href={`/sales/invoices/${application.customerInvoiceId}`}>{application.invoiceNumber}</Link></td>
                <td>{application.amount}</td>
                <td><Badge tone={application.reversedAt ? 'neutral' : 'success'}>{application.reversedAt ? 'Reversed' : 'Active'}</Badge></td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
