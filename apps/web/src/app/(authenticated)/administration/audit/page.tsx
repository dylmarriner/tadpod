import { Card, DataTable, EmptyState } from '@tadpods/ui';
import { serverApi } from '../../../../lib/api';

type Audit = { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; createdAt: string; user: { displayName: string; email: string } | null };
export const metadata = { title: 'Audit history' };
export default async function AuditPage() {
  const events = await serverApi<Audit[]>('/audit');
  return <><header className="page-header"><div><h1>Audit history</h1><p>Who changed what, and when.</p></div></header><Card>{events.length ? <DataTable label="TADPODS audit history" headings={['Time', 'Action', 'Record', 'User', 'Details']}>{events.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString('en-NZ')}</td><td><strong>{event.action}</strong></td><td>{event.entityType}{event.entityId ? ` · ${event.entityId}` : ''}</td><td>{event.user?.displayName ?? 'System'}<div className="muted">{event.user?.email}</div></td><td><code>{JSON.stringify(event.metadata)}</code></td></tr>)}</DataTable> : <EmptyState title="No audit events" description="Events appear here as staff use TADPODS." />}</Card></>;
}
