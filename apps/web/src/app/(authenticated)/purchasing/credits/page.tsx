import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { CreateSupplierCreditForm } from '../../../../components/supplier-bill-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Supplier = { id: string; code: string; name: string };
type Credit = { id: string; creditNumber: string; sourceType: string; amount: string; remaining: string; currency: string; supplier: { code: string; name: string } };

export const metadata = { title: 'Supplier credits' };

export default async function SupplierCreditsPage({ searchParams }: { searchParams: Promise<{ supplierId?: string }> }) {
  const { supplierId } = await searchParams;
  let credits: { items: Credit[] } | null = null;
  let suppliers: Supplier[] = [];
  let loadError = '';
  try {
    [credits, suppliers] = await Promise.all([
      serverApi<{ items: Credit[] }>('/supplier-credits'),
      serverApi<{ items: Supplier[] }>('/suppliers?active=true&pageSize=100').then((response) => response.items)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load supplier credits.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Supplier credits</h1>
        <p>Unapplied value on a supplier's account — raised automatically from an overpayment, or manually here.</p>
      </div>
    </header>
    {loadError ? <div className="form-message" role="alert">{loadError}</div> : <>
      {suppliers.length > 0 ? <Card title="Create manual credit">
        <CreateSupplierCreditForm supplierId={supplierId ?? suppliers[0]!.id} />
      </Card> : null}
      <div style={{ marginTop: '1rem' }}>
        <Card title="All credits">
          {credits === null || credits.items.length === 0
            ? <EmptyState title="No credits yet" description="Credits appear here from overpayments or manual grants." />
            : <DataTable label="Supplier credits" headings={['Credit', 'Supplier', 'Source', 'Amount', 'Remaining']}>
                {credits.items.map((credit) => <tr key={credit.id}>
                  <td><Link href={`/purchasing/credits/${credit.id}`}>{credit.creditNumber}</Link></td>
                  <td>{credit.supplier.code} — {credit.supplier.name}</td>
                  <td><Badge tone="info">{credit.sourceType}</Badge></td>
                  <td>{credit.amount} {credit.currency}</td>
                  <td>{credit.remaining}</td>
                </tr>)}
              </DataTable>}
        </Card>
      </div>
    </>}
  </>;
}
