import { describe, expect, it } from 'vitest';
import type { DhanCandle, fetchDhanDailyCandles } from '@rm07/broker-adapters';
import type { InstrumentResolverService } from '../instruments/instrument-resolver.service';
import { DhanHistoricalSignalsProvider, type DhanDataConfig } from './dhan-historical-signals.provider';

const config: DhanDataConfig = { clientId: 'c', accessToken: 't' };

function resolver(securityId: string | null): InstrumentResolverService {
  return { resolveSecurityId: () => Promise.resolve(securityId) } as unknown as InstrumentResolverService;
}

const candles = (n: number): DhanCandle[] =>
  Array.from({ length: n }, (_, i) => ({
    time: `d${i}`,
    open: i + 1,
    high: i + 2,
    low: i,
    close: i + 1,
    volume: 100,
  }));

function fetcher(result: DhanCandle[] | Error): typeof fetchDhanDailyCandles {
  return (() =>
    result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result)) as unknown as typeof fetchDhanDailyCandles;
}

describe('DhanHistoricalSignalsProvider', () => {
  it('computes technicals and the LTP in paise from fetched candles', async () => {
    const provider = new DhanHistoricalSignalsProvider(resolver('2885'), config, fetcher(candles(60)));
    const signals = await provider.getSignals('NSE', 'RELIANCE');
    expect(signals.technicals).not.toBe('na');
    expect(signals.ltpPaise).toBe(6000n); // last close = 60 rupees
    expect(signals.technicalNotes).toContain('RSI14=');
  });

  it("returns 'na' when the instrument is unknown", async () => {
    const provider = new DhanHistoricalSignalsProvider(resolver(null), config, fetcher(candles(60)));
    const signals = await provider.getSignals('NSE', 'NOPE');
    expect(signals.technicals).toBe('na');
    expect(signals.technicalNotes).toContain('not found');
  });

  it("returns 'na' when the candle fetch fails", async () => {
    const provider = new DhanHistoricalSignalsProvider(
      resolver('2885'),
      config,
      fetcher(new Error('boom')),
    );
    const signals = await provider.getSignals('NSE', 'RELIANCE');
    expect(signals.technicals).toBe('na');
  });
});
