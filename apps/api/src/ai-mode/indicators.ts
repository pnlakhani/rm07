import type { AiSignal } from '@rm07/core';

/** A daily OHLCV candle (prices in rupees, as the broker returns them). */
export interface Candle {
  readonly time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface MacdValue {
  readonly macd: number;
  readonly signal: number;
  readonly histogram: number;
}

export interface BollingerValue {
  readonly mid: number;
  readonly upper: number;
  readonly lower: number;
}

export interface TechnicalSnapshot {
  readonly lastClose: number | null;
  readonly rsi14: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly macd: MacdValue | null;
  readonly bollinger: BollingerValue | null;
  readonly support90: number | null;
  readonly resistance90: number | null;
}

/** Latest EMA over `values` (null if fewer than `period` points). SMA-seeded. */
export function emaLast(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) {
    return null;
  }
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i += 1) {
    ema += values[i]!;
  }
  ema /= period;
  for (let i = period; i < values.length; i += 1) {
    ema = values[i]! * k + ema * (1 - k);
  }
  return ema;
}

/** EMA series aligned so out[0] corresponds to index (period-1) of `values`. */
function emaSeries(values: readonly number[], period: number): number[] {
  if (period <= 0 || values.length < period) {
    return [];
  }
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i += 1) {
    ema += values[i]!;
  }
  ema /= period;
  const out: number[] = [ema];
  for (let i = period; i < values.length; i += 1) {
    ema = values[i]! * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

/** Latest RSI (Wilder's smoothing). Null if fewer than period+1 points. */
export function rsiLast(values: readonly number[], period = 14): number | null {
  if (values.length < period + 1) {
    return null;
  }
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    if (delta >= 0) {
      gain += delta;
    } else {
      loss -= delta;
    }
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) {
    return 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Latest MACD(12,26,9). Null if insufficient history. */
export function macdLast(values: readonly number[]): MacdValue | null {
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  if (slow.length === 0) {
    return null;
  }
  // fast is offset by 11, slow by 25; align both at values-index >= 25.
  const macdLine: number[] = [];
  for (let i = 25; i < values.length; i += 1) {
    macdLine.push(fast[i - 11]! - slow[i - 25]!);
  }
  const signalSeries = emaSeries(macdLine, 9);
  if (signalSeries.length === 0) {
    return null;
  }
  const macd = macdLine[macdLine.length - 1]!;
  const signal = signalSeries[signalSeries.length - 1]!;
  return { macd, signal, histogram: macd - signal };
}

/** Latest Bollinger bands over the last `period` closes. */
export function bollingerLast(
  values: readonly number[],
  period = 20,
  mult = 2,
): BollingerValue | null {
  if (values.length < period) {
    return null;
  }
  const slice = values.slice(values.length - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { mid: mean, upper: mean + mult * sd, lower: mean - mult * sd };
}

/** Compute the full technical snapshot from daily candles. */
export function computeTechnicals(candles: readonly Candle[]): TechnicalSnapshot {
  const closes = candles.map((c) => c.close);
  const recent = candles.slice(Math.max(0, candles.length - 90));
  const lastClose = closes.length > 0 ? closes[closes.length - 1]! : null;
  return {
    lastClose,
    rsi14: rsiLast(closes, 14),
    ema20: emaLast(closes, 20),
    ema50: emaLast(closes, 50),
    ema200: emaLast(closes, 200),
    macd: macdLast(closes),
    bollinger: bollingerLast(closes, 20, 2),
    support90: recent.length > 0 ? Math.min(...recent.map((c) => c.low)) : null,
    resistance90: recent.length > 0 ? Math.max(...recent.map((c) => c.high)) : null,
  };
}

/** Coarse technical signal pill + a notes line carrying the precise values for the model. */
export function summariseTechnicalSignal(s: TechnicalSnapshot): { signal: AiSignal; notes: string } {
  if (s.lastClose === null || s.rsi14 === null || s.ema50 === null || s.macd === null) {
    return { signal: 'na', notes: 'Insufficient price history to compute technicals.' };
  }
  const bullish = s.lastClose > s.ema50 && s.macd.macd > s.macd.signal && s.rsi14 < 70;
  const bearish = s.lastClose < s.ema50 && s.macd.macd < s.macd.signal && s.rsi14 > 30;
  const signal: AiSignal = bullish ? 'bull' : bearish ? 'bear' : 'neutral';
  const f = (n: number | null): string => (n !== null ? n.toFixed(2) : 'n/a');
  const notes = [
    `close=${f(s.lastClose)}`,
    `RSI14=${s.rsi14.toFixed(1)}`,
    `MACD=${s.macd.macd.toFixed(2)}/${s.macd.signal.toFixed(2)}`,
    `EMA20=${f(s.ema20)}`,
    `EMA50=${f(s.ema50)}`,
    `EMA200=${f(s.ema200)}`,
    `90dS/R=${f(s.support90)}/${f(s.resistance90)}`,
  ].join(', ');
  return { signal, notes };
}
