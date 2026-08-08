import Link from 'next/link';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type StockCountListItem = {
  id: string;
  warehouse: { id: string; code: string; name: string };
  status: 'DRAFT' | 'POSTED';
  lineCount: number;
  countedLineCount: number;
  createdBy: { id: string; displayName: string; email: string };
  postedAt: string | null;
  createdAt: string;
};

export const metadata = { title: 'Stock counts' };

export default async function StockCountsPage() {
  let page: { items: StockCountListItem[]; total: number } | null = null;
  let loadError = '';
  try {
    page = await serverApi<{ items: StockCountListItem[]; total: number }>('/inventory/stock-counts');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load stock counts.';
  }

  return <>
    <PageHeader
      kicker="Inventory"
      title="Stock counts"
      description="Count worksheets freeze expected ledger quantity, capture physical counts and post only the resulting variance."
      actions={<Link href="/inventory/stock-counts/new"><Button>Start stock count</Button></Link>}
    />
    <Card kicker="Count sessions" title="Stock counts">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : page === null || page.items.length === 0 ? <EmptyState title="No stock counts yet" description="Stock counts will appear here once started." action={<Link href="/inventory/stock-counts/new"><Button>Start the first stock count</Button></Link>} />
        : <DataTable label="Stock counts" headings={['Started', 'Warehouse', 'Status', 'Progress', 'Started by', 'Posted', '']}>
            {page.items.map((item) => <tr key={item.id}>
              <td>{new Date(item.createdAt).toLocaleString('en-NZ')}</td>
              <td>{item.warehouse.code}<div className="muted">{item.warehouse.name}</div></td>
              <td><Badge tone={item.status === 'POSTED' ? 'neutral' : 'info'}>{item.status === 'POSTED' ? 'Posted' : 'Draft'}</Badge></td>
              <td data-quantity>{item.countedLineCount} / {item.lineCount} counted</td>
              <td>{item.createdBy.displayName}<div className="muted">{item.createdBy.email}</div></td>
              <td>{item.postedAt ? new Date(item.postedAt).toLocaleString('en-NZ') : '—'}</td>
              <td><Link href={`/inventory/stock-counts/${item.id}`}><Button variant="secondary">Open</Button></Link></td>
            </tr>)}
          </DataTable>}
    </Card>
  </>;
}
