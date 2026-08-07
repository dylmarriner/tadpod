import { Card, EmptyState } from '@tadpods/ui';
import Link from 'next/link';
import { CreateSupplierBillForm } from '../../../../../../components/supplier-bill-forms';
import { serverApi } from '../../../../../../lib/server-api';
import { ApiError } from '../../../../../../lib/api';

type BillableLine = { purchaseOrderLineId: string; product: { sku: string; name: string }; unitCost: string; unbilledQuantity: string };
type PurchaseOrder = { id: string; orderNumber: string; supplier: { code: string; name: string } };

export const metadata = { title: 'Create bill' };

export default async function CreateSupplierBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: PurchaseOrder | null = null;
  let lines: BillableLine[] = [];
  let loadError = '';
  try {
    [order, lines] = await Promise.all([
      serverApi<PurchaseOrder>(`/purchase-orders/${id}`),
      serverApi<BillableLine[]>(`/supplier-bills/billable-lines?purchaseOrderId=${id}`)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this purchase order.';
  }

  if (loadError || !order) return <div className="form-message" role="alert">{loadError || 'Purchase order not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>Create bill — {order.orderNumber}</h1>
        <p>{order.supplier.code} — {order.supplier.name}</p>
      </div>
    </header>
    <Card title="Unbilled lines">
      {lines.length === 0
        ? <EmptyState title="Nothing to bill" description="Every received line on this order has already been billed." action={<Link href={`/purchasing/orders/${order.id}`}>Back to order</Link>} />
        : <CreateSupplierBillForm purchaseOrderId={order.id} lines={lines} />}
    </Card>
  </>;
}
