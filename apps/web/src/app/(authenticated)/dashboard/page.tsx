import { Badge, Card, PageHeader } from '@tadpods/ui';
import { serverApi } from '../../../lib/server-api';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const metrics = await serverApi<{ users: number; activeSessions: number; pendingEvents: number; failedEvents: number; auditEventsLast24Hours: number }>('/dashboard');
  const cards = [
    ['Users', metrics.users, '/administration/users'],
    ['Active sessions', metrics.activeSessions, '/administration/users'],
    ['Pending events', metrics.pendingEvents, '/administration/audit'],
    ['Failed events', metrics.failedEvents, '/administration/audit'],
    ['Audit events today', metrics.auditEventsLast24Hours, '/administration/audit']
  ] as const;

  return <>
    <PageHeader
      kicker="Operations console"
      title="TADPODS dashboard"
      description="Live platform telemetry and direct access to the records that need attention."
      actions={<Badge tone={metrics.failedEvents ? 'danger' : 'live'} pulse>{metrics.failedEvents ? 'Attention required' : 'Platform live'}</Badge>}
    />

    <div className="grid grid--metrics">
      {cards.map(([label, value, href]) => <a href={href} key={label}>
        <Card kicker="Telemetry">
          <div className="metric">{value}</div>
          <div className="metric-label">{label}</div>
        </Card>
      </a>)}
    </div>

    <div className="grid grid--2 dashboard-lower-grid">
      <Card kicker="Navigate" title="Operational areas">
        <div className="operation-links">
          <a href="/sales/orders"><span>SL</span><strong>Sales orders</strong></a>
          <a href="/purchasing/orders"><span>PU</span><strong>Purchase orders</strong></a>
          <a href="/inventory/products"><span>IN</span><strong>Inventory</strong></a>
          <a href="/customers"><span>AC</span><strong>Customer accounts</strong></a>
          <a href="/reports"><span>RP</span><strong>Reports</strong></a>
        </div>
      </Card>
      <Card kicker="Guardrails" title="System rules">
        <ul className="system-rules">
          <li>NZD and New Zealand GST defaults</li>
          <li>Negative stock disabled</li>
          <li>Posted records use reversals rather than silent edits</li>
          <li>Security changes are recorded in audit history</li>
        </ul>
      </Card>
    </div>
  </>;
}
