import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() })
}));

describe('AppShell', () => {
  it('renders the Foundry spine, command deck and context ledger', () => {
    const html = renderToStaticMarkup(
      <AppShell
        user={{
          id: '1',
          displayName: 'Admin',
          email: 'admin@tadpods.local',
          permissions: ['*']
        }}
        brand={{
          displayName: 'TADPODS',
          primaryColour: '#FF9E2C',
          accentColour: '#2DD4BF'
        }}
      >
        <p>Content</p>
      </AppShell>
    );

    for (const code of ['DB', 'SL', 'PU', 'IN', 'AC', 'RP', 'AD']) {
      expect(html).toContain(code);
    }
    for (const section of ['Dashboard', 'Sales', 'Purchasing', 'Inventory', 'Customers', 'Suppliers', 'Reports', 'Administration']) {
      expect(html).toContain(section);
    }

    expect(html).toContain('fnd-spine');
    expect(html).toContain('fnd-deck');
    expect(html).toContain('fnd-ledger');
    expect(html).toContain('Search records and actions');
    expect(html).toContain('System context');
    expect(html).toContain('Skip to main content');
  });

  it('does not expose navigation the user cannot read', () => {
    const html = renderToStaticMarkup(
      <AppShell
        user={{ id: '2', displayName: 'Warehouse', email: 'warehouse@tadpods.local', permissions: ['inventory.read'] }}
        brand={{ displayName: 'TADPODS', primaryColour: '#FF9E2C', accentColour: '#2DD4BF' }}
      >
        <p>Content</p>
      </AppShell>
    );

    expect(html).toContain('Inventory');
    expect(html).not.toContain('Customers');
    expect(html).not.toContain('Administration');
  });
});
