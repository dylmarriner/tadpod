import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Backorder = {
  id: string; backorderNumber: string; status: string; priority: number; expectedDate: string | null; promisedDate: string | null;
  customer: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  salesOrder: { id: string; orderNumber: string };
  supplier: { id: string; code: string; name: string } | null;
  purchaseOrder: { id: string; orderNumber: string } | null;
};

export const metadata = { title: 'Backorders' };

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (status === 'CANCELLED') return 'danger';
  if (status === 'FULFILLED') return 'success';
  if (status === 'READY_TO_FULFIL') return 'info';
  return 'warning';
}

export default async function BackordersPage() {
  let backorders: { items: Backorder[]; total: number } | null = null;
  let loadError = '';
  try {
    backorders = await serverApi<{ items: Backorder[]; total: number }>('/backorders?pageSize=100');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load backorders.';
  }

  return <>
    <PageHeader kicker="Sales" title="Backorders" description="Confirmed demand waiting on supply, ordered by priority then age and linked to the sales and purchasing records that will resolve it." />
    <Card kicker="Queue" title="Open and recent backorders">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : backorders === null || backorders.items.length === 0
          ? <EmptyState title="No backorders" description="Backorders appear here automatically when a confirmed sales order cannot be fully supplied." />
          : <DataTable label="Backorders" headings={['Backorder', 'Sales order', 'Customer', 'Warehouse', 'Status', 'Priority', 'Supplier', 'Purchase order']}>
              {backorders.items.map((backorder) => <tr key={backorder.id}>
                <td><Link href={`/sales/backorders/${backorder.id}`}>{backorder.backorderNumber}</Link></td>
                <td><Link href={`/sales/orders/${backorder.salesOrder.id}`}>{backorder.salesOrder.orderNumber}</Link></td>
                <td>{backorder.customer.code} — {backorder.customer.name}</td>
                <td>{backorder.warehouse.code}</td>
                <td><Badge tone={statusTone(backorder.status)}>{backorder.status.replaceAll('_', ' ')}</Badge></td>
                <td data-quantity>{backorder.priority}</td>
                <td>{backorder.supplier ? `${backorder.supplier.code} — ${backorder.supplier.name}` : '—'}</td>
                <td>{backorder.purchaseOrder ? <Link href={`/purchasing/orders/${backorder.purchaseOrder.id}`}>{backorder.purchaseOrder.orderNumber}</Link> : '—'}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
