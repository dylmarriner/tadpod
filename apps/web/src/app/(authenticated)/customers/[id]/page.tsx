import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState } from '@tadpods/ui';
import { CustomerAddressForm, CustomerArchiveToggle, RemoveCustomerAddressButton } from '../../../../components/customer-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type CustomerAddress = { id: string; type: 'BILLING' | 'DELIVERY' | 'GENERAL'; addressLine1: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null };
type Customer = {
  id: string; code: string; name: string; legalName: string | null; taxNumber: string | null; currency: string;
  paymentTermsDays: number; creditLimit: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  notes: string | null; active: boolean;
};
type CustomerAccount = { amountOwed: string; overdue: string; creditLimit: string; availableCredit: string };
type SalesOrderSummary = { id: string; orderNumber: string; status: string; totalAmount: string; createdAt: string };

export const metadata = { title: 'Customer detail' };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customer: Customer | null = null;
  let account: CustomerAccount | null = null;
  let addresses: CustomerAddress[] = [];
  let orders: { items: SalesOrderSummary[] } | null = null;
  let loadError = '';
  try {
    [customer, account, addresses, orders] = await Promise.all([
      serverApi<Customer>(`/customers/${id}`),
      serverApi<CustomerAccount>(`/customers/${id}/account`),
      serverApi<CustomerAddress[]>(`/customers/${id}/addresses`),
      serverApi<{ items: SalesOrderSummary[] }>(`/sales-orders?customerId=${id}&pageSize=10`)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this customer.';
  }

  if (loadError || !customer) return <div className="form-message" role="alert">{loadError || 'Customer not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{customer.name}</h1>
        <p><strong>{customer.code}</strong>{customer.legalName ? ` · ${customer.legalName}` : ''} · {customer.currency} · {customer.paymentTermsDays}-day terms</p>
      </div>
      <div className="inline">
        <Link href={`/sales/orders/new?customerId=${customer.id}`}><Button variant="secondary">New sales order</Button></Link>
        <CustomerArchiveToggle customerId={customer.id} active={customer.active} />
      </div>
    </header>
    <div className="grid grid--2">
      <Card title="Account summary">
        {account ? <dl className="definition-list">
          <div><dt>Amount owed</dt><dd>{account.amountOwed}</dd></div>
          <div><dt>Overdue</dt><dd>{account.overdue}</dd></div>
          <div><dt>Credit limit</dt><dd>{account.creditLimit === '0.00' ? 'No limit' : account.creditLimit}</dd></div>
          <div><dt>Available credit</dt><dd>{account.availableCredit === '0.00' ? 'No limit' : account.availableCredit}</dd></div>
        </dl> : null}
        <p className="muted">Customer invoices, payments, and statements are added in a later phase — the owed/overdue figures above read zero until then.</p>
      </Card>
      <Card title="Contact details">
        <dl className="definition-list">
          <div><dt>Status</dt><dd><Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Active' : 'Inactive'}</Badge></dd></div>
          <div><dt>Tax number</dt><dd>{customer.taxNumber ?? '—'}</dd></div>
          <div><dt>Contact</dt><dd>{customer.contactName ?? '—'}</dd></div>
          <div><dt>Email</dt><dd>{customer.contactEmail ?? '—'}</dd></div>
          <div><dt>Phone</dt><dd>{customer.contactPhone ?? '—'}</dd></div>
          {customer.notes ? <div><dt>Notes</dt><dd>{customer.notes}</dd></div> : null}
        </dl>
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Recent sales orders">
        {!orders || orders.items.length === 0
          ? <EmptyState title="No sales orders yet" description="Create a sales order for this customer." />
          : <DataTable label="Sales orders" headings={['Order', 'Status', 'Total', 'Created']}>
              {orders.items.map((order) => <tr key={order.id}>
                <td><Link href={`/sales/orders/${order.id}`}>{order.orderNumber}</Link></td>
                <td><Badge tone="info">{order.status.replaceAll('_', ' ')}</Badge></td>
                <td>{order.totalAmount}</td>
                <td>{new Date(order.createdAt).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
    <div className="grid grid--2" style={{ marginTop: '1rem' }}>
      <Card title="Add address">
        <CustomerAddressForm customerId={customer.id} />
      </Card>
      <Card title="Addresses">
        {addresses.length === 0
          ? <EmptyState title="No addresses yet" description="Add a billing, delivery, or general address." />
          : <DataTable label="Customer addresses" headings={['Type', 'Address', 'City', 'Country', '']}>
              {addresses.map((address) => <tr key={address.id}>
                <td><Badge tone="info">{address.type}</Badge></td>
                <td>{address.addressLine1 ?? '—'}</td>
                <td>{[address.city, address.region, address.postalCode].filter(Boolean).join(', ') || '—'}</td>
                <td>{address.country ?? '—'}</td>
                <td><RemoveCustomerAddressButton customerId={customer.id} addressId={address.id} /></td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
