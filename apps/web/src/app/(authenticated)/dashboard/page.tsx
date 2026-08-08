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
  const operationalAreas = [
    ['SL', 'Sales orders', '/sales/orders'],
    ['PU', 'Purchase orders', '/purchasing/orders'],
    ['IN', 'Inventory', '/inventory/products'],
    ['AC', 'Customer accounts', '/customers'],
    ['RP', 'Reports', '/reports']
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

    <div className="grid grid--2" style={{ marginTop: 16 }}>
      <Card kicker="Navigate" title="Operational areas">
        <div className="stack">
          {operationalAreas.map(([code, label, href]) => <a className="button button--secondary" href={href} key={href}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--flux)' }}>{code}</span>
            <span>{label}</span>
          </a>)}
        </div>
      </Card>
      <Card kicker="Guardrails" title="System rules">
        <ul className="stack muted" style={{ margin: 0, paddingLeft: 20 }}>
          <li>NZD and New Zealand GST defaults</li>
          <li>Negative stock disabled</li>
          <li>Posted records use reversals rather than silent edits</li>
          <li>Security changes are recorded in audit history</li>
        </ul>
      </Card>
    </div>
  </>;
}
