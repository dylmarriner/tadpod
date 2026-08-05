'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Field, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await browserApi('/auth/login', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      const returnTo = searchParams.get('returnTo');
      router.replace(returnTo?.startsWith('/') ? returnTo : '/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed');
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={(event) => void submit(event)}>
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <Field label="Email address"><TextInput name="email" type="email" autoComplete="username" required /></Field>
    <Field label="Password"><TextInput name="password" type="password" autoComplete="current-password" required /></Field>
    <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to TADPODS'}</Button>
  </form>;
}
