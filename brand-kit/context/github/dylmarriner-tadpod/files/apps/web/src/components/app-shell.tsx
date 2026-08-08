'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Badge } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type User = { id: string; displayName: string; email: string; permissions: string[] };
type Brand = { displayName: string; primaryColour: string; accentColour: string };

const sections = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Sales', href: '/sales/orders', permission: 'sales.read' },
  { label: 'Backorders', href: '/sales/backorders', permission: 'sales.read' },
  { label: 'Invoicing', href: '/sales/invoices', permission: 'sales.read' },
  { label: 'Payments', href: '/sales/payments', permission: 'sales.read' },
  { label: 'Credits', href: '/sales/credits', permission: 'sales.read' },
  { label: 'Purchasing', href: '/purchasing/orders', permission: 'purchasing.read' },
  { label: 'Bills', href: '/purchasing/bills', permission: 'purchasing.read' },
  { label: 'Supplier payments', href: '/purchasing/payments', permission: 'purchasing.read' },
  { label: 'Supplier credits', href: '/purchasing/credits', permission: 'purchasing.read' },
  { label: 'Inventory', href: '/inventory', permission: 'inventory.read' },
  { label: 'Customers', href: '/customers', permission: 'customers.read' },
  { label: 'Suppliers', href: '/suppliers', permission: 'suppliers.read' },
  { label: 'Reports', enabled: false },
  { label: 'Administration', href: '/administration', permission: 'admin.users' }
] as const;

function allowed(user: User, permission?: string): boolean {
  return !permission || user.permissions.includes('*') || user.permissions.includes(permission);
}

export function AppShell({ user, brand, children }: { user: User; brand: Brand; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen((open) => !open); }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const actions = useMemo(() => [
    { label: 'Open dashboard', href: '/dashboard' },
    ...(allowed(user, 'admin.brand') ? [{ label: 'Edit TADPODS branding', href: '/administration/branding' }] : []),
    ...(allowed(user, 'admin.users') ? [{ label: 'Manage users', href: '/administration/users' }] : []),
    ...(allowed(user, 'admin.roles') ? [{ label: 'Manage roles', href: '/administration/roles' }] : []),
    ...(allowed(user, 'audit.read') ? [{ label: 'View audit history', href: '/administration/audit' }] : [])
  ].filter((action) => action.label.toLowerCase().includes(query.toLowerCase())), [query, user]);

  async function logout(): Promise<void> {
    await browserApi('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return <div className="app-shell" style={{ '--brand': brand.primaryColour, '--accent': brand.accentColour } as React.CSSProperties}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="sidebar">
      <a className="wordmark" href="/dashboard"><span className="wordmark__mark">T</span><span>{brand.displayName}</span></a>
      <nav className="nav" aria-label="Primary navigation">
        {sections.map((section) => {
          if ('permission' in section && !allowed(user, section.permission)) return null;
          if ('href' in section && section.href) return <a key={section.label} href={section.href} aria-current={pathname.startsWith(section.href) ? 'page' : undefined}>{section.label}</a>;
          return <button key={section.label} disabled title={`${section.label} is enabled in the next TADPODS build phase`}>{section.label}<Badge>Next phase</Badge></button>;
        })}
      </nav>
      <div className="sidebar__footer"><div><strong>{user.displayName}</strong></div><small>{user.email}</small></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><Button variant="secondary" onClick={() => setCommandOpen(true)} aria-label="Open command menu">Search and actions <kbd>Ctrl K</kbd></Button><div className="topbar__actions"><Button variant="secondary" onClick={() => void logout()}>Sign out</Button></div></header>
      <main id="main-content" className="page">{children}</main>
    </div>
    {commandOpen ? <div className="command-backdrop" role="presentation" onMouseDown={() => setCommandOpen(false)}><section className="command-panel" role="dialog" aria-modal="true" aria-label="TADPODS command menu" onMouseDown={(event) => event.stopPropagation()}><input autoFocus className="input" placeholder="Search TADPODS actions" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="command-results">{actions.map((action) => <a key={action.href} href={action.href} onClick={() => setCommandOpen(false)}>{action.label}</a>)}</div></section></div> : null}
  </div>;
}
