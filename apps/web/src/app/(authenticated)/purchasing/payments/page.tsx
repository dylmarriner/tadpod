import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Payment = { id: string; paymentNumber: string; amount: string; currency: string; method: string; paidAt: string; reversedAt: string | null; supplier: { code: string; name: string } };

export const metadata = { title: 'Supplier payments' };

export default async function SupplierPaymentsPage() {
  let payments: { items: Payment[]; total: number } | null = null;
  let loadError = '';
  try {
    payments = await serverApi<{ items: Payment[]; total: number }>('/supplier-payments');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load supplier payments.';
  }

  return <>
    <PageHeader
      kicker="Purchasing"
      title="Supplier payments"
      description="Payments allocate oldest bill first by default; any unapplied remainder remains as supplier account credit."
      actions={<Link href="/purchasing/payments/new"><Button>Record payment</Button></Link>}
    />
    <Card kicker="Cash paid" title="Payment register">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : payments === null || payments.items.length === 0
          ? <EmptyState title="No payments yet" description="Record the first supplier payment to begin allocating payables." action={<Link href="/purchasing/payments/new"><Button>Record the first payment</Button></Link>} />
          : <DataTable label="Supplier payments" headings={['Payment', 'Supplier', 'Amount', 'Method', 'Paid', 'Status']}>
              {payments.items.map((payment) => <tr key={payment.id}>
                <td><Link href={`/purchasing/payments/${payment.id}`}>{payment.paymentNumber}</Link></td>
                <td>{payment.supplier.code} — {payment.supplier.name}</td>
                <td data-money>{payment.amount} {payment.currency}</td>
                <td>{payment.method}</td>
                <td>{new Date(payment.paidAt).toLocaleDateString('en-NZ')}</td>
                <td><Badge tone={payment.reversedAt ? 'danger' : 'success'}>{payment.reversedAt ? 'Reversed' : 'Posted'}</Badge></td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
