import Link from 'next/link';
import { Card } from '@tadpods/ui';

export const metadata = { title: 'Inventory' };

const links = [
  { href: '/inventory/products', label: 'Products', description: 'SKUs, barcodes, pricing, and reorder settings.' },
  { href: '/inventory/warehouses', label: 'Warehouses', description: 'Stock locations and the default warehouse.' },
  { href: '/inventory/adjustments', label: 'Opening stock and adjustments', description: 'Guided opening-stock entry and mandatory-reason adjustments.' },
  { href: '/inventory/transfers', label: 'Warehouse transfers', description: 'Move stock between warehouses as a single linked posting.' },
  { href: '/inventory/stock-counts', label: 'Stock counts', description: 'Draft counts, variances, and posted corrections.' },
  { href: '/inventory/movements', label: 'Stock movement history', description: 'The full, immutable posted ledger.' }
] as const;

export default function InventoryHubPage() {
  return <>
    <header className="page-header">
      <div>
        <h1>Inventory</h1>
        <p>Products, warehouses, and the stock-movement ledger that is the sole source of truth for stock on hand.</p>
      </div>
    </header>
    <div className="grid grid--2">
      {links.map((link) => <Card key={link.href} title={link.label}>
        <p>{link.description}</p>
        <Link href={link.href}>Open {link.label.toLowerCase()}</Link>
      </Card>)}
    </div>
  </>;
}
