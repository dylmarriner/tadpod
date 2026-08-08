import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { CustomerCreateForm } from '../../../components/customer-forms';
import { serverApi } from '../../../lib/server-api';
import { ApiError } from '../../../lib/api';

type Customer = { id: string; code: string; name: string; currency: string; paymentTermsDays: number; creditLimit: string; contactEmail: string | null; active: boolean };

export const metadata = { title: 'Customers' };

export default async function CustomersPage() {
  let customers: { items: Customer[]; total: number } | null = null;
  let loadError = '';
  try {
    customers = await serverApi<{ items: Customer[]; total: number }>('/customers');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load customers.';
  }

  return <>
    <PageHeader kicker="Accounts" title="Customers" description="Customer master records, contact details, credit limits and payment terms." />
    {loadError ? <div className="form-message" role="alert">{loadError}</div> : <>
      <Card kicker="New account" title="Create customer">
        <CustomerCreateForm />
      </Card>
      <div style={{ marginTop: '1rem' }}>
        <Card kicker="Register" title="All customers">
          {customers === null || customers.items.length === 0
            ? <EmptyState title="No customers yet" description="Create the first customer above." />
            : <DataTable label="Customers" headings={['Code', 'Name', 'Currency', 'Payment terms', 'Credit limit', 'Contact', 'Status']}>
                {customers.items.map((customer) => <tr key={customer.id}>
                  <td><strong>{customer.code}</strong></td>
                  <td><Link href={`/customers/${customer.id}`}>{customer.name}</Link></td>
                  <td>{customer.currency}</td>
                  <td>{customer.paymentTermsDays} days</td>
                  <td data-money>{customer.creditLimit === '0.00' ? 'No limit' : customer.creditLimit}</td>
                  <td>{customer.contactEmail ?? '—'}</td>
                  <td><Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Active' : 'Inactive'}</Badge></td>
                </tr>)}
              </DataTable>}
        </Card>
      </div>
    </>}
  </>;
}
