import { describe, expect, it } from 'vitest';
import type { BrokerSession } from '../types.js';
import { DhanAdapter } from './dhan.adapter.js';

type Route = { path: string; method: string; ok?: boolean; status?: number; body?: unknown };
interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeFetch(routes: Route[]): { fetchImpl: typeof globalThis.fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    calls.push({
      url: u,
      method,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const route = routes.find((r) => u.endsWith(r.path) && r.method === method);
    if (!route) {
      return { ok: false, status: 404, text: async () => '{}' } as Response;
    }
    return {
      ok: route.ok ?? true,
      status: route.status ?? 200,
      text: async () => (route.body === undefined ? '' : JSON.stringify(route.body)),
    } as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fetchImpl, calls };
}

const session: BrokerSession = { clientId: 'C1', accessToken: 'TOK', tokenExpiresAt: null };

describe('DhanAdapter', () => {
  it('connect verifies the token via /holdings and returns a session', async () => {
    const { fetchImpl, calls } = makeFetch([{ path: '/holdings', method: 'GET', body: [] }]);
    const adapter = new DhanAdapter(fetchImpl);
    const result = await adapter.connect({ client_id: 'C1', access_token: 'TOK' });
    expect(result).toMatchObject({ clientId: 'C1', accessToken: 'TOK' });
    expect(calls[0]?.url).toContain('/v2/holdings');
    expect(calls[0]?.headers['access-token']).toBe('TOK');
  });

  it('connect rejects an invalid token', async () => {
    const { fetchImpl } = makeFetch([
      { path: '/holdings', method: 'GET', ok: false, status: 401, body: { errorMessage: 'Invalid Token' } },
    ]);
    const adapter = new DhanAdapter(fetchImpl);
    await expect(adapter.connect({ client_id: 'C1', access_token: 'BAD' })).rejects.toThrow(/Invalid Token/);
  });

  it('connect requires both fields', async () => {
    const { fetchImpl } = makeFetch([]);
    await expect(new DhanAdapter(fetchImpl).connect({ client_id: 'C1' })).rejects.toThrow(/client_id and access_token/);
  });

  it('maps holdings to paise', async () => {
    const { fetchImpl } = makeFetch([
      {
        path: '/holdings',
        method: 'GET',
        body: [
          { exchange: 'NSE', tradingSymbol: 'RELIANCE', securityId: '2885', isin: 'INE002A01018', totalQty: 10, avgCostPrice: 2655.0 },
        ],
      },
    ]);
    const [h] = await new DhanAdapter(fetchImpl).getHoldings(session);
    expect(h).toEqual({
      tradingSymbol: 'RELIANCE',
      exchange: 'NSE',
      quantity: 10,
      avgPricePaise: 265500n,
      ltpPaise: 0n,
      isin: 'INE002A01018',
    });
  });

  it('maps positions including segment + product + pnl', async () => {
    const { fetchImpl } = makeFetch([
      {
        path: '/positions',
        method: 'GET',
        body: [
          {
            tradingSymbol: 'TCS',
            exchangeSegment: 'NSE_EQ',
            productType: 'CNC',
            buyAvg: 3345.8,
            netQty: 40,
            realizedProfit: 0,
            unrealizedProfit: 6122.0,
          },
        ],
      },
    ]);
    const [p] = await new DhanAdapter(fetchImpl).getPositions(session);
    expect(p).toMatchObject({
      tradingSymbol: 'TCS',
      exchange: 'NSE',
      product: 'CNC',
      netQuantity: 40,
      avgPricePaise: 334580n,
      unrealisedPnlPaise: 612200n,
    });
  });

  it('fetches an LTP quote with the client-id header', async () => {
    const { fetchImpl, calls } = makeFetch([
      { path: '/marketfeed/ltp', method: 'POST', body: { data: { NSE_EQ: { '2885': { last_price: 2900.5 } } }, status: 'success' } },
    ]);
    const quote = await new DhanAdapter(fetchImpl).getQuote(session, {
      tradingSymbol: 'RELIANCE',
      exchange: 'NSE',
      securityId: '2885',
    });
    expect(quote.ltpPaise).toBe(290050n);
    expect(calls[0]?.headers['client-id']).toBe('C1');
    expect(calls[0]?.body).toEqual({ NSE_EQ: [2885] });
  });

  it('getQuote requires a securityId', async () => {
    const { fetchImpl } = makeFetch([]);
    await expect(
      new DhanAdapter(fetchImpl).getQuote(session, { tradingSymbol: 'X', exchange: 'NSE' }),
    ).rejects.toThrow(/securityId/);
  });

  it('places an order with the mapped Dhan body', async () => {
    const { fetchImpl, calls } = makeFetch([
      { path: '/orders', method: 'POST', body: { orderId: '112', orderStatus: 'PENDING' } },
    ]);
    const ack = await new DhanAdapter(fetchImpl).placeOrder(session, {
      tradingSymbol: 'RELIANCE',
      exchange: 'NSE',
      securityId: '2885',
      side: 'BUY',
      quantity: 5,
      orderType: 'MARKET',
      product: 'CNC',
      validity: 'DAY',
      idempotencyKey: 'abc-123-def',
    });
    expect(ack).toEqual({ brokerOrderId: '112', status: 'OPEN' });
    expect(calls[0]?.body).toMatchObject({
      dhanClientId: 'C1',
      transactionType: 'BUY',
      exchangeSegment: 'NSE_EQ',
      productType: 'CNC',
      orderType: 'MARKET',
      securityId: '2885',
      quantity: 5,
    });
  });

  it('cancels an order', async () => {
    const { fetchImpl, calls } = makeFetch([
      { path: '/orders/112', method: 'DELETE', body: { orderId: '112', orderStatus: 'CANCELLED' } },
    ]);
    const ack = await new DhanAdapter(fetchImpl).cancelOrder(session, '112');
    expect(ack).toEqual({ brokerOrderId: '112', status: 'CANCELLED' });
    expect(calls[0]?.method).toBe('DELETE');
  });
});
