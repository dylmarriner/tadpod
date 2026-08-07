import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { CancelSalesOrderLineButton, SalesOrderActions } from '../../../../../components/sales-order-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Line = {
  id: string; product: { id: string; sku: string; name: string }; unitPrice: string; orderedQuantity: string;
  reservedQuantity: string; deliveredQuantity: string; cancelledQuantity: string; backorderedQuantity: string;
  outstandingQuantity: string; unreservedQuantity: string; deliverableQuantity: string; lineTotal: string;
  stockOnHand?: string; availableStock?: string;
};
type SalesOrder = {
  id: string; orderNumber: string; status: string; invoicingStatus: string; currency: string; priority: number;
  promisedDate: string | null; customerReference: string | null; notes: string | null; totalAmount: string;
  customer: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  createdBy: { id: string; displayName: string; email: string };
  confirmedBy: { id: string; displayName: string; email: string } | null;
  confirmedAt: string | null; cancelledAt: string | null; closedAt: string | null;
  lines: readonly Line[];
};
type Backorder = { id: string; backorderNumber: string; status: string; salesOrder: { id: string } };
type Delivery = { id: string; deliveryNumber: string; status: string; postedAt: string | null };

export const metadata = { title: 'Sales order detail' };

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: SalesOrder | null = null;
  let backorders: { items: Backorder[] } | null = null;
  let deliveries: { items: Delivery[] } | null = null;
  let loadError = '';
  try {
    order = await serverApi<SalesOrder>(`/sales-orders/${id}`);
    [backorders, deliveries] = await Promise.all([
      serverApi<{ items: Backorder[] }>(`/backorders?customerId=${order.customer.id}&pageSize=100`),
      serverApi<{ items: Delivery[] }>(`/deliveries?salesOrderId=${id}&pageSize=100`)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this sales order.';
  }

  if (loadError || !order) return <div className="form-message" role="alert">{loadError || 'Sales order not found.'}</div>;

  const relatedBackorders = (backorders?.items ?? []).filter((backorder) => backorder.salesOrder.id === order!.id);

  return <>
    <header className="page-header">
      <div>
        <h1>{order.orderNumber}</h1>
        <p>{order.customer.code} — {order.customer.name} · {order.warehouse.code} · {order.currency} · Total {order.totalAmount}</p>
      </div>
      <Badge tone="info">{order.status.replaceAll('_', ' ')}</Badge>
    </header>
    <div className="grid grid--2">
      <Card title="Actions">
        <SalesOrderActions id={order.id} status={order.status} />
      </Card>
      <Card title="Timeline">
        <dl className="definition-list">
          <div><dt>Created by</dt><dd>{order.createdBy.displayName}</dd></div>
          <div><dt>Priority</dt><dd>{order.priority}</dd></div>
          {order.promisedDate ? <div><dt>Promised date</dt><dd>{new Date(order.promisedDate).toLocaleDateString('en-NZ')}</dd></div> : null}
          {order.confirmedBy ? <div><dt>Confirmed by</dt><dd>{order.confirmedBy.displayName}</dd></div> : null}
          {order.confirmedAt ? <div><dt>Confirmed</dt><dd>{new Date(order.confirmedAt).toLocaleString('en-NZ')}</dd></div> : null}
          {order.cancelledAt ? <div><dt>Cancelled</dt><dd>{new Date(order.cancelledAt).toLocaleString('en-NZ')}</dd></div> : null}
          {order.closedAt ? <div><dt>Closed</dt><dd>{new Date(order.closedAt).toLocaleString('en-NZ')}</dd></div> : null}
        </dl>
        {order.customerReference ? <p className="muted">Reference: {order.customerReference}</p> : null}
        {order.notes ? <p className="muted">{order.notes}</p> : null}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Lines">
        {order.lines.length === 0
          ? <EmptyState title="No lines" description="This order has no lines." />
          : <DataTable label="Sales order lines" headings={['Product', 'Unit price', 'Ordered', 'Reserved', 'Backordered', 'Delivered', 'Cancelled', 'Outstanding', 'Line total', '']}>
              {order.lines.map((line) => <tr key={line.id}>
                <td><strong>{line.product.sku}</strong><div className="muted">{line.product.name}</div></td>
                <td>{line.unitPrice}</td>
                <td>{line.orderedQuantity}</td>
                <td>{line.reservedQuantity}</td>
                <td>{line.backorderedQuantity}</td>
                <td>{line.deliveredQuantity}</td>
                <td>{line.cancelledQuantity}</td>
                <td>{line.outstandingQuantity}</td>
                <td>{line.lineTotal}</td>
                <td><CancelSalesOrderLineButton orderId={order.id} lineId={line.id} outstandingQuantity={line.outstandingQuantity} /></td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
    <div className="grid grid--2" style={{ marginTop: '1rem' }}>
      <Card title="Deliveries">
        {!deliveries || deliveries.items.length === 0
          ? <EmptyState title="No deliveries yet" description="Use the Deliver action once stock is reserved." />
          : <DataTable label="Deliveries" headings={['Delivery', 'Status', 'Posted']}>
              {deliveries.items.map((delivery) => <tr key={delivery.id}>
                <td>{delivery.deliveryNumber}</td>
                <td><Badge tone={delivery.status === 'POSTED' ? 'success' : delivery.status === 'REVERSED' ? 'danger' : 'neutral'}>{delivery.status}</Badge></td>
                <td>{delivery.postedAt ? new Date(delivery.postedAt).toLocaleString('en-NZ') : '—'}</td>
              </tr>)}
            </DataTable>}
      </Card>
      <Card title="Related backorders">
        {relatedBackorders.length === 0
          ? <EmptyState title="No backorders" description="Every line on this order is either fully reserved or fully delivered." />
          : <DataTable label="Backorders" headings={['Backorder', 'Status']}>
              {relatedBackorders.map((backorder) => <tr key={backorder.id}>
                <td><Link href={`/sales/backorders/${backorder.id}`}>{backorder.backorderNumber}</Link></td>
                <td><Badge tone="warning">{backorder.status.replaceAll('_', ' ')}</Badge></td>
              </tr>)}
            </DataTable>}
        <p className="muted">See the <Link href="/sales/backorders">backorder dashboard</Link> for every backorder linked to this customer, product, or warehouse.</p>
      </Card>
    </div>
  </>;
}
