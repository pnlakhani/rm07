'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@rm07/ui';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Alert, Card, errorMessage, Field, Input } from '@/components/ui';

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const { setAccessToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await authApi.signin(email, password, totp);
      setAccessToken(accessToken);
      router.push('/dashboard');
    } catch (e) {
      setError(errorMessage(e, 'Invalid email, password, or authenticator code.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">RM07 · Quant Terminal</p>
        <h1 className="text-2xl font-bold">Sign in</h1>
      </div>
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Authenticator code" hint="6-digit code from your TOTP app">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/gu, ''))}
              required
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
      <p className="text-sm text-zinc-400">
        No account?{' '}
        <Link href="/signup" className="text-blue-400 hover:underline">
          Create one
        </Link>
      </p>
    </main>
  );
}
