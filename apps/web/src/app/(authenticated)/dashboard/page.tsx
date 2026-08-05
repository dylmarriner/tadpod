import { Card, Badge } from '@tadpods/ui';
import { serverApi } from '../../../lib/api';

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
  return <><header className="page-header"><div><h1>TADPODS dashboard</h1><p>Platform health and the records requiring attention.</p></div><Badge tone={metrics.failedEvents ? 'danger' : 'success'}>{metrics.failedEvents ? 'Attention required' : 'Platform healthy'}</Badge></header><div className="grid grid--metrics">{cards.map(([label, value, href]) => <a href={href} key={label}><Card><div className="metric">{value}</div><div className="metric-label">{label}</div></Card></a>)}</div><div className="grid grid--2" style={{ marginTop: '1rem' }}><Card title="What comes next"><p>Products, warehouses and the authoritative stock ledger are the next implementation phase. The platform foundation is already live and usable for administration.</p></Card><Card title="System rules"><ul><li>NZD and New Zealand GST defaults</li><li>Negative stock disabled</li><li>Posted records will use reversals</li><li>Every security change is audited</li></ul></Card></div></>;
}
