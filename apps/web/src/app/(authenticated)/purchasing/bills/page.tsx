import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Bill = {
  id: string; billNumber: string; displayStatus: string; totalAmount: string; outstandingAmount: string; currency: string; dueDate: string;
  supplier: { id: string; code: string; name: string };
};

export const metadata = { title: 'Supplier bills' };

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (status === 'VOIDED' || status === 'OVERDUE') return 'danger';
  if (status === 'UNPAID' || status === 'PARTIALLY_PAID') return 'warning';
  return 'success';
}

export default async function SupplierBillsPage() {
  let bills: { items: Bill[]; total: number } | null = null;
  let loadError = '';
  try {
    bills = await serverApi<{ items: Bill[]; total: number }>('/supplier-bills');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load supplier bills.';
  }

  return <>
    <PageHeader kicker="Purchasing" title="Supplier bills" description="Bills turn received-but-unbilled purchase quantities into payables and show the remaining amount due." />
    <Card kicker="Payables" title="Bill register">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : bills === null || bills.items.length === 0
          ? <EmptyState title="No bills yet" description="Receive a purchase order, then create the supplier bill from its detail page." />
          : <DataTable label="Supplier bills" headings={['Bill', 'Supplier', 'Status', 'Total', 'Outstanding', 'Due']}>
              {bills.items.map((bill) => <tr key={bill.id}>
                <td><Link href={`/purchasing/bills/${bill.id}`}>{bill.billNumber}</Link></td>
                <td>{bill.supplier.code} — {bill.supplier.name}</td>
                <td><Badge tone={statusTone(bill.displayStatus)}>{bill.displayStatus.replaceAll('_', ' ')}</Badge></td>
                <td data-money>{bill.totalAmount} {bill.currency}</td>
                <td data-money>{bill.outstandingAmount}</td>
                <td>{new Date(bill.dueDate).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
