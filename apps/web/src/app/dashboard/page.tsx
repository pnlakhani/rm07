'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@rm07/ui';
import { billingApi, brokersApi, type BrokerConnection } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, Splash } from '@/components/ui';

export default function DashboardPage(): JSX.Element {
  const router = useRouter();
  const { accessToken, ready, logout } = useAuth();
  const [plan, setPlan] = useState<string>('free');
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect to login once we know there is no session.
  useEffect(() => {
    if (ready && !accessToken) {
      router.replace('/login');
    }
  }, [ready, accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void (async () => {
      try {
        const [sub, conns] = await Promise.all([
          billingApi.getSubscription(accessToken),
          brokersApi.list(accessToken),
        ]);
        if (active) {
          setPlan(sub.plan);
          setConnections(conns);
        }
      } catch {
        /* surface nothing for now; empty state renders */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken]);

  if (!ready || !accessToken) {
    return <Splash label="Loading…" />;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">RM07 · Quant Terminal</p>
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-300">
            {plan} plan
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              void logout().then(() => {
                router.push('/login');
              });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <section aria-label="Broker connections" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Broker connections
        </h2>
        {loading ? (
          <Card>
            <p className="text-sm text-zinc-500">Loading…</p>
          </Card>
        ) : connections.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-400">
              No brokers connected yet. Broker connect lands on this screen next.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {connections.map((c) => (
              <li key={c.id}>
                <Card className="flex items-center justify-between">
                  <div>
                    <p className="font-medium capitalize">{c.broker}</p>
                    <p className="text-xs text-zinc-500">{c.clientId ?? 'no client id'}</p>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                    {c.status}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
