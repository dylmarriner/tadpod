import Link from 'next/link';
import { Card, EmptyState } from '@tadpods/ui';
import { CustomerPaymentCustomerSelect, RecordPaymentForm } from '../../../../../components/customer-invoice-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Customer = { id: string; code: string; name: string };

export const metadata = { title: 'Record customer payment' };

export default async function NewCustomerPaymentPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;
  let customers: Customer[] = [];
  let loadError = '';
  try {
    customers = (await serverApi<{ items: Customer[] }>('/customers?active=true&pageSize=100')).items;
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load customers.';
  }

  if (loadError) return <div className="form-message" role="alert">{loadError}</div>;
  if (customers.length === 0) return <EmptyState title="No active customers" description="Create an active customer first." action={<Link href="/customers">Go to customers</Link>} />;

  const selectedCustomerId = customerId && customers.some((customer) => customer.id === customerId) ? customerId : customers[0]!.id;

  return <>
    <header className="page-header">
      <div>
        <h1>Record customer payment</h1>
        <p>The payment is recorded once in full, then allocated across open invoices oldest first.</p>
      </div>
    </header>
    <Card title="Payment">
      <div style={{ marginBottom: '1rem' }}>
        <CustomerPaymentCustomerSelect customers={customers} selectedCustomerId={selectedCustomerId} />
      </div>
      <RecordPaymentForm customerId={selectedCustomerId} />
    </Card>
  </>;
}
