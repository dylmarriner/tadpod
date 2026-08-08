import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { ReverseAdjustmentButton } from '../../../../components/adjustment-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type AdjustmentListItem = {
  id: string;
  movementType: string;
  product: { id: string; sku: string; name: string };
  warehouse: { id: string; code: string; name: string };
  signedQuantity: string;
  beforeQuantity: string;
  afterQuantity: string;
  postedAt: string;
  sourceType: string;
  notes: string | null;
  actor: { id: string; displayName: string; email: string } | null;
  reversal: { id: string; postedAt: string } | null;
};

export const metadata = { title: 'Adjustments' };

function movementLabel(movementType: string): string {
  if (movementType === 'OPENING_STOCK') return 'Opening stock';
  if (movementType === 'POSITIVE_ADJUSTMENT') return 'Positive adjustment';
  if (movementType === 'NEGATIVE_ADJUSTMENT') return 'Negative adjustment';
  return movementType;
}

export default async function AdjustmentsPage() {
  let page: { items: AdjustmentListItem[]; total: number } | null = null;
  let loadError = '';
  try {
    page = await serverApi<{ items: AdjustmentListItem[]; total: number }>('/inventory/adjustments');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load adjustments.';
  }

  return <>
    <PageHeader
      kicker="Inventory"
      title="Opening stock and adjustments"
      description="Posted opening balances and stock corrections with their source, actor and before/after quantity."
      actions={<Link href="/inventory/adjustments/new"><Button>Record adjustment</Button></Link>}
    />
    <Card kicker="Immutable postings" title="Adjustment ledger">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : page === null || page.items.length === 0 ? <EmptyState title="No adjustments yet" description="Opening stock and stock adjustments will appear here once posted." action={<Link href="/inventory/adjustments/new"><Button>Record the first posting</Button></Link>} />
        : <DataTable label="Opening stock and adjustments" headings={['Posted', 'Type', 'Product', 'Warehouse', 'Before', 'Change', 'After', 'Reason / notes', 'Actor', 'Reversal']}>
            {page.items.map((item) => <tr key={item.id}>
              <td>{new Date(item.postedAt).toLocaleString('en-NZ')}</td>
              <td><Badge tone={item.movementType === 'NEGATIVE_ADJUSTMENT' ? 'warning' : 'success'}>{movementLabel(item.movementType)}</Badge></td>
              <td><strong>{item.product.sku}</strong><div className="muted">{item.product.name}</div></td>
              <td>{item.warehouse.code}<div className="muted">{item.warehouse.name}</div></td>
              <td data-quantity>{item.beforeQuantity}</td>
              <td data-quantity>{Number(item.signedQuantity) > 0 ? '+' : ''}{item.signedQuantity}</td>
              <td data-quantity>{item.afterQuantity}</td>
              <td>{item.notes ?? '—'}</td>
              <td>{item.actor ? <>{item.actor.displayName}<div className="muted">{item.actor.email}</div></> : 'System'}</td>
              <td>{item.reversal ? <Badge tone="neutral">Reversed {new Date(item.reversal.postedAt).toLocaleDateString('en-NZ')}</Badge> : <ReverseAdjustmentButton movementId={item.id} alreadyReversed={false} />}</td>
            </tr>)}
          </DataTable>}
    </Card>
  </>;
}
