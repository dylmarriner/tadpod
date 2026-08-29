import Link from 'next/link';
import { Card, PageHeader } from '@tadpods/ui';

export const metadata = { title: 'Inventory' };

const links = [
  { code: 'PR', href: '/inventory/products', label: 'Products', description: 'SKUs, barcodes, pricing and reorder settings.' },
  { code: 'WH', href: '/inventory/warehouses', label: 'Warehouses', description: 'Stock locations and the default warehouse.' },
  { code: 'AD', href: '/inventory/adjustments', label: 'Opening stock and adjustments', description: 'Guided opening-stock entry and mandatory-reason adjustments.' },
  { code: 'TR', href: '/inventory/transfers', label: 'Warehouse transfers', description: 'Move stock between warehouses as a single linked posting.' },
  { code: 'SC', href: '/inventory/stock-counts', label: 'Stock counts', description: 'Draft counts, variances and posted corrections.' },
  { code: 'MV', href: '/inventory/movements', label: 'Stock movement history', description: 'The full immutable posted stock ledger.' }
] as const;

export default function InventoryHubPage() {
  return <>
    <PageHeader kicker="Inventory" title="Stock control" description="Products, warehouses and the stock-movement ledger that remains the source of truth for stock on hand." />
    <div className="grid grid--2">
      {links.map((link) => <Card key={link.href} kicker={link.code} title={link.label} footer={<Link href={link.href}>Open {link.label.toLowerCase()} ›</Link>}>
        <p className="muted" style={{ margin: 0 }}>{link.description}</p>
      </Card>)}
    </div>
  </>;
}
