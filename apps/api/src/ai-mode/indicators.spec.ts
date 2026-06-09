import { describe, expect, it } from 'vitest';
import {
  bollingerLast,
  computeTechnicals,
  emaLast,
  macdLast,
  rsiLast,
  summariseTechnicalSignal,
  type Candle,
  type TechnicalSnapshot,
} from './indicators';

const increasing = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
const constant = (n: number, v = 100): number[] => Array.from({ length: n }, () => v);
const candlesFrom = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ time: `d${i}`, open: c, high: c + 1, low: c - 1, close: c, volume: 100 }));

describe('indicators', () => {
  it('emaLast: SMA seed and constant-series stability', () => {
    expect(emaLast([1, 2, 3, 4, 5], 5)).toBeCloseTo(3);
    expect(emaLast(constant(30, 42), 20)).toBeCloseTo(42);
    expect(emaLast([1, 2, 3], 5)).toBeNull();
  });

  it('rsiLast: 100 when only gains, 0 when only losses, null when short', () => {
    expect(rsiLast(increasing(30), 14)).toBe(100);
    expect(rsiLast([...increasing(30)].reverse(), 14)).toBe(0);
    expect(rsiLast([1, 2, 3], 14)).toBeNull();
  });

  it('macdLast: ~0 for a flat series, positive for a rising series, null when short', () => {
    const flat = macdLast(constant(40));
    expect(flat).not.toBeNull();
    expect(flat?.macd).toBeCloseTo(0);
    expect(flat?.histogram).toBeCloseTo(0);

    const rising = macdLast(increasing(60));
    expect(rising?.macd).toBeGreaterThan(0);

    expect(macdLast(increasing(20))).toBeNull();
  });

  it('bollingerLast: flat series collapses the bands to the mean', () => {
    const b = bollingerLast(constant(25, 50), 20, 2);
    expect(b?.mid).toBeCloseTo(50);
    expect(b?.upper).toBeCloseTo(50);
    expect(b?.lower).toBeCloseTo(50);
    expect(bollingerLast([1, 2, 3], 20)).toBeNull();
  });

  it('computeTechnicals: last close + 90d S/R, ema200 null when short', () => {
    const snap = computeTechnicals(candlesFrom(increasing(60)));
    expect(snap.lastClose).toBe(60);
    expect(snap.ema200).toBeNull();
    expect(snap.support90).toBe(0); // low of close=1 is 0
    expect(snap.resistance90).toBe(61); // high of close=60 is 61
  });

  it('summariseTechnicalSignal: bull / bear / na', () => {
    const base: TechnicalSnapshot = {
      lastClose: 110,
      rsi14: 60,
      ema20: 105,
      ema50: 100,
      ema200: 95,
      macd: { macd: 2, signal: 1, histogram: 1 },
      bollinger: { mid: 105, upper: 115, lower: 95 },
      support90: 90,
      resistance90: 120,
    };
    expect(summariseTechnicalSignal(base).signal).toBe('bull');
    expect(
      summariseTechnicalSignal({
        ...base,
        lastClose: 90,
        rsi14: 40,
        macd: { macd: -2, signal: -1, histogram: -1 },
      }).signal,
    ).toBe('bear');
    expect(summariseTechnicalSignal({ ...base, rsi14: null }).signal).toBe('na');
  });
});
