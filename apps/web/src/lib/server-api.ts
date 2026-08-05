import 'server-only';
import { cookies } from 'next/headers';
import { ApiError } from './api';

const serverApiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function serverApi<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(`${serverApiUrl}${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store'
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' })) as { message?: string };
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.json() as Promise<T>;
}

export async function publicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${serverApiUrl}${path}`, { next: { revalidate: 60 } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' })) as { message?: string };
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.json() as Promise<T>;
}
