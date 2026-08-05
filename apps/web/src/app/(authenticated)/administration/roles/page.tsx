import { Card } from '@tadpods/ui';
import { RolePermissionsForm } from '../../../../components/admin-forms';
import { serverApi } from '../../../../lib/api';

type Role = { id: string; key: string; name: string; description: string | null; userCount: number; permissions: string[] };
export const metadata = { title: 'Roles and permissions' };
export default async function RolesPage() {
  const roles = await serverApi<Role[]>('/roles');
  const allPermissions = [...new Set(roles.flatMap((role) => role.permissions).concat(['admin.users','admin.roles','admin.brand','audit.read','sales.read','sales.write','purchasing.read','purchasing.write','inventory.read','inventory.write','customers.read','customers.write','suppliers.read','suppliers.write','reports.read']))].sort();
  return <><header className="page-header"><div><h1>Roles and permissions</h1><p>Configure operational access without handing everyone the master keys.</p></div></header><div className="grid grid--2">{roles.map((role) => <Card key={role.id} title={`${role.name} · ${role.userCount} users`}><p className="muted">{role.description}</p><RolePermissionsForm role={role} allPermissions={allPermissions} /></Card>)}</div></>;
}
