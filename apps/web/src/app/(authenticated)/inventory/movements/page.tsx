import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Movement = {
  id: string;
  productId: string;
  warehouseId: string;
  movementType: string;
  signedQuantity: string;
  postedAt: string;
  sourceType: string;
  sourceId: string;
  reversalOfId: string | null;
  notes: string | null;
};

export const metadata = { title: 'Stock movement history' };

function movementTone(movementType: string): 'success' | 'warning' | 'neutral' | 'info' {
  if (movementType === 'NEGATIVE_ADJUSTMENT' || movementType === 'WAREHOUSE_TRANSFER_OUT' || movementType === 'SALES_DELIVERY') return 'warning';
  if (movementType === 'REVERSAL') return 'neutral';
  if (movementType === 'STOCK_COUNT_CORRECTION') return 'info';
  return 'success';
}

export default async function MovementsPage() {
  let page: { items: Movement[]; total: number } | null = null;
  let loadError = '';
  try {
    page = await serverApi<{ items: Movement[]; total: number }>('/inventory/movements');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load stock movements.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Stock movement history</h1>
        <p>Every posted movement on the immutable inventory ledger, most recent first. Every quantity here — and every stock balance derived from it — traces back to one of these rows.</p>
      </div>
    </header>
    <Card title="Movements">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : page === null || page.items.length === 0
          ? <EmptyState title="No stock movements yet" description="Movements will appear here once stock is posted." />
          : <DataTable label="Stock movements" headings={['Posted', 'Type', 'Quantity', 'Source', 'Notes', 'Reversal']}>
              {page.items.map((movement) => <tr key={movement.id}>
                <td>{new Date(movement.postedAt).toLocaleString('en-NZ')}</td>
                <td><Badge tone={movementTone(movement.movementType)}>{movement.movementType.replaceAll('_', ' ')}</Badge></td>
                <td>{Number(movement.signedQuantity) > 0 ? '+' : ''}{movement.signedQuantity}</td>
                <td>{movement.sourceType} <span className="muted">{movement.sourceId}</span></td>
                <td>{movement.notes ?? '—'}</td>
                <td>{movement.reversalOfId ? <Badge tone="neutral">Reverses a movement</Badge> : '—'}</td>
              </tr>)}
            </DataTable>}
    </Card>
  </>;
}
