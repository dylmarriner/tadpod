import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { publicApi } from '../lib/server-api';
import { ServiceWorkerRegistration } from '../components/service-worker-registration';

export const metadata: Metadata = {
  title: { default: 'TADPODS', template: '%s | TADPODS' },
  description: 'TADPODS inventory, purchasing, sales and account management',
  applicationName: 'TADPODS',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TADPODS'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#111827'
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await publicApi<{ displayName: string; primaryColour: string; accentColour: string }>('/brand').catch(() => ({ displayName: 'TADPODS', primaryColour: '#0F766E', accentColour: '#14B8A6' }));
  return <html lang="en"><body style={{ '--brand': brand.primaryColour, '--accent': brand.accentColour } as React.CSSProperties}>
    <ServiceWorkerRegistration />
    {children}
  </body></html>;
}
