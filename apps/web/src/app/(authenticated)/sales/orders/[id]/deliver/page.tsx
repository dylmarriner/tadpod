import { Card } from '@tadpods/ui';
import { DeliverSalesOrderForm } from '../../../../../../components/sales-order-forms';
import { serverApi } from '../../../../../../lib/server-api';
import { ApiError } from '../../../../../../lib/api';

type Line = { id: string; product: { sku: string; name: string }; outstandingQuantity: string; deliverableQuantity: string };
type SalesOrder = { id: string; orderNumber: string; customer: { code: string; name: string }; lines: readonly Line[] };

export const metadata = { title: 'Deliver sales order' };

export default async function DeliverSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: SalesOrder | null = null;
  let loadError = '';
  try {
    order = await serverApi<SalesOrder>(`/sales-orders/${id}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this sales order.';
  }

  if (loadError || !order) return <div className="form-message" role="alert">{loadError || 'Sales order not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>Deliver — {order.orderNumber}</h1>
        <p>{order.customer.code} — {order.customer.name}</p>
      </div>
    </header>
    <Card title="Delivery">
      <DeliverSalesOrderForm
        salesOrderId={order.id}
        lines={order.lines.map((line) => ({ salesOrderLineId: line.id, label: `${line.product.sku} — ${line.product.name}`, outstandingQuantity: line.outstandingQuantity, deliverableQuantity: line.deliverableQuantity }))}
      />
    </Card>
  </>;
}
