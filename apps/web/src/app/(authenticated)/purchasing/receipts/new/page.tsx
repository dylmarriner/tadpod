import Link from 'next/link';
import { Card, EmptyState } from '@tadpods/ui';
import { NewGoodsReceiptForm } from '../../../../../components/goods-receipt-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type OrderLine = {
  id: string;
  product: { id: string; sku: string; name: string };
  orderedQuantity: string;
  receivedQuantity: string;
  outstandingQuantity: string;
};
type PurchaseOrder = { id: string; orderNumber: string; status: string; supplier: { code: string; name: string }; lines: readonly OrderLine[] };
type Warehouse = { id: string; code: string; name: string };

export const metadata = { title: 'Receive goods' };

export default async function NewGoodsReceiptPage({ searchParams }: { searchParams: Promise<{ purchaseOrderId?: string }> }) {
  const { purchaseOrderId } = await searchParams;
  if (!purchaseOrderId) {
    return <EmptyState title="Choose a purchase order" description="Open a confirmed purchase order and use its Receive goods action." action={<Link href="/purchasing/orders">Go to purchase orders</Link>} />;
  }

  let order: PurchaseOrder | null = null;
  let warehouses: Warehouse[] = [];
  let loadError = '';
  try {
    const [orderResponse, warehouseResponse] = await Promise.all([
      serverApi<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}`),
      serverApi<{ items: Warehouse[] }>('/warehouses?status=ACTIVE&pageSize=100')
    ]);
    order = orderResponse;
    warehouses = warehouseResponse.items;
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this purchase order.';
  }

  if (loadError || !order) return <div className="form-message" role="alert">{loadError || 'Purchase order not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>Receive goods — {order.orderNumber}</h1>
        <p>{order.supplier.code} — {order.supplier.name}</p>
      </div>
    </header>
    <Card title="Goods receipt">
      {warehouses.length === 0
        ? <EmptyState title="No active warehouses" description="Create an active warehouse before receiving goods." action={<Link href="/inventory/warehouses">Go to warehouses</Link>} />
        : <NewGoodsReceiptForm purchaseOrderId={order.id} lines={[...order.lines]} warehouses={warehouses} />}
    </Card>
  </>;
}
