import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { publicApi } from '../lib/server-api';
import { ServiceWorkerRegistration } from '../components/service-worker-registration';

// Self-hosted at build time (next/font downloads and bundles the actual .woff2 files into the
// build output) so the brand typeface renders as designed instead of silently falling back to
// whatever sans-serif the OS happens to have, and with no runtime request to Google's CDN.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'TADPODS', template: '%s | TADPODS' },
  description: 'TADPODS inventory, purchasing, sales and account management',
  applicationName: 'TADPODS',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
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
  const brand = await publicApi<{ displayName: string; primaryColour: string; accentColour: string }>('/brand').catch(() => ({ displayName: 'TADPODS', primaryColour: '#1677FF', accentColour: '#6B7280' }));
  return <html lang="en" className={inter.variable}><body style={{ '--brand': brand.primaryColour, '--accent': brand.accentColour } as React.CSSProperties}>
    <ServiceWorkerRegistration />
    {children}
  </body></html>;
}
