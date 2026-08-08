import { Suspense } from 'react';
import { Card } from '@tadpods/ui';
import { LoginForm } from '../../components/login-form';
import { publicApi } from '../../lib/server-api';

export const metadata = { title: 'Sign in' };

function LoginFormFallback() {
  return <div className="muted" aria-live="polite">Preparing secure sign-in…</div>;
}

export default async function LoginPage() {
  const brand = await publicApi<{ displayName: string }>('/brand').catch(() => ({
    displayName: 'TADPODS'
  }));

  return <main className="login-shell">
    <div className="login-card">
      <div className="login-brand">
        <div className="wordmark">
          <span className="wordmark__mark">T</span>
          <span>{brand.displayName}</span>
        </div>
        <p className="muted">Business operations without the ERP obstacle course.</p>
      </div>
      <Card kicker="Secure access" title={`Sign in to ${brand.displayName}`}>
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
      </Card>
    </div>
  </main>;
}
