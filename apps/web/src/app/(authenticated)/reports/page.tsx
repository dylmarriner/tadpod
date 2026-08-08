import Link from 'next/link';
import { Card } from '@tadpods/ui';
import { REPORTS, reportCategories } from '../../../lib/reports';

export const metadata = { title: 'Reports' };

export default function ReportsHubPage() {
  return <>
    <header className="page-header">
      <div>
        <h1>Reports</h1>
        <p>Every report reads from posted ledger data and exports as CSV — a report's URL, with its date filters, is itself the saved report.</p>
      </div>
    </header>
    {reportCategories().map((category) => {
      const reports = REPORTS.filter((report) => report.category === category);
      if (reports.length === 0) return null;
      return <div key={category} style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 .6rem' }}>{category}</h2>
        <div className="grid grid--2">
          {reports.map((report) => <Card key={report.key} title={report.label}>
            <p>{report.description}</p>
            <Link href={`/reports/${report.key}`}>Open {report.label.toLowerCase()}</Link>
          </Card>)}
        </div>
      </div>;
    })}
  </>;
}
