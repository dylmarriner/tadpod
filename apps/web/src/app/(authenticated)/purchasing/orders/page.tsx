import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState } from '@tadpods/ui';
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
    <header className="page-header">
      <div>
        <h1>Purchase orders</h1>
        <p>Commitments to suppliers. A confirmed order is not a payable — only a posted supplier bill creates one.</p>
      </div>
      <div className="inline">
        <Link href="/purchasing/receipts"><Button variant="secondary">Goods receipts</Button></Link>
        <Link href="/purchasing/orders/new"><Button>New purchase order</Button></Link>
      </div>
    </header>
    <Card title="Orders">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : orders === null || orders.items.length === 0
          ? <EmptyState title="No purchase orders yet" description="Create the first purchase order above." action={<Link href="/purchasing/orders/new"><Button>Create the first order</Button></Link>} />
          : <DataTable label="Purchase orders" headings={['Order', 'Supplier', 'Status', 'Total', 'Created']}>
              {orders.items.map((order) => <tr key={order.id}>
                <td><Link href={`/purchasing/orders/${order.id}`}>{order.orderNumber}</Link></td>
                <td>{order.supplier.code} — {order.supplier.name}</td>
                <td><Badge tone={statusTone(order.status)}>{order.status.replaceAll('_', ' ')}</Badge></td>
                <td>{order.totalAmount} {order.currency}</td>
                <td>{new Date(order.createdAt).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
