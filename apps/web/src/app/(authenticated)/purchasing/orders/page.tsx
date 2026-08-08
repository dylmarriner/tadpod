import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type PurchaseOrder = {
  id: string; orderNumber: string; status: string; totalAmount: string; currency: string;
  supplier: { id: string; code: string; name: string }; createdAt: string;
};

export const metadata = { title: 'Purchase orders' };

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (status === 'CANCELLED') return 'danger';
  if (status === 'DRAFT' || status === 'AWAITING_APPROVAL') return 'warning';
  if (status === 'BILLED' || status === 'CLOSED') return 'success';
  return 'info';
}

export default async function PurchaseOrdersPage() {
  let orders: { items: PurchaseOrder[]; total: number } | null = null;
  let loadError = '';
  try {
    orders = await serverApi<{ items: PurchaseOrder[]; total: number }>('/purchase-orders');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load purchase orders.';
  }

  return <>
    <PageHeader
      kicker="Purchasing"
      title="Purchase orders"
      description="Supplier commitments and receipt progress. A confirmed order is not a payable until its supplier bill is posted."
      actions={<div className="inline">
        <Link className="button button--secondary" href="/purchasing/receipts">Goods receipts</Link>
        <Link className="button button--primary" href="/purchasing/orders/new">New purchase order</Link>
      </div>}
    />
    <Card kicker="Register" title="Orders">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : orders === null || orders.items.length === 0
          ? <EmptyState title="No purchase orders yet" description="Create the first purchase order to begin tracking supplier commitments." action={<Link className="button button--primary" href="/purchasing/orders/new">Create the first order</Link>} />
          : <DataTable label="Purchase orders" headings={['Order', 'Supplier', 'Status', 'Total', 'Created']}>
              {orders.items.map((order) => <tr key={order.id}>
                <td><Link href={`/purchasing/orders/${order.id}`}>{order.orderNumber}</Link></td>
                <td>{order.supplier.code} — {order.supplier.name}</td>
                <td><Badge tone={statusTone(order.status)}>{order.status.replaceAll('_', ' ')}</Badge></td>
                <td data-money>{order.totalAmount} {order.currency}</td>
                <td>{new Date(order.createdAt).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
