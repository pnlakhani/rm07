type Fetcher = typeof globalThis.fetch;

const DHAN_BASE = 'https://api.dhan.co/v2';

/** A daily OHLCV candle from Dhan (prices in rupees). */
export interface DhanCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DhanHistoricalRequest {
  /** Platform-level (system) Dhan market-data token — NOT a user's connection. */
  readonly accessToken: string;
  readonly clientId: string;
  readonly securityId: string;
  /** Dhan exchange segment, e.g. NSE_EQ / BSE_EQ / NSE_FNO. */
  readonly exchangeSegment: string;
  /** YYYY-MM-DD. */
  readonly fromDate: string;
  readonly toDate: string;
}

interface DhanHistoricalResponse {
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  timestamp?: number[];
}

/**
 * Fetch daily candles from Dhan's historical-charts API (v2). Column-oriented response is zipped
 * into rows. Used by the platform's AI Mode signals pipeline (instrument-level, identical for all
 * users), not by a per-user broker session.
 */
export async function fetchDhanDailyCandles(
  req: DhanHistoricalRequest,
  fetchImpl: Fetcher = globalThis.fetch,
): Promise<readonly DhanCandle[]> {
  const res = await fetchImpl(`${DHAN_BASE}/charts/historical`, {
    method: 'POST',
    headers: {
      'access-token': req.accessToken,
      'client-id': req.clientId,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      securityId: req.securityId,
      exchangeSegment: req.exchangeSegment,
      instrument: 'EQUITY',
      fromDate: req.fromDate,
      toDate: req.toDate,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Dhan historical request failed (${res.status})`);
  }
  const json = (text ? JSON.parse(text) : {}) as DhanHistoricalResponse;
  const close = json.close ?? [];
  const open = json.open ?? [];
  const high = json.high ?? [];
  const low = json.low ?? [];
  const volume = json.volume ?? [];
  const ts = json.timestamp ?? [];
  const out: DhanCandle[] = [];
  for (let i = 0; i < close.length; i += 1) {
    const epoch = ts[i];
    out.push({
      time: epoch !== undefined ? new Date(epoch * 1000).toISOString() : `${i}`,
      open: open[i] ?? 0,
      high: high[i] ?? 0,
      low: low[i] ?? 0,
      close: close[i]!,
      volume: volume[i] ?? 0,
    });
  }
  return out;
}
