import { Badge, Card } from '@tadpods/ui';
import { StockCountEntry } from '../../../../../components/stock-count-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type StockCount = {
  id: string;
  warehouse: { id: string; code: string; name: string };
  status: 'DRAFT' | 'POSTED';
  notes: string | null;
  createdBy: { id: string; displayName: string; email: string };
  postedAt: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    product: { id: string; sku: string; name: string; barcode: string | null; unitOfMeasure: string };
    expectedQuantity: string;
    countedQuantity: string | null;
    variance: string | null;
  }>;
};

export const metadata = { title: 'Stock count' };

export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let count: StockCount | null = null;
  let loadError = '';
  try {
    count = await serverApi<StockCount>(`/inventory/stock-counts/${id}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this stock count.';
  }

  if (loadError || !count) {
    return <div className="form-message" role="alert">{loadError || 'Stock count not found.'}</div>;
  }

  const countedLines = count.lines.filter((line) => line.countedQuantity !== null).length;

  return <>
    <header className="page-header">
      <div>
        <h1>Stock count — {count.warehouse.code}</h1>
        <p>{count.warehouse.name} · Started by {count.createdBy.displayName} on {new Date(count.createdAt).toLocaleString('en-NZ')}</p>
      </div>
      <Badge tone={count.status === 'POSTED' ? 'neutral' : 'info'}>{count.status === 'POSTED' ? 'Posted' : 'Draft'}</Badge>
    </header>
    <Card title={`Lines (${countedLines} / ${count.lines.length} counted)`}>
      {count.notes ? <p className="muted">{count.notes}</p> : null}
      <StockCountEntry countId={count.id} lines={count.lines} status={count.status} />
    </Card>
  </>;
}
