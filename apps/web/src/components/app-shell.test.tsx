import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe('AppShell', () => {
  it('shows the TADPODS navigation model and accessible skip link', () => {
    const html = renderToStaticMarkup(<AppShell user={{ id: '1', displayName: 'Admin', email: 'admin@tadpods.local', permissions: ['*'] }} brand={{ displayName: 'TADPODS', primaryColour: '#0F766E', accentColour: '#14B8A6' }}><p>Content</p></AppShell>);
    for (const section of ['Dashboard','Sales','Purchasing','Inventory','Customers','Suppliers','Reports','Administration']) expect(html).toContain(section);
    expect(html).toContain('Skip to main content');
    expect(html).toContain('TADPODS');
  });
});
