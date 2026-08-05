'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type Role = { id: string; key: string; name: string; permissions: string[] };

function useMutation() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(operation: () => Promise<unknown>): Promise<void> {
    setBusy(true); setError('');
    try { await operation(); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Request failed'); } finally { setBusy(false); }
  }
  return { run, error, busy };
}

export function BrandForm({ brand }: { brand: { displayName: string; legalName: string | null; logoUrl: string | null; primaryColour: string; accentColour: string; documentFooter: string } }) {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutation.run(() => browserApi('/brand', { method: 'PATCH', body: JSON.stringify({ displayName: data.get('displayName'), legalName: data.get('legalName') || null, logoUrl: data.get('logoUrl') || null, primaryColour: data.get('primaryColour'), accentColour: data.get('accentColour'), documentFooter: data.get('documentFooter') }) }));
  }
  return <form className="form-stack" onSubmit={submit}>{mutation.error ? <div className="form-message">{mutation.error}</div> : null}<Field label="Display name"><TextInput name="displayName" defaultValue={brand.displayName} required /></Field><Field label="Legal name"><TextInput name="legalName" defaultValue={brand.legalName ?? ''} /></Field><Field label="Logo URL"><TextInput name="logoUrl" type="url" defaultValue={brand.logoUrl ?? ''} /></Field><div className="grid grid--2"><Field label="Primary colour"><TextInput name="primaryColour" type="color" defaultValue={brand.primaryColour} /></Field><Field label="Accent colour"><TextInput name="accentColour" type="color" defaultValue={brand.accentColour} /></Field></div><Field label="Document footer"><TextInput name="documentFooter" defaultValue={brand.documentFooter} required /></Field><Button disabled={mutation.busy}>Save TADPODS branding</Button></form>;
}

export function UserCreateForm({ roles }: { roles: Role[] }) {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    void mutation.run(async () => { await browserApi('/users', { method: 'POST', body: JSON.stringify({ email: data.get('email'), displayName: data.get('displayName'), password: data.get('password'), roleKeys: data.getAll('roleKeys') }) }); form.reset(); });
  }
  return <form className="form-stack" onSubmit={submit}>{mutation.error ? <div className="form-message">{mutation.error}</div> : null}<Field label="Display name"><TextInput name="displayName" required /></Field><Field label="Email"><TextInput name="email" type="email" required /></Field><Field label="Temporary password" hint="Use at least 12 characters."><TextInput name="password" type="password" minLength={12} required /></Field><Field label="Roles"><div className="checkbox-list">{roles.map((role) => <label key={role.key}><input type="checkbox" name="roleKeys" value={role.key} /> {role.name}</label>)}</div></Field><Button disabled={mutation.busy}>Create user</Button></form>;
}

export function UserRolesForm({ userId, selected, roles }: { userId: string; selected: string[]; roles: Role[] }) {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); const data = new FormData(event.currentTarget); void mutation.run(() => browserApi(`/users/${userId}/roles`, { method: 'PATCH', body: JSON.stringify({ roleKeys: data.getAll('roleKeys') }) })); }
  return <form onSubmit={submit}><div className="checkbox-list">{roles.map((role) => <label key={role.key}><input type="checkbox" name="roleKeys" value={role.key} defaultChecked={selected.includes(role.key)} /> {role.name}</label>)}</div>{mutation.error ? <div className="field__error">{mutation.error}</div> : null}<Button variant="secondary" disabled={mutation.busy}>Save roles</Button></form>;
}

export function RolePermissionsForm({ role, allPermissions }: { role: Role; allPermissions: string[] }) {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); const data = new FormData(event.currentTarget); void mutation.run(() => browserApi(`/roles/${role.id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissionKeys: data.getAll('permissionKeys') }) })); }
  return <form className="form-stack" onSubmit={submit}><div className="checkbox-list">{allPermissions.map((permission) => <label key={permission}><input type="checkbox" name="permissionKeys" value={permission} defaultChecked={role.permissions.includes(permission)} disabled={role.key === 'administrator' && permission === '*'} /> {permission}</label>)}</div>{mutation.error ? <div className="field__error">{mutation.error}</div> : null}<Button variant="secondary" disabled={mutation.busy}>Save permissions</Button></form>;
}
