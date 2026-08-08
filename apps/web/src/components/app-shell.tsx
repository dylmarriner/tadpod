'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Badge } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type User = { id: string; displayName: string; email: string; permissions: string[] };
type Brand = { displayName: string; primaryColour: string; accentColour: string };

type NavItem = { label: string; href: string; permission?: string } | { label: string; enabled: false };
type NavGroup = { label: string | null; items: readonly NavItem[] };

// Grouped so every sub-page is one click away from the sidebar itself — previously "Inventory"
// was the only area collapsed behind a hub page (unlike Sales/Purchasing, which already linked
// their sub-pages directly), so reaching Products took an extra click through /inventory first.
const navGroups: readonly NavGroup[] = [
  { label: null, items: [{ label: 'Dashboard', href: '/dashboard' }] },
  {
    label: 'Sales',
    items: [
      { label: 'Orders', href: '/sales/orders', permission: 'sales.read' },
      { label: 'Backorders', href: '/sales/backorders', permission: 'sales.read' },
      { label: 'Invoicing', href: '/sales/invoices', permission: 'sales.read' },
      { label: 'Payments', href: '/sales/payments', permission: 'sales.read' },
      { label: 'Credits', href: '/sales/credits', permission: 'sales.read' }
    ]
  },
  {
    label: 'Purchasing',
    items: [
      { label: 'Orders', href: '/purchasing/orders', permission: 'purchasing.read' },
      { label: 'Bills', href: '/purchasing/bills', permission: 'purchasing.read' },
      { label: 'Payments', href: '/purchasing/payments', permission: 'purchasing.read' },
      { label: 'Credits', href: '/purchasing/credits', permission: 'purchasing.read' }
    ]
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Products', href: '/inventory/products', permission: 'inventory.read' },
      { label: 'Warehouses', href: '/inventory/warehouses', permission: 'inventory.read' },
      { label: 'Adjustments', href: '/inventory/adjustments', permission: 'inventory.read' },
      { label: 'Transfers', href: '/inventory/transfers', permission: 'inventory.read' },
      { label: 'Stock counts', href: '/inventory/stock-counts', permission: 'inventory.read' },
      { label: 'Movements', href: '/inventory/movements', permission: 'inventory.read' }
    ]
  },
  {
    label: 'Accounts',
    items: [
      { label: 'Customers', href: '/customers', permission: 'customers.read' },
      { label: 'Suppliers', href: '/suppliers', permission: 'suppliers.read' }
    ]
  },
  { label: null, items: [{ label: 'Reports', href: '/reports', permission: 'reports.read' }] },
  { label: null, items: [{ label: 'Administration', href: '/administration', permission: 'admin.users' }] }
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
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !('permission' in item) || allowed(user, item.permission));
          if (items.length === 0) return null;
          return <div className="nav-group" key={group.label ?? items[0]!.label}>
            {group.label ? <div className="nav-group__label">{group.label}</div> : null}
            {items.map((item) =>
              'href' in item && item.href
                ? <a key={item.label} href={item.href} aria-current={pathname.startsWith(item.href) ? 'page' : undefined}>{item.label}</a>
                : <button key={item.label} disabled title={`${item.label} is enabled in the next TADPODS build phase`}>{item.label}<Badge>Next phase</Badge></button>
            )}
          </div>;
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
