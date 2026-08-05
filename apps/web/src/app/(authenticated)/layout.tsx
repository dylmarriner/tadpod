import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { publicApi, serverApi } from '../../lib/server-api';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await serverApi<{ user: { id: string; displayName: string; email: string; permissions: string[] } }>('/auth/me').catch(() => null);
  if (!session) redirect('/login');
  const brand = await publicApi<{ displayName: string; primaryColour: string; accentColour: string }>('/brand').catch(() => ({ displayName: 'TADPODS', primaryColour: '#0F766E', accentColour: '#14B8A6' }));
  return <AppShell user={session.user} brand={brand}>{children}</AppShell>;
}
