'use client';

import { useEffect, useState } from 'react';
import { brokersApi, type Holding } from '@/lib/api';

/** Format an integer-paise string as ₹ rupees (display only). */
function formatPaise(paise: string): string {
  return `₹${(Number(paise) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Live holdings for a connection (a real broker call server-side). */
export function Holdings({ token, connectionId }: { token: string; connectionId: string }): JSX.Element {
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await brokersApi.holdings(token, connectionId);
        if (active) setHoldings(result);
      } catch {
        if (active) {
          setError('Could not load holdings — the broker may need a valid token or a whitelisted IP.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, connectionId]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading holdings…</p>;
  }
  if (error) {
    return <p className="text-sm text-amber-400">{error}</p>;
  }
  if (!holdings || holdings.length === 0) {
    return <p className="text-sm text-zinc-500">No holdings.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <th className="py-1">Symbol</th>
          <th>Exch</th>
          <th className="text-right">Qty</th>
          <th className="text-right">Avg</th>
          <th className="text-right">LTP</th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((h) => (
          <tr key={`${h.exchange}:${h.tradingSymbol}`} className="border-t border-zinc-800">
            <td className="py-1.5 font-medium">{h.tradingSymbol}</td>
            <td className="text-zinc-400">{h.exchange}</td>
            <td className="text-right">{h.quantity}</td>
            <td className="text-right">{formatPaise(h.avgPricePaise)}</td>
            <td className="text-right">{formatPaise(h.ltpPaise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
