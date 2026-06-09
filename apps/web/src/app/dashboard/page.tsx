'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@rm07/ui';
import { billingApi, brokersApi, type BrokerConnection } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, Splash } from '@/components/ui';
import { ConnectBroker } from '@/components/connect-broker';
import { Holdings } from '@/components/holdings';

export default function DashboardPage(): JSX.Element {
  const router = useRouter();
  const { accessToken, ready, logout } = useAuth();
  const [plan, setPlan] = useState('free');
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !accessToken) {
      router.replace('/login');
    }
  }, [ready, accessToken, router]);

  const reload = useCallback(async (token: string): Promise<void> => {
    try {
      const [sub, conns] = await Promise.all([
        billingApi.getSubscription(token),
        brokersApi.list(token),
      ]);
      setPlan(sub.plan);
      setConnections(conns);
    } catch {
      /* leave current state; empty/zero is a fine fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    void reload(accessToken);
  }, [accessToken, reload]);

  if (!ready || !accessToken) {
    return <Splash label="Loading…" />;
  }

  const token = accessToken;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
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

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Connect a broker
          </h2>
          <ConnectBroker
            token={token}
            onConnected={() => {
              void reload(token);
            }}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Broker connections
          </h2>
          {loading ? (
            <Card>
              <p className="text-sm text-zinc-500">Loading…</p>
            </Card>
          ) : connections.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-400">No brokers connected yet. Use the form to add one.</p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {connections.map((c) => (
                <li key={c.id}>
                  <Card>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium capitalize">{c.broker}</p>
                        <p className="text-xs text-zinc-500">{c.clientId ?? 'no client id'}</p>
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                        {c.status}
                      </span>
                    </div>
                    <Holdings token={token} connectionId={c.id} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
