import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Card, EmptyState, ProgressSteps } from './index.js';

describe('TADPODS UI primitives', () => {
  it('renders accessible workflow components', () => {
    const html = renderToStaticMarkup(<Card title="Sales order"><Badge tone="success">Confirmed</Badge><ProgressSteps steps={['Draft', 'Confirmed', 'Delivered']} current={1} /><Button>Deliver available stock</Button></Card>);
    expect(html).toContain('Workflow progress');
    expect(html).toContain('Deliver available stock');
    expect(html).toContain('Confirmed');
  });

  it('renders actionable empty states', () => {
    expect(renderToStaticMarkup(<EmptyState title="No users found" description="Change the search or add a user." />)).toContain('No users found');
  });
});
