import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { ReverseGoodsReceiptAction } from '../../../../../components/goods-receipt-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Line = {
  id: string; purchaseOrderLineId: string; product: { id: string; sku: string; name: string };
  receivedQuantity: string; rejectedQuantity: string; acceptedQuantity: string;
};
type GoodsReceipt = {
  id: string; receiptNumber: string; notes: string | null; reversedAt: string | null; createdAt: string;
  purchaseOrder: { id: string; orderNumber: string };
  warehouse: { id: string; code: string; name: string };
  receivedBy: { id: string; displayName: string; email: string };
  lines: readonly Line[];
};

export const metadata = { title: 'Goods receipt detail' };

export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let receipt: GoodsReceipt | null = null;
  let loadError = '';
  try {
    receipt = await serverApi<GoodsReceipt>(`/goods-receipts/${id}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this goods receipt.';
  }

  if (loadError || !receipt) return <div className="form-message" role="alert">{loadError || 'Goods receipt not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>{receipt.receiptNumber}</h1>
        <p>
          <Link href={`/purchasing/orders/${receipt.purchaseOrder.id}`}>{receipt.purchaseOrder.orderNumber}</Link>
          {' '}· {receipt.warehouse.code} — {receipt.warehouse.name} · Received by {receipt.receivedBy.displayName}
        </p>
      </div>
      <Badge tone={receipt.reversedAt ? 'danger' : 'success'}>{receipt.reversedAt ? 'Reversed' : 'Posted'}</Badge>
    </header>
    <div className="grid grid--2">
      <Card title="Actions">
        {receipt.reversedAt
          ? <p className="muted">Reversed {new Date(receipt.reversedAt).toLocaleString('en-NZ')}</p>
          : <ReverseGoodsReceiptAction id={receipt.id} />}
      </Card>
      <Card title="Details">
        <dl className="definition-list">
          <div><dt>Created</dt><dd>{new Date(receipt.createdAt).toLocaleString('en-NZ')}</dd></div>
        </dl>
        {receipt.notes ? <p className="muted">{receipt.notes}</p> : null}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Lines">
        {receipt.lines.length === 0
          ? <EmptyState title="No lines" description="This receipt has no lines." />
          : <DataTable label="Goods receipt lines" headings={['Product', 'Received', 'Rejected', 'Accepted']}>
              {receipt.lines.map((line) => <tr key={line.id}>
                <td><strong>{line.product.sku}</strong><div className="muted">{line.product.name}</div></td>
                <td>{line.receivedQuantity}</td>
                <td>{line.rejectedQuantity}</td>
                <td>{line.acceptedQuantity}</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
