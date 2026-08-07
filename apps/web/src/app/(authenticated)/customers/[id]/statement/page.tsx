import { Card, EmptyState } from '@tadpods/ui';
import { serverApi } from '../../../../../lib/server-api';
import { apiUrl, ApiError } from '../../../../../lib/api';

type StatementLine = { type: string; ref: { id: string; number: string }; date: string; description: string; debit: string; credit: string; runningBalance: string };
type Statement = { customerId: string; asOf: string; openingBalance: string; closingBalance: string; lines: readonly StatementLine[] };
type Customer = { id: string; code: string; name: string };

export const metadata = { title: 'Customer statement' };

export default async function CustomerStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customer: Customer | null = null;
  let statement: Statement | null = null;
  let loadError = '';
  try {
    [customer, statement] = await Promise.all([serverApi<Customer>(`/customers/${id}`), serverApi<Statement>(`/customers/${id}/statement`)]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this statement.';
  }

  if (loadError || !customer || !statement) return <div className="form-message" role="alert">{loadError || 'Statement not found.'}</div>;

  return <>
    <header className="page-header">
      <div>
        <h1>Statement — {customer.code} — {customer.name}</h1>
        <p>As of {new Date(statement.asOf).toLocaleString('en-NZ')} · Closing balance {statement.closingBalance}</p>
      </div>
      <a href={`${apiUrl}/documents/customers/${customer.id}/statement`} target="_blank" rel="noreferrer">Print</a>
    </header>
    <Card title="Transactions">
      {statement.lines.length === 0
        ? <EmptyState title="Nothing to show" description="No invoices, payments, or credits have been posted for this customer yet." />
        : <div className="table-wrap">
            <table>
              <caption className="sr-only">Statement lines</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Debit</th><th scope="col">Credit</th><th scope="col">Balance</th></tr></thead>
              <tbody>
                {statement.lines.map((line, index) => <tr key={`${line.type}-${line.ref.id}-${index}`}>
                  <td>{new Date(line.date).toLocaleDateString('en-NZ')}</td>
                  <td>{line.description}</td>
                  <td>{Number(line.debit) > 0 ? line.debit : ''}</td>
                  <td>{Number(line.credit) > 0 ? line.credit : ''}</td>
                  <td>{line.runningBalance}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </Card>
  </>;
}
