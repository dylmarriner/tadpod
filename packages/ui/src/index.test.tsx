import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Alert,
  Badge,
  Button,
  Card,
  CommandPalette,
  EmptyState,
  PageHeader,
  ProgressSteps,
  Skeleton,
  Tabs
} from './index.js';

describe('TADPODS Foundry UI primitives', () => {
  it('keeps existing workflow components accessible', () => {
    const html = renderToStaticMarkup(
      <Card title="Sales order">
        <Badge tone="success">Confirmed</Badge>
        <ProgressSteps steps={['Draft', 'Confirmed', 'Delivered']} current={1} />
        <Button>Deliver available stock</Button>
      </Card>
    );
    expect(html).toContain('Workflow progress');
    expect(html).toContain('Deliver available stock');
    expect(html).toContain('Confirmed');
  });

  it('renders Foundry page hierarchy and semantic alerts', () => {
    const html = renderToStaticMarkup(
      <>
        <PageHeader kicker="Sales" title="Orders" description="Track orders from draft to delivery." />
        <Alert tone="warning" title="Needs attention">Three orders are waiting on stock.</Alert>
      </>
    );
    expect(html).toContain('fnd-page-kicker');
    expect(html).toContain('Orders');
    expect(html).toContain('role="status"');
    expect(html).toContain('Needs attention');
  });

  it('renders Foundry utility states and tabs', () => {
    const html = renderToStaticMarkup(
      <>
        <Skeleton lines={3} label="Loading customers" />
        <Tabs items={[{ label: 'Open', href: '/open' }, { label: 'Paid', href: '/paid' }]} activeHref="/open" />
        <EmptyState title="No users found" description="Change the search or add a user." />
      </>
    );
    expect(html).toContain('Loading customers');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('No users found');
  });

  it('renders the command palette as an accessible dialog', () => {
    const html = renderToStaticMarkup(
      <CommandPalette
        open
        query="sales"
        onQueryChange={() => undefined}
        actions={[{ label: 'Open sales orders', href: '/sales/orders', hint: 'SL' }]}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('TADPODS command line');
    expect(html).toContain('Open sales orders');
  });
});
