import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { ReverseTransferButton } from '../../../../components/transfer-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type TransferListItem = {
  transferId: string;
  outMovementId: string;
  product: { id: string; sku: string; name: string };
  fromWarehouse: { id: string; code: string; name: string };
  toWarehouse: { id: string; code: string; name: string };
  quantity: string;
  postedAt: string;
  notes: string | null;
  actor: { id: string; displayName: string; email: string } | null;
  reversed: boolean;
};

export const metadata = { title: 'Transfers' };

export default async function TransfersPage() {
  let page: { items: TransferListItem[]; total: number } | null = null;
  let loadError = '';
  try {
    page = await serverApi<{ items: TransferListItem[]; total: number }>('/inventory/transfers');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load transfers.';
  }

  return <>
    <PageHeader
      kicker="Inventory"
      title="Warehouse transfers"
      description="Linked warehouse-out and warehouse-in postings, grouped as a single transfer operation."
      actions={<Link href="/inventory/transfers/new"><Button>Record transfer</Button></Link>}
    />
    <Card kicker="Movement register" title="Transfers">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : page === null || page.items.length === 0 ? <EmptyState title="No transfers yet" description="Warehouse transfers will appear here once posted." action={<Link href="/inventory/transfers/new"><Button>Record the first transfer</Button></Link>} />
        : <DataTable label="Warehouse transfers" headings={['Posted', 'Product', 'From', 'To', 'Quantity', 'Notes', 'Actor', 'Reversal']}>
            {page.items.map((item) => <tr key={item.outMovementId}>
              <td>{new Date(item.postedAt).toLocaleString('en-NZ')}</td>
              <td><strong>{item.product.sku}</strong><div className="muted">{item.product.name}</div></td>
              <td>{item.fromWarehouse.code}<div className="muted">{item.fromWarehouse.name}</div></td>
              <td>{item.toWarehouse.code}<div className="muted">{item.toWarehouse.name}</div></td>
              <td data-quantity>{item.quantity}</td>
              <td>{item.notes ?? '—'}</td>
              <td>{item.actor ? <>{item.actor.displayName}<div className="muted">{item.actor.email}</div></> : 'System'}</td>
              <td>{item.reversed ? <Badge tone="neutral">Reversed</Badge> : <ReverseTransferButton transferId={item.transferId} />}</td>
            </tr>)}
          </DataTable>}
    </Card>
  </>;
}
