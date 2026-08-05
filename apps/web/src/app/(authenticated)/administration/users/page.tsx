import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { UserCreateForm, UserRolesForm } from '../../../../components/admin-forms';
import { serverApi } from '../../../../lib/api';

type Role = { id: string; key: string; name: string; permissions: string[] };
type User = { id: string; email: string; displayName: string; status: string; roles: string[]; createdAt: string };
export const metadata = { title: 'Users' };
export default async function UsersPage() {
  const [users, roles] = await Promise.all([serverApi<User[]>('/users'), serverApi<Role[]>('/roles')]);
  return <><header className="page-header"><div><h1>Users</h1><p>Staff access, role assignment and account status.</p></div></header><div className="grid grid--2"><Card title="Create user"><UserCreateForm roles={roles} /></Card><Card title="Access standards"><p>Access defaults to denied. Give staff the narrowest role that matches their work. TADPODS records every role change.</p></Card></div><div style={{ marginTop: '1rem' }}><Card title="Staff accounts">{users.length ? <DataTable label="TADPODS users" headings={['User', 'Status', 'Roles', 'Change roles']} >{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><div className="muted">{user.email}</div></td><td><Badge tone={user.status === 'ACTIVE' ? 'success' : 'warning'}>{user.status}</Badge></td><td>{user.roles.join(', ') || 'No roles'}</td><td><UserRolesForm userId={user.id} selected={user.roles} roles={roles} /></td></tr>)}</DataTable> : <EmptyState title="No users found" description="Create the first staff account above." />}</Card></div></>;
}
