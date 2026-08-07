import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { AdjustBackorderLineQuantityForm, CancelBackorderButton, CancelBackorderLineButton, GeneratePurchaseOrderForm } from '../../../../../components/backorder-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type BackorderLine = {
  id: string; salesOrderLineId: string; product: { id: string; sku: string; name: string };
  quantity: string; allocatedQuantity: string; fulfilledQuantity: string; cancelledQuantity: string; openQuantity: string;
  purchaseOrderLineId: string | null;
};
type Backorder = {
  id: string; backorderNumber: string; status: string; priority: number; expectedDate: string | null; promisedDate: string | null;
  notes: string | null; createdAt: string;
  customer: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  salesOrder: { id: string; orderNumber: string };
  supplier: { id: string; code: string; name: string } | null;
  purchaseOrder: { id: string; orderNumber: string } | null;
  createdBy: { id: string; displayName: string; email: string };
  cancelledAt: string | null; fulfilledAt: string | null;
  lines: readonly BackorderLine[];
};
type Supplier = { id: string; code: string; name: string; active: boolean };

export const metadata = { title: 'Backorder detail' };

export default async function BackorderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let backorder: Backorder | null = null;
  let suppliers: Supplier[] = [];
  let loadError = '';
  try {
    [backorder, suppliers] = await Promise.all([
      serverApi<Backorder>(`/backorders/${id}`),
      serverApi<{ items: Supplier[] }>('/suppliers?active=true&pageSize=100').then((response) => response.items)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this backorder.';
  }

  if (loadError || !backorder) return <div className="form-message" role="alert">{loadError || 'Backorder not found.'}</div>;

  const openLineIds = backorder.lines.filter((line) => Number(line.openQuantity) > 0).map((line) => line.id);
  const cancellable = backorder.status !== 'CANCELLED' && backorder.status !== 'FULFILLED';

  return <>
    <header className="page-header">
      <div>
        <h1>{backorder.backorderNumber}</h1>
        <p>{backorder.customer.code} — {backorder.customer.name} · {backorder.warehouse.code} · Priority {backorder.priority}</p>
      </div>
      <Badge tone={backorder.status === 'CANCELLED' ? 'danger' : backorder.status === 'FULFILLED' ? 'success' : 'warning'}>{backorder.status.replaceAll('_', ' ')}</Badge>
    </header>
    <div className="grid grid--2">
      <Card title="Source and supply">
        <dl className="definition-list">
          <div><dt>Sales order</dt><dd><Link href={`/sales/orders/${backorder.salesOrder.id}`}>{backorder.salesOrder.orderNumber}</Link></dd></div>
          <div><dt>Supplier</dt><dd>{backorder.supplier ? `${backorder.supplier.code} — ${backorder.supplier.name}` : 'Not yet assigned'}</dd></div>
          <div><dt>Purchase order</dt><dd>{backorder.purchaseOrder ? <Link href={`/purchasing/orders/${backorder.purchaseOrder.id}`}>{backorder.purchaseOrder.orderNumber}</Link> : 'Not yet raised'}</dd></div>
          {backorder.expectedDate ? <div><dt>Expected availability</dt><dd>{new Date(backorder.expectedDate).toLocaleDateString('en-NZ')}</dd></div> : null}
          {backorder.promisedDate ? <div><dt>Promised date</dt><dd>{new Date(backorder.promisedDate).toLocaleDateString('en-NZ')}</dd></div> : null}
          <div><dt>Created by</dt><dd>{backorder.createdBy.displayName}</dd></div>
          {backorder.cancelledAt ? <div><dt>Cancelled</dt><dd>{new Date(backorder.cancelledAt).toLocaleString('en-NZ')}</dd></div> : null}
          {backorder.fulfilledAt ? <div><dt>Fulfilled</dt><dd>{new Date(backorder.fulfilledAt).toLocaleString('en-NZ')}</dd></div> : null}
        </dl>
        {backorder.notes ? <p className="muted">{backorder.notes}</p> : null}
      </Card>
      <Card title="Actions">
        {cancellable ? <div className="form-stack">
          <CancelBackorderButton backorderId={backorder.id} />
          {!backorder.purchaseOrder && openLineIds.length > 0 ? <>
            <p className="muted">Generate a purchase order covering the open lines below.</p>
            <GeneratePurchaseOrderForm supplierOptions={suppliers} backorderLineIds={openLineIds} />
          </> : null}
        </div> : <p className="muted">This backorder is {backorder.status.toLowerCase()} — no further action is needed.</p>}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Lines">
        {backorder.lines.length === 0
          ? <EmptyState title="No lines" description="This backorder has no lines." />
          : <DataTable label="Backorder lines" headings={['Product', 'Quantity', 'Allocated (incoming)', 'Fulfilled', 'Cancelled', 'Open', 'Adjust', '']}>
              {backorder.lines.map((line) => <tr key={line.id}>
                <td><strong>{line.product.sku}</strong><div className="muted">{line.product.name}</div></td>
                <td>{line.quantity}</td>
                <td>{line.allocatedQuantity}</td>
                <td>{line.fulfilledQuantity}</td>
                <td>{line.cancelledQuantity}</td>
                <td>{line.openQuantity}</td>
                <td>{cancellable && Number(line.openQuantity) > 0 ? <AdjustBackorderLineQuantityForm backorderId={backorder.id} lineId={line.id} currentQuantity={line.quantity} /> : '—'}</td>
                <td><CancelBackorderLineButton backorderId={backorder.id} lineId={line.id} openQuantity={line.openQuantity} /></td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
