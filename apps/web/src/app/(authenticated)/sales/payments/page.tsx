import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Payment = { id: string; paymentNumber: string; amount: string; currency: string; method: string; receivedAt: string; reversedAt: string | null; customer: { code: string; name: string } };

export const metadata = { title: 'Customer payments' };

export default async function CustomerPaymentsPage() {
  let payments: { items: Payment[]; total: number } | null = null;
  let loadError = '';
  try {
    payments = await serverApi<{ items: Payment[]; total: number }>('/customer-payments');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load customer payments.';
  }

  return <>
    <PageHeader
      kicker="Sales"
      title="Customer payments"
      description="Payments allocate oldest invoice first by default; any unapplied remainder stays on the customer account as credit."
      actions={<Link className="button button--primary" href="/sales/payments/new">Record payment</Link>}
    />
    <Card kicker="Cash received" title="Payment register">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : payments === null || payments.items.length === 0
          ? <EmptyState title="No payments yet" description="Record the first customer payment to begin allocating receivables." action={<Link className="button button--primary" href="/sales/payments/new">Record the first payment</Link>} />
          : <DataTable label="Customer payments" headings={['Payment', 'Customer', 'Amount', 'Method', 'Received', 'Status']}>
              {payments.items.map((payment) => <tr key={payment.id}>
                <td><Link href={`/sales/payments/${payment.id}`}>{payment.paymentNumber}</Link></td>
                <td>{payment.customer.code} — {payment.customer.name}</td>
                <td data-money>{payment.amount} {payment.currency}</td>
                <td>{payment.method}</td>
                <td>{new Date(payment.receivedAt).toLocaleDateString('en-NZ')}</td>
                <td><Badge tone={payment.reversedAt ? 'danger' : 'success'}>{payment.reversedAt ? 'Reversed' : 'Posted'}</Badge></td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
