import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { PurchaseOrderActions } from '../../../../../components/purchase-order-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Line = {
  id: string; product: { id: string; sku: string; name: string }; unitCost: string; orderedQuantity: string;
  receivedQuantity: string; billedQuantity: string; outstandingQuantity: string; unbilledQuantity: string; lineTotal: string;
};
type PurchaseOrder = {
  id: string; orderNumber: string; status: string; currency: string; notes: string | null; totalAmount: string;
  supplier: { id: string; code: string; name: string };
  createdBy: { id: string; displayName: string; email: string };
  approvedBy: { id: string; displayName: string; email: string } | null;
  submittedAt: string | null; approvedAt: string | null; confirmedAt: string | null; cancelledAt: string | null; closedAt: string | null;
  lines: readonly Line[];
};
type CurrentUser = { permissions: string[] };

export const metadata = { title: 'Purchase order detail' };

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: PurchaseOrder | null = null;
  let currentUser: CurrentUser | null = null;
  let loadError = '';
  try {
    [order, currentUser] = await Promise.all([serverApi<PurchaseOrder>(`/purchase-orders/${id}`), serverApi<CurrentUser>('/me')]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this purchase order.';
  }

  if (loadError || !order) return <div className="form-message" role="alert">{loadError || 'Purchase order not found.'}</div>;

  const canApprove = Boolean(currentUser?.permissions.includes('*') || currentUser?.permissions.includes('purchasing.approve'));

  return <>
    <header className="page-header">
      <div>
        <h1>{order.orderNumber}</h1>
        <p>{order.supplier.code} — {order.supplier.name} · {order.currency} · Total {order.totalAmount}</p>
      </div>
      <Badge tone="info">{order.status.replaceAll('_', ' ')}</Badge>
    </header>
    <div className="grid grid--2">
      <Card title="Actions">
        <PurchaseOrderActions id={order.id} status={order.status} canApprove={canApprove} />
      </Card>
      <Card title="Timeline">
        <dl className="definition-list">
          <div><dt>Created by</dt><dd>{order.createdBy.displayName}</dd></div>
          {order.submittedAt ? <div><dt>Submitted</dt><dd>{new Date(order.submittedAt).toLocaleString('en-NZ')}</dd></div> : null}
          {order.approvedBy ? <div><dt>Approved by</dt><dd>{order.approvedBy.displayName}</dd></div> : null}
          {order.confirmedAt ? <div><dt>Confirmed</dt><dd>{new Date(order.confirmedAt).toLocaleString('en-NZ')}</dd></div> : null}
          {order.cancelledAt ? <div><dt>Cancelled</dt><dd>{new Date(order.cancelledAt).toLocaleString('en-NZ')}</dd></div> : null}
          {order.closedAt ? <div><dt>Closed</dt><dd>{new Date(order.closedAt).toLocaleString('en-NZ')}</dd></div> : null}
        </dl>
        {order.notes ? <p className="muted">{order.notes}</p> : null}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Lines">
        {order.lines.length === 0
          ? <EmptyState title="No lines" description="This order has no lines." />
          : <DataTable label="Purchase order lines" headings={['Product', 'Unit cost', 'Ordered', 'Received', 'Outstanding', 'Billed', 'Unbilled', 'Line total']}>
              {order.lines.map((line) => <tr key={line.id}>
                <td><strong>{line.product.sku}</strong><div className="muted">{line.product.name}</div></td>
                <td>{line.unitCost}</td>
                <td>{line.orderedQuantity}</td>
                <td>{line.receivedQuantity}</td>
                <td>{line.outstandingQuantity}</td>
                <td>{line.billedQuantity}</td>
                <td>{line.unbilledQuantity}</td>
                <td>{line.lineTotal}</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
