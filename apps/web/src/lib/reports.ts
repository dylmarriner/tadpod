export type ReportDefinition = {
  key: string;
  label: string;
  category: 'Customers' | 'Suppliers' | 'Inventory' | 'Sales' | 'Tax';
  dateRange: boolean;
  description: string;
};

/** Mirrors the endpoints under apps/api/src/modules/reports/reports.controller.ts one-for-one. */
export const REPORTS: readonly ReportDefinition[] = [
  { key: 'aged-receivables', label: 'Aged receivables', category: 'Customers', dateRange: false, description: 'Outstanding customer balances grouped by age bracket.' },
  { key: 'customer-invoices', label: 'Customer invoice register', category: 'Customers', dateRange: true, description: 'Every posted customer invoice.' },
  { key: 'customer-payments', label: 'Customer payment register', category: 'Customers', dateRange: true, description: 'Every posted customer payment.' },
  { key: 'customer-credits', label: 'Customer credit register', category: 'Customers', dateRange: false, description: 'Every posted customer credit note.' },
  { key: 'aged-payables', label: 'Aged payables', category: 'Suppliers', dateRange: false, description: 'Outstanding supplier balances grouped by age bracket.' },
  { key: 'received-not-billed', label: 'Received not billed', category: 'Suppliers', dateRange: false, description: 'Goods received but not yet billed by the supplier.' },
  { key: 'purchase-commitments', label: 'Purchase commitments', category: 'Suppliers', dateRange: false, description: 'Open purchase order value not yet received.' },
  { key: 'supplier-bills', label: 'Supplier bill register', category: 'Suppliers', dateRange: true, description: 'Every posted supplier bill.' },
  { key: 'supplier-payments', label: 'Supplier payment register', category: 'Suppliers', dateRange: true, description: 'Every posted supplier payment.' },
  { key: 'supplier-credits', label: 'Supplier credit register', category: 'Suppliers', dateRange: false, description: 'Every posted supplier credit note.' },
  { key: 'low-stock', label: 'Low stock', category: 'Inventory', dateRange: false, description: 'Products at or below their reorder level.' },
  { key: 'sales-by-customer', label: 'Sales by customer', category: 'Sales', dateRange: true, description: 'Revenue posted per customer.' },
  { key: 'sales-by-product', label: 'Sales by product', category: 'Sales', dateRange: true, description: 'Revenue and quantity posted per product.' },
  { key: 'cash-received', label: 'Cash received', category: 'Sales', dateRange: true, description: 'Posted customer payments by method.' },
  { key: 'tax-summary', label: 'Tax summary', category: 'Tax', dateRange: true, description: 'Tax collected by rate.' }
] as const;

export function findReport(key: string): ReportDefinition | undefined {
  return REPORTS.find((report) => report.key === key);
}

export function reportCategories(): readonly ReportDefinition['category'][] {
  return ['Customers', 'Suppliers', 'Inventory', 'Sales', 'Tax'];
}
