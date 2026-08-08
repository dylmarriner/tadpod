'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, Button, CommandPalette, type CommandAction } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type User = { id: string; displayName: string; email: string; permissions: string[] };
type Brand = { displayName: string; primaryColour: string; accentColour: string };
type NavItem = { label: string; href: string; permission?: string };
type Domain = { code: string; label: string; items: readonly NavItem[] };

const domains: readonly Domain[] = [
  { code: 'DB', label: 'Dashboard', items: [{ label: 'Dashboard', href: '/dashboard' }] },
  {
    code: 'SL', label: 'Sales', items: [
      { label: 'Orders', href: '/sales/orders', permission: 'sales.read' },
      { label: 'Backorders', href: '/sales/backorders', permission: 'sales.read' },
      { label: 'Invoicing', href: '/sales/invoices', permission: 'sales.read' },
      { label: 'Payments', href: '/sales/payments', permission: 'sales.read' },
      { label: 'Credits', href: '/sales/credits', permission: 'sales.read' }
    ]
  },
  {
    code: 'PU', label: 'Purchasing', items: [
      { label: 'Orders', href: '/purchasing/orders', permission: 'purchasing.read' },
      { label: 'Bills', href: '/purchasing/bills', permission: 'purchasing.read' },
      { label: 'Payments', href: '/purchasing/payments', permission: 'purchasing.read' },
      { label: 'Credits', href: '/purchasing/credits', permission: 'purchasing.read' }
    ]
  },
  {
    code: 'IN', label: 'Inventory', items: [
      { label: 'Products', href: '/inventory/products', permission: 'inventory.read' },
      { label: 'Warehouses', href: '/inventory/warehouses', permission: 'inventory.read' },
      { label: 'Adjustments', href: '/inventory/adjustments', permission: 'inventory.read' },
      { label: 'Transfers', href: '/inventory/transfers', permission: 'inventory.read' },
      { label: 'Stock counts', href: '/inventory/stock-counts', permission: 'inventory.read' },
      { label: 'Movements', href: '/inventory/movements', permission: 'inventory.read' }
    ]
  },
  {
    code: 'AC', label: 'Accounts', items: [
      { label: 'Customers', href: '/customers', permission: 'customers.read' },
      { label: 'Suppliers', href: '/suppliers', permission: 'suppliers.read' }
    ]
  },
  { code: 'RP', label: 'Reports', items: [{ label: 'Reports', href: '/reports', permission: 'reports.read' }] },
  { code: 'AD', label: 'Administration', items: [{ label: 'Administration', href: '/administration', permission: 'admin.users' }] }
] as const;

function allowed(user: User, permission?: string): boolean {
  return !permission || user.permissions.includes('*') || user.permissions.includes(permission);
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, brand, children }: { user: User; brand: Brand; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleDomains = useMemo(() => domains.map((domain) => ({
    ...domain,
    items: domain.items.filter((item) => allowed(user, item.permission))
  })).filter((domain) => domain.items.length > 0), [user]);

  const currentDomain = visibleDomains.find((domain) => domain.items.some((item) => isActive(pathname, item.href))) ?? visibleDomains[0];

  const commandActions = useMemo<CommandAction[]>(() => {
    const all = visibleDomains.flatMap((domain) => domain.items.map((item) => ({
      label: `Open ${domain.label} · ${item.label}`,
      href: item.href,
      hint: domain.code
    })));
    const normalized = query.trim().toLowerCase();
    return normalized ? all.filter((action) => action.label.toLowerCase().includes(normalized)) : all;
  }, [query, visibleDomains]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (!commandOpen) return;
      if (event.key === 'Escape') setCommandOpen(false);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => commandActions.length ? (index + 1) % commandActions.length : 0);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => commandActions.length ? (index - 1 + commandActions.length) % commandActions.length : 0);
      }
      if (event.key === 'Enter' && commandActions[activeIndex]) {
        event.preventDefault();
        router.push(commandActions[activeIndex].href);
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, commandActions, commandOpen, router]);

  async function logout(): Promise<void> {
    await browserApi('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  function selectCommand(action: CommandAction): void {
    router.push(action.href);
    setCommandOpen(false);
  }

  const permissionSummary = user.permissions.includes('*') ? 'Full access' : `${user.permissions.length} permission${user.permissions.length === 1 ? '' : 's'}`;

  return <div
    className="fnd-app app-shell"
    style={{ '--tenant-brand': brand.primaryColour, '--tenant-accent': brand.accentColour } as React.CSSProperties}
  >
    <a className="skip-link" href="#main-content">Skip to main content</a>

    <aside className="fnd-spine" aria-label="TADPODS domains">
      <a className="fnd-spine-brand" href="/dashboard" aria-label={`${brand.displayName} dashboard`}>
        <span aria-hidden="true">T</span>
      </a>
      <nav className="fnd-spine-nav" aria-label="Primary navigation">
        {visibleDomains.map((domain) => {
          const domainActive = domain.items.some((item) => isActive(pathname, item.href));
          return <div className={`fnd-domain ${domainActive ? 'is-active' : ''}`} key={domain.code}>
            <a className="fnd-domain-trigger" href={domain.items[0]!.href} aria-current={domainActive ? 'page' : undefined} aria-label={domain.label}>
              <span>{domain.code}</span>
            </a>
            <div className="fnd-flyout" aria-label={`${domain.label} navigation`}>
              <div className="fnd-flyout__header"><span>{domain.code}</span><strong>{domain.label}</strong></div>
              <div className="fnd-flyout__items">
                {domain.items.map((item) => <a key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
                  <span>{item.label}</span><span aria-hidden="true">›</span>
                </a>)}
              </div>
            </div>
          </div>;
        })}
      </nav>
      <div className="fnd-spine-status" title="Signed in"><span className="fnd-live-dot" /></div>
    </aside>

    <div className="fnd-deck">
      <header className="fnd-command-deck">
        <button className="fnd-command-line" type="button" onClick={() => setCommandOpen(true)} aria-label="Search records and actions">
          <span className="fnd-command-line__prompt" aria-hidden="true">›</span>
          <span>Search records and actions</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="fnd-command-deck__actions">
          <Badge tone="live" pulse>Session live</Badge>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>Sign out</Button>
        </div>
      </header>
      {currentDomain && currentDomain.items.length > 1 ? <nav className="fnd-mobile-subnav" aria-label={`${currentDomain.label} sections`}>
        <span className="fnd-mobile-subnav__code" aria-hidden="true">{currentDomain.code}</span>
        {currentDomain.items.map((item) => <a key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>{item.label}</a>)}
      </nav> : null}
      <main id="main-content" className="fnd-deck-body page">{children}</main>
    </div>

    <aside className="fnd-ledger" aria-label="System context">
      <div className="fnd-ledger__eyebrow">System context</div>
      <div className="fnd-ledger__brand">{brand.displayName}</div>
      <section className="fnd-ledger__section">
        <span>Current domain</span>
        <strong>{currentDomain?.label ?? 'Dashboard'}</strong>
        <small>{currentDomain?.code ?? 'DB'}</small>
      </section>
      <section className="fnd-ledger__section">
        <span>Signed in as</span>
        <strong>{user.displayName}</strong>
        <small>{user.email}</small>
      </section>
      <section className="fnd-ledger__section">
        <span>Access</span>
        <strong>{permissionSummary}</strong>
        <small>Navigation and actions follow your role.</small>
      </section>
      <div className="fnd-ledger__spacer" />
      <section className="fnd-ledger__section fnd-ledger__shortcut">
        <span>Command line</span>
        <strong>Ctrl / Cmd + K</strong>
        <small>Jump to any available TADPODS area.</small>
      </section>
    </aside>

    <CommandPalette
      open={commandOpen}
      query={query}
      onQueryChange={setQuery}
      actions={commandActions}
      activeIndex={activeIndex}
      onSelect={selectCommand}
      onClose={() => setCommandOpen(false)}
    />
  </div>;
}
