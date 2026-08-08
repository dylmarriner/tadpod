import Link from 'next/link';
import { Card, PageHeader } from '@tadpods/ui';
import { REPORTS, reportCategories } from '../../../lib/reports';

export const metadata = { title: 'Reports' };

export default function ReportsHubPage() {
  return <>
    <PageHeader
      kicker="Reporting"
      title="Reports"
      description="Operational and account reports generated from posted ledger data. Date filters remain in the URL and every report can be exported as CSV."
    />
    {reportCategories().map((category) => {
      const reports = REPORTS.filter((report) => report.category === category);
      if (reports.length === 0) return null;
      return <section key={category} style={{ marginTop: '1rem' }}>
        <div className="fnd-page-kicker" style={{ marginBottom: 8 }}>{category}</div>
        <div className="grid grid--2">
          {reports.map((report) => <Card key={report.key} kicker="Report" title={report.label} footer={<Link href={`/reports/${report.key}`}>Open report ›</Link>}>
            <p className="muted" style={{ margin: 0 }}>{report.description}</p>
          </Card>)}
        </div>
      </section>;
    })}
  </>;
}
