import { describe, expect, it } from 'vitest';
import { fetchDhanDailyCandles } from './historical.js';

function fakeFetch(body: unknown, ok = true, status = 200): typeof globalThis.fetch {
  return (async () =>
    ({ ok, status, text: async () => JSON.stringify(body) }) as Response) as unknown as typeof globalThis.fetch;
}

const req = {
  accessToken: 't',
  clientId: 'c',
  securityId: '2885',
  exchangeSegment: 'NSE_EQ',
  fromDate: '2025-01-01',
  toDate: '2025-06-01',
};

describe('fetchDhanDailyCandles', () => {
  it('zips the column-oriented response into candles', async () => {
    const body = {
      open: [10, 11],
      high: [12, 13],
      low: [9, 10],
      close: [11, 12],
      volume: [100, 200],
      timestamp: [1700000000, 1700086400],
    };
    const candles = await fetchDhanDailyCandles(req, fakeFetch(body));
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ open: 10, high: 12, low: 9, close: 11, volume: 100 });
    expect(candles[1]?.close).toBe(12);
  });

  it('returns [] for an empty payload', async () => {
    expect(await fetchDhanDailyCandles(req, fakeFetch({}))).toEqual([]);
  });

  it('throws on a non-OK response', async () => {
    await expect(fetchDhanDailyCandles(req, fakeFetch({}, false, 500))).rejects.toThrow(
      /Dhan historical/u,
    );
  });
});
