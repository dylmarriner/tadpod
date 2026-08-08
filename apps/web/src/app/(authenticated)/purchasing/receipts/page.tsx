import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type GoodsReceipt = {
  id: string; receiptNumber: string; reversedAt: string | null; createdAt: string;
  purchaseOrder: { id: string; orderNumber: string };
  warehouse: { id: string; code: string; name: string };
  receivedBy: { id: string; displayName: string };
};

export const metadata = { title: 'Goods receipts' };

export default async function GoodsReceiptsPage() {
  let receipts: { items: GoodsReceipt[]; total: number } | null = null;
  let loadError = '';
  try {
    receipts = await serverApi<{ items: GoodsReceipt[]; total: number }>('/goods-receipts');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load goods receipts.';
  }

  return <>
    <PageHeader kicker="Purchasing" title="Goods receipts" description="Posted stock receipts against purchase orders. New receipts are created from the relevant purchase order detail page." />
    <Card kicker="Receiving ledger" title="Receipts">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : receipts === null || receipts.items.length === 0
          ? <EmptyState title="No goods receipts yet" description="Receive goods from a confirmed purchase order to see the posting here." />
          : <DataTable label="Goods receipts" headings={['Receipt', 'Purchase order', 'Warehouse', 'Received by', 'Status', 'Created']}>
              {receipts.items.map((receipt) => <tr key={receipt.id}>
                <td><Link href={`/purchasing/receipts/${receipt.id}`}>{receipt.receiptNumber}</Link></td>
                <td><Link href={`/purchasing/orders/${receipt.purchaseOrder.id}`}>{receipt.purchaseOrder.orderNumber}</Link></td>
                <td>{receipt.warehouse.code} — {receipt.warehouse.name}</td>
                <td>{receipt.receivedBy.displayName}</td>
                <td><Badge tone={receipt.reversedAt ? 'danger' : 'success'}>{receipt.reversedAt ? 'Reversed' : 'Posted'}</Badge></td>
                <td>{new Date(receipt.createdAt).toLocaleDateString('en-NZ')}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
