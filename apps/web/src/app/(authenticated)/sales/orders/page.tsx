import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type SalesOrder = {
  id: string; orderNumber: string; status: string; totalAmount: string; currency: string;
  customer: { id: string; code: string; name: string }; createdAt: string;
};

export const metadata = { title: 'Sales orders' };

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (status === 'CANCELLED') return 'danger';
  if (status === 'DRAFT') return 'warning';
  if (status === 'BACKORDERED' || status === 'PARTIALLY_ALLOCATED' || status === 'PARTIALLY_DELIVERED') return 'warning';
  if (status === 'DELIVERED' || status === 'CLOSED') return 'success';
  return 'info';
}

export default async function SalesOrdersPage() {
  let orders: { items: SalesOrder[]; total: number } | null = null;
  let loadError = '';
  try {
    orders = await serverApi<{ items: SalesOrder[]; total: number }>('/sales-orders');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load sales orders.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Sales orders</h1>
        <p>Customer demand. Confirming reserves what stock is available now and backorders the rest.</p>
      </div>
      <div className="inline">
        <Link href="/sales/backorders"><Button variant="secondary">Backorders</Button></Link>
        <Link href="/sales/orders/new"><Button>New sales order</Button></Link>
      </div>
    </header>
    <Card title="Orders">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : orders === null || orders.items.length === 0
          ? <EmptyState title="No sales orders yet" description="Create the first sales order above." action={<Link href="/sales/orders/new"><Button>Create the first order</Button></Link>} />
          : <DataTable label="Sales orders" headings={['Order', 'Customer', 'Status', 'Total', 'Created']}>
              {orders.items.map((order) => <tr key={order.id}>
                <td><Link href={`/sales/orders/${order.id}`}>{order.orderNumber}</Link></td>
                <td>{order.customer.code} — {order.customer.name}</td>
                <td><Badge tone={statusTone(order.status)}>{order.status.replaceAll('_', ' ')}</Badge></td>
                <td>{order.totalAmount} {order.currency}</td>
                <td>{new Date(order.createdAt).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
