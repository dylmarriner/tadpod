import { Card } from '@tadpods/ui';
import { BrandForm } from '../../../../components/admin-forms';
import { serverApi } from '../../../../lib/server-api';

export const metadata = { title: 'Branding' };
export default async function BrandingPage() {
  const brand = await serverApi<{ displayName: string; legalName: string | null; logoUrl: string | null; primaryColour: string; accentColour: string; documentFooter: string }>('/brand');
  return <><header className="page-header"><div><h1>TADPODS branding</h1><p>These settings feed the interface, emails, reports and document templates.</p></div></header><Card><BrandForm brand={brand} /></Card></>;
}
