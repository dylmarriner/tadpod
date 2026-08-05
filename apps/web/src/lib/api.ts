export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function browserApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-tadpods-client': 'web',
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' })) as { message?: string };
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.json() as Promise<T>;
}
