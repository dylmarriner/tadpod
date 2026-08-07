import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState } from '@tadpods/ui';
import { RemoveSupplierAddressButton, SupplierAddressForm, SupplierArchiveToggle } from '../../../../components/supplier-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type SupplierAddress = { id: string; type: 'BILLING' | 'DELIVERY' | 'GENERAL'; addressLine1: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null };
type Supplier = {
  id: string; code: string; name: string; legalName: string | null; taxNumber: string | null; currency: string;
  paymentTermsDays: number; contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  notes: string | null; active: boolean;
};
type SupplierAccount = { amountOwed: string; overdue: string; dueWithin7Days: string; dueWithin30Days: string; unappliedCredit: string; availableCredit: string; receivedNotBilled: string };
type SupplierBillSummary = { id: string; billNumber: string; displayStatus: string; totalAmount: string; outstandingAmount: string; currency: string; dueDate: string };

export const metadata = { title: 'Supplier detail' };

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let supplier: Supplier | null = null;
  let account: SupplierAccount | null = null;
  let addresses: SupplierAddress[] = [];
  let bills: { items: SupplierBillSummary[] } | null = null;
  let loadError = '';
  try {
    [supplier, account, addresses, bills] = await Promise.all([
      serverApi<Supplier>(`/suppliers/${id}`),
      serverApi<SupplierAccount>(`/suppliers/${id}/account`),
      serverApi<SupplierAddress[]>(`/suppliers/${id}/addresses`),
      serverApi<{ items: SupplierBillSummary[] }>(`/supplier-bills?supplierId=${id}&pageSize=10`)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this supplier.';
  }

  if (loadError || !supplier) return <div className="form-message" role="alert">{loadError || 'Supplier not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{supplier.name}</h1>
        <p><strong>{supplier.code}</strong>{supplier.legalName ? ` · ${supplier.legalName}` : ''} · {supplier.currency} · {supplier.paymentTermsDays}-day terms</p>
      </div>
      <div className="inline">
        <Link href={`/purchasing/payments/new?supplierId=${supplier.id}`}><Button variant="secondary">Record payment</Button></Link>
        <Link href={`/suppliers/${supplier.id}/statement`}><Button variant="secondary">Statement</Button></Link>
        <SupplierArchiveToggle supplierId={supplier.id} active={supplier.active} />
      </div>
    </header>
    <div className="grid grid--2">
      <Card title="Account summary">
        {account ? <dl className="definition-list">
          <div><dt>Amount owed</dt><dd>{account.amountOwed}</dd></div>
          <div><dt>Overdue</dt><dd>{account.overdue}</dd></div>
          <div><dt>Due within 7 days</dt><dd>{account.dueWithin7Days}</dd></div>
          <div><dt>Due within 30 days</dt><dd>{account.dueWithin30Days}</dd></div>
          <div><dt>Unapplied credit</dt><dd>{account.unappliedCredit}</dd></div>
          <div><dt>Available credit</dt><dd>{account.availableCredit}</dd></div>
          <div><dt>Received, not billed</dt><dd>{account.receivedNotBilled}</dd></div>
        </dl> : null}
      </Card>
      <Card title="Contact details">
        <dl className="definition-list">
          <div><dt>Status</dt><dd><Badge tone={supplier.active ? 'success' : 'neutral'}>{supplier.active ? 'Active' : 'Inactive'}</Badge></dd></div>
          <div><dt>Tax number</dt><dd>{supplier.taxNumber ?? '—'}</dd></div>
          <div><dt>Contact</dt><dd>{supplier.contactName ?? '—'}</dd></div>
          <div><dt>Email</dt><dd>{supplier.contactEmail ?? '—'}</dd></div>
          <div><dt>Phone</dt><dd>{supplier.contactPhone ?? '—'}</dd></div>
          {supplier.notes ? <div><dt>Notes</dt><dd>{supplier.notes}</dd></div> : null}
        </dl>
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Recent bills">
        {!bills || bills.items.length === 0
          ? <EmptyState title="No bills yet" description="Create a bill from a received purchase order." />
          : <DataTable label="Supplier bills" headings={['Bill', 'Status', 'Total', 'Outstanding', 'Due']}>
              {bills.items.map((bill) => <tr key={bill.id}>
                <td><Link href={`/purchasing/bills/${bill.id}`}>{bill.billNumber}</Link></td>
                <td><Badge tone="info">{bill.displayStatus.replaceAll('_', ' ')}</Badge></td>
                <td>{bill.totalAmount} {bill.currency}</td>
                <td>{bill.outstandingAmount}</td>
                <td>{new Date(bill.dueDate).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
    <div className="grid grid--2" style={{ marginTop: '1rem' }}>
      <Card title="Add address">
        <SupplierAddressForm supplierId={supplier.id} />
      </Card>
      <Card title="Addresses">
        {addresses.length === 0
          ? <EmptyState title="No addresses yet" description="Add a billing, delivery, or general address." />
          : <DataTable label="Supplier addresses" headings={['Type', 'Address', 'City', 'Country', '']}>
              {addresses.map((address) => <tr key={address.id}>
                <td><Badge tone="info">{address.type}</Badge></td>
                <td>{address.addressLine1 ?? '—'}</td>
                <td>{[address.city, address.region, address.postalCode].filter(Boolean).join(', ') || '—'}</td>
                <td>{address.country ?? '—'}</td>
                <td><RemoveSupplierAddressButton supplierId={supplier.id} addressId={address.id} /></td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
