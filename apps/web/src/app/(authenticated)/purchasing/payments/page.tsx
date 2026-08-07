import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState } from '@tadpods/ui';
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
    <header className="page-header">
      <div>
        <h1>Supplier payments</h1>
        <p>Payments allocate oldest-bill-first by default; any leftover becomes unapplied account credit.</p>
      </div>
      <Link href="/purchasing/payments/new"><Button>Record payment</Button></Link>
    </header>
    <Card title="Payments">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : payments === null || payments.items.length === 0
          ? <EmptyState title="No payments yet" description="Record the first supplier payment above." action={<Link href="/purchasing/payments/new"><Button>Record the first payment</Button></Link>} />
          : <DataTable label="Supplier payments" headings={['Payment', 'Supplier', 'Amount', 'Method', 'Paid', 'Status']}>
              {payments.items.map((payment) => <tr key={payment.id}>
                <td><Link href={`/purchasing/payments/${payment.id}`}>{payment.paymentNumber}</Link></td>
                <td>{payment.supplier.code} — {payment.supplier.name}</td>
                <td>{payment.amount} {payment.currency}</td>
                <td>{payment.method}</td>
                <td>{new Date(payment.paidAt).toLocaleDateString('en-NZ')}</td>
                <td><Badge tone={payment.reversedAt ? 'danger' : 'success'}>{payment.reversedAt ? 'Reversed' : 'Posted'}</Badge></td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
