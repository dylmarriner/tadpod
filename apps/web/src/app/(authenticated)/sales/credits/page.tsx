import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { CreateCreditForm } from '../../../../components/customer-invoice-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Customer = { id: string; code: string; name: string };
type Credit = { id: string; creditNumber: string; sourceType: string; amount: string; remaining: string; currency: string; customer: { code: string; name: string } };

export const metadata = { title: 'Customer credits' };

export default async function CustomerCreditsPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;
  let credits: { items: Credit[] } | null = null;
  let customers: Customer[] = [];
  let loadError = '';
  try {
    [credits, customers] = await Promise.all([
      serverApi<{ items: Credit[] }>('/customer-credits'),
      serverApi<{ items: Customer[] }>('/customers?active=true&pageSize=100').then((response) => response.items)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load customer credits.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Customer credits</h1>
        <p>Unapplied value on a customer's account — raised automatically from an overpayment, or manually here.</p>
      </div>
    </header>
    {loadError ? <div className="form-message" role="alert">{loadError}</div> : <>
      {customers.length > 0 ? <Card title="Create manual credit">
        <CreateCreditForm customerId={customerId ?? customers[0]!.id} />
      </Card> : null}
      <div style={{ marginTop: '1rem' }}>
        <Card title="All credits">
          {credits === null || credits.items.length === 0
            ? <EmptyState title="No credits yet" description="Credits appear here from overpayments or manual grants." />
            : <DataTable label="Customer credits" headings={['Credit', 'Customer', 'Source', 'Amount', 'Remaining']}>
                {credits.items.map((credit) => <tr key={credit.id}>
                  <td><Link href={`/sales/credits/${credit.id}`}>{credit.creditNumber}</Link></td>
                  <td>{credit.customer.code} — {credit.customer.name}</td>
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
