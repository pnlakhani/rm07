'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@rm07/ui';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Alert, Card, errorMessage, Field, Input } from '@/components/ui';

type Step = 'account' | 'otp' | 'totp';

export default function SignupPage(): JSX.Element {
  const router = useRouter();
  const { setAccessToken } = useAuth();
  const [step, setStep] = useState<Step>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrolmentToken, setEnrolmentToken] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAccount(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await authApi.signup(email, password);
      setStep('otp');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { enrolmentToken: token } = await authApi.verifyOtp(email, code);
      setEnrolmentToken(token);
      const { secret } = await authApi.enrolTotp(token);
      setTotpSecret(secret);
      setStep('totp');
    } catch (e) {
      setError(errorMessage(e, 'That code did not match. Check your email and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await authApi.confirmTotp(totpCode, enrolmentToken);
      setAccessToken(accessToken);
      router.push('/dashboard');
    } catch (e) {
      setError(errorMessage(e, 'That authenticator code did not match.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">RM07 · Quant Terminal</p>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-sm text-zinc-500">Step {step === 'account' ? 1 : step === 'otp' ? 2 : 3} of 3</p>
      </div>

      <Card>
        {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}

        {step === 'account' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void createAccount();
            }}
          >
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" hint="Use a long, unique passphrase.">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Sending code…' : 'Continue'}
            </Button>
          </form>
        ) : null}

        {step === 'otp' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode();
            }}
          >
            <p className="text-sm text-zinc-400">We emailed a 6-digit code to {email}.</p>
            <Field label="Email code">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/gu, ''))}
                required
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
          </form>
        ) : null}

        {step === 'totp' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <p className="text-sm text-zinc-400">
              Add this secret to your authenticator app (Google Authenticator, Authy…), then enter
              the current 6-digit code to finish.
            </p>
            <div className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm tracking-wider text-zinc-200 break-all">
              {totpSecret || '—'}
            </div>
            <Field label="Authenticator code">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/gu, ''))}
                required
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Finishing…' : 'Finish setup'}
            </Button>
          </form>
        ) : null}
      </Card>

      <p className="text-sm text-zinc-400">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-400 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
