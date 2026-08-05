import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { publicApi } from '../lib/server-api';

export const metadata: Metadata = {
  title: { default: 'TADPODS', template: '%s | TADPODS' },
  description: 'TADPODS inventory, purchasing, sales and account management',
  applicationName: 'TADPODS'
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await publicApi<{ displayName: string; primaryColour: string; accentColour: string }>('/brand').catch(() => ({ displayName: 'TADPODS', primaryColour: '#0F766E', accentColour: '#14B8A6' }));
  return <html lang="en"><body style={{ '--brand': brand.primaryColour, '--accent': brand.accentColour } as React.CSSProperties}>{children}</body></html>;
}
