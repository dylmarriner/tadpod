import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, DataTable, EmptyState, Field, TextInput, Button, PageHeader } from '@tadpods/ui';
import { findReport } from '../../../../lib/reports';
import { serverApi } from '../../../../lib/server-api';
import { apiUrl, ApiError } from '../../../../lib/api';

type Row = Record<string, string | number | boolean>;

function titleCase(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

export default async function ReportViewerPage({
  params,
  searchParams
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { key } = await params;
  const report = findReport(key);
  if (!report) notFound();

  const { from, to } = await searchParams;
  const query = new URLSearchParams();
  if (report.dateRange && from) query.set('from', new Date(from).toISOString());
  if (report.dateRange && to) query.set('to', new Date(to).toISOString());
  const queryString = query.toString();

  let rows: Row[] = [];
  let loadError = '';
  try {
    rows = await serverApi<Row[]>(`/reports/${key}${queryString ? `?${queryString}` : ''}`);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this report.';
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const csvQuery = new URLSearchParams(query);
  csvQuery.set('format', 'csv');
  const csvHref = `${apiUrl}/reports/${key}?${csvQuery.toString()}`;

  return <>
    <PageHeader
      kicker="Reporting"
      title={report.label}
      description={report.description}
      actions={<div className="inline">
        <Link href="/reports">All reports</Link>
        <a className="button button--secondary" href={csvHref}>Download CSV</a>
      </div>}
    />
    {report.dateRange ? <Card kicker="Filter" title="Date range">
      <form method="get" className="inline">
        <Field label="From"><TextInput type="date" name="from" defaultValue={from ?? ''} /></Field>
        <Field label="To"><TextInput type="date" name="to" defaultValue={to ?? ''} /></Field>
        <Button type="submit" variant="secondary">Apply</Button>
        {from || to ? <Link href={`/reports/${key}`}>Clear</Link> : null}
      </form>
    </Card> : null}
    <div style={{ marginTop: '1rem' }}>
      <Card kicker="Dataset" title="Results">
        {loadError ? <div className="form-message" role="alert">{loadError}</div>
          : rows.length === 0
            ? <EmptyState title="No rows" description="No data matches this report yet." />
            : <DataTable label={report.label} headings={columns.map(titleCase)}>
                {rows.map((row, index) => <tr key={index}>
                  {columns.map((column) => <td key={column}>{String(row[column])}</td>)}
                </tr>)}
              </DataTable>}
      </Card>
    </div>
  </>;
}
